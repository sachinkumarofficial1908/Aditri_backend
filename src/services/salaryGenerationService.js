const GovSalary = require('../models/GovSalary');
const CompanySalary = require('../models/CompanySalary');
const AttendanceSalary = require('../models/AttendanceSalary');
const Employee = require('../models/Employee');
const SalaryCalculationService = require('./salaryCalculationService');
const { AppError } = require('../utils/errorHandler');

class SalaryGenerationService {
  /**
   * Generate government salary for all employees with attendance data
   */
  static async generateGovSalary(month, year, bonusConfig, deductionConfig, admin_id) {
    try {
      // Get all attendance entries for month/year
      const attendanceEntries = await AttendanceSalary.find({
        month,
        year,
      }).populate('employee_id', 'gov_rate');

      if (!attendanceEntries || attendanceEntries.length === 0) {
        throw new AppError('No attendance entries found for selected month/year', 404);
      }

      const results = [];
      const errors = [];

      for (const attendance of attendanceEntries) {
        try {
          // Check if salary already exists
          const existingSalary = await GovSalary.findOne({
            employee_id: attendance.employee_id._id,
            month,
            year,
          });

          if (existingSalary) {
            errors.push({
              clms_id: attendance.clms_id,
              error: 'Salary already generated for this employee',
            });
            continue;
          }

          const employee = await Employee.findById(attendance.employee_id._id);
          const govRate = employee.govDailyWage || employee.gov_rate || 0;

          // Calculate salary
          const salaryCalculation = SalaryCalculationService.calculateGovSalary({
            days: attendance.days_present,
            gov_rate: govRate,
            bonuses: bonusConfig.bonuses || [],
            pf_percentage: deductionConfig.pf_percentage || 12,
            esic_percentage: deductionConfig.esic_percentage || 0.75,
          });

          // Create salary record
          const govSalary = new GovSalary({
            employee_id: attendance.employee_id._id,
            clms_id: attendance.clms_id,
            month,
            year,
            days: attendance.days_present,
            gov_rate: govRate,
            ...salaryCalculation,
            pf_percentage: deductionConfig.pf_percentage || 12,
            esic_percentage: deductionConfig.esic_percentage || 0.75,
            generated_by_admin: admin_id,
          });

          await govSalary.save();
          results.push(govSalary);
        } catch (error) {
          errors.push({
            clms_id: attendance.clms_id,
            error: error.message,
          });
        }
      }

      return {
        success: results,
        errors,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate company salary based on government salary
   */
  static async generateCompanySalary(month, year, bonusConfig, admin_id) {
    try {
      // Get all government salary records for month/year
      const govSalaries = await GovSalary.find({
        month,
        year,
      });

      if (!govSalaries || govSalaries.length === 0) {
        throw new AppError('No government salary records found. Generate government salary first.', 404);
      }

      const results = [];
      const errors = [];

      for (const govSalary of govSalaries) {
        try {
          // Check if company salary already exists
          const existingSalary = await CompanySalary.findOne({
            employee_id: govSalary.employee_id,
            month,
            year,
          });

          if (existingSalary) {
            errors.push({
              clms_id: govSalary.clms_id,
              error: 'Company salary already generated for this employee',
            });
            continue;
          }

          const employee = await Employee.findById(govSalary.employee_id);
          const compRate = employee.dailyWagesRate || employee.comp_rate || 0;

          // Calculate salary using company rate
          const salaryCalculation = SalaryCalculationService.calculateCompanySalary({
            days: govSalary.days,
            comp_rate: compRate,
            bonuses: bonusConfig.bonuses || [],
            pf: govSalary.pf,
            esic: govSalary.esic,
          });

          // Create company salary record
          const companySalary = new CompanySalary({
            employee_id: govSalary.employee_id,
            clms_id: govSalary.clms_id,
            month,
            year,
            days: govSalary.days,
            comp_rate: compRate,
            ...salaryCalculation,
            generated_by_admin: admin_id,
          });

          await companySalary.save();
          results.push(companySalary);
        } catch (error) {
          errors.push({
            clms_id: govSalary.clms_id,
            error: error.message,
          });
        }
      }

      return {
        success: results,
        errors,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get government salary records for month/year
   */
  static async getGovSalaries(month, year) {
    try {
      const salaries = await GovSalary.find({
        month,
        year,
      })
        .populate('employee_id', 'employeeId name clmsId')
        .populate('generated_by_admin', 'name email')
        .sort({ createdAt: -1 });

      return salaries;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get company salary records for month/year
   */
  static async getCompanySalaries(month, year) {
    try {
      const salaries = await CompanySalary.find({
        month,
        year,
      })
        .populate('employee_id', 'employeeId name clmsId')
        .populate('generated_by_admin', 'name email')
        .sort({ createdAt: -1 });

      return salaries;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update government salary record
   */
  static async updateGovSalary(id, updates) {
    try {
      const salary = await GovSalary.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      });

      if (!salary) {
        throw new AppError('Government salary record not found', 404);
      }

      return salary;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update company salary record
   */
  static async updateCompanySalary(id, updates) {
    try {
      const salary = await CompanySalary.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      });

      if (!salary) {
        throw new AppError('Company salary record not found', 404);
      }

      return salary;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Finalize government salary
   */
  static async finalizeGovSalary(month, year) {
    try {
      const result = await GovSalary.updateMany(
        { month, year },
        { status: 'finalized' }
      );

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Finalize company salary
   */
  static async finalizeCompanySalary(month, year) {
    try {
      const result = await CompanySalary.updateMany(
        { month, year },
        { status: 'finalized' }
      );

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate salary summary for period
   */
  static async calculateSalarySummary(salaryRecords) {
    try {
      const summary = {
        totalRecords: salaryRecords.length,
        totalGross: 0,
        totalPF: 0,
        totalESIC: 0,
        totalNetDeduction: 0,
        totalAdvance: 0,
        totalNetPayable: 0,
        averageGross: 0,
        averageNetPayable: 0
      };

      salaryRecords.forEach((record) => {
        if (record.gross_amount) {
          summary.totalGross += record.gross_amount || 0;
        }
        if (record.pf) {
          summary.totalPF += record.pf || 0;
        }
        if (record.esic) {
          summary.totalESIC += record.esic || 0;
        }
        summary.totalNetDeduction += (record.pf || 0) + (record.esic || 0);
        summary.totalAdvance += record.advance || 0;
        summary.totalNetPayable += record.net_payable || 0;
      });

      summary.averageGross =
        summary.totalRecords > 0
          ? summary.totalGross / summary.totalRecords
          : 0;
      summary.averageNetPayable =
        summary.totalRecords > 0
          ? summary.totalNetPayable / summary.totalRecords
          : 0;

      // Round to 2 decimal places
      Object.keys(summary).forEach((key) => {
        if (typeof summary[key] === 'number' && key !== 'totalRecords') {
          summary[key] = Math.round(summary[key] * 100) / 100;
        }
      });

      return summary;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate salary data before generation
   */
  static async validateSalaryData(attendanceRecords) {
    try {
      const errors = [];
      const warnings = [];

      attendanceRecords.forEach((record, index) => {
        if (!record.clms_id) {
          errors.push(`Row ${index + 1}: CLMS ID is missing`);
        }

        if (record.days_present < 0 || record.days_present > 31) {
          errors.push(
            `Row ${index + 1}: Invalid number of days (${record.days_present})`
          );
        }

        if (!record.days_present || record.days_present === 0) {
          warnings.push(`Row ${index + 1}: No working days recorded`);
        }

        if (record.advance && record.advance < 0) {
          errors.push(`Row ${index + 1}: Advance cannot be negative`);
        }
      });

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Lock salary for a month (prevent further edits)
   */
  static async lockSalaryMonth(month, year, locked_by) {
    try {
      const result = await AttendanceSalary.updateMany(
        { month, year },
        { lockedByAdmin: true, locked_at: new Date(), locked_by },
        { multi: true }
      );

      return {
        success: true,
        message: `Salary locked for ${month}/${year}`,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Unlock salary for a month (allow edits)
   */
  static async unlockSalaryMonth(month, year, unlocked_by) {
    try {
      const result = await AttendanceSalary.updateMany(
        { month, year },
        { lockedByAdmin: false, unlocked_at: new Date(), unlocked_by },
        { multi: true }
      );

      return {
        success: true,
        message: `Salary unlocked for ${month}/${year}`,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SalaryGenerationService;
