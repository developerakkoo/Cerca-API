const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true,
    },
    ratedBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'ratedByModel',
        required: true,
    },
    ratedByModel: {
        type: String,
        required: true,
        enum: ['User', 'Driver'],
    },
    ratedTo: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'ratedToModel',
        required: true,
    },
    ratedToModel: {
        type: String,
        required: true,
        enum: ['User', 'Driver'],
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
    },
    review: {
        type: String,
        trim: true,
        maxlength: 500,
    },
    tags: [{
        type: String,
        enum: ['polite', 'professional', 'clean_vehicle', 'safe_driving', 'rude', 'late', 'unsafe']
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

ratingSchema.index({ ride: 1 });
ratingSchema.index({ ratedTo: 1, ratedToModel: 1 });

module.exports = mongoose.model('Rating', ratingSchema);

