/**
 * Salary Calculation Service
 * Handles all salary calculations for government and company salary
 */

class SalaryCalculationService {
  /**
   * Calculate government salary
   * @param {Object} data - Attendance data
   * @param {number} data.days - Number of days
   * @param {number} data.gov_rate - Government daily rate
   * @param {Array} data.bonuses - Array of bonus objects [{name, percentage}]
   * @param {number} data.pf_percentage - PF percentage (default 12)
   * @param {number} data.esic_percentage - ESIC percentage (default 0.75)
   * @returns {Object} Calculated salary object
   */
  static calculateGovSalary(data) {
    const { days, gov_rate, bonuses = [], pf_percentage = 12, esic_percentage = 0.75 } = data;

    // Validate inputs
    if (days === undefined || days === null || Number(days) < 0 || gov_rate === undefined || gov_rate === null || Number(gov_rate) < 0) {
      throw new Error('Days and government rate are required');
    }

    // Calculate total amount (days × rate)
    const totalAmount = this.roundToDecimal(Number(days) * Number(gov_rate), 2);

    // Calculate bonuses
    const calculatedBonuses = bonuses.map((bonus) => ({
      name: bonus.name,
      percentage: Number(bonus.percentage) || 0,
      amount: this.roundToDecimal((totalAmount * (Number(bonus.percentage) || 0)) / 100, 2),
    }));

    // Calculate gross (total amount + all bonuses)
    const bonusTotal = calculatedBonuses.reduce((sum, b) => sum + b.amount, 0);
    const gross = this.roundToDecimal(totalAmount + bonusTotal, 2);

    // Calculate deductions
    const pf = this.roundToDecimal((gross * (Number(pf_percentage) || 0)) / 100, 2);
    const esic = this.roundToDecimal((gross * (Number(esic_percentage) || 0)) / 100, 2);

    // Calculate net
    const netDeduction = this.roundToDecimal(pf + esic, 2);
    const netPayable = this.roundToDecimal(gross - netDeduction, 2);

    return {
      total_amount: totalAmount,
      bonuses: calculatedBonuses,
      gross,
      pf,
      esic,
      net_deduction: netDeduction,
      net_payable: netPayable,
    };
  }

  /**
   * Calculate company salary
   * @param {Object} data - Attendance data
   * @param {number} data.days - Number of days
   * @param {number} data.comp_rate - Company daily rate
   * @param {Array} data.bonuses - Array of bonus objects [{name, percentage}]
   * @param {number} data.pf - PF from government salary
   * @param {number} data.esic - ESIC from government salary
   * @returns {Object} Calculated salary object
   */
  static calculateCompanySalary(data) {
    const { days, comp_rate, bonuses = [], pf = 0, esic = 0 } = data;

    // Validate inputs
    if (days === undefined || days === null || Number(days) < 0 || comp_rate === undefined || comp_rate === null || Number(comp_rate) < 0) {
      throw new Error('Days and company rate are required');
    }

    // Calculate total amount (days × rate)
    const totalAmount = this.roundToDecimal(Number(days) * Number(comp_rate), 2);

    // Calculate bonuses
    const calculatedBonuses = bonuses.map((bonus) => ({
      name: bonus.name,
      percentage: Number(bonus.percentage) || 0,
      amount: this.roundToDecimal((totalAmount * (Number(bonus.percentage) || 0)) / 100, 2),
    }));

    // Calculate gross (total amount + all bonuses)
    const bonusTotal = calculatedBonuses.reduce((sum, b) => sum + b.amount, 0);
    const gross = this.roundToDecimal(totalAmount + bonusTotal, 2);

    // Use PF and ESIC from government salary
    const safePf = Number(pf) || 0;
    const safeEsic = Number(esic) || 0;
    const netDeduction = this.roundToDecimal(safePf + safeEsic, 2);
    const netPayable = this.roundToDecimal(gross - netDeduction, 2);

    return {
      total_amount: totalAmount,
      bonuses: calculatedBonuses,
      gross,
      pf: safePf,
      esic: safeEsic,
      net_deduction: netDeduction,
      net_payable: netPayable,
    };
  }

  /**
   * Recalculate all bonuses based on gross amount
   * @param {number} gross - Gross salary
   * @param {Array} bonuses - Bonus configuration
   * @returns {Array} Calculated bonuses
   */
  static recalculateBonuses(gross, bonuses = []) {
    return bonuses.map((bonus) => ({
      name: bonus.name,
      percentage: bonus.percentage,
      amount: this.roundToDecimal((gross * bonus.percentage) / 100, 2),
    }));
  }

  /**
   * Round to decimal places
   * @param {number} value - Value to round
   * @param {number} decimals - Number of decimal places
   * @returns {number} Rounded value
   */
  static roundToDecimal(value, decimals = 2) {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Validate salary data
   * @param {Object} data - Salary data
   * @returns {Object} Validation result
   */
  static validateSalaryData(data) {
    const errors = [];

    if (!data.days || data.days <= 0) {
      errors.push('Days must be greater than 0');
    }

    if (!data.gov_rate || data.gov_rate < 0) {
      errors.push('Government rate must be positive');
    }

    if (data.pf_percentage && data.pf_percentage < 0) {
      errors.push('PF percentage must be positive');
    }

    if (data.esic_percentage && data.esic_percentage < 0) {
      errors.push('ESIC percentage must be positive');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

module.exports = SalaryCalculationService;
