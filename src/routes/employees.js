'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const {
  getAllEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  terminateEmployee,
} = require('../controllers/employeeController');

const employeeValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('fatherName').notEmpty().withMessage('Father name is required'),
  body('addressLine1').notEmpty().withMessage('Address line 1 is required'),
  body('pincode').notEmpty().withMessage('Pincode is required'),
  body('siteName').notEmpty().withMessage('Site name is required'),
  body('dob').notEmpty().withMessage('DOB is required').isISO8601().toDate(),
  body('dateOfJoining').notEmpty().withMessage('Date of joining is required').isISO8601().toDate(),
  body('aadharNo').notEmpty().withMessage('Aadhar number is required'),
  body('uanNo').notEmpty().withMessage('UAN number is required'),
  body('esicNo').notEmpty().withMessage('ESIC number is required'),
  body('bankAccountNumber').notEmpty().withMessage('Bank account number is required'),
  body('ifscCode').notEmpty().withMessage('IFSC code is required'),
  body('bankAddress').notEmpty().withMessage('Bank address is required'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('designation').notEmpty().withMessage('Designation is required'),
  body('gradeOfWork').notEmpty().withMessage('Grade of work is required'),
  body('dailyWagesRate').notEmpty().withMessage('Daily wages rate is required').isNumeric(),
];

const updateValidation = [
  body('dob').optional().isISO8601().toDate(),
  body('dateOfJoining').optional().isISO8601().toDate(),
  body('dailyWagesRate').optional().isNumeric(),
];

router.use(protect, authorize('admin', 'supervisor'));

router.get('/', getAllEmployees);
router.get('/:id', getEmployee);
router.post('/', employeeValidation, createEmployee);
router.patch('/:id', updateValidation, updateEmployee);
router.patch('/:id/terminate', terminateEmployee);
router.delete('/:id', deleteEmployee);

module.exports = router;
