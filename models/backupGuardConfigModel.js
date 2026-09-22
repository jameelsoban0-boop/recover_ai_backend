const mongoose = require("mongoose");

const backupGuardConfigSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    protectedFolders: {
      camera: { type: Boolean, default: true },
      downloads: { type: Boolean, default: true },
      documents: { type: Boolean, default: false },
      sdCard: { type: Boolean, default: false },
    },
    destination: {
      type: String,
      enum: ["original", "recoverai_folder", "custom", "sd_card"],
      default: "recoverai_folder",
    },
    frequency: {
      type: String,
      enum: ["onNewMedia", "daily", "weekly", "manual"],
      default: "manual",
    },
    wifiOnly: { type: Boolean, default: true },
    chargeOnly: { type: Boolean, default: false },
    excludeLargeFilesOverMB: { type: Number, default: 200 },
    notifyOnFailure: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BackupGuardConfig", backupGuardConfigSchema);
