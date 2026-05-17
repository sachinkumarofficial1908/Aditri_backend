'use strict';
const router = require('express').Router();
const upload = require('../middleware/multerUpload');
const { validateAttendance, generateAttendance } = require('../controllers/attendanceController');
const { auth, supervisorAuth } = require('../middleware/auth');
const AttendanceQueueService = require('../services/attendanceQueueService');

/**
 * ATTENDANCE VALIDATION & GENERATION
 */
router.post('/validate', upload.single('file'), validateAttendance);
router.post('/generate', upload.single('file'), generateAttendance);

/**
 * QUEUE MANAGEMENT ROUTES
 */

// Get queue records for supervisor
router.get('/queue', auth, supervisorAuth, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const supervisorId = req.user.id;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const result = await AttendanceQueueService.getQueueRecords(
      supervisorId,
      parseInt(month),
      parseInt(year),
      { AttendanceSalary: require('../models/AttendanceSalary') }
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get queue statistics
router.get('/queue/stats', auth, supervisorAuth, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const supervisorId = req.user.id;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const result = await AttendanceQueueService.getQueueStats(
      supervisorId,
      parseInt(month),
      parseInt(year),
      { AttendanceSalary: require('../models/AttendanceSalary') }
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Submit queue (finalize)
router.post('/queue/submit', auth, supervisorAuth, async (req, res, next) => {
  try {
    const { month, year, salaryType } = req.body;
    const supervisorId = req.user.id;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const result = await AttendanceQueueService.submitQueue(
      supervisorId,
      parseInt(month),
      parseInt(year),
      salaryType || 'normal',
      { AttendanceSalary: require('../models/AttendanceSalary') }
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Reopen queue (for editing after submission)
router.post('/queue/reopen', auth, supervisorAuth, async (req, res, next) => {
  try {
    const { month, year } = req.body;
    const supervisorId = req.user.id;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const result = await AttendanceQueueService.reopenQueue(
      supervisorId,
      parseInt(month),
      parseInt(year),
      { AttendanceSalary: require('../models/AttendanceSalary') }
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get queue editing history
router.get('/queue/history', auth, supervisorAuth, async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const supervisorId = req.user.id;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const result = await AttendanceQueueService.getQueueHistory(
      supervisorId,
      parseInt(month),
      parseInt(year),
      { ActivityLog: require('../models/ActivityLog') }
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
