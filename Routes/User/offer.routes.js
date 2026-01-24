const express = require('express');
const router = express.Router();
const {
  claimOffer,
  getOfferByPhone,
  validateOfferCode
} = require('../../Controllers/User/offer.controller');

/**
 * @route   POST /api/offers/claim
 * @desc    Claim a discount code for a phone number
 * @access  Public
 */
router.post('/claim', claimOffer);

/**
 * @route   GET /api/offers/phone/:phone
 * @desc    Get discount code by phone number
 * @access  Public
 * @query   countryCode (optional) - Country code for formatting
 */
router.get('/phone/:phone', getOfferByPhone);

/**
 * @route   GET /api/offers/validate/:code
 * @desc    Validate a discount code
 * @access  Public
 */
router.get('/validate/:code', validateOfferCode);

module.exports = router;

