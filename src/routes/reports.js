/**
 * Report Generation Routes
 * API endpoints for generating various salary and attendance reports
 */

const express = require('express');
const ReportGenerationController = require('../controllers/reportGenerationController');
const { auth, adminAuth, supervisorAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * SALARY REPORTS
 */

// Generate monthly salary report
router.get(
  '/salary/monthly',
  auth,
  adminAuth,
  ReportGenerationController.generateMonthlySalaryReport
);

// Generate supervisor salary report
router.get(
  '/salary/supervisor',
  auth,
  adminAuth,
  ReportGenerationController.generateSupervisorReport
);

/**
 * WAGE SLIP REPORTS
 */

// Generate wage slip for single employee
router.get(
  '/wageslip',
  auth,
  ReportGenerationController.generateWageSlipReport
);

// Generate department-wise report
router.get(
  '/department',
  auth,
  adminAuth,
  ReportGenerationController.generateDepartmentReport
);

/**
 * ANALYTICS & DASHBOARD
 */

// Generate analytics/dashboard data
router.get(
  '/analytics',
  auth,
  adminAuth,
  ReportGenerationController.generateAnalytics
);

module.exports = router;
