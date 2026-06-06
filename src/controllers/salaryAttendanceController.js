const SalaryAttendanceService = require('../services/salaryAttendanceService');
const ExcelService = require('../services/excelService');
const Employee = require('../models/Employee');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { AppError } = require('../utils/errorHandler');

const scopeEmployeeQuery = (req, query = {}) => {
  if (req.user?.role === 'supervisor') {
    return { ...query, supervisor_id: req.user._id };
  }
  return query;
};

class AttendanceController {
  /**
   * Save manual attendance entry
   */
  static async saveAttendanceEntry(req, res, next) {
    try {
      const { employee_id, clms_id, month, year, days_present, rate_per_day, ot_amount = 0, advance = 0 } = req.body;
      const supervisor_id = req.user.id;
      const employeeLookup = [];
      if (employee_id) employeeLookup.push({ _id: employee_id });
      if (clms_id) employeeLookup.push({ clmsId: clms_id });

      if (!employeeLookup.length) {
        throw new AppError('Employee ID or CLMS ID is required', 400);
      }

      const scopedEmployee = await Employee.findOne(scopeEmployeeQuery(req, {
        $or: employeeLookup,
      })).select('_id');

      if (!scopedEmployee) {
        throw new AppError('Employee is not under your supervision', 403);
      }

      const entry = await SalaryAttendanceService.saveAttendanceEntry({
        employee_id,
        clms_id,
        month,
        year,
        days_present,
        rate_per_day,
        ot_amount,
        advance,
        supervisor_id,
        source: 'manual',
      });

      return successResponse(res, entry, 'Attendance entry saved successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Save multiple attendance entries (bulk upload)
   */
  static async saveBulkAttendance(req, res, next) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      const supervisor_id = req.user.id;

      // Parse Excel file
      const { entries, errors } = await ExcelService.parseAttendanceExcel(req.file.path);

      if (entries.length === 0) {
        throw new AppError('No valid entries found in Excel file', 400);
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
              error: 'Employee not found under your supervision',
            });
            continue;
          }

          // Use uploaded rate or fetch from employee master
          const rate_per_day = entry.rate || employee.comp_rate || 0;

          enrichedEntries.push({
            employee_id: employee._id,
            clms_id: entry.clmsId,
            month: req.body.month,
            year: req.body.year,
            days_present: entry.days,
            rate_per_day,
          });
        } catch (error) {
          validationErrors.push({
            clmsId: entry.clmsId,
            error: error.message,
          });
        }
      }

      // Save all entries
      const result = await SalaryAttendanceService.saveMultipleEntries(
        enrichedEntries,
        supervisor_id
      );

      return successResponse(
        res,
        {
          success: result.success,
          errors: [...result.errors, ...validationErrors],
          summary: {
            total: entries.length,
            saved: result.success.length,
            failed: result.errors.length + validationErrors.length,
          },
        },
        'Bulk attendance upload completed',
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get attendance by month/year
   */
  static async getAttendanceByMonthYear(req, res, next) {
    try {
      const { month, year, supervisorId } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const entries = await SalaryAttendanceService.getAttendanceByMonthYear(
        parseInt(month),
        parseInt(year),
        supervisorId
      );

      return successResponse(res, entries, 'Attendance records retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get supervisor's attendance entries
   */
  static async getSupervisorAttendance(req, res, next) {
    try {
      const { month, year } = req.query;
      const supervisor_id = req.user.id;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const entries = await SalaryAttendanceService.getSupervisorAttendance(
        supervisor_id,
        parseInt(month),
        parseInt(year)
      );

      return successResponse(res, entries, 'Supervisor attendance records retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update attendance entry
   */
  static async updateAttendanceEntry(req, res, next) {
    try {
      const { id } = req.params;
      const { days_present, rate_per_day, ot_amount, advance } = req.body;
      const updates = {};

      if (days_present !== undefined) updates.days_present = Number(days_present);
      if (rate_per_day !== undefined) updates.rate_per_day = Number(rate_per_day);
      if (ot_amount !== undefined) updates.ot_amount = Number(ot_amount);
      if (advance !== undefined) updates.advance = Number(advance);

      const entry = await SalaryAttendanceService.updateAttendanceEntry(id, updates);

      return successResponse(res, entry, 'Attendance entry updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete attendance entry
   */
  static async deleteAttendanceEntry(req, res, next) {
    try {
      const { id } = req.params;

      await SalaryAttendanceService.deleteAttendanceEntry(id);

      return successResponse(res, null, 'Attendance entry deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search employee by CLMS ID or name
   */
  static async searchEmployee(req, res, next) {
    try {
      const { query } = req.query;

      if (!query) {
        throw new AppError('Search query is required', 400);
      }

      const employees = await Employee.find(
        scopeEmployeeQuery(req, {
          $or: [
            { clmsId: { $regex: query, $options: 'i' } },
            { name: { $regex: query, $options: 'i' } },
          ],
          status: 'Valid',
        }),
        'employeeId name clmsId designation dailyWagesRate govDailyWage gov_rate comp_rate'
      ).limit(10).lean();

      const normalizedEmployees = employees.map((employee) => {
        const dailyWageRate = employee.dailyWagesRate || employee.comp_rate || 0;
        const govDailyRate = employee.govDailyWage || employee.gov_rate || 0;
        return {
          ...employee,
          dailyWageRate,
          govDailyRate,
          comp_rate: dailyWageRate,
          gov_rate: govDailyRate,
        };
      });

      return successResponse(res, normalizedEmployees, 'Employees found successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calculate salary for attendance record
   */
  static async calculateSalary(req, res, next) {
    try {
      const { clms_id, numberOfDays, salaryType, otAmount, advance } = req.body;

      // Find employee by CLMS ID
      const employee = await Employee.findOne(scopeEmployeeQuery(req, { clmsId: clms_id }));

      if (!employee) {
        throw new AppError('Employee not found under your supervision', 404);
      }

      // Get the salary calculation service
      const SalaryGenerationService = require('../services/salaryGenerationService');

      // Calculate salary
      const result = await SalaryGenerationService.generateSingleSalary(
        {
          numberOfDays,
          otAmount: otAmount || 0,
          advance: advance || 0,
          salaryType: salaryType || 'normal'
        },
        {
          dailyWageRate: employee.dailyWagesRate || employee.comp_rate || 0,
          govDailyWageRate: employee.govDailyWage || employee.gov_rate || 0
        }
      );

      if (!result.success) {
        throw new AppError(result.error, 400);
      }

      return successResponse(
        res,
        {
          employeeId: employee.employeeId,
          clmsId: employee.clmsId,
          name: employee.name,
          designation: employee.designation,
          ...result.salaryDetails
        },
        'Salary calculated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lock salary month (prevent further edits)
   */
  static async lockSalaryMonth(req, res, next) {
    try {
      const { month, year } = req.body;
      const admin_id = req.user.id;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      if (req.user.role !== 'admin') {
        throw new AppError('Only admins can lock salary months', 403);
      }

      const SalaryGenerationService = require('../services/salaryGenerationService');
      const AttendanceSalary = require('../models/AttendanceSalary');

      const result = await SalaryGenerationService.lockSalaryMonth(
        month,
        year,
        admin_id
      );

      return successResponse(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unlock salary month (allow edits)
   */
  static async unlockSalaryMonth(req, res, next) {
    try {
      const { month, year } = req.body;
      const admin_id = req.user.id;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      if (req.user.role !== 'admin') {
        throw new AppError('Only admins can unlock salary months', 403);
      }

      const SalaryGenerationService = require('../services/salaryGenerationService');

      const result = await SalaryGenerationService.unlockSalaryMonth(
        month,
        year,
        admin_id
      );

      return successResponse(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Finalize attendance for month (final submit)
   */
  static async finalizeAttendance(req, res, next) {
    try {
      const { month, year, salaryType } = req.body;
      const supervisor_id = req.user.id;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      // Get attendance records
      const AttendanceSalary = require('../models/AttendanceSalary');
      const records = await AttendanceSalary.find({
        month,
        year,
        entered_by_supervisor: supervisor_id
      })
        .populate('employee_id')
        .lean();

      if (records.length === 0) {
        throw new AppError('No attendance records found for this period', 404);
      }

      // Mark as finalized
      await AttendanceSalary.updateMany(
        { month, year, entered_by_supervisor: supervisor_id },
        { 
          is_final_submitted: true,
          final_submitted_at: new Date(),
          salary_type: salaryType || 'normal'
        }
      );

      return successResponse(
        res,
        { totalRecords: records.length, month, year },
        'Attendance finalized successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get salary summary for month/year
   */
  static async getSalarySummary(req, res, next) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const AttendanceSalary = require('../models/AttendanceSalary');
      const SalaryGenerationService = require('../services/salaryGenerationService');

      // Get all attendance records for the month
      const records = await AttendanceSalary.find({
        month: parseInt(month),
        year: parseInt(year)
      })
        .populate('employee_id', 'clmsId name designation comp_rate gov_rate')
        .lean();

      if (records.length === 0) {
        return successResponse(res, null, 'No records found for this period');
      }

      // Calculate salary for each record
      const salaryRecords = records.map((record) => {
        const employee = record.employee_id;
        const { salaryDetails } = require('../utils/salaryCalculator').calculateSalary({
          numberOfDays: record.days_present,
          wageRate: employee?.comp_rate || 0,
          govWageRate: employee?.gov_rate || 0,
          salaryType: record.salary_type || 'normal'
        });
        return { ...record, salaryDetails };
      });

      // Get summary
      const summary = SalaryGenerationService.calculateSalarySummary(salaryRecords);

      return successResponse(
        res,
        { summary, recordCount: salaryRecords.length },
        'Salary summary retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AttendanceController;
