'use strict';
const router = require('express').Router();
const upload = require('../middleware/multerUpload');
const { generateMusterRoll } = require('../controllers/musterController');

router.post('/generate', upload.single('file'), generateMusterRoll);

module.exports = router;
