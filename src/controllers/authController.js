'use strict';
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const logger = require('../utils/logger');
const { logActivity } = require('../middleware/activityLogger');

const getTokenCookieOptions = () => ({
    expires: new Date(Date.now() + parseInt(process.env.JWT_COOKIE_EXPIRE || 7) * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
});

const getSafeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  avatar: user.avatar,
});

const TEST_OTP_PHONE = '9999999999';
const PHONE_OTP_TTL_MS = 3 * 60 * 1000;
const PHONE_OTP_MAX_ATTEMPTS = 5;
const phoneOtpChallenges = new Map();
const EMAIL_OTP_TTL_MS = 5 * 60 * 1000;
const EMAIL_OTP_MAX_ATTEMPTS = 5;
const emailOtpChallenges = new Map();

const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

const getSmtpConfig = () => {
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = (process.env.SMTP_EMAIL || '').trim();
  const timeoutMs = parseInt(process.env.SMTP_TIMEOUT_MS, 10) || 12000;
  return {
    host: (process.env.SMTP_HOST || '').trim() || (user.endsWith('@gmail.com') ? 'smtp.gmail.com' : ''),
    port,
    secure: port === 465,
    user,
    pass: (process.env.SMTP_PASSWORD || '').replace(/\s+/g, ''),
    fromEmail: (process.env.FROM_EMAIL || process.env.SMTP_EMAIL || '').trim(),
    fromName: (process.env.FROM_NAME || 'Aditri Constructions Services').trim(),
    timeoutMs,
  };
};

const sendEmail = async ({ to, subject, html }) => {
  const smtp = getSmtpConfig();
  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      let detail = '';
      try {
        const data = await response.json();
        detail = data?.message || data?.error || JSON.stringify(data);
      } catch {
        detail = await response.text();
      }
      const error = new Error(detail || 'Resend email API failed');
      error.code = 'EMAIL_API_FAILED';
      throw error;
    }

    return;
  }

  if (!smtp.user || !smtp.pass) {
    throw new Error('Email service is not configured. Check SMTP_EMAIL and SMTP_PASSWORD.');
  }
  if (!smtp.host) {
    throw new Error('Email service is not configured. Check SMTP_HOST or use a Gmail SMTP_EMAIL.');
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: smtp.timeoutMs,
    greetingTimeout: smtp.timeoutMs,
    socketTimeout: smtp.timeoutMs,
    dnsTimeout: smtp.timeoutMs,
  });

  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
    to,
    subject,
    html,
  });
};

const getEmailErrorMessage = (err) => {
  if (err?.code === 'EMAIL_API_FAILED') {
    return `Email API failed: ${err.message}`;
  }
  if (err?.code === 'EAUTH') {
    return 'Email login failed. Use a valid Gmail App Password in SMTP_PASSWORD.';
  }
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(err?.code)) {
    return 'Email server connection timed out. Check SMTP_HOST, SMTP_PORT, and Render network access.';
  }
  if (/not configured/i.test(err?.message || '')) {
    return err.message;
  }
  return 'Unable to send reset email. Check SMTP/Gmail app password settings.';
};

const getResetPasswordUrl = (req, token) => {
  const clientUrl = getClientUrl(req.body.clientUrl || req.get('origin') || req.get('referer'));
  const resetUrl = new URL(`/reset-password/${token}`, clientUrl);
  return resetUrl.toString();
};

const clearExpiredPhoneOtps = () => {
  const now = Date.now();
  for (const [id, challenge] of phoneOtpChallenges.entries()) {
    if (challenge.expiresAt <= now) phoneOtpChallenges.delete(id);
  }
};

const clearExpiredEmailOtps = () => {
  const now = Date.now();
  for (const [id, challenge] of emailOtpChallenges.entries()) {
    if (challenge.expiresAt <= now) emailOtpChallenges.delete(id);
  }
};

const sendToken = (user, statusCode, res) => {
  const token = user.getSignedToken();
  res.status(statusCode)
    .cookie('token', token, getTokenCookieOptions())
    .json({
      success: true,
      token,
      user: getSafeUser(user),
    });
};

const getRequestOrigin = (req) => {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  return host ? `${proto}://${host}` : null;
};

const getBackendOriginForClient = (clientUrl, req) => {
  const clientOrigin = normalizeOrigin(clientUrl);
  if (clientOrigin === 'http://localhost:5173' || clientOrigin === 'http://localhost:3000') {
    return process.env.LOCAL_SERVER_URL || `http://localhost:${process.env.PORT || 10000}`;
  }

  return process.env.SERVER_URL || getRequestOrigin(req) || `http://localhost:${process.env.PORT || 10000}`;
};

const getGoogleRedirectUri = (req, clientUrl) => (
  `${getBackendOriginForClient(clientUrl, req)}/api/auth/google/callback`
);

const normalizeOrigin = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const getAllowedClientOrigins = () => {
  const configured = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    ...(process.env.OAUTH_ALLOWED_CLIENT_URLS || '').split(','),
    ...(process.env.CORS_ORIGINS || '').split(','),
    'http://localhost:5173',
    'http://localhost:3000',
    'https://aditri-frontend2.vercel.app',
  ];

  return configured.map((url) => normalizeOrigin(url?.trim())).filter(Boolean);
};

const getClientUrl = (preferredUrl) => {
  const preferredOrigin = normalizeOrigin(preferredUrl);
  const allowedOrigins = getAllowedClientOrigins();

  if (preferredOrigin && allowedOrigins.includes(preferredOrigin)) {
    return preferredOrigin;
  }

  return normalizeOrigin(process.env.CLIENT_URL) || 'http://localhost:5173';
};

const sanitizeRedirect = (redirectPath = '/') => {
  if (typeof redirectPath !== 'string') return '/';
  if (!redirectPath.startsWith('/') || redirectPath.startsWith('//')) return '/';
  return redirectPath;
};

const signOAuthState = (payload) => {
  const secret = process.env.JWT_SECRET;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
};

const verifyOAuthState = (state) => {
  if (!state || typeof state !== 'string') throw new Error('Missing OAuth state');
  const [body, signature] = state.split('.');
  if (!body || !signature) throw new Error('Invalid OAuth state');

  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid OAuth state signature');
  }

  const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!parsed.exp || parsed.exp < Date.now()) throw new Error('OAuth state expired');
  return parsed;
};

const redirectWithOAuthError = (res, message = 'Google sign-in failed', clientUrl) => {
  const failureUrl = new URL('/login', getClientUrl(clientUrl));
  failureUrl.searchParams.set('oauthError', message);
  return res.redirect(failureUrl.toString());
};

const exchangeGoogleCode = async (code, redirectUri) => {
  if (typeof fetch !== 'function') {
    throw new Error('OAuth requires Node.js 18+ fetch support');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.id_token) {
    throw new Error(tokens.error_description || 'Unable to exchange Google OAuth code');
  }

  const profileResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`
  );
  const profile = await profileResponse.json();
  if (!profileResponse.ok) {
    throw new Error(profile.error_description || 'Unable to verify Google identity token');
  }

  if (profile.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Google identity token audience mismatch');
  }

  if (profile.email_verified !== true && profile.email_verified !== 'true') {
    throw new Error('Google email is not verified');
  }

  if (!profile.email || !profile.sub) {
    throw new Error('Google profile is missing required identity fields');
  }

  return profile;
};

const findOrCreateGoogleUser = async (profile) => {
  const email = profile.email.toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: profile.sub }, { email }] });

  if (!user) {
    return User.create({
      name: profile.name || email.split('@')[0],
      email,
      authProvider: 'google',
      googleId: profile.sub,
      avatar: profile.picture,
      role: 'user',
      lastLogin: new Date(),
    });
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        googleId: user.googleId || profile.sub,
        avatar: user.avatar || profile.picture,
        lastLogin: new Date(),
      },
    }
  );

  return User.findById(user._id);
};

const redirectWithOAuthToken = (user, state, res) => {
  const token = user.getSignedToken();
  const successUrl = new URL('/oauth/callback', getClientUrl(state.clientUrl));
  successUrl.searchParams.set('token', token);
  successUrl.searchParams.set('user', Buffer.from(JSON.stringify(getSafeUser(user))).toString('base64url'));
  successUrl.searchParams.set('redirect', sanitizeRedirect(state.redirect));

  return res
    .cookie('token', token, getTokenCookieOptions())
    .redirect(successUrl.toString());
};

// @POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { name, email, password, phone, emailVerificationToken } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    try {
      const decoded = jwt.verify(emailVerificationToken, process.env.JWT_SECRET);
      if (decoded.purpose !== 'register_email' || decoded.email !== email) {
        throw new Error('Email verification mismatch');
      }
    } catch {
      return res.status(400).json({ success: false, message: 'Please verify your email OTP before registering' });
    }

    const user = await User.create({ name, email, password, phone, role: 'user' });
    logger.info(`New user registered: ${email}`);
    sendToken(user, 201, res);
  } catch (err) { next(err); }
};

// @POST /api/auth/register/email-otp/send
exports.sendRegisterEmailOtp = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    clearExpiredEmailOtps();

    const email = req.body.email.toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const verificationId = crypto.randomUUID();

    emailOtpChallenges.set(verificationId, {
      email,
      otpHash: hashOtp(otp),
      expiresAt: Date.now() + EMAIL_OTP_TTL_MS,
      attempts: 0,
    });

    await sendEmail({
      to: email,
      subject: 'Your Aditri registration OTP',
      html: `<h3>Email Verification</h3>
        <p>Your OTP for Aditri registration is:</p>
        <h2 style="letter-spacing: 4px;">${otp}</h2>
        <p>This OTP expires in 5 minutes.</p>`,
    });

    res.json({
      success: true,
      message: 'OTP sent to your email address.',
      verificationId,
      expiresInSeconds: EMAIL_OTP_TTL_MS / 1000,
    });
  } catch (err) {
    logger.error(`Registration email OTP failed: ${err.message}`);
    res.status(500).json({
      success: false,
      message: 'Unable to send email OTP. Check SMTP/Gmail app password settings.',
    });
  }
};

// @POST /api/auth/register/email-otp/verify
exports.verifyRegisterEmailOtp = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const email = req.body.email.toLowerCase();
    const { otp, verificationId } = req.body;
    const challenge = emailOtpChallenges.get(verificationId);

    if (!challenge || challenge.expiresAt <= Date.now()) {
      emailOtpChallenges.delete(verificationId);
      return res.status(400).json({ success: false, message: 'Email OTP expired. Please request a new OTP.' });
    }

    if (challenge.email !== email) {
      return res.status(400).json({ success: false, message: 'OTP verification does not match this email.' });
    }

    if (challenge.attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      emailOtpChallenges.delete(verificationId);
      return res.status(400).json({ success: false, message: 'Too many OTP attempts. Please request a new OTP.' });
    }

    challenge.attempts += 1;

    if (challenge.otpHash !== hashOtp(otp)) {
      return res.status(400).json({ success: false, message: 'Invalid email OTP. Please check and try again.' });
    }

    emailOtpChallenges.delete(verificationId);

    const emailVerificationToken = jwt.sign(
      { email, purpose: 'register_email' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({
      success: true,
      message: 'Email verified successfully.',
      email,
      emailVerificationToken,
    });
  } catch (err) {
    next(err);
  }
};

// @POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const { email, phone, password } = req.body;
    const user = await User.findOne(
      email ? { email } : { phone }
    ).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isLocked()) {
      return res.status(403).json({ success: false, message: 'Account locked. Try later.' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = Date.now() + 30 * 60 * 1000;
        user.loginAttempts = 0;
      }
      await user.save();
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    // Log activity for all user logins
    await logActivity({
      req,
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      action: 'login',
      targetType: 'auth',
      status: 'success',
    });

    logger.info(`User logged in: ${email}`, { userId: user._id, role: user.role });
    sendToken(user, 200, res);
  } catch (err) { next(err); }
};

// @POST /api/auth/forgot-password
exports.forgotPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const email = req.body.email.toLowerCase();
    const user = await User.findOne({ email });
    const genericResponse = {
      success: true,
      message: 'If an account exists for this email, a reset link has been sent.',
    };

    if (!user) {
      return res.json(genericResponse);
    }

    const resetToken = user.getResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      const resetUrl = getResetPasswordUrl(req, resetToken);
      await sendEmail({
        to: user.email,
        subject: 'Reset your Aditri password',
        html: `<h3>Password Reset</h3>
          <p>Use the link below to reset your Aditri account password.</p>
          <p><a href="${resetUrl}">Reset password</a></p>
          <p>This link expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
      });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      logger.error(`Forgot password email failed: ${err.code || 'NO_CODE'} ${err.message}`);
      return res.status(500).json({
        success: false,
        message: getEmailErrorMessage(err),
      });
    }

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
};

// @PUT /api/auth/reset-password/:token
exports.resetPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+password +resetPasswordToken +resetPasswordExpire');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Password reset link is invalid or expired.' });
    }

    user.password = req.body.password;
    user.authProvider = 'local';
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    sendToken(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// @GET /api/auth/google
exports.googleOAuthStart = async (req, res, next) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Google OAuth is not configured',
      });
    }

    const mode = req.query.mode === 'register' ? 'register' : 'login';
    const clientUrl = getClientUrl(req.query.clientUrl || req.get('origin') || req.get('referer'));
    const redirectUri = getGoogleRedirectUri(req, clientUrl);
    const state = signOAuthState({
      mode,
      clientUrl,
      redirectUri,
      redirect: sanitizeRedirect(req.query.redirect),
      exp: Date.now() + 10 * 60 * 1000,
    });

    const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
    googleUrl.searchParams.set('redirect_uri', redirectUri);
    googleUrl.searchParams.set('response_type', 'code');
    googleUrl.searchParams.set('scope', 'openid email profile');
    googleUrl.searchParams.set('prompt', 'select_account');
    googleUrl.searchParams.set('state', state);

    return res.redirect(googleUrl.toString());
  } catch (err) {
    next(err);
  }
};

// @GET /api/auth/google/callback
exports.googleOAuthCallback = async (req, res) => {
  let state;
  try {
    state = verifyOAuthState(req.query.state);

    if (req.query.error) {
      return redirectWithOAuthError(res, 'Google sign-in was cancelled', state.clientUrl);
    }

    if (!req.query.code) {
      throw new Error('Missing Google OAuth code');
    }
    const profile = await exchangeGoogleCode(req.query.code, state.redirectUri || getGoogleRedirectUri(req, state.clientUrl));
    const user = await findOrCreateGoogleUser(profile);

    logger.info(`Google OAuth ${state.mode}: ${user.email}`);
    return redirectWithOAuthToken(user, state, res);
  } catch (err) {
    logger.error(`Google OAuth failed: ${err.message}`);
    return redirectWithOAuthError(res, 'Google sign-in failed. Please try again.', state?.clientUrl);
  }
};

// @POST /api/auth/phone-otp/send
exports.sendPhoneOtp = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    clearExpiredPhoneOtps();

    const { phone } = req.body;
    if (phone !== TEST_OTP_PHONE) {
      return res.status(400).json({
        success: false,
        message: 'Testing OTP is available only for phone number 9999999999.',
      });
    }

    const otp = '123456';
    const verificationId = crypto.randomUUID();

    phoneOtpChallenges.set(verificationId, {
      userId: req.user.id.toString(),
      phone,
      otpHash: hashOtp(otp),
      expiresAt: Date.now() + PHONE_OTP_TTL_MS,
      attempts: 0,
    });

    res.json({
      success: true,
      message: 'Testing OTP generated.',
      verificationId,
      devOtp: otp,
      expiresInSeconds: PHONE_OTP_TTL_MS / 1000,
    });
  } catch (err) {
    next(err);
  }
};

// @POST /api/auth/phone-otp/verify
exports.verifyPhoneOtp = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { phone, otp, verificationId } = req.body;
    const challenge = phoneOtpChallenges.get(verificationId);

    if (!challenge || challenge.expiresAt <= Date.now()) {
      phoneOtpChallenges.delete(verificationId);
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new OTP.' });
    }

    if (challenge.userId !== req.user.id.toString() || challenge.phone !== phone) {
      return res.status(400).json({ success: false, message: 'OTP verification does not match this phone number.' });
    }

    if (challenge.attempts >= PHONE_OTP_MAX_ATTEMPTS) {
      phoneOtpChallenges.delete(verificationId);
      return res.status(400).json({ success: false, message: 'Too many OTP attempts. Please request a new OTP.' });
    }

    challenge.attempts += 1;

    if (challenge.otpHash !== hashOtp(otp)) {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please check and try again.' });
    }

    phoneOtpChallenges.delete(verificationId);

    const phoneVerificationToken = jwt.sign(
      { id: req.user.id, phone, purpose: 'checkout_phone_test' },
      process.env.JWT_SECRET,
      { expiresIn: '3m' }
    );

    res.json({
      success: true,
      message: 'Phone number verified successfully.',
      phone,
      phoneVerificationToken,
    });
  } catch (err) {
    next(err);
  }
};

// @POST /api/auth/logout
exports.logout = async (req, res) => {
  try {
    // Log activity for admin/supervisor logouts
    if (req.user && (req.user.role === 'admin' || req.user.role === 'supervisor')) {
      await logActivity({
        req,
        adminId: req.user._id,
        adminName: req.user.name,
        adminEmail: req.user.email,
        action: 'logout',
        targetType: 'auth',
        status: 'success',
      });
    }
  } catch (err) {
    // Don't fail logout if logging fails
    console.error('Error logging logout:', err);
  }

  res.cookie('token', '', { expires: new Date(0), httpOnly: true });
  res.json({ success: true, message: 'Logged out successfully' });
};

// @GET /api/auth/me
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ success: true, user: getSafeUser(user) });
  } catch (err) { next(err); }
};

// @PUT /api/auth/update-profile
exports.updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, phone },
      { new: true, runValidators: true }
    );
    res.json({ success: true, user: getSafeUser(user) });
  } catch (err) { next(err); }
};

// @PUT /api/auth/change-password
exports.changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    if (!user.password) {
      return res.status(400).json({ success: false, message: 'This account does not have a local password yet. Use forgot password to set one.' });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    sendToken(user, 200, res);
  } catch (err) { next(err); }
};
