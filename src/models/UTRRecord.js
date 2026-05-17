'use strict';
const mongoose = require('mongoose');

const utrRecordSchema = new mongoose.Schema({
  utr: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('UTRRecord', utrRecordSchema);
