const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
    rider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: false,
    },
    pickupLocation: {
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
    dropoffLocation: {
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
    //First 1.5 km is 37rs
    // After that, 25  * per km rate
    // Total Fare = Base Fare + (Distance Traveled × Per-Km Rate) + (Ride Duration × Per-Minute Rate) + Surge Pricing + Booking Fee + Taxes + Tolls - Discountsd
    fare: {
        type: Number,
        required: false,
    },
    distanceInKm: {
        type: Number,
        required: false,
    },
    status: {
        type: String,
        enum: ['requested', 'accepted', 'in_progress', 'completed', 'cancelled'],
        default: 'requested',
    },
    rideType: {
        type: String,
        enum: ['normal', 'whole_day', 'custom'],
        default: 'normal',
    },
    customSchedule: {
        startDate: {
            type: Date,
        },
        endDate: {
            type: Date,
        },
        startTime: {
            type: String, // e.g., "08:00 AM"
        },
        endTime: {
            type: String, // e.g., "06:00 PM"
        },
    },
    startOtp: {
        type: String,
        required: false, // OTP for starting the ride
    },
    stopOtp: {
        type: String,
        required: false, // OTP for stopping the ride
    },
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
rideSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const Ride = mongoose.model('Ride', rideSchema);

module.exports = Ride;