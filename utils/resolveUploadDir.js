const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Returns a writable directory for multer to store uploads in.
 *
 * On a normal server, `preferredDir` (e.g. ./uploads/profile) is used as-is.
 * On a read-only filesystem (e.g. Vercel serverless functions, where only
 * os.tmpdir() is writable), creating that directory throws EROFS — so this
 * falls back to a subdirectory under the OS temp dir instead of crashing.
 *
 * IMPORTANT: the temp-dir fallback is ephemeral. Files written there will
 * NOT persist across requests, cold starts, or deploys, and won't be
 * reachable via the app's static /uploads route. It only exists so the
 * process doesn't crash on boot — for real uploads in production on a
 * serverless host, wire this up to persistent storage (S3, Cloudinary,
 * Firebase Storage, Vercel Blob, etc.) instead.
 */
function resolveUploadDir(preferredDir) {
  try {
    fs.mkdirSync(preferredDir, { recursive: true });
    fs.accessSync(preferredDir, fs.constants.W_OK);
    return preferredDir;
  } catch (err) {
    const fallback = path.join(os.tmpdir(), "recoverai-uploads", path.basename(preferredDir) || "root");
    try {
      fs.mkdirSync(fallback, { recursive: true });
    } catch (fallbackErr) {
      console.error(
        `[uploads] Could not create fallback upload dir "${fallback}":`,
        fallbackErr.message
      );
    }
    console.warn(
      `[uploads] "${preferredDir}" is not writable (${err.code || err.message}); using ephemeral "${fallback}" instead. ` +
        "Files saved here will NOT persist — use persistent cloud storage in production on serverless hosts."
    );
    return fallback;
  }
}

module.exports = { resolveUploadDir };
