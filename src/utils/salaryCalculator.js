/**
 * Salary Calculator Utility
 * Handles all salary calculations for normal and gov salary types
 */

const calculateSalary = ({
  numberOfDays = 0,
  wageRate = 0,
  govWageRate = 0,
  otAmount = 0,
  advance = 0,
  bonusPercent = 8.33,
  leaveBonusPercent = 6.33,
  pfPercent = 12,
  esicPercent = 0.75,
  salaryType = 'normal'
}) => {
  try {
    // Validate inputs
    if (numberOfDays < 0 || numberOfDays > 31) {
      throw new Error('Number of days must be between 0 and 31')
    }

    if (wageRate < 0 || govWageRate < 0 || advance < 0 || otAmount < 0) {
      throw new Error('Wage rates and amounts cannot be negative')
    }

    let result = {}

    if (salaryType === 'normal') {
      // Normal Salary Calculation
      result = calculateNormalSalary({
        numberOfDays,
        wageRate,
        govWageRate,
        otAmount,
        advance,
        bonusPercent,
        leaveBonusPercent,
        pfPercent,
        esicPercent
      })
    } else if (salaryType === 'gov') {
      // Government Salary Calculation
      result = calculateGovSalary({
        numberOfDays,
        govWageRate,
        otAmount,
        advance,
        pfPercent,
        esicPercent
      })
    } else {
      throw new Error('Invalid salary type. Use "normal" or "gov"')
    }

    // Round all values to 2 decimal places
    return roundAllValues(result)
  } catch (error) {
    throw new Error(`Salary Calculation Error: ${error.message}`)
  }
}

/**
 * Calculate Normal Salary
 * Includes bonus and leave bonus
 */
const calculateNormalSalary = ({
  numberOfDays,
  wageRate,
  govWageRate,
  otAmount,
  advance,
  bonusPercent,
  leaveBonusPercent,
  pfPercent,
  esicPercent
}) => {
  // Total Amount = Number of Days × Daily Wage Rate
  const totalAmount = numberOfDays * wageRate

  // OT Amount (as provided)
  const otAmountValue = otAmount

  // Bonus = 8.33% × Total Amount
  const bonus = totalAmount * (bonusPercent / 100)

  // Leave Bonus = 6.33% × Total Amount
  const leaveBonus = totalAmount * (leaveBonusPercent / 100)

  // Gross = Total Amount + Bonus + Leave Bonus + OT
  const gross = totalAmount + bonus + leaveBonus + otAmountValue

  // PF = 12% × (Number of Days × Gov Daily Wage Rate)
  const pf = numberOfDays * govWageRate * (pfPercent / 100)

  // ESIC = 0.75% × (Number of Days × Gov Daily Wage Rate)
  const esic = numberOfDays * govWageRate * (esicPercent / 100)

  // Net Deduction = PF + ESIC
  const netDeduction = pf + esic

  // Net Payable = Gross - Net Deduction - Advance
  const netPayable = gross - netDeduction - advance

  return {
    salaryType: 'normal',
    totalAmount,
    otAmount: otAmountValue,
    bonus,
    leaveBonus,
    gross,
    pf,
    esic,
    netDeduction,
    advance,
    netPayable
  }
}

/**
 * Calculate Government Salary
 * Simpler calculation without bonuses
 */
const calculateGovSalary = ({
  numberOfDays,
  govWageRate,
  otAmount,
  advance,
  pfPercent,
  esicPercent
}) => {
  // Total Amount = Number of Days × Gov Daily Wage Rate
  const totalAmount = numberOfDays * govWageRate

  // OT Amount (as provided)
  const otAmountValue = otAmount

  // Gross = Total Amount + OT
  const gross = totalAmount + otAmountValue

  // PF = 12% × (Number of Days × Gov Daily Wage Rate)
  const pf = numberOfDays * govWageRate * (pfPercent / 100)

  // ESIC = 0.75% × (Number of Days × Gov Daily Wage Rate)
  const esic = numberOfDays * govWageRate * (esicPercent / 100)

  // Net Deduction = PF + ESIC
  const netDeduction = pf + esic

  // Net Payable = Gross - Net Deduction - Advance
  const netPayable = gross - netDeduction - advance

  return {
    salaryType: 'gov',
    totalAmount,
    otAmount: otAmountValue,
    gross,
    pf,
    esic,
    netDeduction,
    advance,
    netPayable
  }
}

/**
 * Round all numeric values to 2 decimal places
 */
const roundAllValues = (obj) => {
  const rounded = {}
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === 'number') {
      rounded[key] = Math.round(obj[key] * 100) / 100
    } else {
      rounded[key] = obj[key]
    }
  })
  return rounded
}

/**
 * Bulk calculate salary for multiple records
 */
const calculateBulkSalary = (records) => {
  return records.map((record) => {
    try {
      return {
        ...record,
        salaryDetails: calculateSalary(record),
        error: null
      }
    } catch (error) {
      return {
        ...record,
        salaryDetails: null,
        error: error.message
      }
    }
  })
}

module.exports = {
  calculateSalary,
  calculateNormalSalary,
  calculateGovSalary,
  calculateBulkSalary,
  roundAllValues
}
