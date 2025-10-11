const Rating = require('../../Models/Driver/rating.model.js');
const Driver = require('../../Models/Driver/driver.model.js');
const User = require('../../Models/User/user.model.js');
const Ride = require('../../Models/Driver/ride.model.js');
const logger = require('../../utils/logger.js');

/**
 * @desc    Submit a rating for a ride
 * @route   POST /ratings
 */
const submitRating = async (req, res) => {
    try {
        const { rideId, ratedBy, ratedByModel, ratedTo, ratedToModel, rating, review, tags } = req.body;

        // Validate required fields
        if (!rideId || !ratedBy || !ratedByModel || !ratedTo || !ratedToModel || !rating) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Validate rating value
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        // Check if ride exists
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        // Check if rating already exists
        const existingRating = await Rating.findOne({ 
            ride: rideId, 
            ratedBy, 
            ratedByModel 
        });

        if (existingRating) {
            return res.status(400).json({ message: 'Rating already submitted for this ride' });
        }

        // Create rating
        const newRating = await Rating.create({
            ride: rideId,
            ratedBy,
            ratedByModel,
            ratedTo,
            ratedToModel,
            rating,
            review,
            tags,
        });

        // Update ride with rating
        if (ratedByModel === 'User') {
            await Ride.findByIdAndUpdate(rideId, { driverRating: rating });
        } else {
            await Ride.findByIdAndUpdate(rideId, { riderRating: rating });
        }

        // Calculate and update average rating
        await updateAverageRating(ratedTo, ratedToModel);

        logger.info(`Rating submitted: ${newRating._id}`);
        res.status(201).json({ 
            message: 'Rating submitted successfully', 
            rating: newRating 
        });
    } catch (error) {
        logger.error('Error submitting rating:', error);
        res.status(500).json({ message: 'Error submitting rating', error: error.message });
    }
};

/**
 * @desc    Get ratings for a specific entity (Driver or User)
 * @route   GET /ratings/:entityModel/:entityId
 */
const getRatingsForEntity = async (req, res) => {
    try {
        const { entityModel, entityId } = req.params;
        const { limit = 20, skip = 0 } = req.query;

        if (!['Driver', 'User'].includes(entityModel)) {
            return res.status(400).json({ message: 'Invalid entity model' });
        }

        const ratings = await Rating.find({ 
            ratedTo: entityId, 
            ratedToModel: entityModel 
        })
        .populate('ratedBy', 'name fullName')
        .populate('ride', 'pickupAddress dropoffAddress createdAt')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip));

        const totalRatings = await Rating.countDocuments({ 
            ratedTo: entityId, 
            ratedToModel: entityModel 
        });

        res.status(200).json({ 
            ratings, 
            total: totalRatings,
            count: ratings.length 
        });
    } catch (error) {
        logger.error('Error fetching ratings:', error);
        res.status(500).json({ message: 'Error fetching ratings', error: error.message });
    }
};

/**
 * @desc    Get rating for a specific ride
 * @route   GET /ratings/ride/:rideId
 */
const getRatingByRide = async (req, res) => {
    try {
        const { rideId } = req.params;

        const ratings = await Rating.find({ ride: rideId })
            .populate('ratedBy', 'name fullName')
            .populate('ratedTo', 'name fullName');

        res.status(200).json({ ratings });
    } catch (error) {
        logger.error('Error fetching ride ratings:', error);
        res.status(500).json({ message: 'Error fetching ride ratings', error: error.message });
    }
};

/**
 * @desc    Get average rating and stats for an entity
 * @route   GET /ratings/:entityModel/:entityId/stats
 */
const getRatingStats = async (req, res) => {
    try {
        const { entityModel, entityId } = req.params;

        if (!['Driver', 'User'].includes(entityModel)) {
            return res.status(400).json({ message: 'Invalid entity model' });
        }

        const ratings = await Rating.find({ 
            ratedTo: entityId, 
            ratedToModel: entityModel 
        });

        if (ratings.length === 0) {
            return res.status(200).json({
                averageRating: 0,
                totalRatings: 0,
                ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
            });
        }

        const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = (totalRating / ratings.length).toFixed(2);

        // Rating distribution
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        ratings.forEach(r => {
            distribution[r.rating]++;
        });

        res.status(200).json({
            averageRating: parseFloat(averageRating),
            totalRatings: ratings.length,
            ratingDistribution: distribution
        });
    } catch (error) {
        logger.error('Error fetching rating stats:', error);
        res.status(500).json({ message: 'Error fetching rating stats', error: error.message });
    }
};

/**
 * @desc    Delete a rating (admin only)
 * @route   DELETE /ratings/:id
 */
const deleteRating = async (req, res) => {
    try {
        const { id } = req.params;

        const rating = await Rating.findByIdAndDelete(id);

        if (!rating) {
            return res.status(404).json({ message: 'Rating not found' });
        }

        // Recalculate average rating
        await updateAverageRating(rating.ratedTo, rating.ratedToModel);

        logger.info(`Rating deleted: ${id}`);
        res.status(200).json({ message: 'Rating deleted successfully' });
    } catch (error) {
        logger.error('Error deleting rating:', error);
        res.status(500).json({ message: 'Error deleting rating', error: error.message });
    }
};

/**
 * Helper function to update average rating
 */
const updateAverageRating = async (entityId, entityModel) => {
    try {
        const ratings = await Rating.find({ 
            ratedTo: entityId, 
            ratedToModel: entityModel 
        });

        const Model = entityModel === 'Driver' ? Driver : User;
        
        if (ratings.length === 0) {
            await Model.findByIdAndUpdate(entityId, {
                rating: 0,
                totalRatings: 0,
            });
            return;
        }

        const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = (totalRating / ratings.length).toFixed(2);

        await Model.findByIdAndUpdate(entityId, {
            rating: parseFloat(averageRating),
            totalRatings: ratings.length,
        });
    } catch (error) {
        logger.error('Error updating average rating:', error);
    }
};

module.exports = {
    submitRating,
    getRatingsForEntity,
    getRatingByRide,
    getRatingStats,
    deleteRating,
};

