'use strict';
const { trackActivity } = require('../middleware/activityLogger');
const logger = require('./logger');

/**
 * Activity Tracking Helper Functions
 * Provides standardized activity logging across the application
 */

// ─── Auth Activities ───────────────────────────────────────────────────────────

const logLogin = async (req, user) => {
  try {
    await trackActivity(
      req,
      'login',
      'auth',
      user._id,
      user.name || user.email,
      { email: user.email, role: user.role },
      'success'
    );
  } catch (err) {
    logger.error('Failed to log login activity:', { error: err.message });
  }
};

const logLogout = async (req, user) => {
  try {
    await trackActivity(
      req,
      'logout',
      'auth',
      user._id,
      user.name || user.email,
      {},
      'success'
    );
  } catch (err) {
    logger.error('Failed to log logout activity:', { error: err.message });
  }
};

// ─── Employee Activities ────────────────────────────────────────────────────────

const logEmployeeCreate = async (req, employee) => {
  await trackActivity(
    req,
    'employee_create',
    'employee',
    employee._id,
    employee.name,
    { clmsId: employee.clmsId, email: employee.email },
    'success'
  );
};

const logEmployeeUpdate = async (req, employee, changes) => {
  await trackActivity(
    req,
    'employee_update',
    'employee',
    employee._id,
    employee.name,
    { clmsId: employee.clmsId, changes },
    'success'
  );
};

const logEmployeeDelete = async (req, employee) => {
  await trackActivity(
    req,
    'employee_delete',
    'employee',
    employee._id,
    employee.name,
    { clmsId: employee.clmsId },
    'success'
  );
};

// ─── Attendance Activities ──────────────────────────────────────────────────────

const logAttendanceUpload = async (req, month, year, uploadType, employeeCount, status = 'success', error = null) => {
  await trackActivity(
    req,
    'attendance_upload',
    'attendance',
    null,
    `Attendance ${month}/${year}`,
    { month, year, uploadType, employeeCount },
    status,
    error
  );
};

const logAttendanceGenerate = async (req, month, year, uploadType, employeeCount, status = 'success', error = null) => {
  await trackActivity(
    req,
    'attendance_generate',
    'attendance',
    null,
    `Attendance ${month}/${year}`,
    { month, year, uploadType, employeeCount },
    status,
    error
  );
};

// ─── Salary Activities ──────────────────────────────────────────────────────────

const logSalaryGenerate = async (req, salaryType, month, year, count, status = 'success', error = null) => {
  await trackActivity(
    req,
    'salary_generate',
    'salary',
    null,
    `${salaryType} Salary ${month}/${year}`,
    { salaryType, month, year, employeeCount: count },
    status,
    error
  );
};

const logSalaryApprove = async (req, salary) => {
  await trackActivity(
    req,
    'salary_approve',
    'salary',
    salary._id,
    `Salary for ${salary.month}/${salary.year}`,
    { salaryType: salary.salaryType, amount: salary.totalAmount },
    'success'
  );
};

// ─── Project Activities ─────────────────────────────────────────────────────────

const logProjectCreate = async (req, project) => {
  await trackActivity(
    req,
    'project_create',
    'project',
    project._id,
    project.name,
    { location: project.location, client: project.client },
    'success'
  );
};

const logProjectUpdate = async (req, project, changes) => {
  await trackActivity(
    req,
    'project_update',
    'project',
    project._id,
    project.name,
    { changes },
    'success'
  );
};

const logProjectDelete = async (req, project) => {
  await trackActivity(
    req,
    'project_delete',
    'project',
    project._id,
    project.name,
    { location: project.location },
    'success'
  );
};

// ─── Wage Slip Activities ───────────────────────────────────────────────────────

const logWageSlipGenerate = async (req, month, year, count, status = 'success', error = null) => {
  await trackActivity(
    req,
    'wage_slip_generate',
    'wage-slip',
    null,
    `Wage Slips ${month}/${year}`,
    { month, year, count },
    status,
    error
  );
};

// ─── Report Activities ──────────────────────────────────────────────────────────

const logReportGenerate = async (req, reportType, filters, status = 'success', error = null) => {
  await trackActivity(
    req,
    'report_generate',
    'report',
    null,
    `${reportType} Report`,
    { reportType, filters },
    status,
    error
  );
};

// ─── Excel Upload Activities ────────────────────────────────────────────────────

const logExcelUpload = async (req, uploadType, fileName, recordCount, status = 'success', error = null) => {
  await trackActivity(
    req,
    'excel_upload',
    'excel',
    null,
    fileName,
    { uploadType, recordCount },
    status,
    error
  );
};

// ─── Data Export Activities ─────────────────────────────────────────────────────

const logExportData = async (req, exportType, filters, recordCount, status = 'success') => {
  await trackActivity(
    req,
    'data_export',
    'system',
    null,
    `${exportType} Export`,
    { exportType, filters, recordCount },
    status
  );
};

// ─── Error Activities ───────────────────────────────────────────────────────────

const logError = async (req, action, targetType, errorMessage) => {
  try {
    await trackActivity(
      req,
      action,
      targetType,
      null,
      'Error',
      {},
      'failed',
      errorMessage
    );
  } catch (err) {
    logger.error('Failed to log error activity:', { error: err.message });
  }
};

module.exports = {
  // Auth
  logLogin,
  logLogout,
  // Employee
  logEmployeeCreate,
  logEmployeeUpdate,
  logEmployeeDelete,
  // Attendance
  logAttendanceUpload,
  logAttendanceGenerate,
  // Salary
  logSalaryGenerate,
  logSalaryApprove,
  // Project
  logProjectCreate,
  logProjectUpdate,
  logProjectDelete,
  // Wage Slip
  logWageSlipGenerate,
  // Report
  logReportGenerate,
  // Excel
  logExcelUpload,
  // Export
  logExportData,
  // Error
  logError,
};
