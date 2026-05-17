'use strict';
const ActivityLog = require('../models/ActivityLog');

exports.getAllLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, action, targetType, adminId, startDate, endDate, search } = req.query;

    const query = {};

    if (action) query.action = action;
    if (targetType) query.targetType = targetType;
    if (adminId) query.adminId = adminId;
    if (search) {
      query.$or = [
        { adminName: new RegExp(search, 'i') },
        { targetName: new RegExp(search, 'i') },
        { adminEmail: new RegExp(search, 'i') },
      ];
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const total = await ActivityLog.countDocuments(query);
    const logs = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));

    res.json({ success: true, total, logs, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
};

exports.getLogById = async (req, res, next) => {
  try {
    const log = await ActivityLog.findById(req.params.id);
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    res.json({ success: true, log });
  } catch (err) {
    next(err);
  }
};

exports.getLogStats = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const stats = await ActivityLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const adminStats = await ActivityLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$adminId',
          adminName: { $first: '$adminName' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    res.json({ success: true, actionStats: stats, adminStats });
  } catch (err) {
    next(err);
  }
};

exports.deleteOldLogs = async (req, res, next) => {
  try {
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
