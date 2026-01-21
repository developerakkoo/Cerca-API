const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/**
 * @schema   CouponUsage
 * @purpose  Track coupon usage per user
 */
const couponUsageSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rideId: {
    type: Schema.Types.ObjectId,
    ref: 'Ride',
    default: null,
  },
  usedAt: {
    type: Date,
    default: Date.now,
  },
  discountAmount: {
    type: Number,
    required: true,
  },
  originalFare: {
    type: Number,
    required: true,
  },
  finalFare: {
    type: Number,
    required: true,
  },
}, { _id: false });

/**
 * @schema   Coupon
 * @purpose  Promo code/coupon management with usage tracking
 */
const CouponSchema = new Schema({
  couponCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true,
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
  
  // Discount value
  discountValue: {
    type: Number,
    required: true,
    min: 0,
  },
  
  // For percentage: max discount cap
  maxDiscountAmount: {
    type: Number,
    default: null, // null means no limit
  },
  
  // Minimum order/ride amount to apply coupon
  minOrderAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  
  // Validity dates
  startDate: {
    type: Date,
    required: true,
  },
  
  validUntil: {
    type: Date,
    required: true,
  },
  
  // Usage limits
  maxUsage: {
    type: Number,
    default: null, // null means unlimited
  },
  
  maxUsagePerUser: {
    type: Number,
    default: 1, // Default: 1 use per user
  },
  
  // Current usage count
  usageCount: {
    type: Number,
    default: 0,
  },
  
  // Track which users have used this coupon
  usedBy: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    usageCount: {
      type: Number,
      default: 1,
    },
    firstUsedAt: {
      type: Date,
      default: Date.now,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  
  // Usage history
  usageHistory: [couponUsageSchema],
  
  // Status
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Applicable services (null means all services)
  applicableServices: [{
    type: String,
  }],
  
  // Applicable ride types
  applicableRideTypes: [{
    type: String,
    enum: ['normal', 'whole_day', 'custom'],
  }],
  
  // Created by admin
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },

  // Gift-related fields
  isGift: {
    type: Boolean,
    default: false,
  },

  giftType: {
    type: String,
    enum: ['MANUAL', 'AUTO_NEW_USER', 'AUTO_FIRST_RIDE', 'AUTO_LOYALTY', 'AUTO_BIRTHDAY'],
    default: 'MANUAL',
  },

  autoAssignConditions: {
    // For AUTO_LOYALTY: minimum ride count
    minRideCount: {
      type: Number,
      default: null,
    },
    // For AUTO_BIRTHDAY: birthday date check
    birthdayCheck: {
      type: Boolean,
      default: false,
    },
    // Additional conditions can be added here
  },

  giftImage: {
    type: String,
    default: 'assets/gift-box.png',
  },

  giftTitle: {
    type: String,
    default: null,
  },

  giftDescription: {
    type: String,
    default: null,
  },

  priority: {
    type: Number,
    default: 0, // Higher priority shows first
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
CouponSchema.index({ couponCode: 1, isActive: 1 });
CouponSchema.index({ validUntil: 1, isActive: 1 });
CouponSchema.index({ 'usedBy.userId': 1 });

// Virtual: Check if coupon is expired
CouponSchema.virtual('isExpired').get(function() {
  const now = new Date();
  return now > this.validUntil || now < this.startDate;
});

// Virtual: Check if coupon usage limit reached
CouponSchema.virtual('isUsageLimitReached').get(function() {
  if (this.maxUsage === null) return false;
  return this.usageCount >= this.maxUsage;
});

// Method: Check if user can use this coupon
CouponSchema.methods.canUserUse = function(userId) {
  // Check if coupon is active
  if (!this.isActive) {
    return { canUse: false, reason: 'Coupon is not active' };
  }
  
  // Check if expired
  if (this.isExpired) {
    return { canUse: false, reason: 'Coupon has expired' };
  }
  
  // Check if usage limit reached
  if (this.isUsageLimitReached) {
    return { canUse: false, reason: 'Coupon usage limit reached' };
  }
  
  // Check per-user usage limit
  const userUsage = this.usedBy.find(u => u.userId.toString() === userId.toString());
  if (userUsage && userUsage.usageCount >= this.maxUsagePerUser) {
    return { canUse: false, reason: 'You have reached the usage limit for this coupon' };
  }
  
  return { canUse: true };
};

// Method: Calculate discount amount
CouponSchema.methods.calculateDiscount = function(rideFare) {
  if (rideFare < this.minOrderAmount) {
    return { 
      discount: 0, 
      reason: `Minimum order amount of ₹${this.minOrderAmount} required` 
    };
  }
  
  let discount = 0;
  
  if (this.type === 'fixed') {
    discount = Math.min(this.discountValue, rideFare);
  } else if (this.type === 'percentage') {
    discount = (rideFare * this.discountValue) / 100;
    if (this.maxDiscountAmount) {
      discount = Math.min(discount, this.maxDiscountAmount);
    }
    discount = Math.min(discount, rideFare); // Can't discount more than fare
  } else if (this.type === 'new_user') {
    discount = Math.min(this.discountValue, rideFare);
  }
  
  // Round to 2 decimal places
  discount = Math.round(discount * 100) / 100;
  
  return { discount, finalFare: Math.max(0, rideFare - discount) };
};

// Method: Record usage
CouponSchema.methods.recordUsage = async function(userId, rideId, discountAmount, originalFare, finalFare) {
  // Update usage count
  this.usageCount += 1;
  
  // Update or add user usage
  const userUsageIndex = this.usedBy.findIndex(u => u.userId.toString() === userId.toString());
  if (userUsageIndex >= 0) {
    this.usedBy[userUsageIndex].usageCount += 1;
    this.usedBy[userUsageIndex].lastUsedAt = new Date();
  } else {
    this.usedBy.push({
      userId,
      usageCount: 1,
      firstUsedAt: new Date(),
      lastUsedAt: new Date(),
    });
  }
  
  // Add to usage history
  this.usageHistory.push({
    userId,
    rideId,
    usedAt: new Date(),
    discountAmount,
    originalFare,
    finalFare,
  });
  
  await this.save();
};

module.exports = model('Coupon', CouponSchema);
