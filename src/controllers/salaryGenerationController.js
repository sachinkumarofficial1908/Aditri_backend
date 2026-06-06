const SalaryGenerationService = require('../services/salaryGenerationService');
const ExcelService = require('../services/excelService');
const GovSalary = require('../models/GovSalary');
const CompanySalary = require('../models/CompanySalary');
const Employee = require('../models/Employee');
const AttendanceSalary = require('../models/AttendanceSalary');
const SalaryProcessStatus = require('../models/SalaryProcessStatus');
const { successResponse } = require('../utils/responseHandler');
const { AppError } = require('../utils/errorHandler');
const { logActivity } = require('../middleware/activityLogger');

class SalaryGenerationController {
  static async enrichSalaryRows(salaries) {
    return Promise.all(
      salaries.map(async (salary) => {
        const employeeId = salary.employee_id?._id || salary.employee_id;
        const employee = await Employee.findById(employeeId).populate('supervisor_id', 'name email');
        return {
          ...salary.toObject(),
          employee_details: {
            name: employee?.name,
            clmsId: employee?.clmsId,
            supervisorId: employee?.supervisor_id?._id?.toString() || 'unassigned',
            supervisorName: employee?.supervisor_id?.name || 'Unassigned',
            supervisorEmail: employee?.supervisor_id?.email || '',
          },
        };
      })
    );
  }

  static async ensureGovSalaries(month, year, adminId, bonusConfig = { bonuses: [] }, deductionConfig = { pf_percentage: 12, esic_percentage: 0.75 }) {
    let salaries = await SalaryGenerationService.getGovSalaries(month, year);
    if (!salaries.length) {
      await SalaryGenerationService.generateGovSalary(
        month,
        year,
        bonusConfig,
        deductionConfig,
        adminId
      );
      salaries = await SalaryGenerationService.getGovSalaries(month, year);
    }

    if (!salaries.length) {
      throw new AppError('No government salary records could be generated for selected month/year', 404);
    }

    return salaries;
  }

  static async ensureCompanySalaries(month, year, adminId, bonusConfig = { bonuses: [] }) {
    await SalaryGenerationController.ensureGovSalaries(month, year, adminId, bonusConfig);
    let salaries = await SalaryGenerationService.getCompanySalaries(month, year);
    if (!salaries.length) {
      await SalaryGenerationService.generateCompanySalary(
        month,
        year,
        bonusConfig,
        adminId
      );
      salaries = await SalaryGenerationService.getCompanySalaries(month, year);
    }

    if (!salaries.length) {
      throw new AppError('No original salary records could be generated for selected month/year', 404);
    }

    return salaries;
  }

  static async getSalaryProcessStatus(req, res, next) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const parsedMonth = parseInt(month, 10);
      const parsedYear = parseInt(year, 10);
      const status = await SalaryProcessStatus.findOne({
        month: parsedMonth,
        year: parsedYear,
      }).populate('completedBy', 'name email');

      const entries = await AttendanceSalary.find({
        month: parsedMonth,
        year: parsedYear,
      })
        .populate('employee_id', 'employeeId name clmsId designation')
        .populate('entered_by_supervisor', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      const groupedMap = new Map();
      entries.forEach((entry) => {
        const supervisorId = entry.entered_by_supervisor?._id?.toString() || 'unassigned';
        const supervisorName = entry.entered_by_supervisor?.name || 'Unassigned';
        if (!groupedMap.has(supervisorId)) {
          groupedMap.set(supervisorId, {
            supervisorId,
            supervisorName,
            supervisorEmail: entry.entered_by_supervisor?.email || '',
            totalEntries: 0,
            totalDays: 0,
            entries: [],
          });
        }

        const group = groupedMap.get(supervisorId);
        group.totalEntries += 1;
        group.totalDays += Number(entry.days_present || 0);
        group.entries.push({
          id: entry._id,
          employeeName: entry.employee_id?.name || 'N/A',
          employeeId: entry.employee_id?.employeeId || '',
          clmsId: entry.clms_id,
          daysPresent: entry.days_present,
          ratePerDay: entry.rate_per_day,
          otAmount: entry.ot_amount || 0,
          advance: entry.advance || 0,
          source: entry.source,
        });
      });

      return successResponse(
        res,
        {
          month: parsedMonth,
          year: parsedYear,
          isCompleted: Boolean(status?.isCompleted),
          completedAt: status?.completedAt || null,
          completedBy: status?.completedBy || null,
          supervisorGroups: Array.from(groupedMap.values()),
          totalEntries: entries.length,
        },
        'Salary process status retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  static async completeSalaryProcess(req, res, next) {
    try {
      const { month, year } = req.body;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const parsedMonth = parseInt(month, 10);
      const parsedYear = parseInt(year, 10);
      const attendanceCount = await AttendanceSalary.countDocuments({
        month: parsedMonth,
        year: parsedYear,
      });

      if (!attendanceCount) {
        throw new AppError('No attendance entries found for selected month/year', 404);
      }

      const status = await SalaryProcessStatus.findOneAndUpdate(
        { month: parsedMonth, year: parsedYear },
        {
          isCompleted: true,
          completedAt: new Date(),
          completedBy: req.user._id,
        },
        { new: true, upsert: true, runValidators: true }
      ).populate('completedBy', 'name email');

      await GovSalary.updateMany(
        { month: parsedMonth, year: parsedYear },
        { status: 'finalized' }
      );
      await CompanySalary.updateMany(
        { month: parsedMonth, year: parsedYear },
        { status: 'finalized' }
      );

      await logActivity({
        req,
        adminId: req.user._id,
        adminName: req.user.name,
        adminEmail: req.user.email,
        action: 'salary_generate',
        targetType: 'salary',
        targetName: `Salary Process Completed ${month}/${year}`,
        details: { month: parsedMonth, year: parsedYear, attendanceCount },
        status: 'success',
      });

      return successResponse(res, status, 'Salary process marked completed');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate government salary
   */
  static async generateGovSalary(req, res, next) {
    try {
      const { month, year, bonusConfig, deductionConfig } = req.body;
      const admin_id = req.user.id;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const processStatus = await SalaryProcessStatus.findOne({
        month: parseInt(month),
        year: parseInt(year),
        isCompleted: true,
      });
      if (processStatus) {
        throw new AppError('Salary process is completed for this month/year. Only downloads are allowed.', 400);
      }

      const result = await SalaryGenerationService.generateGovSalary(
        parseInt(month),
        parseInt(year),
        bonusConfig || { bonuses: [] },
        deductionConfig || { pf_percentage: 12, esic_percentage: 0.75 },
        admin_id
      );

      // Log activity
      await logActivity({
        req,
        adminId: req.user._id,
        adminName: req.user.name,
        adminEmail: req.user.email,
        action: 'salary_generate',
        targetType: 'salary',
        targetId: result._id,
        targetName: `Government Salary ${month}/${year}`,
        details: { month, year, employeeCount: result.salaries?.length || 0 },
        status: 'success',
      });

      return successResponse(
        res,
        result,
        'Government salary generated successfully',
        201
      );
    } catch (error) {
      await logActivity({
        req,
        adminId: req.user._id,
        adminName: req.user.name,
        adminEmail: req.user.email,
        action: 'salary_generate',
        targetType: 'salary',
        status: 'failed',
        errorMessage: error.message,
      });
      next(error);
    }
  }

  /**
   * Generate company salary
   */
  static async generateCompanySalary(req, res, next) {
    try {
      const { month, year, bonusConfig } = req.body;
      const admin_id = req.user.id;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const processStatus = await SalaryProcessStatus.findOne({
        month: parseInt(month),
        year: parseInt(year),
        isCompleted: true,
      });
      if (processStatus) {
        throw new AppError('Salary process is completed for this month/year. Only downloads are allowed.', 400);
      }

      await SalaryGenerationController.ensureGovSalaries(
        parseInt(month, 10),
        parseInt(year, 10),
        admin_id,
        bonusConfig || { bonuses: [] }
      );

      const result = await SalaryGenerationService.generateCompanySalary(
        parseInt(month),
        parseInt(year),
        bonusConfig || { bonuses: [] },
        admin_id
      );

      // Log activity
      await logActivity({
        req,
        adminId: req.user._id,
        adminName: req.user.name,
        adminEmail: req.user.email,
        action: 'salary_generate',
        targetType: 'salary',
        targetId: result._id,
        targetName: `Company Salary ${month}/${year}`,
        details: { month, year, employeeCount: result.salaries?.length || 0 },
        status: 'success',
      });

      return successResponse(
        res,
        result,
        'Company salary generated successfully',
        201
      );
    } catch (error) {
      await logActivity({
        req,
        adminId: req.user._id,
        adminName: req.user.name,
        adminEmail: req.user.email,
        action: 'salary_generate',
        targetType: 'salary',
        status: 'failed',
        errorMessage: error.message,
      });
      next(error);
    }
  }

  /**
   * Get government salary records
   */
  static async getGovSalaries(req, res, next) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const salaries = await SalaryGenerationController.ensureGovSalaries(
        parseInt(month, 10),
        parseInt(year, 10),
        req.user.id
      );
      const enrichedSalaries = await SalaryGenerationController.enrichSalaryRows(salaries);

      return successResponse(res, enrichedSalaries, 'Government salaries retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get company salary records
   */
  static async getCompanySalaries(req, res, next) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const salaries = await SalaryGenerationController.ensureCompanySalaries(
        parseInt(month, 10),
        parseInt(year, 10),
        req.user.id
      );
      const enrichedSalaries = await SalaryGenerationController.enrichSalaryRows(salaries);

      return successResponse(res, enrichedSalaries, 'Company salaries retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update government salary
   */
  static async updateGovSalary(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const salary = await SalaryGenerationService.updateGovSalary(id, updates);
      const enrichedSalary = (await SalaryGenerationController.enrichSalaryRows([salary]))[0];

      return successResponse(res, enrichedSalary, 'Government salary updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update company salary
   */
  static async updateCompanySalary(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const salary = await SalaryGenerationService.updateCompanySalary(id, updates);
      const enrichedSalary = (await SalaryGenerationController.enrichSalaryRows([salary]))[0];

      return successResponse(res, enrichedSalary, 'Company salary updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download government salary Excel
   */
  static async downloadGovSalaryExcel(req, res, next) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const salaries = await SalaryGenerationService.getGovSalaries(
        parseInt(month),
        parseInt(year)
      );

      // Enrich with employee details
      const enrichedSalaries = await Promise.all(
        salaries.map(async (salary) => {
          const employee = await Employee.findById(salary.employee_id);
          return {
            ...salary.toObject(),
            employee_details: {
              name: employee?.name,
              clmsId: employee?.clmsId,
            },
          };
        })
      );

      const workbook = await ExcelService.exportGovSalaryExcel(
        enrichedSalaries,
        { pf_percentage: 12, esic_percentage: 0.75 }
      );

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Government_Salary_${month}_${year}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download company salary Excel
   */
  static async downloadCompanySalaryExcel(req, res, next) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const salaries = await SalaryGenerationService.getCompanySalaries(
        parseInt(month),
        parseInt(year)
      );

      // Enrich with employee details
      const enrichedSalaries = await Promise.all(
        salaries.map(async (salary) => {
          const employee = await Employee.findById(salary.employee_id);
          return {
            ...salary.toObject(),
            employee_details: {
              name: employee?.name,
              clmsId: employee?.clmsId,
            },
          };
        })
      );

      const workbook = await ExcelService.exportCompanySalaryExcel(enrichedSalaries);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Original_Salary_${month}_${year}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download both government and company salary Excel
   */
  static async downloadBothSalaryExcel(req, res, next) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw new AppError('Month and year are required', 400);
      }

      const govSalaries = await SalaryGenerationController.ensureGovSalaries(
        parseInt(month, 10),
        parseInt(year, 10),
        req.user.id
      );
      const companySalaries = await SalaryGenerationController.ensureCompanySalaries(
        parseInt(month, 10),
        parseInt(year, 10),
        req.user.id
      );

      const enrichedGovSalaries = await SalaryGenerationController.enrichSalaryRows(govSalaries);
      const enrichedCompanySalaries = await SalaryGenerationController.enrichSalaryRows(companySalaries);

      const workbook = new (require('exceljs')).Workbook();

      // Add government salary sheet
      const govWorkbook = await ExcelService.exportGovSalaryExcel(enrichedGovSalaries);
      const govSheet = govWorkbook.getWorksheet('Government Salary');
      const newGovSheet = workbook.addWorksheet('Government Salary');
      govSheet.eachRow((row, rowNumber) => {
        const newRow = newGovSheet.getRow(rowNumber);
        row.eachCell((cell, colNumber) => {
          const newCell = newRow.getCell(colNumber);
          newCell.value = cell.value;
          if (cell.font) newCell.font = { ...cell.font };
          if (cell.fill) newCell.fill = { ...cell.fill };
          if (cell.border) newCell.border = { ...cell.border };
          if (cell.alignment) newCell.alignment = { ...cell.alignment };
          if (cell.numFmt) newCell.numFmt = cell.numFmt;
        });
      });
      newGovSheet.columns = govSheet.columns;

      // Add company salary sheet
      const compWorkbook = await ExcelService.exportCompanySalaryExcel(enrichedCompanySalaries);
      const compSheet = compWorkbook.getWorksheet('Original Salary');
      const newCompSheet = workbook.addWorksheet('Original Salary');
      compSheet.eachRow((row, rowNumber) => {
        const newRow = newCompSheet.getRow(rowNumber);
        row.eachCell((cell, colNumber) => {
          const newCell = newRow.getCell(colNumber);
          newCell.value = cell.value;
          if (cell.font) newCell.font = { ...cell.font };
          if (cell.fill) newCell.fill = { ...cell.fill };
          if (cell.border) newCell.border = { ...cell.border };
          if (cell.alignment) newCell.alignment = { ...cell.alignment };
          if (cell.numFmt) newCell.numFmt = cell.numFmt;
        });
      });
      newCompSheet.columns = compSheet.columns;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Salary_Reports_${month}_${year}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SalaryGenerationController;
