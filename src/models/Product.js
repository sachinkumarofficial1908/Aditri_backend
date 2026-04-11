'use strict';
const mongoose = require('mongoose');

const CATEGORIES = ['Electrical', 'Cable', 'Networking', 'Safety', 'Mechanical', 'Tools', 'Civil', 'Other'];

const SUBCATEGORIES = [
  'Electrical & Electronics',
  'Cables & Connectivity',
  'Networking & Communication',
  'Safety Materials / PPE',
  'Mechanical, Piping & Industrial Tools',
  'Multimedia & Accessories',
  'Chemical & Miscellaneous',
  'Civil Supplies',
];

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 250 },
  slug: { type: String, lowercase: true },
  description: { type: String, required: true, maxlength: 3000 },
  shortDescription: { type: String, maxlength: 500 },
  price: { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, min: 0, default: 0 },
  category: { type: String, required: true, enum: CATEGORIES },
  subcategory: { type: String, enum: SUBCATEGORIES },
  stock: { type: Number, default: 0, min: 0 },
  images: [{
    url: { type: String },
    alt: { type: String },
    public_id: { type: String }, // for future cloud storage
  }],
  specifications: [{ key: String, value: String }],
  brand: { type: String, trim: true, maxlength: 100 },
  sku: { type: String, unique: true, sparse: true },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  tags: [{ type: String, lowercase: true, trim: true }],
  ratings: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 },
  },
  unit: { type: String, default: 'piece' },
  minOrderQty: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-generate slug
productSchema.pre('save', function (next) {
  if (this.isModified('name') || this.isNew) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now();
  }
  next();
});

// Virtual: inStock
productSchema.virtual('isInStock').get(function () { return this.stock > 0; });

// Virtual: discount percent
productSchema.virtual('discountPercent').get(function () {
  if (this.discountPrice && this.discountPrice > 0 && this.price > this.discountPrice) {
    return Math.round(((this.price - this.discountPrice) / this.price) * 100);
  }
  return 0;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// Indexes for fast querying
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ subcategory: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Product', productSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.SUBCATEGORIES = SUBCATEGORIES;
