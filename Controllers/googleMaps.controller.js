const https = require('https');
const { URL } = require('url');
const logger = require('../utils/logger');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyDQq0QpnwQKzDR99ObP1frWj_uRTQ54pbo';
const AUTocomplete_API_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const PLACE_DETAILS_API_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

/**
 * Helper function to make HTTPS GET requests
 */
const httpsGet = (url) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    };

    const req = https.get(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
};

/**
 * Get place predictions (autocomplete)
 * GET /api/google-maps/places/autocomplete?query=...&lat=...&lng=...&radius=...
 */
const getPlacePredictions = async (req, res) => {
  try {
    const { query, lat, lng, radius = 10000 } = req.query; // Reduced from 50000 to 10000 (10km)

    // Validate required parameters
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter is required',
        error: 'VALIDATION_ERROR'
      });
    }

    // Build Google Places API URL
    let url = `${AUTocomplete_API_URL}?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
    
    // Add component restrictions to limit results to India only
    url += '&components=country:in';
    
    // Add location bias if provided
    if (lat && lng) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid latitude or longitude values',
          error: 'VALIDATION_ERROR'
        });
      }
      
      // Use stricter radius - max 10km, ensure it doesn't exceed 10km
      const searchRadius = Math.min(parseInt(radius) || 10000, 10000); // Max 10km
      url += `&location=${latitude},${longitude}&radius=${searchRadius}`;
    }
    
    // Request geocode types for addresses
    url += '&types=geocode';

    logger.info(`Fetching place predictions for query: ${query}`);

    // Call Google Places API
    const data = await httpsGet(url);

    // Handle Google API errors
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      logger.error(`Google Places API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
      return res.status(500).json({
        success: false,
        message: `Google Places API error: ${data.status}`,
        error: data.error_message || 'GOOGLE_API_ERROR',
        data: {
          predictions: []
        }
      });
    }

    // Return predictions
    const predictions = data.predictions || [];
    
    logger.info(`Found ${predictions.length} place predictions for query: ${query}`);

    res.status(200).json({
      success: true,
      data: {
        predictions: predictions
      }
    });

  } catch (error) {
    logger.error('Error fetching place predictions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch place predictions',
      error: error.message || 'INTERNAL_SERVER_ERROR',
      data: {
        predictions: []
      }
    });
  }
};

/**
 * Get place details by place_id
 * GET /api/google-maps/places/details?place_id=...
 */
const getPlaceDetails = async (req, res) => {
  try {
    const { place_id } = req.query;

    // Validate required parameters
    if (!place_id || place_id.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'place_id parameter is required',
        error: 'VALIDATION_ERROR'
      });
    }

    // Build Google Places Details API URL
    const url = `${PLACE_DETAILS_API_URL}?place_id=${encodeURIComponent(place_id)}&key=${GOOGLE_MAPS_API_KEY}&fields=place_id,formatted_address,name,geometry`;

    logger.info(`Fetching place details for place_id: ${place_id}`);

    // Call Google Places API
    const data = await httpsGet(url);

    // Handle Google API errors
    if (data.status !== 'OK') {
      logger.error(`Google Places Details API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
      return res.status(500).json({
        success: false,
        message: `Google Places Details API error: ${data.status}`,
        error: data.error_message || 'GOOGLE_API_ERROR',
        data: null
      });
    }

    // Return place details
    const placeDetails = data.result || null;
    
    logger.info(`Successfully fetched place details for place_id: ${place_id}`);

    res.status(200).json({
      success: true,
      data: placeDetails
    });

  } catch (error) {
    logger.error('Error fetching place details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch place details',
      error: error.message || 'INTERNAL_SERVER_ERROR',
      data: null
    });
  }
};

module.exports = {
  getPlacePredictions,
  getPlaceDetails
};

