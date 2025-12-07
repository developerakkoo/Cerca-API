const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/**
 * @schema   Referral
 * @purpose  Track user referrals and rewards
 */
const referralSchema = new Schema({
  // Referrer (person who referred)
  referrer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // Referee (person who was referred)
  referee: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  
  // Referral code used
  referralCode: {
    type: String,
    required: true,
    index: true,
  },
  
  // Status
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'REWARDED', 'CANCELLED'],
    default: 'PENDING',
  },
  
  // Referral date
  referredAt: {
    type: Date,
    default: Date.now,
  },
  
  // When referee completed first ride
  firstRideCompletedAt: {
    type: Date,
    default: null,
  },
  
  // When reward was given
  rewardedAt: {
    type: Date,
    default: null,
  },
  
  // Reward details
  reward: {
    referrerReward: {
      type: Number,
      default: 0,
    },
    refereeReward: {
      type: Number,
      default: 0,
    },
    rewardType: {
      type: String,
      enum: ['WALLET_CREDIT', 'DISCOUNT_COUPON', 'BOTH'],
      default: 'WALLET_CREDIT',
    },
    couponCode: {
      type: String,
      default: null,
    },
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
referralSchema.index({ referrer: 1, status: 1 });
referralSchema.index({ referee: 1 });
referralSchema.index({ referralCode: 1 });
referralSchema.index({ status: 1 });

module.exports = model('Referral', referralSchema);

