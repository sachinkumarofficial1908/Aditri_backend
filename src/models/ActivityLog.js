'use strict';
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  userName: {
    type: String,
    required: true,
    default: 'Anonymous',
  },
  userEmail: {
    type: String,
    required: true,
    default: 'unknown@example.com',
  },
  userRole: {
    type: String,
    enum: ['admin', 'supervisor', 'employee', 'guest', 'system'],
    default: 'guest',
  },

  // Action details
  action: {
    type: String,
    required: true,
    index: true,
  },
  targetType: {
    type: String,
    enum: ['employee', 'project', 'salary', 'attendance', 'wage-slip', 'auth', 'system', 'excel', 'report', 'order', 'inquiry', 'product'],
    required: true,
    index: true,
  },
  targetId: {
    type: String,
  },
  targetName: {
    type: String,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

  // Request information
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    default: 'GET',
  },
  path: {
    type: String,
    index: true,
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },

  // Response information
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success',
  },
  statusCode: {
    type: Number,
    default: 200,
  },
  errorMessage: {
    type: String,
  },

  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
    expires: 90 * 24 * 60 * 60, // Auto-delete after 90 days
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { 
  timestamps: false,
  collection: 'activity_logs',
});

// Compound indexes for efficient querying
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ targetType: 1, timestamp: -1 });
activityLogSchema.index({ userRole: 1, timestamp: -1 });
activityLogSchema.index({ status: 1, timestamp: -1 });
activityLogSchema.index({ path: 1, timestamp: -1 });
activityLogSchema.index({ statusCode: 1, timestamp: -1 });

// Create text index for search
activityLogSchema.index({
  userName: 'text',
  userEmail: 'text',
  targetName: 'text',
  action: 'text',
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);

