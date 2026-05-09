'use strict';
const { validationResult } = require('express-validator');
const Employee = require('../models/Employee');

const buildUpdateData = (body) => {
  const allowed = [
    'name',
    'fatherName',
    'addressLine1',
    'addressLine2',
    'pincode',
    'siteName',
    'dob',
    'dateOfJoining',
    'aadharNo',
    'panNo',
    'uanNo',
    'esicNo',
    'bankAccountNumber',
    'ifscCode',
    'bankAddress',
    'phone',
    'l1CardNumber',
    'l1CardIssued',
    'l1CardExpiry',
    'policeVerificationNumber',
    'designation',
    'gradeOfWork',
    'dailyWagesRate',
    'photoUrl',
    'clmsId',
  ];

  return allowed.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      acc[key] = body[key];
    }
    return acc;
  }, {});
};

exports.getAllEmployees = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { employeeId: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
        { aadharNo: new RegExp(search, 'i') },
      ];
    }

    const total = await Employee.countDocuments(query);
    const employees = await Employee.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));

    res.json({ success: true, total, employees });
  } catch (err) { next(err); }
};

exports.getEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (err) { next(err); }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const data = buildUpdateData(req.body);
    const employee = await Employee.create({ ...data, createdBy: req.user._id });
    res.status(201).json({ success: true, employee });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({ success: false, message: `${field} must be unique` });
    }
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const updateData = buildUpdateData(req.body);
    const employee = await Employee.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({ success: false, message: `${field} must be unique` });
    }
    next(err);
  }
};

exports.deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) { next(err); }
};

exports.terminateEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    employee.status = 'Terminated';
    employee.terminatedAt = new Date();
    await employee.save();
    res.json({ success: true, employee });
  } catch (err) { next(err); }
};
