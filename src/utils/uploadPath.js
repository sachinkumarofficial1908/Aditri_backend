'use strict';
const path = require('path');

const getUploadDir = () => {
  const configuredPath = process.env.UPLOAD_PATH || 'uploads';
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, '..', '..', configuredPath);
};

module.exports = { getUploadDir };
