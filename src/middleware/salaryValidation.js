const { AppError } = require('../utils/errorHandler');

class SalaryValidation {
  /**
   * Validate attendance entry data
   */
  static validateAttendanceEntry = (req, res, next) => {
    try {
      const { employee_id, clms_id, month, year, days_present, rate_per_day } = req.body;

      const errors = [];

      if (!employee_id) errors.push('Employee ID is required');
      if (!clms_id) errors.push('CLMS ID is required');
      if (!month || month < 1 || month > 12) errors.push('Valid month (1-12) is required');
      if (!year || year < 2000) errors.push('Valid year is required');
      if (days_present === undefined || days_present < 0) {
        errors.push('Days present must be >= 0');
      }
      if (!rate_per_day || rate_per_day <= 0) {
        errors.push('Rate per day must be positive');
      }

      if (errors.length > 0) {
        throw new AppError(errors.join(', '), 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Validate bulk attendance upload
   */
  static validateBulkAttendance = (req, res, next) => {
    try {
      const { month, year } = req.body;

      if (!month || month < 1 || month > 12) {
        throw new AppError('Valid month (1-12) is required', 400);
      }

      if (!year || year < 2000) {
        throw new AppError('Valid year is required', 400);
      }

      if (!req.file) {
        throw new AppError('Excel file is required', 400);
      }

      // Check file extension
      const allowedExtensions = ['.xlsx', '.xls'];
      const fileExtension = req.file.originalname.substring(
        req.file.originalname.lastIndexOf('.')
      );

      if (!allowedExtensions.includes(fileExtension.toLowerCase())) {
        throw new AppError('Only Excel files (.xlsx, .xls) are allowed', 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Validate salary generation data
   */
  static validateSalaryGeneration = (req, res, next) => {
    try {
      const { month, year, bonusConfig, deductionConfig } = req.body;

      const errors = [];

      if (!month || month < 1 || month > 12) {
        errors.push('Valid month (1-12) is required');
      }

      if (!year || year < 2000) {
        errors.push('Valid year is required');
      }

      if (deductionConfig) {
        if (
          deductionConfig.pf_percentage < 0 ||
          deductionConfig.pf_percentage > 100
        ) {
          errors.push('PF percentage must be between 0-100');
        }

        if (
          deductionConfig.esic_percentage < 0 ||
          deductionConfig.esic_percentage > 100
        ) {
          errors.push('ESIC percentage must be between 0-100');
        }
      }

      if (bonusConfig && bonusConfig.bonuses) {
        bonusConfig.bonuses.forEach((bonus, index) => {
          if (!bonus.name) {
            errors.push(`Bonus ${index + 1}: Name is required`);
          }
          if (bonus.percentage < 0 || bonus.percentage > 100) {
            errors.push(`Bonus ${index + 1}: Percentage must be between 0-100`);
          }
        });
      }

      if (errors.length > 0) {
        throw new AppError(errors.join(', '), 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Validate month-year query parameters
   */
  static validateMonthYear = (req, res, next) => {
    try {
      const { month, year } = req.query;

      if (!month || month < 1 || month > 12) {
        throw new AppError('Valid month (1-12) is required', 400);
      }

      if (!year || year < 2000) {
        throw new AppError('Valid year is required', 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Validate salary calculation parameters
   */
  static validateSalaryCalculation = (req, res, next) => {
    try {
      const { numberOfDays, wageRate, govWageRate, salaryType, otAmount, advance } = req.body;

      const errors = [];

      if (numberOfDays === undefined || numberOfDays < 0 || numberOfDays > 31) {
        errors.push('Number of days must be between 0 and 31');
      }

      if (!wageRate || wageRate < 0) {
        errors.push('Wage rate must be a positive number');
      }

      if (!govWageRate || govWageRate < 0) {
        errors.push('Gov wage rate must be a positive number');
      }

      if (otAmount && otAmount < 0) {
        errors.push('OT Amount cannot be negative');
      }

      if (advance && advance < 0) {
        errors.push('Advance cannot be negative');
      }

      if (!['normal', 'gov'].includes(salaryType)) {
        errors.push('Salary type must be "normal" or "gov"');
      }

      if (errors.length > 0) {
        throw new AppError(errors.join(', '), 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Validate final submission (lock attendance)
   */
  static validateFinalSubmission = (req, res, next) => {
    try {
      const { month, year, salaryType } = req.body;

      const errors = [];

      if (!month || month < 1 || month > 12) {
        errors.push('Valid month (1-12) is required');
      }

      if (!year || year < 2000) {
        errors.push('Valid year is required');
      }

      if (!['normal', 'gov', 'both'].includes(salaryType)) {
        errors.push('Salary type must be "normal", "gov", or "both"');
      }

      if (errors.length > 0) {
        throw new AppError(errors.join(', '), 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Validate attendance lock status before edit
   */
  static checkAttendanceLock = (Model) => {
    return async (req, res, next) => {
      try {
        const { month, year } = req.body;

        // Find locked attendance for this month/year
        const locked = await Model.findOne({
          month,
          year,
          lockedByAdmin: true
        });

        if (locked) {
          throw new AppError(
            'This salary period is locked by admin and cannot be edited',
            403
          );
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Check for duplicate attendance entry
   */
  static checkDuplicateAttendance = (Model) => {
    return async (req, res, next) => {
      try {
        const { clms_id, month, year, supervisor_id } = req.body;
        const { id } = req.params;

        const existing = await Model.findOne({
          clms_id,
          month,
          year,
          supervisor_id
        });

        // Allow update if the found record is the one being updated
        if (existing && existing._id.toString() !== id) {
          throw new AppError(
            'Duplicate attendance entry for this employee in the same month',
            409
          );
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Validate Excel file requirements
   */
  static validateExcelFile = (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        throw new AppError('Only Excel files (.xlsx, .xls) are allowed', 400);
      }

      if (req.file.size > 5 * 1024 * 1024) {
        // 5MB limit
        throw new AppError('File size must not exceed 5MB', 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Validate salary report parameters
   */
  static validateSalaryReport = (req, res, next) => {
    try {
      const { month, year, salaryType } = req.query;

      const errors = [];

      if (!month || month < 1 || month > 12) {
        errors.push('Valid month (1-12) is required');
      }

      if (!year || year < 2000) {
        errors.push('Valid year is required');
      }

      if (salaryType && !['normal', 'gov', 'both'].includes(salaryType)) {
        errors.push('Salary type must be "normal", "gov", or "both"');
      }

      if (errors.length > 0) {
        throw new AppError(errors.join(', '), 400);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = SalaryValidation;
