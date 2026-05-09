'use strict';
const { validateFileSettings, generateAttendanceWorkbook } = require('../services/attendanceService');

exports.validateAttendance = async (req, res, next) => {
  try {
    const result = validateFileSettings(req.file, {
      uploadType: req.body.uploadType,
      month: req.body.month,
      year: req.body.year,
    });

    return res.json({
      success: true,
      uploadType: result.uploadType,
      month: result.month,
      year: result.year,
      daysInMonth: result.daysInMonth,
      employeeCount: result.employeeCount,
      headers: result.headers,
      previewRows: result.previewRows,
      errors: result.errors,
      warnings: result.warnings,
      valid: result.valid,
    });
  } catch (err) {
    return next(err);
  }
};

exports.generateAttendance = async (req, res, next) => {
  try {
    const { buffer, fileName } = generateAttendanceWorkbook(req.file, {
      uploadType: req.body.uploadType,
      month: req.body.month,
      year: req.body.year,
      entryStart: req.body.entryStart,
      entryEnd: req.body.entryEnd,
      exitStart: req.body.exitStart,
      exitEnd: req.body.exitEnd,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return next(err);
  }
};
