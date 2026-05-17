'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const { createInquiry, getInquiries, updateStatus } = require('../controllers/inquiryController');
const { protect, adminOnly } = require('../middleware/auth');

const inquiryValidation = [
  body('subject').trim().notEmpty().withMessage('Subject required'),
  body('message').trim().isLength({ min: 10 }).withMessage('Message min 10 chars'),
];

router.post('/', protect, inquiryValidation, createInquiry);
router.get('/', protect, adminOnly, getInquiries);
router.put('/:id/status', protect, adminOnly, updateStatus);

module.exports = router;
