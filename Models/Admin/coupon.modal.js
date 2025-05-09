const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
    couponCode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    type: {
        type: String,
        enum: ['fixed', 'percentage', 'new_user'],
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    validUntil: {
        type: Date,
        required: true,
    },
    minOrderAmount: {
        type: Number,
        required: true,
    },
    maxDiscountAmount: {
        type: Number,
        required: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('Coupon', CouponSchema);