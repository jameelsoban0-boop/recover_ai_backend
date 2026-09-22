const mongoose = require("mongoose");

const backupActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["running", "success", "failed"],
      default: "running",
      index: true,
    },
    source: { type: String, default: "" },
    destination: { type: String, default: "" },
    fileCount: { type: Number, default: 0 },
    totalSizeBytes: { type: Number, default: 0 },
    errorMessage: { type: String, default: "" },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BackupActivity", backupActivitySchema);
