const { computeUserIsPro } = require("../services/chatUsageLimitService");

/**
 * Blocks non-Premium users from a route. Must run after `authenticate`
 * (needs req.authUser). Used to gate Premium-only features like AI Backup
 * Guard and AI Restore Organiser per the RecoverAI Free/Premium tiering.
 */
function requirePremium(req, res, next) {
  if (!computeUserIsPro(req.authUser)) {
    return res.status(402).json({
      code: "PREMIUM_REQUIRED",
      error: "This feature requires RecoverAI Premium.",
    });
  }
  next();
}

module.exports = requirePremium;
