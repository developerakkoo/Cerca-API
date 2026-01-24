const OfferSubmission = require('../../Models/User/offerSubmission.model');
const logger = require('../../utils/logger');

/**
 * Generate unique discount code
 * Format: CERCA{YYYY}{XXXX} where XXXX is a 4-digit random number
 */
const generateDiscountCode = async () => {
  const prefix = 'CERCA';
  const year = new Date().getFullYear();
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const code = `${prefix}${year}${random}`;
    
    // Check if code already exists
    const existing = await OfferSubmission.findOne({ discountCode: code });
    if (!existing) {
      return code;
    }
    
    attempts++;
    logger.warn(`Discount code ${code} already exists, generating new one... (attempt ${attempts})`);
  }
  
  // Fallback: use timestamp if all random attempts fail
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}${year}${timestamp}`;
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number (digits only)
 * @param {string} countryCode - Country code (e.g., "+91")
 * @returns {object} { valid: boolean, error: string }
 */
const validatePhoneNumber = (phone, countryCode) => {
  // Remove spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  
  // Extract digits only
  const digitsOnly = cleaned.replace(/\D/g, '');
  
  // Check length (10-15 digits after country code)
  const minLength = 10;
  const maxLength = 15;
  
  if (!digitsOnly || digitsOnly.length < minLength) {
    return {
      valid: false,
      error: `Phone number must be at least ${minLength} digits`
    };
  }
  
  if (digitsOnly.length > maxLength) {
    return {
      valid: false,
      error: `Phone number must be at most ${maxLength} digits`
    };
  }
  
  // Validate country code format
  if (!countryCode || !countryCode.startsWith('+')) {
    return {
      valid: false,
      error: 'Invalid country code format. Must start with +'
    };
  }
  
  return { valid: true, error: null };
};

/**
 * Format phone number with country code
 */
const formatPhoneNumber = (phone, countryCode) => {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '').replace(/\D/g, '');
  return `${countryCode} ${cleaned}`;
};

/**
 * Extract phone digits only (for duplicate checking)
 */
const extractPhoneDigits = (phone, countryCode) => {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '').replace(/\D/g, '');
  const countryDigits = countryCode.replace(/\D/g, '');
  return `${countryDigits}${cleaned}`;
};

/**
 * @desc    Claim a discount code for a phone number
 * @route   POST /api/offers/claim
 * @access  Public
 */
exports.claimOffer = async (req, res) => {
  try {
    const { phone, countryCode, source } = req.body;
    
    // Validate input
    if (!phone || !countryCode) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and country code are required',
        error: 'Missing required fields'
      });
    }
    
    // Validate phone number format
    const validation = validatePhoneNumber(phone, countryCode);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
        error: 'Invalid phone number format'
      });
    }
    
    // Format phone number
    const formattedPhone = formatPhoneNumber(phone, countryCode);
    const phoneDigits = extractPhoneDigits(phone, countryCode);
    
    // Check if phone number already has a discount code
    const existingSubmission = await OfferSubmission.findOne({
      $or: [
        { phoneNumber: formattedPhone },
        { phoneDigits: phoneDigits }
      ]
    });
    
    if (existingSubmission) {
      // Return existing code
      logger.info(`Existing discount code found for phone: ${formattedPhone}`);
      
      return res.status(200).json({
        success: true,
        message: 'You already have a discount code',
        data: {
          discountCode: existingSubmission.discountCode,
          phone: existingSubmission.phoneNumber,
          expiresAt: existingSubmission.expiresAt,
          status: existingSubmission.status,
          message: "We'll notify you when the app launches"
        }
      });
    }
    
    // Generate unique discount code
    const discountCode = await generateDiscountCode();
    
    // Calculate expiry date (90 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    
    // Get IP address and user agent (optional)
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    // Create new offer submission
    const offerSubmission = new OfferSubmission({
      phoneNumber: formattedPhone,
      countryCode: countryCode,
      phoneDigits: phoneDigits,
      discountCode: discountCode,
      source: source || 'landing-page',
      ipAddress: ipAddress,
      userAgent: userAgent,
      status: 'claimed',
      claimedAt: new Date(),
      expiresAt: expiresAt,
    });
    
    await offerSubmission.save();
    
    logger.info(`New discount code generated: ${discountCode} for phone: ${formattedPhone}`);
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'Discount code generated successfully',
      data: {
        discountCode: discountCode,
        phone: formattedPhone,
        expiresAt: expiresAt,
        message: "We'll notify you when the app launches"
      }
    });
    
  } catch (error) {
    logger.error('Error claiming offer:', error);
    
    // Handle duplicate key error (race condition)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      
      if (field === 'phoneNumber' || field === 'phoneDigits') {
        // Phone already exists, fetch and return existing code
        try {
          const formattedPhone = formatPhoneNumber(req.body.phone, req.body.countryCode);
          const existing = await OfferSubmission.findOne({ phoneNumber: formattedPhone });
          
          if (existing) {
            return res.status(200).json({
              success: true,
              message: 'You already have a discount code',
              data: {
                discountCode: existing.discountCode,
                phone: existing.phoneNumber,
                expiresAt: existing.expiresAt,
                message: "We'll notify you when the app launches"
              }
            });
          }
        } catch (fetchError) {
          logger.error('Error fetching existing submission:', fetchError);
        }
      }
      
      if (field === 'discountCode') {
        // Discount code collision, retry
        logger.warn('Discount code collision detected, retrying...');
        // Retry logic could be added here, but for now return error
        return res.status(500).json({
          success: false,
          message: 'Failed to generate discount code. Please try again.',
          error: 'Code generation conflict'
        });
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate discount code',
      error: error.message
    });
  }
};

/**
 * @desc    Get discount code by phone number
 * @route   GET /api/offers/phone/:phone
 * @access  Public
 */
exports.getOfferByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const { countryCode } = req.query;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
        error: 'Missing phone parameter'
      });
    }
    
    // Format phone number if country code provided
    let formattedPhone = phone;
    if (countryCode) {
      formattedPhone = formatPhoneNumber(phone, countryCode);
    }
    
    const phoneDigits = countryCode ? extractPhoneDigits(phone, countryCode) : phone.replace(/\D/g, '');
    
    // Find submission
    const submission = await OfferSubmission.findOne({
      $or: [
        { phoneNumber: formattedPhone },
        { phoneDigits: phoneDigits }
      ]
    });
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'No discount code found for this phone number',
        error: 'Not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        discountCode: submission.discountCode,
        phone: submission.phoneNumber,
        expiresAt: submission.expiresAt,
        status: submission.status,
        isValid: submission.isValid,
        isExpired: submission.isExpired
      }
    });
    
  } catch (error) {
    logger.error('Error getting offer by phone:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve discount code',
      error: error.message
    });
  }
};

/**
 * @desc    Validate discount code
 * @route   GET /api/offers/validate/:code
 * @access  Public
 */
exports.validateOfferCode = async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Discount code is required',
        error: 'Missing code parameter'
      });
    }
    
    const submission = await OfferSubmission.findOne({
      discountCode: code.toUpperCase()
    });
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Discount code not found',
        error: 'Invalid code',
        isValid: false
      });
    }
    
    // Check if expired
    if (submission.isExpired) {
      return res.status(200).json({
        success: false,
        message: 'Discount code has expired',
        error: 'Code expired',
        isValid: false,
        expiresAt: submission.expiresAt
      });
    }
    
    // Check if already used
    if (submission.status === 'used') {
      return res.status(200).json({
        success: false,
        message: 'Discount code has already been used',
        error: 'Code used',
        isValid: false,
        usedAt: submission.usedAt
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Discount code is valid',
      data: {
        isValid: true,
        discountCode: submission.discountCode,
        phone: submission.phoneNumber,
        expiresAt: submission.expiresAt,
        status: submission.status
      }
    });
    
  } catch (error) {
    logger.error('Error validating offer code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate discount code',
      error: error.message
    });
  }
};

