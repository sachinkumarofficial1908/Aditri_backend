'use strict';

const cloudinary = require('cloudinary').v2;

const hasCloudinaryUrl = Boolean(process.env.CLOUDINARY_URL);
const hasExplicitCredentials = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME
  && process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinaryUrl || hasExplicitCredentials) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const isCloudinaryConfigured = () => hasCloudinaryUrl || hasExplicitCredentials;

const assertCloudinaryConfigured = () => {
  if (!isCloudinaryConfigured()) {
    const error = new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
    error.statusCode = 500;
    throw error;
  }
};

const getCloudinaryFolder = (subfolder) => {
  const baseFolder = (process.env.CLOUDINARY_FOLDER || 'aditri_uploads').trim();
  return [baseFolder, subfolder].filter(Boolean).join('/').replace(/\/+/g, '/');
};

const destroyCloudinaryAsset = async (publicId) => {
  if (!publicId || !isCloudinaryConfigured()) return null;
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
};

module.exports = {
  cloudinary,
  assertCloudinaryConfigured,
  destroyCloudinaryAsset,
  getCloudinaryFolder,
  isCloudinaryConfigured,
};
