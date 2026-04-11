'use strict';
const Inquiry = require('../models/Inquiry');
const { validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_EMAIL) return;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
    });
    await transporter.sendMail({ from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`, to, subject, html });
  } catch (err) {
    logger.error(`Email send failed: ${err.message}`);
  }
};

// @POST /api/inquiries
exports.createInquiry = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const inquiry = await Inquiry.create({
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Notify admin
    await sendEmail({
      to: process.env.SMTP_EMAIL,
      subject: `New Inquiry: ${inquiry.subject}`,
      html: `<h3>New Inquiry from ${inquiry.name}</h3>
        <p><strong>Email:</strong> ${inquiry.email}</p>
        <p><strong>Phone:</strong> ${inquiry.phone || 'N/A'}</p>
        <p><strong>Company:</strong> ${inquiry.company || 'N/A'}</p>
        <p><strong>Service:</strong> ${inquiry.serviceType}</p>
        <p><strong>Message:</strong><br>${inquiry.message}</p>`,
    });

    // Auto-reply to user
    await sendEmail({
      to: inquiry.email,
      subject: 'Thank you for contacting Aditri Constructions Services',
      html: `<h3>Dear ${inquiry.name},</h3>
        <p>Thank you for reaching out to us. We have received your inquiry and will get back to you within 24 hours.</p>
        <p><strong>Your Reference Number:</strong> ${inquiry._id}</p>
        <br><p>Best Regards,<br>Aditri Constructions Services Team<br>+91 9598033414</p>`,
    });

    res.status(201).json({ success: true, message: 'Inquiry submitted successfully', id: inquiry._id });
  } catch (err) { next(err); }
};

// @GET /api/inquiries (admin)
exports.getInquiries = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = status ? { status } : {};
    const total = await Inquiry.countDocuments(query);
    const inquiries = await Inquiry.find(query)
      .sort('-createdAt')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    res.json({ success: true, total, inquiries });
  } catch (err) { next(err); }
};

// @PUT /api/inquiries/:id/status (admin)
exports.updateStatus = async (req, res, next) => {
  try {
    const { status, adminReply } = req.body;
    const update = { status };
    if (adminReply) { update.adminReply = adminReply; update.repliedAt = new Date(); }
    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });

    if (adminReply) {
      await sendEmail({
        to: inquiry.email,
        subject: `Re: ${inquiry.subject} - Aditri Constructions`,
        html: `<h3>Dear ${inquiry.name},</h3><p>${adminReply}</p>
          <br><p>Best Regards,<br>Aditri Constructions Services<br>+91 9598033414</p>`,
      });
    }
    res.json({ success: true, inquiry });
  } catch (err) { next(err); }
};
