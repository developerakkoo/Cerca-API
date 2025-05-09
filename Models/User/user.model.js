// models/User.js
const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/**
 * @schema   OAuthProvider
 * @purpose  Store external OAuth providers linked to this user
 */
const oauthProviderSchema = new Schema({
  provider: {
    type: String,
    enum: ['google', 'facebook', 'apple'],
    required: true,
  },
  providerId: {
    type: String,
    required: true,
  },
}, { _id: false });

/**
 * @schema   User (Rider)
 * @purpose  Represents a customer; supports email/password & social logins
 */
const userSchema = new Schema(
  {
    // Identity & Contact
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/.+@.+\..+/, 'Please enter a valid email address'],
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: [/^\+\d{10,15}$/, 'Please enter a valid international phone number'],
    },

    // Authentication
    password: {
      type: String,
      select: false, // hashed password (only for local auth)
    },
    oauthProviders: [oauthProviderSchema], // e.g. { provider: 'google', providerId: '...' }

    isVerified: {
      type: Boolean,
      default: false,
    },

    // Profile picture filename (stored in /uploads/profilePics)
    profilePic: {
      type: String,
    },

    // Saved pickup/drop-off addresses
    addressList: [
      { type: Schema.Types.ObjectId, ref: 'Address' },
    ],

    // Ride history
    rideHistory: [
      { type: Schema.Types.ObjectId, ref: 'Ride' },
    ],

    // Wallet & payment
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    preferredPaymentMethod: {
      type: String,
      enum: ['CASH', 'CARD', 'WALLET'],
      default: 'CASH',
    },

    // Audit & soft-delete
    lastLogin: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ email: 1 }); // Define index explicitly
userSchema.index({ phoneNumber: 1 }); // Define index explicitly
userSchema.index(
  { 'oauthProviders.provider': 1, 'oauthProviders.providerId': 1 },
  { unique: true, sparse: true }
);

// Virtuals
userSchema.virtual('firstName').get(function () {
  return this.fullName.split(' ')[0];
});
userSchema.virtual('lastName').get(function () {
  const parts = this.fullName.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : '';
});

module.exports = model('User', userSchema);
