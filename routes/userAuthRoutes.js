const express = require("express");
const {
  handleUserLogin,
  handleUserSignUp,
  handleVerifyOTP,
  handleGoogleLogin,
  handleGetProfile,
  handleUpdateProfile,
  handleDeleteAccount,
  handleForgotPassword,
  handleResetPassword,
  handleGetAiPrivacy,
  handleUpdateAiPrivacy,
} = require("../controllers/userAuthController");
const { checkUserExistsByEmail, authenticate } = require("../middlewares/authMiddleware");
const upload = require("../authImageUpload");
const uploadProfile = require("../profileImageUpload");

const router = express.Router();

router.post("/signup", upload.single("image"), checkUserExistsByEmail, handleUserSignUp);
router.post("/verify-otp", handleVerifyOTP);
router.post("/login", upload.single("image"), handleUserLogin);
router.post("/google-login", handleGoogleLogin);

router.get("/profile", authenticate, handleGetProfile);
router.put("/profile", authenticate, uploadProfile.single("profileImage"), handleUpdateProfile);
router.delete("/account", authenticate, handleDeleteAccount);

router.post("/forgot-password", handleForgotPassword);
router.post("/reset-password", handleResetPassword);

router.get("/ai-privacy", authenticate, handleGetAiPrivacy);
router.patch("/ai-privacy", authenticate, handleUpdateAiPrivacy);

module.exports = router;
