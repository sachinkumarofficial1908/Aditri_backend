'use strict';
const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAllLogs,
  getLogById,
  getLogStats,
  deleteOldLogs,
} = require('../controllers/activityLogController');

// All routes require admin access
router.use(protect, authorize('admin'));

router.get('/', getAllLogs);
router.get('/stats', getLogStats);
router.get('/:id', getLogById);
router.delete('/cleanup', deleteOldLogs);

module.exports = router;
