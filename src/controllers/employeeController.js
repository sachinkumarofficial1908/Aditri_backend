'use strict';
const { validationResult } = require('express-validator');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { logActivity } = require('../middleware/activityLogger');
const { destroyCloudinaryAsset } = require('../config/cloudinary');

const isSupervisorUser = (req) => req.user?.role === 'supervisor';

const cleanupCloudinaryAsset = async (publicId) => {
  try {
    await destroyCloudinaryAsset(publicId);
  } catch (err) {
    // Keep the already-completed database action from failing because image cleanup failed.
  }
};

const scopeEmployeeQuery = (req, query = {}) => {
  if (isSupervisorUser(req)) {
    return { ...query, supervisor_id: req.user._id };
  }
  return query;
};

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
    'govDailyWage',
    'photoPath',
    'photoPublicId',
    'clmsId',
    'status',
    'supervisor_id',
  ];

  return allowed.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      acc[key] = key === 'supervisor_id' && body[key] === '' ? null : body[key];
    }
    return acc;
  }, {});
};

exports.getSupervisors = async (req, res, next) => {
  try {
    if (isSupervisorUser(req)) {
      return res.json({
        success: true,
        supervisors: [{
          _id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          phone: req.user.phone,
          siteName: req.user.siteName,
        }],
      });
    }

    const supervisors = await User.find({ role: 'supervisor', isActive: true })
      .select('name email phone siteName')
      .sort({ name: 1 });

    res.json({ success: true, supervisors });
  } catch (err) { next(err); }
};

exports.getAllEmployees = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      search,
      designation,
      gradeOfWork,
    } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 10000);
    const query = scopeEmployeeQuery(req, {});
    if (status) query.status = status;
    if (designation) query.designation = designation;
    if (gradeOfWork) query.gradeOfWork = gradeOfWork;
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
      .populate('supervisor_id', 'name email phone siteName')
      .sort('-createdAt')
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber);

    res.json({
      success: true,
      total,
      page: pageNumber,
      limit: limitNumber,
      totalPages: Math.max(Math.ceil(total / limitNumber), 1),
      employees,
    });
  } catch (err) { next(err); }
};

exports.getEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOne(scopeEmployeeQuery(req, { _id: req.params.id }))
      .populate('supervisor_id', 'name email phone siteName');
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
    if (isSupervisorUser(req)) {
      data.supervisor_id = req.user._id;
    }
    
    // Convert date fields to proper Date objects
    if (data.dob && typeof data.dob === 'string') {
      data.dob = new Date(data.dob);
    }
    if (data.dateOfJoining && typeof data.dateOfJoining === 'string') {
      data.dateOfJoining = new Date(data.dateOfJoining);
    }
    
    // Add photo URL if file was uploaded
    if (req.file) {
      data.photoPath = req.file.cloudinary.secure_url;
      data.photoPublicId = req.file.cloudinary.public_id;
    }

    const employee = await Employee.create({ ...data, createdBy: req.user._id });
    
    // Log activity
    await logActivity({
      req,
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email,
      action: 'employee_create',
      targetType: 'employee',
      targetId: employee._id,
      targetName: employee.name,
      details: { employeeId: employee.employeeId, designation: employee.designation },
    });

    res.status(201).json({ success: true, employee });
  } catch (err) {
    if (req.file?.cloudinary?.public_id) {
      await cleanupCloudinaryAsset(req.file.cloudinary.public_id);
    }
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
    if (isSupervisorUser(req)) {
      delete updateData.supervisor_id;
    }
    
    // Convert date fields to proper Date objects
    if (updateData.dob && typeof updateData.dob === 'string') {
      updateData.dob = new Date(updateData.dob);
    }
    if (updateData.dateOfJoining && typeof updateData.dateOfJoining === 'string') {
      updateData.dateOfJoining = new Date(updateData.dateOfJoining);
    }
    
    let previousPhotoPublicId = null;
    if (req.file) {
      const existingEmployee = await Employee.findOne(scopeEmployeeQuery(req, { _id: req.params.id }))
        .select('photoPublicId');
      if (!existingEmployee) {
        await cleanupCloudinaryAsset(req.file.cloudinary.public_id);
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }
      previousPhotoPublicId = existingEmployee.photoPublicId;
      updateData.photoPath = req.file.cloudinary.secure_url;
      updateData.photoPublicId = req.file.cloudinary.public_id;
    }

    const employee = await Employee.findOneAndUpdate(scopeEmployeeQuery(req, { _id: req.params.id }), updateData, {
      new: true,
      runValidators: true,
    });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    if (previousPhotoPublicId && previousPhotoPublicId !== updateData.photoPublicId) {
      await cleanupCloudinaryAsset(previousPhotoPublicId);
    }
    
    // Log activity
    await logActivity({
      req,
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email,
      action: 'employee_update',
      targetType: 'employee',
      targetId: employee._id,
      targetName: employee.name,
      details: { employeeId: employee.employeeId, updatedFields: Object.keys(updateData) },
    });

    res.json({ success: true, employee });
  } catch (err) {
    if (req.file?.cloudinary?.public_id) {
      await cleanupCloudinaryAsset(req.file.cloudinary.public_id);
    }
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({ success: false, message: `${field} must be unique` });
    }
    next(err);
  }
};

exports.deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOneAndDelete(scopeEmployeeQuery(req, { _id: req.params.id }));
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    await cleanupCloudinaryAsset(employee.photoPublicId);
    
    // Log activity
    await logActivity({
      req,
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email,
      action: 'employee_delete',
      targetType: 'employee',
      targetId: req.params.id,
      targetName: employee.name,
      details: { employeeId: employee.employeeId, designation: employee.designation },
    });

    res.json({ success: true, message: 'Employee deleted' });
  } catch (err) { next(err); }
};

exports.terminateEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOne(scopeEmployeeQuery(req, { _id: req.params.id }));
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const oldStatus = employee.status;
    employee.status = 'Terminate';
    employee.terminatedAt = new Date();
    await employee.save();
    
    // Log activity
    await logActivity({
      req,
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email,
      action: 'employee_status_change',
      targetType: 'employee',
      targetId: employee._id,
      targetName: employee.name,
      details: { employeeId: employee.employeeId, oldStatus, newStatus: employee.status },
    });

    res.json({ success: true, employee });
  } catch (err) { next(err); }
};
