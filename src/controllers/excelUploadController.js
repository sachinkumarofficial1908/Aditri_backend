/**
 * Excel Upload Handler Controller
 * Manages Excel file uploads for attendance and employee data
 */

const ExcelService = require('../services/excelService');
const Employee = require('../models/Employee');
const AttendanceSalary = require('../models/AttendanceSalary');
const SalaryGenerationService = require('../services/salaryGenerationService');
const { successResponse } = require('../utils/responseHandler');
const { AppError } = require('../utils/errorHandler');

const scopeEmployeeQuery = (req, query = {}) => {
  if (req.user?.role === 'supervisor') {
    return { ...query, supervisor_id: req.user._id };
  }
  return query;
};

class ExcelUploadController {
  /**
   * Upload and validate attendance Excel
   */
  static async uploadAttendanceExcel(req, res, next) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      const { month, year, salaryType } = req.body;
      const supervisorId = req.user.id;

      // Parse Excel file
      const { entries, errors, columnMapping } = await ExcelService.parseAttendanceExcel(
        req.file.path
      );

      if (entries.length === 0 && errors.length > 0) {
        return successResponse(
          res,
          { errors, columnMapping },
          'No valid entries found in file',
          400
        );
      }

      // Enrich entries with employee data
      const enrichedEntries = [];
      const validationErrors = [];

      for (const entry of entries) {
        try {
          // Find employee by CLMS ID
          const employee = await Employee.findOne(scopeEmployeeQuery(req, { clmsId: entry.clmsId }));

          if (!employee) {
            validationErrors.push({
              clmsId: entry.clmsId,
              error: 'Employee not found under your supervision'
            });
            continue;
          }

          enrichedEntries.push({
            employee_id: employee._id,
            clms_id: entry.clmsId,
            name: entry.name,
            month: parseInt(month),
            year: parseInt(year),
            days_present: entry.days,
            rate_per_day: entry.rate || employee.comp_rate || 0,
            gov_rate: employee.gov_rate || 0,
            salaryType: salaryType || 'normal'
          });
        } catch (error) {
          validationErrors.push({
            clmsId: entry.clmsId,
            error: error.message
          });
        }
      }

      return successResponse(
        res,
        {
          validEntries: enrichedEntries.length,
          invalidEntries: validationErrors.length,
          totalEntries: entries.length,
          validData: enrichedEntries,
          errors: [...errors, ...validationErrors],
          columnMapping,
          nextStep: 'Review data and confirm upload'
        },
        'Excel file validated successfully',
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirm and save attendance from Excel
   */
  static async confirmAttendanceUpload(req, res, next) {
    try {
      const { attendanceData, month, year, salaryType } = req.body;
      const supervisorId = req.user.id;

      if (!attendanceData || !Array.isArray(attendanceData) || attendanceData.length === 0) {
        throw new AppError('No attendance data provided', 400);
      }

      // Validate data
      const validation = await SalaryGenerationService.validateSalaryData(attendanceData);

      if (!validation.isValid) {
        return successResponse(
          res,
          { errors: validation.errors, warnings: validation.warnings },
          'Validation failed',
          400
        );
      }

      const savedRecords = [];
      const failedRecords = [];

      // Save each record to database
      for (const record of attendanceData) {
        try {
          const scopedEmployee = await Employee.exists(scopeEmployeeQuery(req, { _id: record.employee_id }));
          if (!scopedEmployee) {
            failedRecords.push({
              clmsId: record.clms_id,
              error: 'Employee is not under your supervision'
            });
            continue;
          }

          // Check for duplicate
          const existing = await AttendanceSalary.findOne({
            employee_id: record.employee_id,
            month: parseInt(month),
            year: parseInt(year),
            entered_by_supervisor: supervisorId
          });

          if (existing) {
            failedRecords.push({
              clmsId: record.clms_id,
              error: 'Duplicate entry for this employee in same month'
            });
            continue;
          }

          // Create and save attendance record
          const attendance = new AttendanceSalary({
            employee_id: record.employee_id,
            clms_id: record.clms_id,
            month: parseInt(month),
            year: parseInt(year),
            days_present: record.days_present,
            rate_per_day: record.rate_per_day,
            entered_by_supervisor: supervisorId,
            source: 'bulk',
            salary_type: salaryType || 'normal'
          });

          await attendance.save();
          savedRecords.push(attendance);
        } catch (error) {
          failedRecords.push({
            clmsId: record.clms_id,
            error: error.message
          });
        }
      }

      return successResponse(
        res,
        {
          savedCount: savedRecords.length,
          failedCount: failedRecords.length,
          totalProcessed: attendanceData.length,
          warnings: validation.warnings,
          errors: failedRecords,
          records: savedRecords.map((r) => ({
            id: r._id,
            clmsId: r.clms_id,
            days: r.days_present,
            rate: r.rate_per_day
          }))
        },
        `Successfully uploaded ${savedRecords.length} records. ${failedRecords.length} records failed.`,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload employee master data from Excel
   */
  static async uploadEmployeeExcel(req, res, next) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      // Parse employee Excel (would need similar implementation)
      // This is a placeholder for employee master upload
      // Implementation would be similar to attendance upload

      return successResponse(
        res,
        { message: 'Employee upload endpoint - implementation pending' },
        'Employee upload functionality',
        501
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download salary template Excel
   */
  static async downloadSalaryTemplate(req, res, next) {
    try {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Attendance Template');

      // Define columns
      worksheet.columns = [
        { header: 'CLMS ID', key: 'clmsId', width: 15 },
        { header: 'Employee Name', key: 'name', width: 25 },
        { header: 'Days Worked', key: 'days', width: 12 },
        { header: 'Daily Rate', key: 'rate', width: 12, optional: true }
      ];

      // Style header
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

      // Add sample rows
      worksheet.addRow({
        clmsId: 'CLM001',
        name: 'John Doe',
        days: 25,
        rate: 500
      });

      worksheet.addRow({
        clmsId: 'CLM002',
        name: 'Jane Smith',
        days: 24,
        rate: 550
      });

      // Add borders and formatting
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=attendance_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download validation error report
   */
  static async downloadErrorReport(req, res, next) {
    try {
      const { errors } = req.body;

      if (!errors || !Array.isArray(errors)) {
        throw new AppError('No error data provided', 400);
      }

      const workbook = await ExcelService.exportValidationErrors(errors);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=validation_errors.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get upload history
   */
  static async getUploadHistory(req, res, next) {
    try {
      const { month, year, limit = 20 } = req.query;
      const supervisorId = req.user.id;

      const query = { entered_by_supervisor: supervisorId, source: 'bulk' };

      if (month && year) {
        query.month = parseInt(month);
        query.year = parseInt(year);
      }

      const records = await AttendanceSalary.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .lean();

      const grouped = {};
      records.forEach((r) => {
        const key = `${r.month}/${r.year}`;
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(r);
      });

      return successResponse(
        res,
        {
          uploadHistory: grouped,
          totalRecords: records.length
        },
        'Upload history retrieved'
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ExcelUploadController;
