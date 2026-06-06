'use strict';
const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const { uploadMultipleImages } = require('../middleware/cloudinaryUpload');

const uploadImages = uploadMultipleImages('images', { folder: 'products', maxFiles: 5 });

router.post('/', protect, adminOnly, uploadImages, (req, res) => {
  if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files uploaded' });
  const urls = req.files.map(f => ({
    url: f.cloudinary.secure_url,
    alt: f.originalname,
    public_id: f.cloudinary.public_id,
  }));
  res.json({ success: true, images: urls });
});

module.exports = router;
