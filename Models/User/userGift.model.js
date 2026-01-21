const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/**
 * @schema   UserGift
 * @purpose  Track which gifts/promo codes are assigned to which users
 */
const userGiftSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  couponId: {
    type: Schema.Types.ObjectId,
    ref: 'Coupon',
    required: true,
    index: true,
  },
  
  assignedAt: {
    type: Date,
    default: Date.now,
  },
  
  assignedBy: {
    type: String,
    enum: ['AUTO', 'ADMIN'],
    default: 'AUTO',
  },
  
  assignedByAdmin: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  
  isUsed: {
    type: Boolean,
    default: false,
  },
  
  usedAt: {
    type: Date,
    default: null,
  },
  
  usedInRideId: {
    type: Schema.Types.ObjectId,
    ref: 'Ride',
    default: null,
  },
  
  // Metadata
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
userGiftSchema.index({ userId: 1, isUsed: 1 });
userGiftSchema.index({ couponId: 1, userId: 1 });
userGiftSchema.index({ userId: 1, couponId: 1 }, { unique: true }); // Prevent duplicate assignments

// Virtual: Check if gift is expired (based on coupon validUntil)
userGiftSchema.virtual('isExpired').get(function() {
  // This will be populated when querying with coupon details
  if (this.populated('couponId') && this.couponId.validUntil) {
    return new Date() > this.couponId.validUntil;
  }
  return false;
});

module.exports = model('UserGift', userGiftSchema);

