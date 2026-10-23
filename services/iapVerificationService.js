const fs = require("fs");
const path = require("path");
const { JWT } = require("google-auth-library");

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_ANDROID_PACKAGE_NAME = "com.recoverai.backup.restore";
const AMAZON_RVS_PRODUCTION_URL = "https://appstore-sdk.amazon.com";
const AMAZON_RVS_SANDBOX_URL = "https://appstore-sdk.amazon.com/sandbox";
const ACTIVE_V2_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_CANCELED",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
]);

function loadGoogleServiceAccount() {
  if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is invalid");
    }
  }

  const file = path.join(__dirname, "..", "google-play-service-account.json");
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return null;
}

async function getGoogleAccessToken() {
  const serviceAccount = loadGoogleServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error("Google Play service account is missing");
  }

  const client = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [GOOGLE_SCOPE],
  });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Could not create Google Play access token");
  return token;
}

function parseTime(value) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function buildAndroidSubscriptionResult(data) {
  const expiryMs = Number(data?.expiryTimeMillis || 0);
  const paymentState = data?.paymentState;
  const paymentOk =
    paymentState === undefined ||
    paymentState === null ||
    [1, 2, 3].includes(paymentState);
  const active = expiryMs > Date.now() && paymentOk;

  return {
    ok: active,
    status: active ? "active" : "expired",
    autoRenewing: active ? data?.autoRenewing !== false : false,
    expiresAt: expiryMs ? new Date(expiryMs).toISOString() : null,
    platform: "android",
    source: "google_play",
    payload: { paymentState, autoRenewing: data?.autoRenewing, orderId: data?.orderId },
  };
}

function buildAndroidSubscriptionV2Result(data, productId) {
  const lineItems = Array.isArray(data?.lineItems) ? data.lineItems : [];
  const matchingLine = lineItems.find((item) => item?.productId === productId);
  const expiryMs = parseTime(matchingLine?.expiryTime);
  const state = data?.subscriptionState;
  const active =
    Boolean(matchingLine) &&
    expiryMs > Date.now() &&
    ACTIVE_V2_STATES.has(state);

  return {
    ok: active,
    status: active ? "active" : "expired",
    autoRenewing: active
      ? matchingLine?.autoRenewingPlan?.autoRenewEnabled !== false &&
        state !== "SUBSCRIPTION_STATE_CANCELED"
      : false,
    expiresAt: expiryMs ? new Date(expiryMs).toISOString() : null,
    platform: "android",
    source: "google_play_v2",
    payload: { subscriptionState: state, productId: matchingLine?.productId },
  };
}

function amazonSandboxEnabled() {
  return ["1", "true", "yes"].includes(
    String(process.env.AMAZON_RVS_SANDBOX || "").trim().toLowerCase()
  );
}

function buildAmazonSubscriptionResult(data, productId, receiptId) {
  const cancelMs = Number(data?.cancelDate || 0);
  const renewalMs = Number(data?.renewalDate || 0);
  const responseProductId = data?.productId || data?.sku;
  const productMatches =
    Boolean(productId) &&
    [responseProductId, data?.termSku, data?.term].some((value) => value === productId);
  const receiptMatches = data?.receiptId === receiptId;
  const identityValid =
    productMatches && receiptMatches && data?.productType === "SUBSCRIPTION";
  const active =
    identityValid && !cancelMs && (!renewalMs || renewalMs > Date.now());

  return {
    ok: active,
    status: !identityValid ? "invalid" : active ? "active" : "expired",
    retryable: false,
    autoRenewing: active ? data?.autoRenewing !== false : false,
    expiresAt: renewalMs ? new Date(renewalMs).toISOString() : null,
    platform: "amazon",
    source: "amazon_rvs",
    payload: {
      receiptId,
      productId: responseProductId,
      productType: data?.productType,
      cancelDate: cancelMs ? new Date(cancelMs).toISOString() : null,
      renewalDate: renewalMs ? new Date(renewalMs).toISOString() : null,
    },
  };
}

async function verifyAmazonPurchase({ productId, purchaseToken, storeUserId }) {
  const secret = (
    process.env.AMAZON_SHARED_SECRET ||
    process.env.AMAZON_RVS_SHARED_SECRET ||
    process.env.AMAZON_DEVELOPER_SECRET ||
    ""
  ).trim();
  if (!secret) {
    const error = new Error("Amazon RVS shared secret is missing");
    error.retryable = true;
    throw error;
  }
  if (!productId || !purchaseToken || !storeUserId) {
    const error = new Error("Missing productId, purchaseToken, or storeUserId");
    error.retryable = false;
    throw error;
  }

  const endpoints = amazonSandboxEnabled()
    ? [AMAZON_RVS_SANDBOX_URL, AMAZON_RVS_PRODUCTION_URL]
    : [AMAZON_RVS_PRODUCTION_URL, AMAZON_RVS_SANDBOX_URL];
  let lastError;
  for (const baseUrl of endpoints) {
    let response;
    try {
      const url =
        `${baseUrl}/version/1.0/verifyReceiptId/developer/${encodeURIComponent(secret)}` +
        `/user/${encodeURIComponent(storeUserId)}/receiptId/${encodeURIComponent(purchaseToken)}`;
      response = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (cause) {
      const error = new Error(`Amazon RVS request failed: ${cause.message}`);
      error.retryable = true;
      throw error;
    }

    const data = await response.json().catch(() => ({}));
    if (response.ok) return buildAmazonSubscriptionResult(data, productId, purchaseToken);

    lastError = new Error(data?.message || `Amazon RVS verify failed (${response.status})`);
    lastError.httpStatus = response.status;
    lastError.retryable = ![400, 404, 410].includes(response.status);
    if (lastError.retryable) throw lastError;
  }
  throw lastError;
}

async function verifyAndroidPurchase({ packageName, productId, purchaseToken }) {
  if (!packageName || !productId || !purchaseToken) {
    throw new Error("Missing packageName, productId, or purchaseToken");
  }
  const accessToken = await getGoogleAccessToken();
  const base =
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
    `${encodeURIComponent(packageName)}/purchases`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const v2Response = await fetch(
    `${base}/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers }
  );
  const v2Data = await v2Response.json().catch(() => ({}));
  if (v2Response.ok) {
    const result = buildAndroidSubscriptionV2Result(v2Data, productId);
    if (result.payload.productId && result.payload.productId !== productId) {
      return { ...result, ok: false, status: "invalid" };
    }
    return result;
  }

  const response = await fetch(
    `${base}/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(
      purchaseToken
    )}`,
    { headers }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Google Play verify failed (${response.status})`);
  }
  return buildAndroidSubscriptionResult(data);
}

async function verifyIapPurchase({ platform, productId, purchaseToken, packageName, storeUserId }) {
  if (platform === "amazon") {
    try {
      return await verifyAmazonPurchase({ productId, purchaseToken, storeUserId });
    } catch (error) {
      console.warn("[iapVerify] Amazon verification failed:", error.message);
      const retryable = error.retryable !== false;
      return {
        ok: false,
        status: retryable ? "verify_failed" : "invalid",
        retryable,
        platform,
        source: "amazon_rvs",
        expiresAt: null,
        payload: {},
        reason: error.message,
      };
    }
  }

  if (platform !== "android") {
    return {
      ok: false,
      status: "unsupported_platform",
      platform,
      source: "none",
      expiresAt: null,
      payload: {},
      reason: "Only Android and Amazon verification are supported",
    };
  }

  try {
    return await verifyAndroidPurchase({
      packageName: packageName || process.env.ANDROID_PACKAGE_NAME || DEFAULT_ANDROID_PACKAGE_NAME,
      productId,
      purchaseToken,
    });
  } catch (error) {
    console.warn("[iapVerify] Google Play verification failed:", error.message);
    return {
      ok: false,
      status: "verify_failed",
      retryable: true,
      platform: "android",
      source: "google_play",
      expiresAt: null,
      payload: {},
      reason: error.message,
    };
  }
}

module.exports = {
  verifyIapPurchase,
  buildAndroidSubscriptionResult,
  buildAndroidSubscriptionV2Result,
  buildAmazonSubscriptionResult,
};
