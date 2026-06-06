'use strict';

const Razorpay = require('razorpay');

const hasRazorpayCredentials = Boolean(
  process.env.RAZORPAY_KEY_ID
  && process.env.RAZORPAY_KEY_SECRET
);

const razorpay = hasRazorpayCredentials
  ? new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })
  : null;

const assertRazorpayConfigured = () => {
  if (!razorpay) {
    const error = new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    error.statusCode = 500;
    throw error;
  }
};

module.exports = {
  assertRazorpayConfigured,
  getRazorpayKeyId: () => process.env.RAZORPAY_KEY_ID,
  razorpay,
};
