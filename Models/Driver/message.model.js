const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true,
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'senderModel',
        required: true,
    },
    senderModel: {
        type: String,
        required: true,
        enum: ['User', 'Driver'],
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'receiverModel',
        required: true,
    },
    receiverModel: {
        type: String,
        required: true,
        enum: ['User', 'Driver'],
    },
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
    },
    messageType: {
        type: String,
        enum: ['text', 'location', 'audio'],
        default: 'text',
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

messageSchema.index({ ride: 1, createdAt: 1 });
messageSchema.index({ receiver: 1, isRead: 1 });

module.exports = mongoose.model('Message', messageSchema);

