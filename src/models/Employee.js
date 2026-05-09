'use strict';
const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  fatherName: {
    type: String,
    required: [true, 'Father name is required'],
    trim: true,
  },
  addressLine1: {
    type: String,
    required: [true, 'Address line 1 is required'],
    trim: true,
  },
  addressLine2: {
    type: String,
    trim: true,
  },
  pincode: {
    type: String,
    required: [true, 'Pincode is required'],
    trim: true,
  },
  siteName: {
    type: String,
    required: [true, 'Site name is required'],
    trim: true,
  },
  dob: {
    type: Date,
    required: [true, 'Date of birth is required'],
  },
  dateOfJoining: {
    type: Date,
    required: [true, 'Date of joining is required'],
  },
  aadharNo: {
    type: String,
    required: [true, 'Aadhar number is required'],
    unique: true,
    trim: true,
  },
  panNo: {
    type: String,
    trim: true,
  },
  uanNo: {
    type: String,
    required: [true, 'UAN number is required'],
    unique: true,
    trim: true,
  },
  esicNo: {
    type: String,
    required: [true, 'ESIC number is required'],
    unique: true,
    trim: true,
  },
  bankAccountNumber: {
    type: String,
    required: [true, 'Bank account number is required'],
    unique: true,
    trim: true,
  },
  ifscCode: {
    type: String,
    required: [true, 'IFSC code is required'],
    trim: true,
  },
  bankAddress: {
    type: String,
    required: [true, 'Bank address is required'],
    trim: true,
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
  },
  l1CardNumber: {
    type: String,
    trim: true,
  },
  l1CardIssued: {
    type: Date,
  },
  l1CardExpiry: {
    type: Date,
  },
  policeVerificationNumber: {
    type: String,
    trim: true,
  },
  designation: {
    type: String,
    required: [true, 'Designation is required'],
    trim: true,
  },
  gradeOfWork: {
    type: String,
    required: [true, 'Grade of work is required'],
    enum: ['Skilled', 'Semi-skilled', 'Unskilled'],
  },
  dailyWagesRate: {
    type: Number,
    required: [true, 'Daily wages rate is required'],
    min: [0, 'Daily wages rate must be positive'],
  },
  photoUrl: {
    type: String,
    trim: true,
  },
  clmsId: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['Active', 'Terminated'],
    default: 'Active',
  },
  terminatedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

employeeSchema.pre('validate', function (next) {
  if (!this.employeeId) {
    this.employeeId = `EMP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  next();
});

module.exports = mongoose.model('Employee', employeeSchema);
