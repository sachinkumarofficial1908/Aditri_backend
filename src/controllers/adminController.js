'use strict';
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
