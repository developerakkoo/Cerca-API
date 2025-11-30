const mongoose = require('mongoose');

const adminEarningsSchema = new mongoose.Schema({
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true,
        unique: true,
        index: true,
    },
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        required: true,
    },
    riderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    grossFare: {
        type: Number,
        required: true,
        min: 0,
    },
    platformFee: {
        type: Number,
        required: true,
        min: 0,
    },
    driverEarning: {
        type: Number,
        required: true,
        min: 0,
    },
    rideDate: {
        type: Date,
        required: true,
        index: true,
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending',
    },
}, {
    timestamps: true,
});

// Compound index for driver analytics queries
adminEarningsSchema.index({ driverId: 1, rideDate: -1 });

// Index for date range queries
adminEarningsSchema.index({ rideDate: -1 });

module.exports = mongoose.model('AdminEarnings', adminEarningsSchema);

