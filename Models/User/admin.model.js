const mongoose = require('mongoose');

const { Schema, model } = mongoose;

/**
 * @schema   Admin
 * @purpose  Represents an admin or sub-admin with hierarchical levels
 */
const adminSchema = new Schema(
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
      required: true, // hashed password
      select: false,
    },

    // Role & Hierarchy
    role: {
      type: String,
      enum: ['ADMIN', 'SUB_ADMIN'],
      default: 'SUB_ADMIN',
    },
    level: {
      type: Number,
      required: true,
      default: 1, // Level 1 by default for sub-admins
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin', // Reference to the admin who created this sub-admin
    },

    // Audit & soft-delete
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);



module.exports = model('Admin', adminSchema);