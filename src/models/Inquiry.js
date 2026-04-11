'use strict';
const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
  phone: { type: String, trim: true, maxlength: 15 },
  company: { type: String, trim: true, maxlength: 200 },
  subject: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 2000 },
  serviceType: {
    type: String,
    enum: ['electrical', 'civil', 'mechanical', 'supply', 'other', 'general'],
    default: 'general',
  },
  status: {
    type: String,
    enum: ['new', 'read', 'replied', 'closed'],
    default: 'new',
  },
  adminReply: String,
  repliedAt: Date,
  ipAddress: String,
  userAgent: String,
}, { timestamps: true });

module.exports = mongoose.model('Inquiry', inquirySchema);
