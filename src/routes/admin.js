'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const { getDashboard, getUsers, toggleUserStatus, updateUserRole, createSupervisor } = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

const supervisorValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('fatherName').notEmpty().withMessage('Father name is required'),
  body('siteName').notEmpty().withMessage('Site name is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

router.use(protect, adminOnly);

router.get('/dashboard', getDashboard);
router.get('/users', getUsers);
router.post('/supervisors', supervisorValidation, createSupervisor);
router.put('/users/:id/toggle', toggleUserStatus);
router.patch('/users/:id/role', updateUserRole);

module.exports = router;
