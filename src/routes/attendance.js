'use strict';
const router = require('express').Router();
const upload = require('../middleware/multerUpload');
const { validateAttendance, generateAttendance } = require('../controllers/attendanceController');

router.post('/validate', upload.single('file'), validateAttendance);
router.post('/generate', upload.single('file'), generateAttendance);

module.exports = router;
