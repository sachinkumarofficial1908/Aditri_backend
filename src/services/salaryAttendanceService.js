const AttendanceSalary = require('../models/AttendanceSalary');
const Employee = require('../models/Employee');
const { AppError } = require('../utils/errorHandler');

class SalaryAttendanceService {
  /**
   * Save single attendance entry
   */
  static async saveAttendanceEntry(data) {
    try {
      const {
        employee_id,
        clms_id,
        month,
        year,
        days_present,
        rate_per_day,
        ot_amount = 0,
        advance = 0,
        supervisor_id,
        source = 'manual',
      } = data;
      let resolvedRatePerDay = Number(rate_per_day || 0);
      if (!resolvedRatePerDay || resolvedRatePerDay <= 0) {
        const employee = await Employee.findOne({
          $or: [
            { _id: employee_id },
            { clmsId: clms_id },
          ],
        }).select('dailyWagesRate comp_rate');
        resolvedRatePerDay = Number(employee?.dailyWagesRate || employee?.comp_rate || 0);
      }

      // Validate required fields
      this.validateAttendanceData({
        employee_id,
        clms_id,
        month,
        year,
        days_present,
        rate_per_day: resolvedRatePerDay,
        ot_amount,
        advance,
        supervisor_id,
      });

      // Check for existing entry
      const existingEntry = await AttendanceSalary.findOne({
        employee_id,
        month,
        year,
      });

      if (existingEntry) {
        throw new AppError('Attendance already exists for this employee in selected month/year', 400);
      }

      // Create new entry
      const entry = new AttendanceSalary({
        employee_id,
        clms_id,
        month,
        year,
        days_present,
        rate_per_day: resolvedRatePerDay,
        ot_amount,
        advance,
        entered_by_supervisor: supervisor_id,
        source,
      });

      await entry.save();
      return entry;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Save multiple attendance entries (bulk)
   */
  static async saveMultipleEntries(entriesData, supervisor_id) {
    try {
      const results = [];
      const errors = [];

      for (const entry of entriesData) {
        try {
          const result = await this.saveAttendanceEntry({
            ...entry,
            supervisor_id,
            source: 'bulk',
          });
          results.push(result);
        } catch (error) {
          errors.push({
            clms_id: entry.clms_id,
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
   * Update attendance entry
   */
  static async updateAttendanceEntry(id, updates) {
    try {
      const currentEntry = await AttendanceSalary.findById(id);

      if (!currentEntry) {
        throw new AppError('Attendance entry not found', 404);
      }

      this.validateAttendanceData({
        employee_id: currentEntry.employee_id,
        clms_id: currentEntry.clms_id,
        month: currentEntry.month,
        year: currentEntry.year,
        days_present: updates.days_present !== undefined ? updates.days_present : currentEntry.days_present,
        rate_per_day: updates.rate_per_day !== undefined ? updates.rate_per_day : currentEntry.rate_per_day,
        ot_amount: updates.ot_amount !== undefined ? updates.ot_amount : currentEntry.ot_amount,
        advance: updates.advance !== undefined ? updates.advance : currentEntry.advance,
        supervisor_id: currentEntry.entered_by_supervisor,
      });

      const entry = await AttendanceSalary.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      });

      if (!entry) {
        throw new AppError('Attendance entry not found', 404);
      }

      return entry;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete attendance entry
   */
  static async deleteAttendanceEntry(id) {
    try {
      const entry = await AttendanceSalary.findByIdAndDelete(id);

      if (!entry) {
        throw new AppError('Attendance entry not found', 404);
      }

      return entry;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get attendance for month/year
   */
  static async getAttendanceByMonthYear(month, year, supervisor_id = null) {
    try {
      const query = { month, year };

      if (supervisor_id) {
        query.entered_by_supervisor = supervisor_id;
      }

      const entries = await AttendanceSalary.find(query)
        .populate('employee_id', 'employeeId name clmsId gov_rate comp_rate')
        .populate('entered_by_supervisor', 'name email')
        .sort({ createdAt: -1 });

      return entries;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get attendance for employee
   */
  static async getEmployeeAttendance(employee_id, month, year) {
    try {
      const entry = await AttendanceSalary.findOne({
        employee_id,
        month,
        year,
      }).populate('employee_id', 'employeeId name clmsId gov_rate comp_rate');

      return entry;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all attendance by supervisor
   */
  static async getSupervisorAttendance(supervisor_id, month, year) {
    try {
      const entries = await AttendanceSalary.find({
        entered_by_supervisor: supervisor_id,
        month,
        year,
      })
        .populate('employee_id', 'employeeId name clmsId gov_rate comp_rate')
        .sort({ createdAt: -1 });

      return entries;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get merged attendance data (all supervisors for month/year)
   */
  static async getMergedAttendance(month, year) {
    try {
      const entries = await AttendanceSalary.find({
        month,
        year,
      })
        .populate('employee_id', 'employeeId name clmsId gov_rate comp_rate')
        .populate('entered_by_supervisor', 'name email')
        .sort({ entered_by_supervisor: 1, createdAt: 1 });

      // Group by supervisor
      const grouped = {};
      entries.forEach((entry) => {
        const supervisor_id = entry.entered_by_supervisor._id.toString();
        if (!grouped[supervisor_id]) {
          grouped[supervisor_id] = {
            supervisor: entry.entered_by_supervisor,
            entries: [],
          };
        }
        grouped[supervisor_id].entries.push(entry);
      });

      return grouped;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate attendance data
   */
  static validateAttendanceData(data) {
    const errors = [];

    if (!data.employee_id) errors.push('Employee ID is required');
    if (!data.clms_id) errors.push('CLMS ID is required');
    if (!data.month || data.month < 1 || data.month > 12) {
      errors.push('Valid month is required (1-12)');
    }
    if (!data.year || data.year < 2000) {
      errors.push('Valid year is required');
    }
    if (data.days_present === undefined || data.days_present < 0) {
      errors.push('Days present must be >= 0');
    }
    if (!data.rate_per_day || data.rate_per_day <= 0) {
      errors.push('Rate per day must be positive');
    }
    if (data.ot_amount !== undefined && data.ot_amount < 0) {
      errors.push('OT amount cannot be negative');
    }
    if (data.advance !== undefined && data.advance < 0) {
      errors.push('Advance cannot be negative');
    }
    if (!data.supervisor_id) errors.push('Supervisor ID is required');

    if (errors.length > 0) {
      throw new AppError(errors.join(', '), 400);
    }
  }
}

module.exports = SalaryAttendanceService;
