'use strict';

const multer = require('multer');
const path = require('path');
const {
  assertCloudinaryConfigured,
  cloudinary,
  destroyCloudinaryAsset,
  getCloudinaryFolder,
} = require('../config/cloudinary');

const DEFAULT_MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024;
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const imageFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, WebP, or GIF images are allowed'), false);
  }
};

const makeMulter = ({ maxFileSize = DEFAULT_MAX_FILE_SIZE, maxFiles } = {}) => multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: maxFileSize, ...(maxFiles ? { files: maxFiles } : {}) },
});

const formatMulterError = (err, maxFileSize) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return `Each image must be ${Math.round(maxFileSize / (1024 * 1024))}MB or smaller`;
    }
    if (err.code === 'LIMIT_FILE_COUNT') return 'Too many images uploaded';
    return err.message;
  }

  return err.message || 'Image upload failed';
};

const uploadBufferToCloudinary = (file, { folder } = {}) => new Promise((resolve, reject) => {
  assertCloudinaryConfigured();

  const uploadOptions = {
    folder,
    resource_type: 'image',
    use_filename: false,
    unique_filename: true,
  };

  if (process.env.CLOUDINARY_UPLOAD_PRESET) {
    uploadOptions.upload_preset = process.env.CLOUDINARY_UPLOAD_PRESET;
  }

  const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
    if (error) return reject(error);
    return resolve(result);
  });

  stream.end(file.buffer);
});

const attachCloudinaryResult = (file, result) => {
  file.cloudinary = {
    public_id: result.public_id,
    url: result.secure_url,
    secure_url: result.secure_url,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
  return file;
};

const uploadSingleImage = (fieldName, options = {}) => {
  const maxFileSize = options.maxFileSize || DEFAULT_MAX_FILE_SIZE;
  const upload = makeMulter({ maxFileSize }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: formatMulterError(err, maxFileSize) });
      }
      if (!req.file) return next();

      try {
        const folder = getCloudinaryFolder(options.folder);
        const result = await uploadBufferToCloudinary(req.file, { folder });
        attachCloudinaryResult(req.file, result);
        return next();
      } catch (uploadErr) {
        uploadErr.statusCode = uploadErr.statusCode || 500;
        return next(uploadErr);
      }
    });
  };
};

const uploadMultipleImages = (fieldName, options = {}) => {
  const maxFiles = options.maxFiles || 5;
  const maxFileSize = options.maxFileSize || DEFAULT_MAX_FILE_SIZE;
  const upload = makeMulter({ maxFileSize, maxFiles }).array(fieldName, maxFiles);

  return (req, res, next) => {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: formatMulterError(err, maxFileSize) });
      }
      if (!req.files?.length) return next();

      const uploadedPublicIds = [];
      try {
        const folder = getCloudinaryFolder(options.folder);
        const files = [];

        for (const file of req.files) {
          const result = await uploadBufferToCloudinary(file, { folder });
          uploadedPublicIds.push(result.public_id);
          files.push(attachCloudinaryResult(file, result));
        }

        req.files = files;
        return next();
      } catch (uploadErr) {
        await Promise.allSettled(uploadedPublicIds.map((publicId) => destroyCloudinaryAsset(publicId)));
        uploadErr.statusCode = uploadErr.statusCode || 500;
        return next(uploadErr);
      }
    });
  };
};

module.exports = {
  uploadMultipleImages,
  uploadSingleImage,
};
