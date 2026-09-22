const express = require("express");
const {
  getConfig,
  upsertConfig,
  listActivity,
  logActivity,
} = require("../controllers/backupGuardController");
const { authenticate } = require("../middlewares/authMiddleware");
const requirePremium = require("../middlewares/requirePremium");

const router = express.Router();

router.use(authenticate);

// AI Backup Guard (scheduled/managed protection) is Premium-only.
router.get("/config", requirePremium, getConfig);
router.put("/config", requirePremium, upsertConfig);

// Backup activity log stays available to Free users too, since manual
// backups (no AI Backup Guard config) are a Free-tier feature.
router.get("/activity", listActivity);
router.post("/activity", logActivity);

module.exports = router;
