function parseLimit(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const GUEST_CHAT_LIMIT = parseLimit(process.env.CARE_FREE_CHAT_LIMIT, 3);
const REGISTERED_CHAT_LIMIT = parseLimit(
  process.env.CARE_REGISTERED_CHAT_LIMIT,
  5
);

function computeUserIsPro(user) {
  if (user?.isPro) return true;
  return user?.subscriptionPlan === "Premium";
}

function isGuestUser(user) {
  return user?.emailVerified === false;
}

function getCareChatLimitForUser(user) {
  if (computeUserIsPro(user)) return null;
  return isGuestUser(user) ? GUEST_CHAT_LIMIT : REGISTERED_CHAT_LIMIT;
}

function buildCareLimitConfig() {
  return {
    guest: GUEST_CHAT_LIMIT,
    registered: REGISTERED_CHAT_LIMIT,
    pro: null,
    proLabel: "unlimited",
  };
}

/**
 * Guard for future cloud-AI features that process file content/metadata
 * (e.g. Corrupted Media Analysis, natural-language search) — respects the
 * user's Settings > AI & Privacy "Allow cloud AI processing" toggle.
 * Not used by the core AI Assistant chat itself, which the user already
 * opts into via chat usage.
 */
function assertCloudAiAllowed(user) {
  if (user?.aiPrivacy?.allowCloudAI !== true) {
    const err = new Error(
      "Cloud AI processing is disabled in AI & Privacy settings. Enable it to use this feature."
    );
    err.statusCode = 403;
    err.code = "CLOUD_AI_DISABLED";
    throw err;
  }
}

module.exports = {
  GUEST_CHAT_LIMIT,
  REGISTERED_CHAT_LIMIT,
  buildCareLimitConfig,
  computeUserIsPro,
  getCareChatLimitForUser,
  isGuestUser,
  assertCloudAiAllowed,
};
