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
  getUserGifts,
  assignGift,
} = require('../Controllers/Coupons/coupon.controller');
const { authenticateAdmin } = require('../utils/adminAuth');

// User routes (public - no authentication required)
// These must come before admin routes to avoid route conflicts
router.post('/validate', validateCoupon); // Validate coupon before applying
router.post('/apply', applyCoupon); // Apply coupon to ride
router.get('/user/:userId/gifts', getUserGifts); // Get available gifts for user
router.get('/code/:code', getCouponByCode); // Get coupon by code (public for validation)

// Admin routes (protected - require authentication)
router.use(authenticateAdmin);

// Admin CRUD routes
router.post('/', addCoupon); // Add a new coupon
router.get('/', getAllCoupons); // Get all coupons
router.get('/:id/statistics', getCouponStatistics); // Get coupon statistics (must come before /:id)
router.get('/:id', getCouponById); // Get a single coupon by ID
router.put('/:id', updateCoupon); // Update a coupon by ID
router.delete('/:id', deleteCoupon); // Delete a coupon by ID
router.post('/:couponId/assign/:userId', assignGift); // Manually assign gift to user

module.exports = router;
