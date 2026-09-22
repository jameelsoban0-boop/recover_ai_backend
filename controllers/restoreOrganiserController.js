const RestoreOrganiserActivity = require("../models/restoreOrganiserActivityModel");
const { NETWORK_ERROR } = require("../messages/message");
const { computeUserIsPro } = require("../services/chatUsageLimitService");

/**
 * GET /api/restore-organiser/access
 * Lets the client check Premium access before entering the AI Restore
 * Organiser flow (so it can show the paywall instead of a 402 mid-flow).
 * Open to all authenticated users — only tells you whether you're allowed.
 */
async function checkAccess(req, res) {
  return res.json({ success: true, allowed: computeUserIsPro(req.authUser) });
}

/**
 * GET /api/restore-organiser/activity
 * Paginated AI Restore Organiser run history for the caller. Premium-only.
 */
async function listActivity(req, res) {
  try {
    const userId = req.authUser._id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

    const [total, items] = await Promise.all([
      RestoreOrganiserActivity.countDocuments({ userId }),
      RestoreOrganiserActivity.find({ userId })
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.json({ success: true, total, limit, skip, items });
  } catch (err) {
    console.error("[restoreOrganiser listActivity]", err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

/**
 * POST /api/restore-organiser/activity
 * Device reports a completed/failed AI Restore Organiser run. Premium-only.
 * Body: { organizeBy, status, fileCount, destinationFolder, errorMessage, startedAt, finishedAt }
 */
async function logActivity(req, res) {
  try {
    const userId = req.authUser._id;
    const body = req.body || {};

    const validOrganizeBy = ["type", "date", "source", "docCategory", "photoGroup", "custom"];
    if (!validOrganizeBy.includes(body.organizeBy)) {
      return res.status(400).json({ error: `organizeBy must be one of: ${validOrganizeBy.join(", ")}` });
    }
    if (!["running", "success", "failed"].includes(body.status)) {
      return res.status(400).json({ error: 'status must be "running", "success", or "failed"' });
    }

    const entry = await RestoreOrganiserActivity.create({
      userId,
      organizeBy: body.organizeBy,
      status: body.status,
      fileCount: Number.isFinite(Number(body.fileCount)) ? Number(body.fileCount) : 0,
      destinationFolder: typeof body.destinationFolder === "string" ? body.destinationFolder : "",
      errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : "",
      startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
      finishedAt: body.finishedAt ? new Date(body.finishedAt) : body.status === "running" ? null : new Date(),
    });

    return res.status(201).json({ success: true, activity: entry });
  } catch (err) {
    console.error("[restoreOrganiser logActivity]", err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

module.exports = {
  checkAccess,
  listActivity,
  logActivity,
};
