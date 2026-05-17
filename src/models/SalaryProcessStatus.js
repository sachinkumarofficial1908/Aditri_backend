const mongoose = require('mongoose');

const salaryProcessStatusSchema = new mongoose.Schema(
  {
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
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

salaryProcessStatusSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('SalaryProcessStatus', salaryProcessStatusSchema);
