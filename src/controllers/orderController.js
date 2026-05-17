'use strict';
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const firebaseAdmin = require('../config/firebaseAdmin');

const TEST_OTP_PHONE = '9999999999';

// @POST /api/orders
exports.createOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { items, shippingAddress, paymentMethod, guestInfo, notes, phoneVerificationToken } = req.body;

    let verifiedPhone;
    try {
      if (shippingAddress.phone === TEST_OTP_PHONE) {
        const decoded = jwt.verify(phoneVerificationToken, process.env.JWT_SECRET);
        if (
          decoded.purpose !== 'checkout_phone_test' ||
          decoded.id !== req.user.id.toString() ||
          decoded.phone !== shippingAddress.phone
        ) {
          throw new Error('Test phone verification mismatch');
        }
        verifiedPhone = decoded.phone;
      } else {
        const decoded = await firebaseAdmin.auth().verifyIdToken(phoneVerificationToken);
        const firebasePhone = decoded.phone_number?.replace(/^\+91/, '');
        if (!firebasePhone || firebasePhone !== shippingAddress.phone) {
          throw new Error('Phone verification mismatch');
        }
        verifiedPhone = firebasePhone;
      }

      if (!verifiedPhone) {
        throw new Error('Phone verification mismatch');
      }
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Please verify your delivery phone number before placing the order.',
      });
    }

    // Validate stock and compute totals
    let subtotal = 0;
    const validatedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product || !product.isActive) {
        return res.status(400).json({
          success: false,
          code: 'PRODUCT_UNAVAILABLE',
          message: 'One or more products in your cart are no longer available. Please remove them and add current products again.',
          invalidProducts: [item.product],
        });
      }
      if (product.stock < item.qty) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }
      const price = product.discountPrice || product.price;
      subtotal += price * item.qty;
      validatedItems.push({ product: product._id, name: product.name, qty: item.qty, price, image: product.images?.[0]?.url });
    }

    const tax = Math.round(subtotal * 0.18);
    const shippingCost = subtotal > 10000 ? 0 : 200;
    const total = subtotal + tax + shippingCost;

    const orderData = {
      items: validatedItems,
      shippingAddress: { ...shippingAddress, phone: verifiedPhone },
      paymentMethod: paymentMethod || 'cod',
      subtotal,
      tax,
      shippingCost,
      total,
      notes,
    };

    if (req.user) {
      orderData.user = req.user.id;
    }

    const order = await Order.create(orderData);

    await User.findByIdAndUpdate(req.user.id, { phone: verifiedPhone }, { runValidators: true });

    // Deduct stock
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.qty } });
    }

    res.status(201).json({ success: true, order });
  } catch (err) { next(err); }
};

// @GET /api/orders/my
exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort('-createdAt').populate('items.product', 'name images');
    res.json({ success: true, orders });
  } catch (err) { next(err); }
};

// @GET /api/orders (admin)
exports.getAllOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = status ? { orderStatus: status } : {};
    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('user', 'name email');
    res.json({ success: true, total, orders });
  } catch (err) { next(err); }
};

// @PUT /api/orders/:id/status (admin)
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { orderStatus, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.orderStatus = orderStatus;
    order.statusHistory.push({ status: orderStatus, note });
    await order.save();
    res.json({ success: true, order });
  } catch (err) { next(err); }
};
