const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/**
 * @schema   Payout
 * @purpose  Track driver payout requests and history
 */
const payoutSchema = new Schema({
  driver: {
    type: Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
    index: true,
  },
  
  // Payout amount
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  
  // Bank account details (snapshot at time of request)
  bankAccount: {
    accountNumber: {
      type: String,
      required: true,
    },
    ifscCode: {
      type: String,
      required: true,
    },
    accountHolderName: {
      type: String,
      required: true,
    },
    bankName: {
      type: String,
      required: true,
    },
    accountType: {
      type: String,
      enum: ['SAVINGS', 'CURRENT'],
      default: 'SAVINGS',
    },
  },
  
  // Payout status
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'PENDING',
    index: true,
  },
  
  // Request details
  requestedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  
  // Processing details
  processedAt: {
    type: Date,
    default: null,
  },
  
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
  
  // Transaction details
  transactionId: {
    type: String,
    default: null, // Bank transaction ID
  },
  
  transactionReference: {
    type: String,
    default: null, // Internal reference ID
  },
  
  // Failure details
  failureReason: {
    type: String,
    default: null,
  },
  
  // Notes
  notes: {
    type: String,
    maxlength: 500,
  },
  
  // Related earnings (which earnings are being paid out)
  relatedEarnings: [{
    type: Schema.Types.ObjectId,
    ref: 'AdminEarnings',
  }],
  
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
payoutSchema.index({ driver: 1, status: 1, requestedAt: -1 });
payoutSchema.index({ status: 1, requestedAt: -1 });
payoutSchema.index({ transactionReference: 1 });

// Virtual: Check if payout can be cancelled
payoutSchema.virtual('canCancel').get(function() {
  return this.status === 'PENDING';
});

module.exports = model('Payout', payoutSchema);

