const express = require('express');
const router = express.Router();
const {
  addCoupon,
  getAllCoupons,
  getCouponById,
  getCouponByCode,
  validateCoupon,
  applyCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponStatistics,
} = require('../Controllers/Coupons/coupon.controller');

// Admin routes
router.post('/', addCoupon); // Add a new coupon
router.get('/', getAllCoupons); // Get all coupons
router.get('/code/:code', getCouponByCode); // Get coupon by code
router.get('/:id', getCouponById); // Get a single coupon by ID
router.get('/:id/statistics', getCouponStatistics); // Get coupon statistics
router.put('/:id', updateCoupon); // Update a coupon by ID
router.delete('/:id', deleteCoupon); // Delete a coupon by ID

// User routes
router.post('/validate', validateCoupon); // Validate coupon before applying
router.post('/apply', applyCoupon); // Apply coupon to ride

module.exports = router;
