const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/**
 * @schema   OfferSubmission
 * @purpose  Store phone number submissions from landing page and generate unique discount codes
 *           Ensures one discount code per phone number (single number = single code)
 */
const offerSubmissionSchema = new Schema(
  {
    // Phone number information
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      index: true,
    },
    
    countryCode: {
      type: String,
      required: [true, 'Country code is required'],
      trim: true,
    },
    
    // Phone digits only (for duplicate checking and fast lookup)
    phoneDigits: {
      type: String,
      required: true,
      index: true,
    },
    
    // Discount code (unique)
    discountCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    
    // Source of submission
    source: {
      type: String,
      default: 'landing-page',
      enum: ['landing-page', 'admin', 'api'],
    },
    
    // Analytics fields (optional)
    ipAddress: {
      type: String,
      default: null,
    },
    
    userAgent: {
      type: String,
      default: null,
    },
    
    // Status tracking
    status: {
      type: String,
      enum: ['pending', 'claimed', 'used'],
      default: 'pending',
    },
    
    // Timestamps
    claimedAt: {
      type: Date,
      default: Date.now,
    },
    
    usedAt: {
      type: Date,
      default: null,
    },
    
    expiresAt: {
      type: Date,
      required: true,
      default: function() {
        // Default expiry: 90 days from creation
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90);
        return expiryDate;
      },
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
offerSubmissionSchema.index({ phoneNumber: 1 }, { unique: true });
offerSubmissionSchema.index({ discountCode: 1 }, { unique: true });
offerSubmissionSchema.index({ phoneDigits: 1 });
offerSubmissionSchema.index({ status: 1, expiresAt: 1 });
offerSubmissionSchema.index({ createdAt: -1 });

// Virtual for checking if code is expired
offerSubmissionSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for checking if code is valid (not expired and not used)
offerSubmissionSchema.virtual('isValid').get(function() {
  return !this.isExpired && this.status !== 'used';
});

// Method to mark code as used
offerSubmissionSchema.methods.markAsUsed = function() {
  this.status = 'used';
  this.usedAt = new Date();
  return this.save();
};

const OfferSubmission = model('OfferSubmission', offerSubmissionSchema);

module.exports = OfferSubmission;

