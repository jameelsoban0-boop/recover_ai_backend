require("dotenv").config();

const express = require("express");
const cors = require("cors");

const MongoDBConnect = require("./connection/connection");
const ensureBody = require("./middlewares/parseRequest");

const userAuthRouter = require("./routes/userAuthRoutes");
const adminRouter = require("./routes/adminRoutes");
const adminAuthRouter = require("./routes/adminAuthRoutes");
const notificationRouter = require("./routes/notificationRoutes");
const appPromoRouter = require("./routes/appPromoRoutes");
const adminPromoRouter = require("./routes/adminPromoRoutes");
const chatRouter = require("./routes/chatRoutes");
const knowledgeRouter = require("./routes/knowledgeRoutes");
const backupGuardRouter = require("./routes/backupGuardRoutes");
const restoreOrganiserRouter = require("./routes/restoreOrganiserRoutes");

const { ensureFirebaseAdmin } = require("./utils/firebaseAdminInit");

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error(
    "Missing MONGODB_URI. Add MONGODB_URI to your Vercel Environment Variables."
  );
}

const app = express();

const port = Number(process.env.PORT) || 8000;

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:3000",
];

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  : defaultAllowedOrigins;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`[cors] blocked origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "X-Service-Key",
  ],

  optionsSuccessStatus: 204,
};

app.use("/uploads", express.static("uploads"));

app.use(cors(corsOptions));

app.options(/.*/, cors(corsOptions));

app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(ensureBody);

/*
|--------------------------------------------------------------------------
| Root / Health Endpoint
|--------------------------------------------------------------------------
|
| Keep this before the database middleware so GET /
| can confirm that the Vercel function itself is alive.
|
*/

app.get("/", (req, res) => {
  res.status(200).json({
    service: "RecoverAI",
    status: "running",
    deployment: "Vercel",
    endpoints: {
      auth: {
        signup: "POST /auth/signup",
        verifyOtp: "POST /auth/verify-otp",
        login: "POST /auth/login",
        googleLogin: "POST /auth/google-login",
        profileGet: "GET /auth/profile (auth)",
        profilePut: "PUT /auth/profile (auth)",
        deleteAccount: "DELETE /auth/account",
        forgotPassword: "POST /auth/forgot-password",
        resetPassword: "POST /auth/reset-password",
        getAiPrivacy: "GET /auth/ai-privacy (auth)",
        updateAiPrivacy: "PATCH /auth/ai-privacy (auth)",
      },

      notifications: {
        registerToken:
          "POST /api/notifications/register-token (token required; userId optional string or Mongo id; JWT optional)",
        send: "POST /api/notifications/send",
      },

      promos: {
        list: "GET /api/app-promos",
        getOne: "GET /api/app-promos/:id",
      },

      chat: {
        limits: "GET /api/chat/limits (no auth)",
        guest: "POST /api/chat/guest (no auth)",
        respond: "POST /api/chat/respond (auth, auto-creates session)",
        entitlement: "GET /api/chat/entitlement (auth)",
        verifyIap: "POST /api/chat/iap/verify (auth)",
        restoreClearIap: "POST /api/chat/iap/restore-clear (auth)",
        createSession: "POST /api/chat/sessions",
        listSessions: "GET /api/chat/sessions",
        getSession: "GET /api/chat/sessions/:id",
        addMessages: "POST /api/chat/sessions/:id/messages",
        updateSession: "PATCH /api/chat/sessions/:id",
        deleteSession: "DELETE /api/chat/sessions/:id",
      },

      knowledge: {
        list: "GET /api/knowledge",
        create:
          "POST /api/knowledge (X-Service-Key, X-Knowledge-Key, or admin Bearer token)",
        merged: "GET /api/knowledge/merged",
      },

      backupGuard: {
        getConfig: "GET /api/backup-guard/config (auth, Premium)",
        upsertConfig: "PUT /api/backup-guard/config (auth, Premium)",
        listActivity: "GET /api/backup-guard/activity (auth)",
        logActivity: "POST /api/backup-guard/activity (auth)",
      },

      restoreOrganiser: {
        checkAccess: "GET /api/restore-organiser/access (auth)",
        listActivity:
          "GET /api/restore-organiser/activity (auth, Premium)",
        logActivity:
          "POST /api/restore-organiser/activity (auth, Premium)",
      },

      admin: {
        login: "POST /api/admin/auth/login",
        users: "GET /api/admin/users",
        usage: "GET /api/admin/usage",
        banUser: "PATCH /api/admin/users/:id/ban",
        broadcastNotification:
          "POST /api/admin/notifications/broadcast",
        createPromo: "POST /api/admin/app-promos",
        updatePromo: "PUT/PATCH /api/admin/app-promos/:id",
        deletePromo: "DELETE /api/admin/app-promos/:id",
        backupGuardOverview:
          "GET /api/admin/backup-guard/overview",
      },
    },
  });
});

/*
|--------------------------------------------------------------------------
| Database Initialization
|--------------------------------------------------------------------------
|
| One shared promise prevents a new MongoDB connection from being
| started for every request handled by the same Vercel instance.
|
*/

let databaseReadyPromise = null;

function initializeDatabase() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = MongoDBConnect(mongoUri)
      .then(() => {
        console.log(
          `[cors] allowed origins: ${allowedOrigins.join(", ")}`
        );

        const firebaseAdmin = ensureFirebaseAdmin();

        console.log(
          `[firebase] Push notifications: ${firebaseAdmin
            ? "ready"
            : "not configured (set FIREBASE_SERVICE_ACCOUNT or firebase-service-account.json)"
          }`
        );

        return true;
      })
      .catch((error) => {
        console.error("[mongodb] connection failed:", error);

        // Allow a later invocation to retry the connection.
        databaseReadyPromise = null;

        throw error;
      });
  }

  return databaseReadyPromise;
}

/*
|--------------------------------------------------------------------------
| Database Middleware
|--------------------------------------------------------------------------
|
| All API routes below this point wait for MongoDB before executing.
|
*/

app.use(async (req, res, next) => {
  try {
    await initializeDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

/*
|--------------------------------------------------------------------------
| Admin Login Debug Logging
|--------------------------------------------------------------------------
*/

app.use((req, res, next) => {
  if (req.path.includes("/api/admin/auth/login")) {
    console.log(
      `[admin-login:request] ${req.method} ${req.originalUrl} origin=${req.headers.origin || "n/a"
      } contentType=${req.headers["content-type"] || "n/a"}`
    );
  }

  next();
});

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

app.use("/auth", userAuthRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/app-promos", appPromoRouter);
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/app-promos", adminPromoRouter);
app.use("/api/chat", chatRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/backup-guard", backupGuardRouter);
app.use("/api/restore-organiser", restoreOrganiserRouter);

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
  });
});

/*
|--------------------------------------------------------------------------
| Error Handler
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {
  console.error(
    `[express-error] ${req.method} ${req.originalUrl}:`,
    error.message
  );

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    error: "Internal server error",
  });
});

/*
|--------------------------------------------------------------------------
| Local Server Only
|--------------------------------------------------------------------------
|
| Vercel imports/export this Express app instead of starting a local
| HTTP listener. Running "node index.js" locally still starts the server.
|
*/

if (!process.env.VERCEL && require.main === module) {
  initializeDatabase()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
      });
    })
    .catch(() => {
      process.exit(1);
    });
}

/*
|--------------------------------------------------------------------------
| IMPORTANT: Vercel Entry Point
|--------------------------------------------------------------------------
*/

module.exports = app;

/*
|--------------------------------------------------------------------------
| Process-Level Error Logging
|--------------------------------------------------------------------------
*/

process.on("uncaughtException", (error) => {
  console.error("[process] uncaughtException:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
});