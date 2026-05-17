'use strict';
const fs = require('fs');
const User = require('../models/User');
const {
  createPaymentReceiptZip,
  validateReceiptWorkbookHeaders,
} = require('../services/paymentReceiptService');

const cleanup = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Cleanup error:', err.message);
    }
  }
};

const generatePaymentReceipts = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Excel file is required' });
    }

    const {
      password,
      secretKey,
      remitterName,
      remitterAccount,
      paymentMode,
      transactionDate,
      timeRangeStart,
      timeRangeEnd,
    } = req.body;

    if (!password) {
      cleanup(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Combined password (password + secret key) is required',
      });
    }

    const expectedSecret = process.env.RECEIPT_SECRET_KEY || 'ACS-IDBI';
    const secretKeyLength = expectedSecret.length;
    
    // Split password into two parts
    // s1 = last 8 characters (secret key)
    // s2 = rest of the characters (admin password)
    const s1 = password.slice(-secretKeyLength);
    const s2 = password.slice(0, -secretKeyLength);

    // Validate secret key (s1)
    if (s1 !== expectedSecret) {
      cleanup(req.file.path);
      return res.status(403).json({ success: false, message: 'Enter correct password' });
    }

    // Validate admin password part (s2)
    if (!s2) {
      cleanup(req.file.path);
      return res.status(400).json({ success: false, message: 'Enter correct password' });
    }

    const admin = await User.findById(req.user.id).select('+password');
    if (!admin) {
      cleanup(req.file.path);
      return res.status(401).json({ success: false, message: 'Admin user not found' });
    }

    const isMatch = await admin.matchPassword(s2);
    if (!isMatch) {
      cleanup(req.file.path);
      return res.status(401).json({ success: false, message: 'Enter correct password' });
    }

    const mode = (paymentMode || 'NEFT').toUpperCase();
    if (!['NEFT', 'IMPS'].includes(mode)) {
      cleanup(req.file.path);
      return res.status(400).json({ success: false, message: 'Payment mode must be NEFT or IMPS' });
    }

    const receiptDefaults = {
      remitterName: remitterName || 'M/S ADITRI CONSTRUCTIONS SERVICES',
      remitterAccount: remitterAccount || '1267XXXXXXXX1680',
      paymentMode: mode,
      transactionDate,
      timeRangeStart,
      timeRangeEnd,
    };

    const output = await createPaymentReceiptZip({
      inputPath: req.file.path,
      ...receiptDefaults,
    });

    cleanup(req.file.path);

    res.download(output.zipFilePath, output.zipFileName, (err) => {
      if (fs.existsSync(output.zipFilePath)) {
        try {
          fs.unlinkSync(output.zipFilePath);
        } catch (cleanupErr) {
          console.error('Zip cleanup error:', cleanupErr.message);
        }
      }
      if (err) {
        console.error('Download error:', err.message);
      }
    });
  } catch (error) {
    cleanup(req.file?.path);
    next(error);
  }
};

const validateReceiptFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Excel file is required' });
    }
    const result = await validateReceiptWorkbookHeaders(req.file.path);
    cleanup(req.file.path);
    return res.json({ success: true, missingHeaders: result.missingHeaders, foundHeaders: result.foundHeaders });
  } catch (error) {
    cleanup(req.file?.path);
    next(error);
  }
};

module.exports = {
  generatePaymentReceipts,
  validateReceiptFile,
};
