'use strict';
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  adminName: {
    type: String,
    required: true,
  },
  adminEmail: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    enum: [
      'employee_create',
      'employee_update',
      'employee_delete',
      'employee_status_change',
      'project_create',
      'project_update',
      'project_delete',
      'salary_generate',
      'login',
      'logout',
    ],
    required: true,
  },
  targetType: {
    type: String,
    enum: ['employee', 'project', 'salary', 'auth', 'system'],
    required: true,
  },
  targetId: {
    type: String,
  },
  targetName: {
    type: String,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    default: 'success',
  },
  errorMessage: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, { timestamps: false });

// Index for querying logs
activityLogSchema.index({ adminId: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ targetType: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
