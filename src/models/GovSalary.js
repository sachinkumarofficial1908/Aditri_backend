const mongoose = require('mongoose');

const bonusSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      decimal: true,
    },
    amount: {
      type: Number,
      default: 0,
      decimal: true,
    },
  },
  { _id: false }
);

const govSalarySchema = new mongoose.Schema(
  {
    employee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    clms_id: {
      type: String,
      required: true,
      index: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    days: {
      type: Number,
      required: true,
      min: 0,
      decimal: true,
    },
    gov_rate: {
      type: Number,
      required: true,
      min: 0,
      decimal: true,
    },
    total_amount: {
      type: Number,
      required: true,
      decimal: true,
    },
    bonuses: [bonusSchema],
    gross: {
      type: Number,
      required: true,
      decimal: true,
    },
    pf: {
      type: Number,
      required: true,
      default: 0,
      decimal: true,
    },
    pf_percentage: {
      type: Number,
      default: 12,
      decimal: true,
    },
    esic: {
      type: Number,
      required: true,
      default: 0,
      decimal: true,
    },
    esic_percentage: {
      type: Number,
      default: 0.75,
      decimal: true,
    },
    net_deduction: {
      type: Number,
      required: true,
      decimal: true,
    },
    net_payable: {
      type: Number,
      required: true,
      decimal: true,
    },
    generated_by_admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'finalized'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

// Compound unique index for employee-month-year combination
govSalarySchema.index(
  { employee_id: 1, month: 1, year: 1 },
  { unique: true }
);

// Index for admin queries
govSalarySchema.index({ generated_by_admin: 1, month: 1, year: 1 });

// Index for monthly reports
govSalarySchema.index({ month: 1, year: 1 });

module.exports = mongoose.model('GovSalary', govSalarySchema);
