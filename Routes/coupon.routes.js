const express = require('express');
const {
    addCoupon,
    getAllCoupons,
    getCouponById,
    updateCoupon,
    deleteCoupon,
} = require('../Controllers/Coupons/coupon.controller');

const router = express.Router();

// Routes for coupon management
router.post('/', addCoupon); // Add a new coupon
router.get('/', getAllCoupons); // Get all coupons
router.get('/:id', getCouponById); // Get a single coupon by ID
router.put('/:id', updateCoupon); // Update a coupon by ID
router.delete('/:id', deleteCoupon); // Delete a coupon by ID

module.exports = router;