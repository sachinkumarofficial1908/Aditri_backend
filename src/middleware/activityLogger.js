'use strict';
const ActivityLog = require('../models/ActivityLog');

/**
 * Log admin activity
 * @param {Object} params - Logging parameters
 * @param {Object} req - Express request object
 */
const logActivity = async (params) => {
  try {
    const { adminId, adminName, adminEmail, action, targetType, targetId, targetName, details, status, errorMessage } = params;

    // Extract IP address
    const ipAddress = params.req?.ip || params.req?.connection?.remoteAddress || 'unknown';
    const userAgent = params.req?.get('user-agent') || '';

    const log = new ActivityLog({
      adminId,
      adminName,
      adminEmail,
      action,
      targetType,
      targetId,
      targetName,
      details,
      ipAddress,
      userAgent,
      status: status || 'success',
      errorMessage,
      timestamp: new Date(),
    });

    await log.save();
  } catch (err) {
    console.error('Error logging activity:', err);
    // Don't throw - logging should not break the main operation
  }
};

module.exports = { logActivity };
