const BackupGuardConfig = require("../models/backupGuardConfigModel");
const BackupActivity = require("../models/backupActivityModel");
const { NETWORK_ERROR, NOT_FOUND } = require("../messages/message");

function defaultConfig(userId) {
  return {
    userId,
    protectedFolders: { camera: true, downloads: true, documents: false, sdCard: false },
    destination: "recoverai_folder",
    frequency: "manual",
    wifiOnly: true,
    chargeOnly: false,
    excludeLargeFilesOverMB: 200,
    notifyOnFailure: true,
  };
}

/**
 * GET /api/backup-guard/config
 * Returns the caller's Backup Guard config, or sensible defaults if none exists yet.
 */
async function getConfig(req, res) {
  try {
    const userId = req.authUser._id;
    const config = await BackupGuardConfig.findOne({ userId }).lean();
    return res.json({ success: true, config: config || defaultConfig(userId) });
  } catch (err) {
    console.error("[backupGuard getConfig]", err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

/**
 * PUT /api/backup-guard/config
 * Create or replace the caller's Backup Guard config.
 * AI Backup Guard (protected-folder scheduling/config) is a Premium-only
 * feature end to end — gated by requirePremium at the route level. Free
 * users still do manual backups, which are logged via POST /activity
 * without needing a config.
 */
async function upsertConfig(req, res) {
  try {
    const userId = req.authUser._id;
    const body = req.body || {};

    const payload = { userId };
    if (body.protectedFolders && typeof body.protectedFolders === "object") {
      payload.protectedFolders = {
        camera: !!body.protectedFolders.camera,
        downloads: !!body.protectedFolders.downloads,
        documents: !!body.protectedFolders.documents,
        sdCard: !!body.protectedFolders.sdCard,
      };
    }
    if (["original", "recoverai_folder", "custom", "sd_card"].includes(body.destination)) {
      payload.destination = body.destination;
    }
    if (["onNewMedia", "daily", "weekly", "manual"].includes(body.frequency)) {
      payload.frequency = body.frequency;
    }
    if (typeof body.wifiOnly === "boolean") payload.wifiOnly = body.wifiOnly;
    if (typeof body.chargeOnly === "boolean") payload.chargeOnly = body.chargeOnly;
    if (Number.isFinite(Number(body.excludeLargeFilesOverMB))) {
      payload.excludeLargeFilesOverMB = Number(body.excludeLargeFilesOverMB);
    }
    if (typeof body.notifyOnFailure === "boolean") payload.notifyOnFailure = body.notifyOnFailure;

    const config = await BackupGuardConfig.findOneAndUpdate(
      { userId },
      { $set: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, config });
  } catch (err) {
    console.error("[backupGuard upsertConfig]", err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

/**
 * GET /api/backup-guard/activity
 * Paginated backup run history for the caller.
 * Query: limit (1-100, default 20), skip (default 0)
 */
async function listActivity(req, res) {
  try {
    const userId = req.authUser._id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

    const [total, items] = await Promise.all([
      BackupActivity.countDocuments({ userId }),
      BackupActivity.find({ userId }).sort({ startedAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    return res.json({ success: true, total, limit, skip, items });
  } catch (err) {
    console.error("[backupGuard listActivity]", err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

/**
 * POST /api/backup-guard/activity
 * Device reports a completed/failed backup run.
 * Body: { status: "success"|"failed", source, destination, fileCount, totalSizeBytes, errorMessage, startedAt, finishedAt }
 */
async function logActivity(req, res) {
  try {
    const userId = req.authUser._id;
    const body = req.body || {};

    if (!["running", "success", "failed"].includes(body.status)) {
      return res.status(400).json({ error: 'status must be "running", "success", or "failed"' });
    }

    const entry = await BackupActivity.create({
      userId,
      status: body.status,
      source: typeof body.source === "string" ? body.source : "",
      destination: typeof body.destination === "string" ? body.destination : "",
      fileCount: Number.isFinite(Number(body.fileCount)) ? Number(body.fileCount) : 0,
      totalSizeBytes: Number.isFinite(Number(body.totalSizeBytes)) ? Number(body.totalSizeBytes) : 0,
      errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : "",
      startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
      finishedAt: body.finishedAt ? new Date(body.finishedAt) : body.status === "running" ? null : new Date(),
    });

    return res.status(201).json({ success: true, activity: entry });
  } catch (err) {
    console.error("[backupGuard logActivity]", err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

module.exports = {
  getConfig,
  upsertConfig,
  listActivity,
  logActivity,
};
