'use strict';
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  client: { type: String, required: true, trim: true },
  location: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: ['electrical', 'civil', 'mechanical', 'solar', 'other'],
  },
  description: { type: String, required: true, maxlength: 2000 },
  highlights: [String],
  status: { type: String, enum: ['completed', 'ongoing', 'upcoming'], default: 'completed' },
  startDate: Date,
  endDate: Date,
  value: String,
  images: [{ url: String, alt: String }],
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  tags: [String],
  purchaseOrderRef: String,
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
