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
    socketId:{
        type:String,
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
    isBusy: {
        type: Boolean,
        default: false,
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
    },
    totalRatings: {
        type: Number,
        default: 0,
    },
    totalEarnings: {
        type: Number,
        default: 0,
    },
    bankAccount: {
        accountNumber: String,
        ifscCode: String,
        accountHolderName: String,
        bankName: String,
        accountType: {
            type: String,
            enum: ['SAVINGS', 'CURRENT'],
            default: 'SAVINGS',
        },
    },
    vehicleInfo: {
        make: String,
        model: String,
        year: Number,
        color: String,
        licensePlate: String,
        vehicleType: {
            type: String,
            enum: ['sedan', 'suv', 'hatchback', 'auto'],
            default: 'sedan',
        },
    },
    isOnline: {
        type: Boolean,
        default: false,
    },
    lastSeen: Date,
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
// Add 2dsphere index for geospatial queries
driverSchema.index({ location: '2dsphere' });
const Driver = mongoose.model('Driver', driverSchema);

module.exports = Driver;