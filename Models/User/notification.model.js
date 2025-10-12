const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'recipientModel',
        required: true,
    },
    recipientModel: {
        type: String,
        required: true,
        enum: ['User', 'Driver'],
    },
    title: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ['ride_request', 'ride_accepted', 'ride_started', 'ride_completed', 'ride_cancelled', 'driver_arrived', 'rating_received', 'emergency', 'system'],
        required: true,
    },
    relatedRide: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    data: {
        type: mongoose.Schema.Types.Mixed, // Additional data
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

