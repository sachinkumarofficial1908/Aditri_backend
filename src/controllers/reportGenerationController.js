/**
 * Report Generation Controller
 * Generates salary reports in various formats (Excel, PDF, JSON)
 */

const AttendanceSalary = require('../models/AttendanceSalary');
const Employee = require('../models/Employee');
const ExcelService = require('../services/excelService');
const SalaryGenerationService = require('../services/salaryGenerationService');
const { successResponse } = require('../utils/responseHandler');
const { AppError } = require('../utils/errorHandler');
const { calculateSalary } = require('../utils/salaryCalculator');

class ReportGenerationController {
  /**
   * Generate monthly salary report
   */
  static async generateMonthlySalaryReport(req, res, next) {
    try {
      const { month, year, salaryType, format } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      // Fetch attendance records
      const records = await AttendanceSalary.find({
        month: parseInt(month),
        year: parseInt(year)
      })
        .populate('employee_id')
        .lean();

      if (records.length === 0) {
        throw new AppError('No records found for this period', 404);
      }

      // Calculate salary for each record
      const salaryRecords = records.map((record) => {
        const employee = record.employee_id;
        const salary = calculateSalary({
          numberOfDays: record.days_present,
          wageRate: employee?.comp_rate || 0,
          govWageRate: employee?.gov_rate || 0,
          salaryType: record.salary_type || 'normal'
        });

        return {
          ...record,
          employeeData: {
            clmsId: employee?.clmsId,
            name: employee?.name,
            designation: employee?.designation,
            gradeOfWork: employee?.gradeOfWork,
            bankAccount: employee?.bankAccount,
            ifsc: employee?.ifsc,
            uanNumber: employee?.uanNumber,
            esicNumber: employee?.esicNumber,
            dailyWageRate: employee?.comp_rate,
            govDailyWageRate: employee?.gov_rate
          },
          numberOfDays: record.days_present,
          salaryDetails: salary
        };
      });

      // Filter by salary type if specified
      const filtered =
        salaryType && salaryType !== 'both'
          ? salaryRecords.filter((r) => r.salary_type === salaryType)
          : salaryRecords;

      // Generate summary
      const summary = SalaryGenerationService.calculateSalarySummary(filtered);

      // Return in requested format
      if (format === 'excel') {
        const workbook = await ExcelService.exportSalaryReport(
          filtered,
          month,
          year,
          summary
        );

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=salary_report_${month}_${year}.xlsx`
        );

        await workbook.xlsx.write(res);
        res.end();
      } else {
        return successResponse(
          res,
          {
            month,
            year,
            summary,
            records: filtered,
            totalRecords: filtered.length
          },
          'Monthly salary report generated'
        );
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate supervisor salary report
   */
  static async generateSupervisorReport(req, res, next) {
    try {
      const { month, year, supervisorId, format } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const query = {
        month: parseInt(month),
        year: parseInt(year)
      };

      if (supervisorId) {
        query.entered_by_supervisor = supervisorId;
      }

      const records = await AttendanceSalary.find(query)
        .populate('employee_id')
        .populate('entered_by_supervisor', 'name')
        .lean();

      if (records.length === 0) {
        throw new AppError('No records found for this period', 404);
      }

      // Group by supervisor
      const grouped = {};
      records.forEach((record) => {
        const supervisor = record.entered_by_supervisor?.name || 'Unknown';
        if (!grouped[supervisor]) {
          grouped[supervisor] = {
            supervisor,
            records: [],
            totalDays: 0,
            totalGross: 0,
            totalDeduction: 0,
            totalNetPayable: 0
          };
        }

        const salary = calculateSalary({
          numberOfDays: record.days_present,
          wageRate: record.employee_id?.comp_rate || 0,
          govWageRate: record.employee_id?.gov_rate || 0
        });

        grouped[supervisor].records.push({
          clmsId: record.clms_id,
          name: record.employee_id?.name,
          days: record.days_present,
          salary
        });

        grouped[supervisor].totalDays += record.days_present;
        grouped[supervisor].totalGross += salary.gross;
        grouped[supervisor].totalDeduction += salary.netDeduction;
        grouped[supervisor].totalNetPayable += salary.netPayable;
      });

      return successResponse(
        res,
        {
          month,
          year,
          supervisorReports: grouped,
          totalRecords: records.length
        },
        'Supervisor report generated'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate wage slip report
   */
  static async generateWageSlipReport(req, res, next) {
    try {
      const { employeeId, month, year } = req.query;

      if (!employeeId || !month || !year) {
        throw new AppError(
          'Employee ID, month, and year are required',
          400
        );
      }

      const record = await AttendanceSalary.findOne({
        employee_id: employeeId,
        month: parseInt(month),
        year: parseInt(year)
      }).populate('employee_id');

      if (!record) {
        throw new AppError('No record found for this employee', 404);
      }

      const employee = record.employee_id;
      const salary = calculateSalary({
        numberOfDays: record.days_present,
        wageRate: employee?.comp_rate || 0,
        govWageRate: employee?.gov_rate || 0
      });

      return successResponse(
        res,
        {
          employee: {
            employeeId: employee?.employeeId,
            clmsId: employee?.clmsId,
            name: employee?.name,
            designation: employee?.designation,
            gradeOfWork: employee?.gradeOfWork,
            bankAccount: employee?.bankAccount,
            ifsc: employee?.ifsc,
            uanNumber: employee?.uanNumber,
            esicNumber: employee?.esicNumber,
            aadhaarNumber: employee?.aadhaarNumber,
            mobile: employee?.mobile
          },
          period: { month, year },
          attendance: {
            daysWorked: record.days_present,
            dailyRate: employee?.comp_rate,
            govDailyRate: employee?.gov_rate
          },
          salary,
          generatedAt: new Date()
        },
        'Wage slip generated'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate department-wise report
   */
  static async generateDepartmentReport(req, res, next) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const records = await AttendanceSalary.find({
        month: parseInt(month),
        year: parseInt(year)
      })
        .populate('employee_id')
        .lean();

      const grouped = {};

      records.forEach((record) => {
        const dept = record.employee_id?.department || 'Unassigned';
        if (!grouped[dept]) {
          grouped[dept] = {
            department: dept,
            employees: 0,
            totalDays: 0,
            totalGross: 0,
            totalDeduction: 0,
            totalNetPayable: 0,
            employees: []
          };
        }

        const salary = calculateSalary({
          numberOfDays: record.days_present,
          wageRate: record.employee_id?.comp_rate || 0,
          govWageRate: record.employee_id?.gov_rate || 0
        });

        grouped[dept].employees.push({
          name: record.employee_id?.name,
          clmsId: record.clms_id,
          netPayable: salary.netPayable
        });

        grouped[dept].totalDays += record.days_present;
        grouped[dept].totalGross += salary.gross;
        grouped[dept].totalDeduction += salary.netDeduction;
        grouped[dept].totalNetPayable += salary.netPayable;
      });

      return successResponse(
        res,
        {
          month,
          year,
          departmentReports: grouped,
          totalRecords: records.length
        },
        'Department report generated'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate analytics/dashboard data
   */
  static async generateAnalytics(req, res, next) {
    try {
      const { month, year } = req.query;

      let query = {};
      if (month && year) {
        query = {
          month: parseInt(month),
          year: parseInt(year)
        };
      }

      const records = await AttendanceSalary.find(query)
        .populate('employee_id')
        .lean();

      if (records.length === 0) {
        return successResponse(
          res,
          {
            totalEmployees: 0,
            totalPayroll: 0,
            averageAttendance: 0,
            totalDays: 0
          },
          'Analytics data'
        );
      }

      let totalGross = 0;
      let totalDeduction = 0;
      let totalDays = 0;

      records.forEach((record) => {
        const salary = calculateSalary({
          numberOfDays: record.days_present,
          wageRate: record.employee_id?.comp_rate || 0,
          govWageRate: record.employee_id?.gov_rate || 0
        });

        totalGross += salary.gross;
        totalDeduction += salary.netDeduction;
        totalDays += record.days_present;
      });

      const avgAttendance = records.length > 0 ? totalDays / records.length : 0;

      return successResponse(
        res,
        {
          period: { month, year },
          totalEmployees: records.length,
          totalPayroll: totalGross,
          totalDeductions: totalDeduction,
          totalNetPayable: totalGross - totalDeduction,
          averageAttendance: Math.round(avgAttendance * 10) / 10,
          generatedAt: new Date()
        },
        'Analytics generated'
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReportGenerationController;
