'use strict';
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Inquiry = require('../models/Inquiry');
const Project = require('../models/Project');

exports.getDashboard = async (req, res, next) => {
  try {
    const [users, products, orders, inquiries, projects] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Product.countDocuments({ isActive: true }),
      Order.countDocuments(),
      Inquiry.countDocuments({ status: 'new' }),
      Project.countDocuments({ isActive: true }),
    ]);

    const revenue = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    const recentOrders = await Order.find()
      .sort('-createdAt')
      .limit(5)
      .populate('user', 'name email');

    const recentInquiries = await Inquiry.find().sort('-createdAt').limit(5);

    const monthlyRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          amount: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]);

    res.json({
      success: true,
      stats: {
        users,
        products,
        orders,
        newInquiries: inquiries,
        projects,
        totalRevenue: revenue[0]?.total || 0,
      },
      recentOrders,
      recentInquiries,
      monthlyRevenue,
    });
  } catch (err) { next(err); }
};

exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await User.countDocuments();
    const users = await User.find()
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-password');
    res.json({ success: true, total, users });
  } catch (err) { next(err); }
};

exports.toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, user });
  } catch (err) { next(err); }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user', 'supervisor', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user._id.equals(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Cannot change own role' });
    }

    user.role = role;
    await user.save();
    res.json({ success: true, user });
  } catch (err) { next(err); }
};

exports.createSupervisor = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, fatherName, siteName, phone, email, password } = req.body;

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ success: false, message: 'Phone number already in use' });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    const supervisor = await User.create({
      name,
      fatherName,
      siteName,
      phone,
      email,
      password,
      role: 'supervisor',
    });

    res.status(201).json({
      success: true,
      supervisor: {
        id: supervisor._id,
        name: supervisor.name,
        fatherName: supervisor.fatherName,
        siteName: supervisor.siteName,
        phone: supervisor.phone,
        email: supervisor.email,
        role: supervisor.role,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({ success: false, message: `${field} must be unique` });
    }
    next(err);
  }
};
