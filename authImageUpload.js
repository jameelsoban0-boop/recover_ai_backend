const multer = require("multer");
const path = require("path");
const { resolveUploadDir } = require("./utils/resolveUploadDir");

const uploadDir = resolveUploadDir("./uploads");

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

module.exports = upload;
