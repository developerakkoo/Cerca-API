const express = require('express');
const router = express.Router();
const { getPlacePredictions, getPlaceDetails } = require('../Controllers/googleMaps.controller');

/**
 * GET /api/google-maps/places/autocomplete
 * Query params: query (required), lat (optional), lng (optional), radius (optional)
 * Returns place predictions for autocomplete
 */
router.get('/places/autocomplete', getPlacePredictions);

/**
 * GET /api/google-maps/places/details
 * Query params: place_id (required)
 * Returns place details by place_id
 */
router.get('/places/details', getPlaceDetails);

module.exports = router;

