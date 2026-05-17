'use strict';
const Inquiry = require('../models/Inquiry');
const { validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const getSmtpConfig = () => {
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port,
    secure: port === 465,
    user: (process.env.SMTP_EMAIL || '').trim(),
    pass: (process.env.SMTP_PASSWORD || '').replace(/\s+/g, ''),
    fromEmail: (process.env.FROM_EMAIL || process.env.SMTP_EMAIL || '').trim(),
    fromName: (process.env.FROM_NAME || 'Aditri Constructions Services').trim(),
  };
};

const getEmailErrorMessage = (err) => {
  if (err.responseCode === 534 || /Application-specific password required/i.test(err.response || '')) {
    return 'Gmail requires a Google App Password for SMTP. Generate a 16-character app password and use it as SMTP_PASSWORD.';
  }

  if (err.responseCode === 535 || /Username and Password not accepted/i.test(err.response || '')) {
    return 'Gmail rejected the SMTP username or password. Check SMTP_EMAIL and use a valid Google App Password.';
  }

  return 'Email could not be sent. Check SMTP settings and try again.';
};

const sendEmail = async ({ to, subject, html, failOnError = false }) => {
  const smtp = getSmtpConfig();

  if (!smtp.user || !smtp.pass) {
    const message = 'Email service is not configured. Check SMTP_EMAIL and SMTP_PASSWORD.';
    logger.error(message);
    if (failOnError) throw new Error(message);
    return { sent: false, error: message };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to,
      subject,
      html,
    });

    return { sent: true };
  } catch (err) {
    logger.error(`Email send failed: ${err.message}`);
    if (failOnError) {
      throw new Error(getEmailErrorMessage(err));
    }
    return { sent: false, error: err.message };
  }
};

// @POST /api/inquiries
exports.createInquiry = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { phone, pincode, company, serviceType, subject, message } = req.body;

    const inquiry = await Inquiry.create({
      name: req.user.name,
      email: req.user.email,
      user: req.user._id,
      phone,
      pincode,
      company,
      serviceType,
      subject,
      message,
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
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });

    if (adminReply) {
      const reply = adminReply.trim();
      if (!reply) {
        return res.status(400).json({ success: false, message: 'Reply message is required' });
      }

      await sendEmail({
        to: inquiry.email,
        subject: `Re: ${inquiry.subject} - Aditri Constructions`,
        html: `<h3>Dear ${inquiry.name},</h3><p>${reply}</p>
          <br><p>Best Regards,<br>Aditri Constructions Services<br>+91 9598033414</p>`,
        failOnError: true,
      });

      inquiry.adminReply = reply;
      inquiry.repliedAt = new Date();
    }

    inquiry.status = status;
    await inquiry.save();

    res.json({ success: true, inquiry });
  } catch (err) { next(err); }
};
