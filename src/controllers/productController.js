'use strict';
const Product = require('../models/Product');
const { validationResult } = require('express-validator');
const { destroyCloudinaryAsset } = require('../config/cloudinary');

const DEFAULT_GST_RATE = 18;
const withDefaultGstRate = (product) => ({
  ...product,
  gstRate: product.gstRate ?? DEFAULT_GST_RATE,
});

const cleanupCloudinaryAsset = async (publicId) => {
  try {
    await destroyCloudinaryAsset(publicId);
  } catch (err) {
    // Product image removal should remain saved even if remote cleanup retries are needed later.
  }
};

const cleanupUploadedImages = async (images = []) => {
  await Promise.allSettled(images.map((image) => destroyCloudinaryAsset(image.public_id)));
};

const getUploadedImages = (req) => (req.files || []).map((file) => ({
  url: file.cloudinary.secure_url,
  alt: file.originalname,
  public_id: file.cloudinary.public_id,
}));

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
};

const buildProductData = (body, uploadedImages = []) => {
  const data = { ...body };

  if (Object.prototype.hasOwnProperty.call(data, 'images')) {
    data.images = parseJsonField(data.images, []);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'specifications')) {
    data.specifications = parseJsonField(data.specifications, []);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'tags')) {
    data.tags = Array.isArray(data.tags)
      ? data.tags
      : parseJsonField(data.tags, String(data.tags).split(',').map((tag) => tag.trim()).filter(Boolean));
  }

  if (uploadedImages.length) {
    const existingImages = Array.isArray(data.images) ? data.images : [];
    data.images = [...existingImages, ...uploadedImages];
  }

  return data;
};

// @GET /api/products
exports.getProducts = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 12, category, subcategory,
      search, sort = '-createdAt', featured,
    } = req.query;

    const query = { isActive: true };

    if (category && category !== 'All') query.category = category;
    if (subcategory && subcategory !== 'All') query.subcategory = subcategory;
    if (featured === 'true') query.isFeatured = true;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $elemMatch: { $regex: search, $options: 'i' } } },
        { brand: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [total, products] = await Promise.all([
      Product.countDocuments(query),
      Product.find(query).sort(sort).skip(skip).limit(parseInt(limit)).lean(),
    ]);

    res.json({
      success: true,
      total,
      pages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      products: products.map(withDefaultGstRate),
    });
  } catch (err) { next(err); }
};

// @GET /api/products/:id
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isActive: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product: withDefaultGstRate(product.toObject()) });
  } catch (err) { next(err); }
};

// @POST /api/products (admin)
exports.createProduct = async (req, res, next) => {
  const uploadedImages = getUploadedImages(req);
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await cleanupUploadedImages(uploadedImages);
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const product = await Product.create({ ...buildProductData(req.body, uploadedImages), createdBy: req.user.id });
    res.status(201).json({ success: true, product });
  } catch (err) {
    await cleanupUploadedImages(uploadedImages);
    next(err);
  }
};

// @PUT /api/products/:id (admin)
exports.updateProduct = async (req, res, next) => {
  const uploadedImages = getUploadedImages(req);
  try {
    const data = buildProductData(req.body, uploadedImages);
    const product = await Product.findByIdAndUpdate(
      req.params.id, data, { new: true, runValidators: true }
    );
    if (!product) {
      await cleanupUploadedImages(uploadedImages);
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, product });
  } catch (err) {
    await cleanupUploadedImages(uploadedImages);
    next(err);
  }
};

// @DELETE /api/products/:id (admin)
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { next(err); }
};

// @GET /api/products/meta/categories
exports.getCategories = async (req, res, next) => {
  try {
    const { CATEGORIES, SUBCATEGORIES } = require('../models/Product');
    const categoryCounts = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const subcategoryCounts = await Product.aggregate([
      { $match: { isActive: true, subcategory: { $exists: true, $ne: null } } },
      { $group: { _id: '$subcategory', count: { $sum: 1 } } },
    ]);
    res.json({
      success: true,
      categories: CATEGORIES,
      subcategories: SUBCATEGORIES,
      categoryCounts,
      subcategoryCounts,
    });
  } catch (err) { next(err); }
};

// @POST /api/products/:id/images (admin) — add images to existing product
exports.addImages = async (req, res, next) => {
  const uploadedImages = getUploadedImages(req);
  try {
    const images = uploadedImages.length ? uploadedImages : parseJsonField(req.body.images, []);
    if (!images?.length) return res.status(400).json({ success: false, message: 'No images provided' });
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $push: { images: { $each: images } } },
      { new: true }
    );
    if (!product) {
      await cleanupUploadedImages(uploadedImages);
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, product });
  } catch (err) {
    await cleanupUploadedImages(uploadedImages);
    next(err);
  }
};

// @DELETE /api/products/:id/images/:imgIndex (admin) — remove one image
exports.removeImage = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    const idx = parseInt(req.params.imgIndex);
    if (idx < 0 || idx >= product.images.length) {
      return res.status(400).json({ success: false, message: 'Invalid image index' });
    }
    const [removedImage] = product.images.splice(idx, 1);
    await product.save();
    await cleanupCloudinaryAsset(removedImage?.public_id);
    res.json({ success: true, product });
  } catch (err) { next(err); }
};
