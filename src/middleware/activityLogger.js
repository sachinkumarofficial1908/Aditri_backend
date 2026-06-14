'use strict';
const ActivityLog = require('../models/ActivityLog');
const logger = require('../utils/logger');

/**
 * Activity Logger Middleware
 * Logs all API activities with user info, request details, and outcomes
 */
const activityLoggerMiddleware = (req, res, next) => {
  // Capture the original send method
  const originalSend = res.send;

  // Override send to capture response
  res.send = function (data) {
    res.send = originalSend;

    // Store response data
    res.bodyContent = data;

    // Call the original send method
    return res.send(data);
  };

  // Continue to next middleware
  next();
};

/**
 * Log user activity to database
 * @param {Object} params - Activity details
 * @returns {Promise<void>}
 */
const logActivity = async (params) => {
  try {
    const {
      req,
      userId,
      userName,
      userEmail,
      userRole,
      action,
      targetType,
      targetId,
      targetName,
      details,
      status = 'success',
      statusCode = 200,
      errorMessage,
    } = params;

    // Extract request info
    const ipAddress = req?.ip || req?.connection?.remoteAddress || 'unknown';
    const userAgent = req?.get('user-agent') || '';
    const method = req?.method || 'UNKNOWN';
    const path = req?.originalUrl || req?.path || 'unknown';

    // Create activity log entry
    const log = new ActivityLog({
      userId: userId || null,
      userName: userName || 'Anonymous',
      userEmail: userEmail || 'unknown@example.com',
      userRole: userRole || 'guest',
      action,
      targetType,
      targetId,
      targetName,
      details: details || {},
      ipAddress,
      userAgent,
      method,
      path,
      status,
      statusCode,
      errorMessage,
      timestamp: new Date(),
    });

    await log.save();

    // Log to Winston
    logger.info(`Activity logged: ${action}`, {
      userId,
      userName,
      action,
      targetType,
      targetId,
      status,
      statusCode,
      method,
      path,
      ipAddress,
    });
  } catch (err) {
    logger.error('Error logging activity:', {
      error: err.message,
      stack: err.stack,
      params,
    });
  }
};

/**
 * Helper to log activities with request context
 * @param {Object} req - Express request object
 * @param {string} action - Action being performed
 * @param {string} targetType - Type of target (e.g., 'Employee', 'Attendance')
 * @param {string} targetId - ID of the target
 * @param {string} targetName - Name of the target
 * @param {Object} details - Additional details
 * @param {string} status - Status ('success' or 'failure')
 * @param {string} errorMessage - Error message if failed
 */
const trackActivity = async (req, action, targetType, targetId, targetName, details = {}, status = 'success', errorMessage = null) => {
  try {
    const user = req.user || {};

    await logActivity({
      req,
      userId: user._id || user.id,
      userName: user.name || user.username || 'System',
      userEmail: user.email || 'system@aditri.com',
      userRole: user.role || 'guest',
      action,
      targetType,
      targetId,
      targetName,
      details,
      status,
      statusCode: 200,
      errorMessage,
    });
  } catch (err) {
    logger.error('Error tracking activity:', { error: err.message, action, targetType });
  }
};

module.exports = { activityLoggerMiddleware, logActivity, trackActivity };
