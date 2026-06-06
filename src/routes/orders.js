'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const {
  createOrder,
  createRazorpayPaymentOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
} = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/auth');

const orderValidation = [
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('items.*.product').isMongoId().withMessage('Cart contains an invalid product'),
  body('items.*.qty').isInt({ min: 1 }).withMessage('Product quantity must be at least 1'),
  body('shippingAddress.street').trim().notEmpty().withMessage('Street address is required'),
  body('shippingAddress.city').trim().notEmpty().withMessage('City is required'),
  body('shippingAddress.state').trim().notEmpty().withMessage('State is required'),
  body('shippingAddress.pincode')
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('PIN code must be exactly 6 digits'),
  body('shippingAddress.phone')
    .trim()
    .matches(/^\d{10}$/)
    .withMessage('Delivery phone number must be exactly 10 digits'),
  body('phoneVerificationToken').trim().notEmpty().withMessage('Please verify your delivery phone number'),
  body('paymentMethod')
    .optional()
    .isIn(['cod', 'bank_transfer', 'upi', 'online', 'razorpay'])
    .withMessage('Unsupported payment method'),
];

router.post('/payment-order', protect, orderValidation, createRazorpayPaymentOrder);
router.post('/', protect, orderValidation, createOrder);
router.get('/my', protect, getMyOrders);
router.get('/', protect, adminOnly, getAllOrders);
router.put('/:id/status', protect, adminOnly, updateOrderStatus);

module.exports = router;
