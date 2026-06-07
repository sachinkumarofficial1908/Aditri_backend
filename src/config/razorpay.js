'use strict';

require('dotenv').config();
const Razorpay = require('razorpay');

const getEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
};

const getRazorpayKeyId = () => getEnv('RAZORPAY_KEY_ID', 'Test_Key_ID', 'RAZORPAY_TEST_KEY_ID');
const getRazorpayKeySecret = () => getEnv('RAZORPAY_KEY_SECRET', 'Test_Key_Secret', 'RAZORPAY_TEST_KEY_SECRET');

let razorpayClient = null;
let configuredSignature = '';

const getRazorpayClient = () => {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret) return null;

  const nextSignature = `${keyId}:${keySecret}`;
  if (razorpayClient && configuredSignature === nextSignature) return razorpayClient;

  razorpayClient = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
  configuredSignature = nextSignature;
  return razorpayClient;
};

const assertRazorpayConfigured = () => {
  if (!getRazorpayClient()) {
    const error = new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Render/backend env.');
    error.statusCode = 500;
    throw error;
  }
};

module.exports = {
  assertRazorpayConfigured,
  getRazorpayClient,
  getRazorpayKeyId,
  getRazorpayKeySecret,
};
