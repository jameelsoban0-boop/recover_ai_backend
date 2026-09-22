const express = require("express");
const {
  checkAccess,
  listActivity,
  logActivity,
} = require("../controllers/restoreOrganiserController");
const { authenticate } = require("../middlewares/authMiddleware");
const requirePremium = require("../middlewares/requirePremium");

const router = express.Router();

router.use(authenticate);

// Open to Free users so the client can show the paywall instead of a 402.
router.get("/access", checkAccess);

// AI Restore Organiser itself is Premium-only.
router.get("/activity", requirePremium, listActivity);
router.post("/activity", requirePremium, logActivity);

module.exports = router;
