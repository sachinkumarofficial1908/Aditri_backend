'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const { createOrder, getMyOrders, getAllOrders, updateOrderStatus } = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/auth');

const orderValidation = [
  body('items').isArray({ min: 1 }).withMessage('At least one item required'),
  body('shippingAddress.street').notEmpty(),
  body('shippingAddress.city').notEmpty(),
  body('shippingAddress.state').notEmpty(),
  body('shippingAddress.pincode').notEmpty(),
];

router.post('/', orderValidation, createOrder);
router.get('/my', protect, getMyOrders);
router.get('/', protect, adminOnly, getAllOrders);
router.put('/:id/status', protect, adminOnly, updateOrderStatus);

module.exports = router;
