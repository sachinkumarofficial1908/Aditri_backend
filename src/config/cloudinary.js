'use strict';

require('dotenv').config();
const cloudinary = require('cloudinary').v2;

const getEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const getCloudinaryCredentials = () => ({
  cloudinaryUrl: getEnv('CLOUDINARY_URL', 'CLOUDNIARY_URL', 'CLOUNDINARY_URL'),
  cloudName: getEnv('CLOUDINARY_CLOUD_NAME', 'CLOUDNIARY_CLOUD_NAME', 'CLOUNDINARY_CLOUD_NAME'),
  apiKey: getEnv('CLOUDINARY_API_KEY', 'CLOUDNIARY_API_KEY', 'CLOUNDINARY_API_KEY'),
  apiSecret: getEnv('CLOUDINARY_API_SECRET', 'CLOUDNIARY_API_SECRET', 'CLOUNDINARY_API_SECRET'),
});

let configuredSignature = '';

const configureCloudinary = () => {
  const {
    cloudinaryUrl,
    cloudName,
    apiKey,
    apiSecret,
  } = getCloudinaryCredentials();

  const hasCloudinaryUrl = Boolean(cloudinaryUrl);
  const hasExplicitCredentials = Boolean(cloudName && apiKey && apiSecret);

  if (!hasCloudinaryUrl && !hasExplicitCredentials) {
    return false;
  }

  const nextSignature = hasCloudinaryUrl
    ? cloudinaryUrl
    : `${cloudName}:${apiKey}:${apiSecret}`;

  if (configuredSignature === nextSignature) {
    return true;
  }

  cloudinary.config({
    cloud_name: cloudName || undefined,
    api_key: apiKey || undefined,
    api_secret: apiSecret || undefined,
    secure: true,
  });

  configuredSignature = nextSignature;
  return true;
};

const isCloudinaryConfigured = () => configureCloudinary();

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
  const baseFolder = getEnv('CLOUDINARY_FOLDER', 'CLOUDNIARY_FOLDER', 'CLOUNDINARY_FOLDER') || 'aditri_uploads';
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
