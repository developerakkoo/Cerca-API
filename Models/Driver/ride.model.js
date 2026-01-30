const mongoose = require('mongoose');
const { randomInt } = require('crypto');

// cryptographically-strong 4-digit OTP
const genOtp = () => String(randomInt(1000, 10000));

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

    pickupAddress: {
        type: String
    },
    dropoffAddress: {
        type: String
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

    driverSocketId: { type: String },
    userSocketId: { type: String },

    dropoffLocation: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point',
        },
        coordinates: {
            type: [Number],
            required: true,
        },
    },

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

    // 🔹 Existing (kept as-is)
    rideType: {
        type: String,
        enum: ['normal', 'whole_day', 'custom'],
        default: 'normal',
    },

    // ✅ NEW — booking behavior (NO breaking change)
    bookingType: {
        type: String,
        enum: ['INSTANT', 'FULL_DAY', 'RENTAL', 'DATE_WISE'],
        default: 'INSTANT',
    },

    // ✅ NEW — flexible booking data
    bookingMeta: {
        startTime: Date,      // full-day / rental
        endTime: Date,        // full-day / rental
        days: Number,         // rental (7, 15, etc.)
        dates: [Date],        // date-wise booking
    },

    cancelledBy: {
        type: String,
        enum: ['rider', 'driver', 'system'],
        default: null,
    },

    // 🔹 Existing custom schedule (kept for backward compatibility)
    customSchedule: {
        startDate: Date,
        endDate: Date,
        startTime: String,
        endTime: String,
    },

    startOtp: {
        type: String,
        default: genOtp,
    },

    stopOtp: {
        type: String,
        default: genOtp,
    },

    paymentMethod: {
        type: String,
        enum: ['CASH', 'RAZORPAY', 'WALLET'],
        default: 'CASH',
    },

    actualStartTime: Date,
    actualEndTime: Date,
    estimatedDuration: Number,
    actualDuration: Number,
    estimatedArrivalTime: Date,
    driverArrivedAt: Date,

    // Fare breakdown for transparency
    fareBreakdown: {
        baseFare: Number,
        distanceFare: Number,
        timeFare: Number,
        subtotal: Number,
        fareAfterMinimum: Number,
        discount: Number,
        finalFare: Number
    },

    riderRating: {
        type: Number,
        min: 1,
        max: 5,
    },

    driverRating: {
        type: Number,
        min: 1,
        max: 5,
    },

    tips: {
        type: Number,
        default: 0,
    },

    discount: {
        type: Number,
        default: 0,
    },

    promoCode: {
        type: String,
    },

    cancellationReason: {
        type: String,
        maxlength: 500,
    },

    cancellationFee: {
        type: Number,
        default: 0,
    },

    refundAmount: {
        type: Number,
        default: 0,
    },

    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded', 'partial'],
        default: 'pending',
    },

    transactionId: String,

    razorpayPaymentId: {
        type: String,
        default: null,
    },

    walletAmountUsed: {
        type: Number,
        default: 0,
        min: 0,
    },

    razorpayAmountPaid: {
        type: Number,
        default: 0,
        min: 0,
    },

    rejectedDrivers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver'
    }],

    notifiedDrivers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver'
    }],

}, {
    timestamps: true
});

// Indexes
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ pickupLocation: '2dsphere' });
rideSchema.index({ dropoffLocation: '2dsphere' });

// Keep updatedAt synced
rideSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const Ride = mongoose.model('Ride', rideSchema);

module.exports = Ride;
