const mongoose = require("mongoose");
const User = require("../models/userModel");
const PushDeviceToken = require("../models/pushDeviceTokenModel");

function buildDeviceInfo(deviceInfo) {
  if (!deviceInfo || typeof deviceInfo !== "object") {
    return { os: "", appVersion: "" };
  }
  return {
    os: typeof deviceInfo.os === "string" ? deviceInfo.os : "",
    appVersion: typeof deviceInfo.appVersion === "string" ? deviceInfo.appVersion : "",
  };
}

async function upsertStandaloneToken({ token, labelUserId, deviceType, deviceInfo }) {
  await PushDeviceToken.findOneAndUpdate(
    { token },
    {
      $set: {
        token,
        userId: labelUserId || null,
        deviceType,
        deviceInfo,
        isActive: true,
        registeredAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * POST /api/notifications/register-token
 * - admin-service style: only [token] is required; optional string [userId] (e.g. "guest_user").
 * - If Bearer JWT matches a user, token is stored on that User (Mongo).
 * - Else if [userId] is a valid ObjectId and a User exists, token is stored on that User.
 * - Else token is stored in PushDeviceToken (standalone broadcast list).
 */
async function registerToken(req, res) {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const deviceType = typeof req.body?.deviceType === "string" ? req.body.deviceType.trim() : "unknown";
    const deviceInfo = buildDeviceInfo(req.body?.deviceInfo);
    const bodyUserIdRaw = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "token is required",
      });
    }

    const authUser = req.authUser && req.authUser._id ? req.authUser : null;
    let mongoUser = authUser;

    if (!mongoUser && bodyUserIdRaw && mongoose.Types.ObjectId.isValid(bodyUserIdRaw)) {
      const u = await User.findById(bodyUserIdRaw);
      if (u && !u.isBanned) {
        mongoUser = u;
      }
    }

    if (mongoUser) {
      if (mongoUser.isBanned) {
        return res.status(403).json({
          success: false,
          message: "Banned users cannot register device tokens",
        });
      }

      const existingIndex = (mongoUser.deviceTokens || []).findIndex((d) => d.token === token);
      if (existingIndex >= 0) {
        mongoUser.deviceTokens[existingIndex].deviceType =
          deviceType || mongoUser.deviceTokens[existingIndex].deviceType;
        mongoUser.deviceTokens[existingIndex].deviceInfo = {
          ...mongoUser.deviceTokens[existingIndex].deviceInfo,
          ...deviceInfo,
        };
        mongoUser.deviceTokens[existingIndex].registeredAt = new Date();
      } else {
        mongoUser.deviceTokens.push({
          token,
          deviceType,
          deviceInfo,
          registeredAt: new Date(),
        });
      }

      await mongoUser.save();

      try {
        await PushDeviceToken.deleteOne({ token });
      } catch (e) {
        console.warn("[notification:registerToken] standalone cleanup skipped:", e.message);
      }

      return res.json({
        success: true,
        message: "Device token registered successfully",
        storage: "user",
        userId: mongoUser._id.toString(),
        token,
      });
    }

    await upsertStandaloneToken({
      token,
      labelUserId: bodyUserIdRaw || null,
      deviceType,
      deviceInfo,
    });

    return res.status(201).json({
      success: true,
      message: "Device token registered successfully",
      storage: "standalone",
      token,
    });
  } catch (error) {
    console.error("[notification:registerToken] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to register device token",
      error: error.message,
    });
  }
}

async function getTokens(req, res) {
  try {
    const user = req.authUser;
    if (!user || !user._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const freshUser = await User.findById(user._id).select("deviceTokens");
    if (!freshUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      tokens: freshUser.deviceTokens || [],
    });
  } catch (error) {
    console.error("[notification:getTokens] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get tokens",
      error: error.message,
    });
  }
}

async function removeToken(req, res) {
  try {
    const user = req.authUser;
    if (!user || !user._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = req.params?.token;
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Token is required in path",
      });
    }

    const freshUser = await User.findById(user._id);
    if (!freshUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    freshUser.deviceTokens = (freshUser.deviceTokens || []).filter((d) => d.token !== token);
    await freshUser.save();

    return res.json({
      success: true,
      message: "Token removed successfully",
    });
  } catch (error) {
    console.error("[notification:removeToken] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove token",
      error: error.message,
    });
  }
}

module.exports = {
  registerToken,
  getTokens,
  removeToken,
};
