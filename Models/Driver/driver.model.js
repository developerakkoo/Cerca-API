const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        // unique: true,
        lowercase: true,
    },
    phone: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point',
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true,
        },
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    isActive: {
        type: Boolean,
        default: false,
    },
    documents: {
        type: [String], // Array of document URLs or file paths
        required: true,
    },
    rides: [
        {
            rideId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Ride',
            },
            status: {
                type: String,
                enum: ['accepted', 'rejected', 'completed', 'cancelled'],
                default: 'pending',
            },
        },
    ],
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Update the `updatedAt` field before saving
driverSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const Driver = mongoose.model('Driver', driverSchema);

module.exports = Driver;