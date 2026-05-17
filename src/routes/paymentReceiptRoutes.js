'use strict';
const router = require('express').Router();
const { uploadExcel } = require('../middleware/upload');
const { protect, adminOnly } = require('../middleware/auth');
const {
  generatePaymentReceipts,
  validateReceiptFile,
} = require('../controllers/paymentReceiptController');

router.post('/validate', protect, adminOnly, uploadExcel.single('file'), validateReceiptFile);
router.post('/generate', protect, adminOnly, uploadExcel.single('file'), generatePaymentReceipts);

module.exports = router;
