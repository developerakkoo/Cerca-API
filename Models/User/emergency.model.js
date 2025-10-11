const mongoose = require('mongoose');

const emergencySchema = new mongoose.Schema({
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true,
    },
    triggeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'triggeredByModel',
        required: true,
    },
    triggeredByModel: {
        type: String,
        required: true,
        enum: ['User', 'Driver'],
    },
    location: {
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
    reason: {
        type: String,
        enum: ['accident', 'harassment', 'unsafe_driving', 'medical', 'other'],
        required: true,
    },
    description: {
        type: String,
        maxlength: 500,
    },
    status: {
        type: String,
        enum: ['active', 'resolved', 'dismissed'],
        default: 'active',
    },
    resolvedAt: Date,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

emergencySchema.index({ status: 1, createdAt: -1 });
emergencySchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Emergency', emergencySchema);

