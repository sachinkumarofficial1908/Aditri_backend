'use strict';
const router = require('express').Router();
const { auth, adminAuth } = require('../middleware/auth');
const {
  getAllLogs,
  getLogById,
  getLogStats,
  deleteOldLogs,
  getUserActivityTimeline,
  exportLogs,
} = require('../controllers/activityLogController');

// Get all logs (admin only)
router.get('/', auth, getAllLogs);

// Get user's own timeline (any authenticated user)
router.get('/timeline/me', auth, getUserActivityTimeline);

// Get statistics (admin only)
router.get('/stats', auth, adminAuth, getLogStats);

// Get specific log (admin only)
router.get('/:id', auth, adminAuth, getLogById);

// Export logs (admin only)
router.get('/export/csv', auth, adminAuth, exportLogs);

// Delete old logs (admin only)
router.delete('/cleanup', auth, adminAuth, deleteOldLogs);

module.exports = router;
