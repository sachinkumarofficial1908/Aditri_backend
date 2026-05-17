const express = require('express');
const AttendanceController = require('../controllers/salaryAttendanceController');
const SalaryGenerationController = require('../controllers/salaryGenerationController');
const { auth, supervisorAuth, adminAuth } = require('../middleware/auth');
const { uploadExcel } = require('../middleware/upload');

const router = express.Router();

/**
 * ATTENDANCE MANAGEMENT ROUTES
 */

// Save single attendance entry (Supervisor only)
router.post('/attendance/manual', auth, supervisorAuth, AttendanceController.saveAttendanceEntry);

// Get attendance by month/year
router.get('/attendance', auth, AttendanceController.getAttendanceByMonthYear);

// Get supervisor's attendance entries
router.get('/attendance/supervisor/:id', auth, AttendanceController.getSupervisorAttendance);

// Save multiple attendance entries via bulk upload
router.post('/attendance/bulk', auth, supervisorAuth, uploadExcel.single('file'), AttendanceController.saveBulkAttendance);

// Update attendance entry (Supervisor only)
router.put('/attendance/:id', auth, supervisorAuth, AttendanceController.updateAttendanceEntry);

// Delete attendance entry (Supervisor only)
router.delete('/attendance/:id', auth, supervisorAuth, AttendanceController.deleteAttendanceEntry);

// Search employees
router.get('/attendance/search/employees', auth, AttendanceController.searchEmployee);

// Salary process status and supervisor-wise attendance review
router.get('/salary/process-status', auth, adminAuth, SalaryGenerationController.getSalaryProcessStatus);
router.post('/salary/process-complete', auth, adminAuth, SalaryGenerationController.completeSalaryProcess);

/**
 * SALARY GENERATION ROUTES (Admin only)
 */

// Generate government salary
router.post('/salary/gov-salary', auth, adminAuth, SalaryGenerationController.generateGovSalary);

// Generate company salary
router.post('/salary/company-salary', auth, adminAuth, SalaryGenerationController.generateCompanySalary);

// Get government salary records
router.get('/salary/gov-salary', auth, adminAuth, SalaryGenerationController.getGovSalaries);

// Get company salary records
router.get('/salary/company-salary', auth, adminAuth, SalaryGenerationController.getCompanySalaries);

// Update government salary
router.put('/salary/gov-salary/:id', auth, adminAuth, SalaryGenerationController.updateGovSalary);

// Update company salary
router.put('/salary/company-salary/:id', auth, adminAuth, SalaryGenerationController.updateCompanySalary);

// Download government salary Excel
router.get('/salary/download/gov-salary', auth, adminAuth, SalaryGenerationController.downloadGovSalaryExcel);

// Download company salary Excel
router.get('/salary/download/company-salary', auth, adminAuth, SalaryGenerationController.downloadCompanySalaryExcel);

// Download both salary reports
router.get('/salary/download/both', auth, adminAuth, SalaryGenerationController.downloadBothSalaryExcel);

/**
 * ADDITIONAL SALARY MANAGEMENT ROUTES
 */

// Calculate salary for attendance record (preview)
router.post('/salary/calculate', auth, AttendanceController.calculateSalary);

// Finalize attendance for month (final submit from supervisor)
router.post('/attendance/finalize', auth, supervisorAuth, AttendanceController.finalizeAttendance);

// Get salary summary for month/year
router.get('/salary/summary', auth, AttendanceController.getSalarySummary);

// Lock salary month (Admin only)
router.post('/salary/lock', auth, adminAuth, AttendanceController.lockSalaryMonth);

// Unlock salary month (Admin only)
router.post('/salary/unlock', auth, adminAuth, AttendanceController.unlockSalaryMonth);

module.exports = router;
