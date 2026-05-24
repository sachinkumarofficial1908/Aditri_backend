'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  googleOAuthStart,
  googleOAuthCallback,
  sendRegisterEmailOtp,
  verifyRegisterEmailOtp,
  sendPhoneOtp,
  verifyPhoneOtp,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name required').isLength({ max: 50 }),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').trim().matches(/^\d{10}$/).withMessage('Phone number must be exactly 10 digits'),
  body('password').isLength({ min: 8 }).withMessage('Password min 8 chars')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must have uppercase, lowercase and number'),
  body('emailVerificationToken').trim().notEmpty().withMessage('Please verify email OTP before registering'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

const updateProfileValidation = [
  body('name').trim().notEmpty().withMessage('Name required').isLength({ max: 50 }),
  body('phone').optional({ checkFalsy: true }).trim().matches(/^\d{10}$/).withMessage('Phone number must be exactly 10 digits'),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password min 8 chars')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must have uppercase, lowercase and number'),
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
];

const resetPasswordValidation = [
  body('password').isLength({ min: 8 }).withMessage('Password min 8 chars')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must have uppercase, lowercase and number'),
];

const phoneOtpSendValidation = [
  body('phone').trim().matches(/^\d{10}$/).withMessage('Phone number must be exactly 10 digits'),
];

const phoneOtpVerifyValidation = [
  body('verificationId').trim().notEmpty().withMessage('OTP verification session is required'),
  body('phone').trim().matches(/^\d{10}$/).withMessage('Phone number must be exactly 10 digits'),
  body('otp').trim().matches(/^\d{6}$/).withMessage('OTP must be exactly 6 digits'),
];

const registerEmailOtpSendValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
];

const registerEmailOtpVerifyValidation = [
  body('verificationId').trim().notEmpty().withMessage('Email OTP verification session is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('otp').trim().matches(/^\d{6}$/).withMessage('OTP must be exactly 6 digits'),
];

router.post('/register/email-otp/send', registerEmailOtpSendValidation, sendRegisterEmailOtp);
router.post('/register/email-otp/verify', registerEmailOtpVerifyValidation, verifyRegisterEmailOtp);
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);
router.put('/reset-password/:token', resetPasswordValidation, resetPassword);
router.get('/google', googleOAuthStart);
router.get('/google/callback', googleOAuthCallback);
router.post('/phone-otp/send', protect, phoneOtpSendValidation, sendPhoneOtp);
router.post('/phone-otp/verify', protect, phoneOtpVerifyValidation, verifyPhoneOtp);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.put('/update-profile', protect, updateProfileValidation, updateProfile);
router.put('/change-password', protect, changePasswordValidation, changePassword);

module.exports = router;
