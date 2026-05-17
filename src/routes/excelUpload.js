/**
 * Excel Upload Routes
 * Handles Excel file uploads for attendance and salary data
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { auth, supervisorAuth, adminAuth } = require('../middleware/auth');
const ExcelUploadController = require('../controllers/excelUploadController');

const router = express.Router();

// Create upload directory for Excel files
const excelUploadDir = process.env.EXCEL_UPLOAD_PATH || './uploads/excel';
if (!fs.existsSync(excelUploadDir)) {
  fs.mkdirSync(excelUploadDir, { recursive: true });
}

// Configure multer for Excel files
const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, excelUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const excelFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  const allowedExt = ['.xlsx', '.xls'];

  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (allowedMimes.includes(mime) || allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false);
  }
};

const excelUpload = multer({
  storage: excelStorage,
  fileFilter: excelFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

/**
 * ATTENDANCE UPLOAD ROUTES
 */

// Upload and validate attendance Excel
router.post(
  '/attendance/validate',
  auth,
  supervisorAuth,
  excelUpload.single('file'),
  ExcelUploadController.uploadAttendanceExcel
);

// Confirm and save attendance from Excel
router.post(
  '/attendance/confirm',
  auth,
  supervisorAuth,
  ExcelUploadController.confirmAttendanceUpload
);

// Get upload history
router.get(
  '/attendance/history',
  auth,
  supervisorAuth,
  ExcelUploadController.getUploadHistory
);

/**
 * EMPLOYEE MASTER UPLOAD ROUTES
 */

// Upload and validate employee master Excel (Admin only)
router.post(
  '/employees/validate',
  auth,
  adminAuth,
  excelUpload.single('file'),
  ExcelUploadController.uploadEmployeeExcel
);

/**
 * TEMPLATE & REPORT DOWNLOAD ROUTES
 */

// Download attendance template
router.get(
  '/template/attendance',
  auth,
  supervisorAuth,
  ExcelUploadController.downloadSalaryTemplate
);

// Download validation error report
router.post(
  '/errors/download',
  auth,
  ExcelUploadController.downloadErrorReport
);

module.exports = router;
