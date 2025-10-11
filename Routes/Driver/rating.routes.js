const express = require('express');
const {
    submitRating,
    getRatingsForEntity,
    getRatingByRide,
    getRatingStats,
    deleteRating,
} = require('../../Controllers/Driver/rating.controller.js');

const router = express.Router();

// Submit a rating
router.post('/', submitRating);

// Get ratings for a specific entity (Driver or User)
// GET /ratings/Driver/DRIVER_ID or /ratings/User/USER_ID
router.get('/:entityModel/:entityId', getRatingsForEntity);

// Get rating stats for an entity
// GET /ratings/Driver/DRIVER_ID/stats
router.get('/:entityModel/:entityId/stats', getRatingStats);

// Get rating for a specific ride
router.get('/ride/:rideId', getRatingByRide);

// Delete a rating (admin only)
router.delete('/:id', deleteRating);

module.exports = router;

