const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/**
 * @schema   WalletTransaction
 * @purpose  Track all wallet transactions (credits, debits, refunds, etc.)
 */
const walletTransactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    
    // Transaction Details
    transactionType: {
      type: String,
      enum: [
        'TOP_UP',           // User added money to wallet
        'RIDE_PAYMENT',     // Payment for a ride
        'REFUND',           // Refund for cancelled ride
        'BONUS',            // Bonus/reward credited
        'REFERRAL_REWARD',  // Referral reward
        'PROMO_CREDIT',     // Promo code credit
        'WITHDRAWAL',       // Withdrawal request
        'ADMIN_ADJUSTMENT', // Admin manual adjustment
        'CANCELLATION_FEE', // Cancellation fee deduction
      ],
      required: true,
    },
    
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    
    // Balance before and after transaction
    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    
    // Related entities
    relatedRide: {
      type: Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
    
    paymentGatewayTransactionId: {
      type: String,
      default: null, // For top-up transactions via payment gateway
    },
    
    paymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'UPI', 'NETBANKING', 'WALLET', 'RAZORPAY', 'STRIPE', 'ADMIN'],
      default: null,
    },
    
    // Transaction Status
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'],
      default: 'COMPLETED',
    },
    
    // Additional Information
    description: {
      type: String,
      maxlength: 500,
    },
    
    metadata: {
      type: Schema.Types.Mixed,
      default: {}, // Store additional data like payment gateway response, etc.
    },
    
    // For withdrawal requests
    withdrawalRequest: {
      bankAccountNumber: String,
      ifscCode: String,
      accountHolderName: String,
      bankName: String,
      requestedAt: Date,
      processedAt: Date,
      processedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Admin',
      },
      rejectionReason: String,
    },
    
    // Admin who made adjustment (if applicable)
    adjustedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    
    // Timestamps
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient queries
walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ transactionType: 1, createdAt: -1 });
walletTransactionSchema.index({ status: 1, createdAt: -1 });
walletTransactionSchema.index({ relatedRide: 1 });
walletTransactionSchema.index({ paymentGatewayTransactionId: 1 });

// Virtual for transaction direction (credit/debit)
walletTransactionSchema.virtual('isCredit').get(function() {
  return ['TOP_UP', 'REFUND', 'BONUS', 'REFERRAL_REWARD', 'PROMO_CREDIT', 'ADMIN_ADJUSTMENT'].includes(this.transactionType);
});

walletTransactionSchema.virtual('isDebit').get(function() {
  return ['RIDE_PAYMENT', 'WITHDRAWAL', 'CANCELLATION_FEE'].includes(this.transactionType);
});

module.exports = model('WalletTransaction', walletTransactionSchema);

