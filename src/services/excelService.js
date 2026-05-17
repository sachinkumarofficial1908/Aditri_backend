const ExcelJS = require('exceljs');
const { AppError } = require('../utils/errorHandler');

class ExcelService {
  /**
   * Parse Excel file for attendance import
   * Expected columns: CLMS ID, Name, Days, Rate
   */
  static async parseAttendanceExcel(filePath) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        throw new AppError('No worksheet found in Excel file', 400);
      }

      const entries = [];
      const errors = [];
      let headerRowIndex = 0;

      // Find header row
      const headerRow = worksheet.getRow(1);
      const headers = headerRow.values.slice(1); // Skip first empty value

      // Normalize headers
      const normalizedHeaders = headers.map((h) => (h ? h.toString().toLowerCase().trim() : ''));

      // Map columns
      const clmsIdCol = this.findColumn(normalizedHeaders, ['clms id', 'clms', 'id', 'employee id']);
      const nameCol = this.findColumn(normalizedHeaders, ['name', 'employee name']);
      const daysCol = this.findColumn(normalizedHeaders, ['days', 'days present', 'present days']);
      const rateCol = this.findColumn(normalizedHeaders, ['rate', 'rate per day', 'daily rate']);

      if (!clmsIdCol || !nameCol || !daysCol) {
        throw new AppError('Missing required columns: CLMS ID, Name, Days', 400);
      }

      // Process data rows
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const clmsId = row.getCell(clmsIdCol + 1).value?.toString().trim();
        const name = row.getCell(nameCol + 1).value?.toString().trim();
        const days = this.parseNumber(row.getCell(daysCol + 1).value);
        const rate = rateCol ? this.parseNumber(row.getCell(rateCol + 1).value) : null;

        // Validate required fields
        if (!clmsId) {
          errors.push({
            row: rowNumber,
            clmsId: 'N/A',
            error: 'CLMS ID is required',
          });
          return;
        }

        if (!name) {
          errors.push({
            row: rowNumber,
            clmsId,
            error: 'Employee name is required',
          });
          return;
        }

        if (days === null || days < 0) {
          errors.push({
            row: rowNumber,
            clmsId,
            error: 'Days must be a valid positive number',
          });
          return;
        }

        entries.push({
          clmsId,
          name,
          days,
          rate: rate || null,
        });
      });

      return {
        entries,
        errors,
        columnMapping: {
          clmsIdCol,
          nameCol,
          daysCol,
          rateCol,
        },
      };
    } catch (error) {
      if (error.statusCode) throw error;
      throw new AppError(`Error parsing Excel file: ${error.message}`, 400);
    }
  }

  /**
   * Export government salary to Excel
   */
  static async exportGovSalaryExcel(salaryData, deductionConfig = {}) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Government Salary');

      // Define columns
      const columns = [
        { header: 'CLMS ID', key: 'clms_id', width: 12 },
        { header: 'Employee Name', key: 'employee_name', width: 25 },
        { header: 'Days', key: 'days', width: 8 },
        { header: 'Gov Rate', key: 'gov_rate', width: 12 },
        { header: 'Total Amount', key: 'total_amount', width: 14 },
      ];

      // Add dynamic bonus columns
      const bonuses = salaryData[0]?.bonuses || [];
      bonuses.forEach((bonus, index) => {
        columns.push({
          header: `${bonus.name}`,
          key: `bonus_${index}`,
          width: 12,
        });
      });

      // Add standard columns
      columns.push(
        { header: 'Gross', key: 'gross', width: 12 },
        { header: `PF (${deductionConfig.pf_percentage || 12}%)`, key: 'pf', width: 12 },
        { header: `ESIC (${deductionConfig.esic_percentage || 0.75}%)`, key: 'esic', width: 12 },
        { header: 'Net Deduction', key: 'net_deduction', width: 14 },
        { header: 'Net Payable', key: 'net_payable', width: 14 }
      );

      worksheet.columns = columns;

      // Style header
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      // Add data rows
      salaryData.forEach((salary, index) => {
        const rowData = {
          clms_id: salary.clms_id,
          employee_name: salary.employee_details?.name || 'N/A',
          days: salary.days,
          gov_rate: salary.gov_rate,
          total_amount: salary.total_amount,
        };

        // Add bonus amounts
        salary.bonuses.forEach((bonus, bonusIndex) => {
          rowData[`bonus_${bonusIndex}`] = bonus.amount;
        });

        // Add deductions and totals
        rowData.gross = salary.gross;
        rowData.pf = salary.pf;
        rowData.esic = salary.esic;
        rowData.net_deduction = salary.net_deduction;
        rowData.net_payable = salary.net_payable;

        const row = worksheet.addRow(rowData);

        // Format numbers
        row.getCell('total_amount').numFmt = '#,##0.00';
        row.getCell('gross').numFmt = '#,##0.00';
        row.getCell('pf').numFmt = '#,##0.00';
        row.getCell('esic').numFmt = '#,##0.00';
        row.getCell('net_deduction').numFmt = '#,##0.00';
        row.getCell('net_payable').numFmt = '#,##0.00';

        // Alternate row colors
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' },
          };
        }
      });

      // Add borders to all cells
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } },
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      });

      return workbook;
    } catch (error) {
      throw new AppError(`Error generating Excel: ${error.message}`, 500);
    }
  }

  /**
   * Export company salary to Excel
   */
  static async exportCompanySalaryExcel(salaryData) {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Original Salary');

      // Define columns
      const columns = [
        { header: 'CLMS ID', key: 'clms_id', width: 12 },
        { header: 'Employee Name', key: 'employee_name', width: 25 },
        { header: 'Days', key: 'days', width: 8 },
        { header: 'Original Rate', key: 'comp_rate', width: 14 },
        { header: 'Total Amount', key: 'total_amount', width: 14 },
      ];

      // Add dynamic bonus columns
      const bonuses = salaryData[0]?.bonuses || [];
      bonuses.forEach((bonus, index) => {
        columns.push({
          header: `${bonus.name}`,
          key: `bonus_${index}`,
          width: 12,
        });
      });

      // Add standard columns
      columns.push(
        { header: 'Gross', key: 'gross', width: 12 },
        { header: 'PF', key: 'pf', width: 12 },
        { header: 'ESIC', key: 'esic', width: 12 },
        { header: 'Net Deduction', key: 'net_deduction', width: 14 },
        { header: 'Net Payable', key: 'net_payable', width: 14 }
      );

      worksheet.columns = columns;

      // Style header
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF70AD47' },
      };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      // Add data rows
      salaryData.forEach((salary, index) => {
        const rowData = {
          clms_id: salary.clms_id,
          employee_name: salary.employee_details?.name || 'N/A',
          days: salary.days,
          comp_rate: salary.comp_rate,
          total_amount: salary.total_amount,
        };

        // Add bonus amounts
        salary.bonuses.forEach((bonus, bonusIndex) => {
          rowData[`bonus_${bonusIndex}`] = bonus.amount;
        });

        // Add deductions and totals
        rowData.gross = salary.gross;
        rowData.pf = salary.pf;
        rowData.esic = salary.esic;
        rowData.net_deduction = salary.net_deduction;
        rowData.net_payable = salary.net_payable;

        const row = worksheet.addRow(rowData);

        // Format numbers
        row.getCell('total_amount').numFmt = '#,##0.00';
        row.getCell('gross').numFmt = '#,##0.00';
        row.getCell('pf').numFmt = '#,##0.00';
        row.getCell('esic').numFmt = '#,##0.00';
        row.getCell('net_deduction').numFmt = '#,##0.00';
        row.getCell('net_payable').numFmt = '#,##0.00';

        // Alternate row colors
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' },
          };
        }
      });

      // Add borders to all cells
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } },
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      });

      return workbook;
    } catch (error) {
      throw new AppError(`Error generating Excel: ${error.message}`, 500);
    }
  }

  /**
   * Find column index by keywords
   */
  static findColumn(headers, keywords) {
    for (let i = 0; i < headers.length; i++) {
      for (const keyword of keywords) {
        if (headers[i].includes(keyword)) {
          return i;
        }
      }
    }
    return null;
  }

  /**
   * Parse number safely
   */
  static parseNumber(value) {
    if (!value) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  /**
   * Export salary report to Excel with wage slip details
   */
  static async exportSalaryReport(salaryData, month, year, summary = null) {
    try {
      const workbook = new ExcelJS.Workbook();

      // Add Summary Sheet
      if (summary) {
        const summarySheet = workbook.addWorksheet('Summary');
        
        summarySheet.columns = [
          { header: 'Metric', key: 'metric', width: 25 },
          { header: 'Value', key: 'value', width: 20 }
        ];

        summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        summarySheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF203864' }
        };

        summarySheet.addRow({ metric: 'Month', value: `${month}/2024` });
        summarySheet.addRow({ metric: 'Year', value: year });
        summarySheet.addRow({ metric: 'Total Records', value: summary.totalRecords });
        summarySheet.addRow({ metric: 'Total Gross Amount', value: summary.totalGross });
        summarySheet.addRow({ metric: 'Total PF Deduction', value: summary.totalPF });
        summarySheet.addRow({ metric: 'Total ESIC Deduction', value: summary.totalESIC });
        summarySheet.addRow({ metric: 'Total Net Deduction', value: summary.totalNetDeduction });
        summarySheet.addRow({ metric: 'Total Advance', value: summary.totalAdvance });
        summarySheet.addRow({ metric: 'Total Net Payable', value: summary.totalNetPayable });
        summarySheet.addRow({ metric: 'Average Gross', value: summary.averageGross });
        summarySheet.addRow({ metric: 'Average Net Payable', value: summary.averageNetPayable });

        summarySheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            };
            if (row.number > 1) {
              cell.numFmt = '#,##0.00';
            }
          });
        });
      }

      // Add Salary Details Sheet
      const detailsSheet = workbook.addWorksheet('Salary Details');

      detailsSheet.columns = [
        { header: 'CLMS ID', key: 'clmsId', width: 12 },
        { header: 'Employee Name', key: 'name', width: 25 },
        { header: 'Designation', key: 'designation', width: 20 },
        { header: 'Grade', key: 'grade', width: 10 },
        { header: 'Days Worked', key: 'days', width: 12 },
        { header: 'Daily Rate', key: 'dailyRate', width: 12 },
        { header: 'Total Amount', key: 'totalAmount', width: 14 },
        { header: 'Bonus', key: 'bonus', width: 12 },
        { header: 'Leave Bonus', key: 'leaveBonus', width: 12 },
        { header: 'Gross Amount', key: 'gross', width: 14 },
        { header: 'PF (12%)', key: 'pf', width: 12 },
        { header: 'ESIC (0.75%)', key: 'esic', width: 12 },
        { header: 'Total Deduction', key: 'netDeduction', width: 14 },
        { header: 'Advance', key: 'advance', width: 12 },
        { header: 'Net Payable', key: 'netPayable', width: 14 },
        { header: 'Bank Account', key: 'bankAccount', width: 20 },
        { header: 'IFSC Code', key: 'ifsc', width: 12 },
        { header: 'UAN Number', key: 'uanNumber', width: 15 },
        { header: 'ESIC Number', key: 'esicNumber', width: 15 }
      ];

      detailsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      detailsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      detailsSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      // Add data rows
      salaryData.forEach((record, index) => {
        const employee = record.employeeData || {};
        const salary = record.salaryDetails || {};

        const rowData = {
          clmsId: employee.clmsId || '',
          name: employee.name || '',
          designation: employee.designation || '',
          grade: employee.gradeOfWork || '',
          days: record.numberOfDays || 0,
          dailyRate: employee.dailyWageRate || 0,
          totalAmount: salary.totalAmount || 0,
          bonus: salary.bonus || 0,
          leaveBonus: salary.leaveBonus || 0,
          gross: salary.gross || 0,
          pf: salary.pf || 0,
          esic: salary.esic || 0,
          netDeduction: salary.netDeduction || 0,
          advance: salary.advance || 0,
          netPayable: salary.netPayable || 0,
          bankAccount: employee.bankAccount || '',
          ifsc: employee.ifsc || '',
          uanNumber: employee.uanNumber || '',
          esicNumber: employee.esicNumber || ''
        };

        const row = detailsSheet.addRow(rowData);

        // Format numbers
        const numberColumns = [
          'days', 'dailyRate', 'totalAmount', 'bonus', 'leaveBonus',
          'gross', 'pf', 'esic', 'netDeduction', 'advance', 'netPayable'
        ];

        numberColumns.forEach((col) => {
          row.getCell(col).numFmt = '#,##0.00';
        });

        // Alternate row colors
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }
          };
        }
      });

      // Add borders
      detailsSheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
          if (row.number > 1) {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        });
      });

      return workbook;
    } catch (error) {
      throw new AppError(`Error generating salary report: ${error.message}`, 500);
    }
  }

  /**
   * Export validation errors to Excel
   */
  static async exportValidationErrors(errors, fileName = 'validation_errors.xlsx') {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Errors');

      worksheet.columns = [
        { header: 'Row Number', key: 'row', width: 12 },
        { header: 'CLMS ID', key: 'clmsId', width: 15 },
        { header: 'Error Message', key: 'error', width: 50 },
        { header: 'Field', key: 'field', width: 20 }
      ];

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' }
      };

      errors.forEach((error) => {
        worksheet.addRow({
          row: error.row || 'N/A',
          clmsId: error.clmsId || 'N/A',
          error: error.message || error.error || '',
          field: error.field || 'N/A'
        });
      });

      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        });
      });

      return workbook;
    } catch (error) {
      throw new AppError(`Error generating error report: ${error.message}`, 500);
    }
  }
}

module.exports = ExcelService;
