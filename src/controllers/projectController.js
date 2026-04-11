'use strict';
const Project = require('../models/Project');

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
    res.status(201).json({ success: true, project });
  } catch (err) { next(err); }
};

exports.updateProject = async (req, res, next) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, project });
  } catch (err) { next(err); }
};

exports.deleteProject = async (req, res, next) => {
  try {
    await Project.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) { next(err); }
};
