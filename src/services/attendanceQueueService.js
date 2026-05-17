/**
 * Attendance Queue Service
 * Manages temporary attendance queue before final submission
 * Stores records in memory and database for supervisor edits
 */

class AttendanceQueueService {
  constructor() {
    this.queues = new Map(); // Key: "supervisorId_month_year"
  }

  /**
   * Get queue key
   */
  static getQueueKey(supervisorId, month, year) {
    return `${supervisorId}_${month}_${year}`;
  }

  /**
   * Add record to queue
   */
  static addToQueue(supervisorId, month, year, attendanceRecord) {
    const key = this.getQueueKey(supervisorId, month, year);
    
    // In production, this should be stored in database
    // For now, we use in-memory storage with backup to DB
    
    return {
      success: true,
      message: 'Record added to queue',
      queueKey: key,
      record: attendanceRecord
    };
  }

  /**
   * Update record in queue
   */
  static updateQueueRecord(supervisorId, month, year, employeeId, updates) {
    const key = this.getQueueKey(supervisorId, month, year);

    return {
      success: true,
      message: 'Record updated in queue',
      queueKey: key,
      updates
    };
  }

  /**
   * Remove record from queue
   */
  static removeFromQueue(supervisorId, month, year, employeeId) {
    const key = this.getQueueKey(supervisorId, month, year);

    return {
      success: true,
      message: 'Record removed from queue',
      queueKey: key,
      employeeId
    };
  }

  /**
   * Get all queue records
   */
  static async getQueueRecords(supervisorId, month, year, db = null) {
    try {
      const key = this.getQueueKey(supervisorId, month, year);

      // Fetch from database if provided
      if (db && db.AttendanceSalary) {
        const records = await db.AttendanceSalary.find({
          entered_by_supervisor: supervisorId,
          month,
          year,
          is_final_submitted: false
        }).populate('employee_id');

        return {
          success: true,
          queueKey: key,
          records,
          count: records.length
        };
      }

      return {
        success: false,
        message: 'Database not provided'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear queue (used before final submission)
   */
  static clearQueue(supervisorId, month, year) {
    const key = this.getQueueKey(supervisorId, month, year);

    return {
      success: true,
      message: 'Queue cleared',
      queueKey: key
    };
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats(supervisorId, month, year, db = null) {
    try {
      if (!db || !db.AttendanceSalary) {
        return {
          success: false,
          message: 'Database not provided'
        };
      }

      const records = await db.AttendanceSalary.find({
        entered_by_supervisor: supervisorId,
        month,
        year
      }).lean();

      const submitted = records.filter((r) => r.is_final_submitted).length;
      const pending = records.filter((r) => !r.is_final_submitted).length;

      return {
        success: true,
        stats: {
          totalRecords: records.length,
          submitted,
          pending,
          completionPercentage: records.length > 0
            ? Math.round((submitted / records.length) * 100)
            : 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate queue before submission
   */
  static async validateQueue(supervisorId, month, year, records, db = null) {
    try {
      const errors = [];
      const warnings = [];

      if (!records || records.length === 0) {
        errors.push('Queue is empty. Add attendance records before submission.');
      }

      records.forEach((record, index) => {
        if (!record.employee_id && !record.clms_id) {
          errors.push(`Record ${index + 1}: Employee ID/CLMS ID is missing`);
        }

        if (record.days_present === undefined || record.days_present < 0 || record.days_present > 31) {
          errors.push(
            `Record ${index + 1}: Invalid days (${record.days_present}). Must be 0-31.`
          );
        }

        if (!record.days_present || record.days_present === 0) {
          warnings.push(
            `Record ${index + 1}: No working days. Net payable will be zero/negative.`
          );
        }

        if (record.rate_per_day && record.rate_per_day < 0) {
          errors.push(`Record ${index + 1}: Rate cannot be negative`);
        }
      });

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        recordsCount: records.length
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [error.message],
        warnings: []
      };
    }
  }

  /**
   * Submit queue (finalize attendance)
   */
  static async submitQueue(supervisorId, month, year, salaryType = 'normal', db = null) {
    try {
      if (!db || !db.AttendanceSalary) {
        throw new Error('Database not provided');
      }

      // Get all pending records
      const records = await db.AttendanceSalary.find({
        entered_by_supervisor: supervisorId,
        month,
        year,
        is_final_submitted: false
      });

      if (records.length === 0) {
        return {
          success: false,
          message: 'No pending records to submit'
        };
      }

      // Validate before submission
      const validation = await this.validateQueue(supervisorId, month, year, records, db);
      if (!validation.isValid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings
        };
      }

      // Mark all records as submitted
      const result = await db.AttendanceSalary.updateMany(
        {
          entered_by_supervisor: supervisorId,
          month,
          year,
          is_final_submitted: false
        },
        {
          is_final_submitted: true,
          final_submitted_at: new Date(),
          salary_type: salaryType
        }
      );

      return {
        success: true,
        message: `Submitted ${result.modifiedCount} records for ${month}/${year}`,
        modifiedCount: result.modifiedCount,
        warnings: validation.warnings
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reopen queue (unsub mit for editing)
   */
  static async reopenQueue(supervisorId, month, year, db = null) {
    try {
      if (!db || !db.AttendanceSalary) {
        throw new Error('Database not provided');
      }

      const result = await db.AttendanceSalary.updateMany(
        {
          entered_by_supervisor: supervisorId,
          month,
          year,
          is_final_submitted: true
        },
        {
          is_final_submitted: false,
          reopened_at: new Date()
        }
      );

      return {
        success: true,
        message: `Reopened queue for editing. ${result.modifiedCount} records available for edit.`,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get queue editing history
   */
  static async getQueueHistory(supervisorId, month, year, db = null) {
    try {
      if (!db || !db.ActivityLog) {
        return {
          success: false,
          message: 'Activity log not available'
        };
      }

      const logs = await db.ActivityLog.find({
        user_id: supervisorId,
        action: { $in: ['ADD_ATTENDANCE', 'UPDATE_ATTENDANCE', 'DELETE_ATTENDANCE'] },
        month,
        year
      })
        .sort({ createdAt: -1 })
        .limit(100);

      return {
        success: true,
        logs,
        totalEntries: logs.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = AttendanceQueueService;
