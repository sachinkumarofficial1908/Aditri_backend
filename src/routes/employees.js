'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const photoUpload = require('../middleware/photoUpload');
const {
  getAllEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  terminateEmployee,
} = require('../controllers/employeeController');

const employeeValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('fatherName').trim().notEmpty().withMessage('Father name is required'),
  body('addressLine1').trim().notEmpty().withMessage('Address line 1 is required'),
  body('pincode')
    .trim()
    .notEmpty()
    .withMessage('Pincode is required')
    .matches(/^\d{6}$/)
    .withMessage('Pincode must be exactly 6 digits'),
  body('siteName').trim().notEmpty().withMessage('Site name is required'),
  body('dob').notEmpty().withMessage('DOB is required').isISO8601().withMessage('Invalid date format').custom((value) => {
    const date = new Date(value);
    if (isNaN(date.getTime())) throw new Error('Invalid date');
    return true;
  }),
  body('dateOfJoining')
    .notEmpty()
    .withMessage('Date of joining is required')
    .isISO8601()
    .withMessage('Invalid date format')
    .custom((value) => {
      const date = new Date(value);
      if (isNaN(date.getTime())) throw new Error('Invalid date');
      return true;
    }),
  body('aadharNo')
    .trim()
    .notEmpty()
    .withMessage('Aadhar number is required')
    .matches(/^\d{12}$/)
    .withMessage('Aadhar number must be exactly 12 digits'),
  body('uanNo')
    .trim()
    .notEmpty()
    .withMessage('UAN number is required')
    .matches(/^\d{10}$/)
    .withMessage('UAN must be exactly 10 digits'),
  body('esicNo')
    .trim()
    .notEmpty()
    .withMessage('ESIC number is required')
    .matches(/^\d{1,17}$/)
    .withMessage('ESIC number must not exceed 17 digits'),
  body('bankAccountNumber')
    .trim()
    .notEmpty()
    .withMessage('Bank account number is required')
    .matches(/^\d{1,30}$/)
    .withMessage('Bank account number must not exceed 30 digits'),
  body('ifscCode')
    .trim()
    .notEmpty()
    .withMessage('IFSC code is required')
    .matches(/^[A-Z0-9]{1,16}$/)
    .withMessage('IFSC code must not exceed 16 characters'),
  body('bankAddress').trim().notEmpty().withMessage('Bank address is required'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(/^\d{10}$/)
    .withMessage('Phone number must be exactly 10 digits'),
  body('designation').trim().notEmpty().withMessage('Designation is required'),
  body('gradeOfWork')
    .trim()
    .notEmpty()
    .withMessage('Grade of work is required')
    .isIn(['Skilled', 'Semi-skilled', 'Unskilled'])
    .withMessage('Grade of work must be Skilled, Semi-skilled, or Unskilled'),
  body('dailyWagesRate')
    .notEmpty()
    .withMessage('Daily wages rate is required')
    .isFloat({ min: 0 })
    .withMessage('Daily wages rate must be a positive number'),
  body('clmsId')
    .trim()
    .notEmpty()
    .withMessage('CLMS ID is required')
    .matches(/^[A-Z0-9]+$/i)
    .withMessage('CLMS ID must contain only letters and numbers'),
  body('panNo')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[A-Z0-9]{10}$/)
    .withMessage('PAN number must be exactly 10 characters'),
  body('govDailyWage')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Government daily wage must be a positive number'),
];

const updateValidation = [
  body('dob').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid date format').custom((value) => {
    const date = new Date(value);
    if (isNaN(date.getTime())) throw new Error('Invalid date');
    return true;
  }),
  body('dateOfJoining')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Invalid date format')
    .custom((value) => {
      const date = new Date(value);
      if (isNaN(date.getTime())) throw new Error('Invalid date');
      return true;
    }),
  body('dailyWagesRate')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Daily wages rate must be a positive number'),
  body('govDailyWage')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Government daily wage must be a positive number'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{10}$/)
    .withMessage('Phone number must be exactly 10 digits'),
  body('pincode')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('Pincode must be exactly 6 digits'),
  body('aadharNo')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{12}$/)
    .withMessage('Aadhar number must be exactly 12 digits'),
  body('panNo')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[A-Z0-9]{10}$/)
    .withMessage('PAN number must be exactly 10 characters'),
  body('gradeOfWork')
    .optional({ checkFalsy: true })
    .isIn(['Skilled', 'Semi-skilled', 'Unskilled'])
    .withMessage('Grade of work must be Skilled, Semi-skilled, or Unskilled'),
  body('status')
    .optional({ checkFalsy: true })
    .isIn(['Valid', 'Terminate', 'Debarred'])
    .withMessage('Status must be Valid, Terminate, or Debarred'),
];

router.use(protect, authorize('admin', 'supervisor'));

router.get('/', getAllEmployees);
router.get('/:id', getEmployee);
router.post('/', photoUpload.single('photo'), employeeValidation, createEmployee);
router.patch('/:id', photoUpload.single('photo'), updateValidation, updateEmployee);
router.patch('/:id/terminate', terminateEmployee);
router.delete('/:id', deleteEmployee);

module.exports = router;
