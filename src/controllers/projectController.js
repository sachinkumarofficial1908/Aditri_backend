'use strict';
const Project = require('../models/Project');
const { logActivity } = require('../middleware/activityLogger');

exports.getProjects = async (req, res, next) => {
  try {
    const { category, status, featured, page = 1, limit = 12 } = req.query;
    const query = { isActive: true };
    if (category && category !== 'all') query.category = category;
    if (status) query.status = status;
    if (featured === 'true') query.isFeatured = true;
    const total = await Project.countDocuments(query);
    const projects = await Project.find(query)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.json({ success: true, total, projects });
  } catch (err) { next(err); }
};

exports.getProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, project });
  } catch (err) { next(err); }
};

exports.createProject = async (req, res, next) => {
  try {
    const project = await Project.create(req.body);
    
    // Log activity
    await logActivity({
      req,
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email,
      action: 'project_create',
      targetType: 'project',
      targetId: project._id,
      targetName: project.name,
      details: { category: project.category },
      status: 'success',
    });
    
    res.status(201).json({ success: true, project });
  } catch (err) { next(err); }
};

exports.updateProject = async (req, res, next) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    
    // Log activity
    await logActivity({
      req,
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email,
      action: 'project_update',
      targetType: 'project',
      targetId: project._id,
      targetName: project.name,
      details: { updatedFields: Object.keys(req.body) },
      status: 'success',
    });
    
    res.json({ success: true, project });
  } catch (err) { next(err); }
};

exports.deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, { isActive: false });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    
    // Log activity
    await logActivity({
      req,
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email,
      action: 'project_delete',
      targetType: 'project',
      targetId: project._id,
      targetName: project.name,
      status: 'success',
    });
    
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) { next(err); }
};
