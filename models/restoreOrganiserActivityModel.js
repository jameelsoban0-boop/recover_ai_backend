const mongoose = require("mongoose");

const restoreOrganiserActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organizeBy: {
      type: String,
      enum: ["type", "date", "source", "docCategory", "photoGroup", "custom"],
      required: true,
    },
    status: {
      type: String,
      enum: ["running", "success", "failed"],
      default: "running",
      index: true,
    },
    fileCount: { type: Number, default: 0 },
    destinationFolder: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RestoreOrganiserActivity", restoreOrganiserActivitySchema);
