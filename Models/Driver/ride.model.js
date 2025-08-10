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

    pickupAddress:{
        type:String
    },
    dropoffAddress:{
        type:String
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
    driverSocketId: { type: String }, // Driver's socket ID for notifications
    userSocketId: { type: String }, // Rider's socket ID for notifications
    
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

    cancelledBy: {
        type: String,
        enum: ['rider', 'driver', 'system'],
        default: null, // Null means not cancelled
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
        default: genOtp, // Generate OTP when ride is created
    },
    stopOtp: {
        type: String,
        required: false, // OTP for stopping the ride
        default: genOtp, // Generate OTP when ride is created
    },
  
    paymentMethod: {
        type: String,
        enum: ['CASH', 'RAZORPAY', 'WALLET'],
        default: 'CASH',
    },
},{
    timestamps:true
});

// Helpful indexes (adjust to your needs)
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ 'pickupLocation': '2dsphere' });
rideSchema.index({ 'dropoffLocation': '2dsphere' });


// Update the `updatedAt` field before saving
rideSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

const Ride = mongoose.model('Ride', rideSchema);

module.exports = Ride;