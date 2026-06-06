'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const firebaseAdmin = require('../config/firebaseAdmin');
const { assertRazorpayConfigured, getRazorpayKeyId, razorpay } = require('../config/razorpay');

const TEST_OTP_PHONE = '9999999999';
const DEFAULT_GST_RATE = 18;

const getGstRate = (product) => {
  const gstRate = Number(product.gstRate);
  return Number.isFinite(gstRate) && gstRate >= 0 ? gstRate : DEFAULT_GST_RATE;
};

const createHttpError = (message, statusCode = 400, extra = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
};

const sendHandledError = (res, err) => {
  if (!err.statusCode && !err.status) return false;
  res.status(err.statusCode || err.status).json({
    success: false,
    message: err.message,
    ...(err.code && { code: err.code }),
    ...(err.invalidProducts && { invalidProducts: err.invalidProducts }),
  });
  return true;
};

const verifyDeliveryPhone = async (req, shippingAddress, phoneVerificationToken) => {
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

    if (!verifiedPhone) throw new Error('Phone verification mismatch');
    return verifiedPhone;
  } catch {
    throw createHttpError('Please verify your delivery phone number before placing the order.', 400);
  }
};

const validateItemsAndCalculateTotals = async (items) => {
  let subtotal = 0;
  let tax = 0;
  const validatedItems = [];

  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product || !product.isActive) {
      throw createHttpError(
        'One or more products in your cart are no longer available. Please remove them and add current products again.',
        400,
        { code: 'PRODUCT_UNAVAILABLE', invalidProducts: [item.product] }
      );
    }
    if (product.stock < item.qty) {
      throw createHttpError(`Insufficient stock for ${product.name}`, 400);
    }
    const price = product.discountPrice || product.price;
    const lineSubtotal = price * item.qty;
    const gstRate = getGstRate(product);
    const gstAmount = Math.round((lineSubtotal * gstRate) / 100);
    subtotal += lineSubtotal;
    tax += gstAmount;
    validatedItems.push({
      product: product._id,
      name: product.name,
      qty: item.qty,
      price,
      gstRate,
      gstAmount,
      image: product.images?.[0]?.url,
    });
  }

  const shippingCost = subtotal > 10000 ? 0 : 200;
  const total = subtotal + tax + shippingCost;
  return { subtotal, tax, shippingCost, total, validatedItems };
};

const toRazorpayAmount = (amount) => Math.round(Number(amount) * 100);

const verifyRazorpayPayment = async (payment, total) => {
  assertRazorpayConfigured();

  const {
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature,
  } = payment || {};

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw createHttpError('Razorpay payment details are missing.', 400);
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(razorpaySignature);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw createHttpError('Payment verification failed.', 400);
  }

  const paymentOrder = await razorpay.orders.fetch(razorpayOrderId);
  if (
    Number(paymentOrder.amount) !== toRazorpayAmount(total) ||
    paymentOrder.currency !== (process.env.RAZORPAY_CURRENCY || 'INR')
  ) {
    throw createHttpError('Paid amount does not match order total.', 400);
  }

  return {
    gateway: 'razorpay',
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    transactionId: razorpayPaymentId,
    paidAt: new Date(),
  };
};

// @POST /api/orders/payment-order
exports.createRazorpayPaymentOrder = async (req, res, next) => {
  try {
    assertRazorpayConfigured();
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { items, shippingAddress, phoneVerificationToken } = req.body;
    await verifyDeliveryPhone(req, shippingAddress, phoneVerificationToken);
    const { subtotal, tax, shippingCost, total } = await validateItemsAndCalculateTotals(items);

    const currency = process.env.RAZORPAY_CURRENCY || 'INR';
    const receipt = `ACS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const paymentOrder = await razorpay.orders.create({
      amount: toRazorpayAmount(total),
      currency,
      receipt,
      notes: {
        userId: req.user.id.toString(),
        email: req.user.email || '',
      },
    });

    res.status(201).json({
      success: true,
      key: getRazorpayKeyId(),
      razorpayOrder: paymentOrder,
      amount: paymentOrder.amount,
      currency,
      totals: { subtotal, tax, shippingCost, total },
    });
  } catch (err) {
    if (sendHandledError(res, err)) return;
    next(err);
  }
};

// @POST /api/orders
exports.createOrder = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { items, shippingAddress, paymentMethod, guestInfo, notes, phoneVerificationToken, razorpay: razorpayPayment } = req.body;

    const verifiedPhone = await verifyDeliveryPhone(req, shippingAddress, phoneVerificationToken);
    const { subtotal, tax, shippingCost, total, validatedItems } = await validateItemsAndCalculateTotals(items);
    const normalizedPaymentMethod = paymentMethod === 'razorpay' ? 'razorpay' : paymentMethod || 'cod';
    let paymentStatus = 'pending';
    let orderStatus = 'pending';
    let paymentDetails;

    if (normalizedPaymentMethod === 'razorpay') {
      paymentDetails = await verifyRazorpayPayment(razorpayPayment, total);
      paymentStatus = 'paid';
      orderStatus = 'confirmed';
    }

    const orderData = {
      items: validatedItems,
      shippingAddress: { ...shippingAddress, phone: verifiedPhone },
      paymentMethod: normalizedPaymentMethod,
      paymentStatus,
      orderStatus,
      subtotal,
      tax,
      shippingCost,
      total,
      notes,
    };

    if (paymentDetails) {
      orderData.paymentDetails = paymentDetails;
    }
    if (guestInfo) {
      orderData.guestInfo = guestInfo;
    }
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
  } catch (err) {
    if (sendHandledError(res, err)) return;
    next(err);
  }
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
