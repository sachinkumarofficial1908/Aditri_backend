'use strict';
const router = require('express').Router();
const { uploadExcel } = require('../middleware/upload');
const { validateWageFile, generateWageSlips } = require('../controllers/wageSlipController');

router.post('/validate', uploadExcel.single('file'), validateWageFile);
router.post('/generate', uploadExcel.single('file'), generateWageSlips);

module.exports = router;
