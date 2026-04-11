'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const {
  getProducts, getProduct, createProduct, updateProduct,
  deleteProduct, getCategories, addImages, removeImage,
} = require('../controllers/productController');
const { protect, adminOnly } = require('../middleware/auth');

const productValidation = [
  body('name').trim().notEmpty().withMessage('Product name required').isLength({ max: 250 }),
  body('description').trim().notEmpty().withMessage('Description required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
  body('category').notEmpty().withMessage('Category required'),
  body('stock').isInt({ min: 0 }).withMessage('Valid stock required'),
];

router.get('/', getProducts);
router.get('/meta/categories', getCategories);
router.get('/:id', getProduct);
router.post('/', protect, adminOnly, productValidation, createProduct);
router.put('/:id', protect, adminOnly, updateProduct);
router.delete('/:id', protect, adminOnly, deleteProduct);
router.post('/:id/images', protect, adminOnly, addImages);
router.delete('/:id/images/:imgIndex', protect, adminOnly, removeImage);

module.exports = router;
