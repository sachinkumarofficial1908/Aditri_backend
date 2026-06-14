'use strict';
const ActivityLog = require('../models/ActivityLog');
const logger = require('../utils/logger');

/**
 * Get all activity logs with advanced filtering and pagination
 */
exports.getAllLogs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      action,
      targetType,
      userId,
      userRole,
      status,
      statusCode,
      method,
      startDate,
      endDate,
      search,
      sortBy = '-timestamp',
    } = req.query;

    const query = {};

    // Filters
    if (action) query.action = action;
    if (targetType) query.targetType = targetType;
    if (userId) query.userId = userId;
    if (userRole) query.userRole = userRole;
    if (status) query.status = status;
    if (statusCode) query.statusCode = parseInt(statusCode);
    if (method) query.method = method;

    // Search functionality
    if (search) {
      query.$or = [
        { userName: new RegExp(search, 'i') },
        { userEmail: new RegExp(search, 'i') },
        { targetName: new RegExp(search, 'i') },
        { action: new RegExp(search, 'i') },
        { path: new RegExp(search, 'i') },
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const total = await ActivityLog.countDocuments(query);
    const logs = await ActivityLog.find(query)
      .sort(sortBy)
      .skip(skip)
      .limit(limitNum)
      .lean();

    logger.info('Activity logs retrieved', {
      total,
      page: pageNum,
      limit: limitNum,
      filters: { action, targetType, userRole, status },
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    logger.error('Error retrieving activity logs:', { error: err.message });
    next(err);
  }
};

/**
 * Get activity log by ID
 */
exports.getLogById = async (req, res, next) => {
  try {
    const log = await ActivityLog.findById(req.params.id).lean();
    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }

    res.json({ success: true, data: log });
  } catch (err) {
    logger.error('Error retrieving activity log:', { error: err.message, logId: req.params.id });
    next(err);
  }
};

/**
 * Get comprehensive activity statistics
 */
exports.getLogStats = async (req, res, next) => {
  try {
    const { days = 7, userRole } = req.query;
    const daysNum = parseInt(days);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const matchStage = {
      $match: {
        timestamp: { $gte: startDate },
      },
    };

    if (userRole) {
      matchStage.$match.userRole = userRole;
    }

    // Action statistics
    const actionStats = await ActivityLog.aggregate([
      matchStage,
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
          },
          failCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Top users
    const topUsers = await ActivityLog.aggregate([
      matchStage,
      {
        $group: {
          _id: '$userId',
          userName: { $first: '$userName' },
          userEmail: { $first: '$userEmail' },
          userRole: { $first: '$userRole' },
          count: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
          },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Target type distribution
    const targetDistribution = await ActivityLog.aggregate([
      matchStage,
      {
        $group: {
          _id: '$targetType',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // HTTP status code distribution
    const statusCodeDistribution = await ActivityLog.aggregate([
      matchStage,
      {
        $group: {
          _id: '$statusCode',
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Role distribution
    const roleDistribution = await ActivityLog.aggregate([
      matchStage,
      {
        $group: {
          _id: '$userRole',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Success rate
    const successRate = await ActivityLog.aggregate([
      matchStage,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          successful: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
        },
      },
    ]);

    logger.info('Activity statistics generated', { daysNum, roleFilter: userRole });

    res.json({
      success: true,
      data: {
        period: { days: daysNum, startDate, endDate: new Date() },
        actionStats,
        topUsers,
        targetDistribution,
        statusCodeDistribution,
        roleDistribution,
        successRate: successRate[0] || {
          total: 0,
          successful: 0,
          failed: 0,
        },
      },
    });
  } catch (err) {
    logger.error('Error generating activity statistics:', { error: err.message });
    next(err);
  }
};

/**
 * Get user activity timeline
 */
exports.getUserActivityTimeline = async (req, res, next) => {
  try {
    const { userId, days = 7 } = req.query;
    const daysNum = parseInt(days);

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const timeline = await ActivityLog.find({
      userId,
      timestamp: { $gte: startDate },
    })
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        userId,
        period: { days: daysNum, startDate, endDate: new Date() },
        activities: timeline,
        total: timeline.length,
      },
    });
  } catch (err) {
    logger.error('Error retrieving user activity timeline:', { error: err.message });
    next(err);
  }
};

/**
 * Delete old activity logs
 */
exports.deleteOldLogs = async (req, res, next) => {
  try {
    const { days = 90 } = req.body;
    const daysNum = parseInt(days);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);

    const result = await ActivityLog.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    logger.warn('Old activity logs deleted', {
      deletedCount: result.deletedCount,
      cutoffDate,
      daysOld: daysNum,
    });

    res.json({
      success: true,
      message: `${result.deletedCount} logs deleted`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    logger.error('Error deleting activity logs:', { error: err.message });
    next(err);
  }
};

/**
 * Export activity logs to CSV
 */
exports.exportLogs = async (req, res, next) => {
  try {
    const { startDate, endDate, userRole, targetType } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    if (userRole) query.userRole = userRole;
    if (targetType) query.targetType = targetType;

    const logs = await ActivityLog.find(query).sort({ timestamp: -1 }).lean();

    // Convert to CSV
    const csv = [
      ['Timestamp', 'User Name', 'User Email', 'Role', 'Action', 'Target Type', 'Target Name', 'Method', 'Path', 'Status', 'Status Code', 'IP Address'].join(','),
      ...logs.map((log) =>
        [
          log.timestamp.toISOString(),
          `"${log.userName}"`,
          `"${log.userEmail}"`,
          log.userRole,
          log.action,
          log.targetType,
          `"${log.targetName || ''}"`,
          log.method,
          `"${log.path}"`,
          log.status,
          log.statusCode,
          log.ipAddress,
        ].join(',')
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="activity-logs-${Date.now()}.csv"`);
    res.send(csv);

    logger.info('Activity logs exported', { exportedCount: logs.length });
  } catch (err) {
    logger.error('Error exporting activity logs:', { error: err.message });
    next(err);
  }
};
    const { days = 90 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const result = await ActivityLog.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} logs older than ${days} days`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    next(err);
  }
};
