'use strict';
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { protect, adminOnly } = require('../middleware/auth');

const uploadDir = process.env.UPLOAD_PATH || './uploads';
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024;
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext) || allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, WebP, or GIF images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxFileSize, files: 5 },
});

const uploadImages = (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `Each image must be ${Math.round(maxFileSize / (1024 * 1024))}MB or smaller`
        : err.code === 'LIMIT_FILE_COUNT'
          ? 'You can upload maximum 5 images at a time'
          : err.message;
      return res.status(400).json({ success: false, message });
    }

    return res.status(400).json({ success: false, message: err.message || 'Image upload failed' });
  });
};

router.post('/', protect, adminOnly, uploadImages, (req, res) => {
  if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files uploaded' });
  const urls = req.files.map(f => ({ url: `/uploads/${f.filename}`, alt: f.originalname }));
  res.json({ success: true, images: urls });
});

module.exports = router;
