'use strict';
const morgan = require('morgan');
const logger = require('./logger');

/**
 * Morgan stream for Winston
 */
const stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

/**
 * Custom Morgan token for user info
 */
morgan.token('user', (req) => {
  return req.user ? `${req.user.email || req.user.name || req.user.id}` : 'Anonymous';
});

/**
 * Custom Morgan token for response time in ms
 */
morgan.token('response-time-ms', (req, res) => {
  if (!req._startAt || !res._startAt) return '0ms';
  const ms = (res._startAt[0] - req._startAt[0]) * 1e3 + (res._startAt[1] - req._startAt[1]) * 1e-6;
  return `${ms.toFixed(2)}ms`;
});

/**
 * Development format with colors and details
 */
const devFormat = ':method :url :status :response-time-ms - :user [:date[iso]]';

/**
 * Production format with detailed info
 */
const prodFormat = ':method :url :status :response-time-ms - :res[content-length] bytes - :user - :remote-addr [:date[iso]]';

/**
 * Get Morgan middleware configured for the environment
 */
const getMorganMiddleware = () => {
  const format = process.env.NODE_ENV === 'production' ? prodFormat : devFormat;

  return morgan(format, {
    stream,
    skip: (req) => {
      // Skip health checks and static files
      return req.path === '/api/health' || req.path.startsWith('/uploads');
    },
  });
};

module.exports = { getMorganMiddleware, stream };
