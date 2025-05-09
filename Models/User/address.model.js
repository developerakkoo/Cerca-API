// models/Address.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * @schema   Address
 * @purpose  Stores user-defined pickup/drop-off locations
 */
const addressSchema = new Schema(
  {
    // The free-form address string (e.g., "221B Baker Street, London")
    addressLine: {
      type: String,
      required: [true, 'Address line is required'],
      trim: true,
    },

    // Optional landmark to help the driver locate the spot (e.g., "next to the big mall")
    landmark: {
      type: String,
      trim: true,
      default: '',
    },

    // GeoJSON point for geospatial queries
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        // [ longitude, latitude ]
        type: [Number],
        required: [true, 'Coordinates are required'],
        validate: {
          validator: arr => arr.length === 2,
          message: 'Coordinates must be an array of [lng, lat]',
        },
      },
    },

    // Optionally store the Google Place ID for precise future lookups
    placeId: {
      type: String,
      trim: true,
      default: null,
    },

    // A human-readable formatted address returned by Google Maps
    formattedAddress: {
      type: String,
      trim: true,
      default: '',
    },

    // Reference back to the owning user
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,             // adds createdAt & updatedAt
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// 2dsphere index to support proximity queries (e.g., find nearby drivers)
addressSchema.index({ location: '2dsphere' });

// Export the model
export default model('Address', addressSchema);
