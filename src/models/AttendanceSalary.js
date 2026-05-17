const mongoose = require('mongoose');

const attendanceSalarySchema = new mongoose.Schema(
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
    days_present: {
      type: Number,
      required: true,
      min: 0,
      decimal: true,
    },
    rate_per_day: {
      type: Number,
      required: true,
      min: 0,
      decimal: true,
    },
    ot_amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    advance: {
      type: Number,
      default: 0,
      min: 0,
    },
    entered_by_supervisor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    source: {
      type: String,
      enum: ['manual', 'bulk'],
      default: 'manual',
    },
  },
  { timestamps: true }
);

// Compound unique index for employee-month-year combination
attendanceSalarySchema.index(
  { employee_id: 1, month: 1, year: 1 },
  { unique: true }
);

// Index for supervisor queries
attendanceSalarySchema.index({ entered_by_supervisor: 1, month: 1, year: 1 });

// Index for monthly reports
attendanceSalarySchema.index({ month: 1, year: 1 });

module.exports = mongoose.model('AttendanceSalary', attendanceSalarySchema);
