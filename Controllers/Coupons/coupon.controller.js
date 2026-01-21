const Coupon = require('../../Models/Admin/coupon.modal');
const User = require('../../Models/User/user.model');
const Ride = require('../../Models/Driver/ride.model');
const UserGift = require('../../Models/User/userGift.model');
const logger = require('../../utils/logger');
const {
  getAvailableGiftsForUser,
  assignGiftToUser,
} = require('../../utils/giftAssignment');

/**
 * @desc    Add a new coupon
 * @route   POST /coupons
 */
const addCoupon = async (req, res) => {
  try {
    // Validate and parse date strings into Date objects
    if (req.body.startDate) {
      const startDate = new Date(req.body.startDate);
      if (isNaN(startDate)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid startDate format. Use YYYY-MM-DD.' 
        });
      }
      req.body.startDate = startDate;
    }
    if (req.body.validUntil) {
      const validUntil = new Date(req.body.validUntil);
      if (isNaN(validUntil)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid validUntil format. Use YYYY-MM-DD.' 
        });
      }
      req.body.validUntil = validUntil;
    }

    // Validate dates
    if (req.body.startDate && req.body.validUntil) {
      if (req.body.startDate >= req.body.validUntil) {
        return res.status(400).json({
          success: false,
          message: 'validUntil must be after startDate',
        });
      }
    }

    // Generate coupon code if not provided
    if (!req.body.couponCode) {
      req.body.couponCode = generateCouponCode();
    } else {
      req.body.couponCode = req.body.couponCode.toUpperCase().trim();
    }

    const coupon = new Coupon(req.body);
    await coupon.save();
    
    logger.info(`Coupon created: ${coupon.couponCode}`);
    res.status(201).json({ 
      success: true,
      message: 'Coupon added successfully', 
      data: { coupon } 
    });
  } catch (error) {
    logger.error('Error adding coupon:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists',
      });
    }
    res.status(500).json({ 
      success: false,
      message: 'Error adding coupon', 
      error: error.message 
    });
  }
};

/**
 * @desc    Get all coupons
 * @route   GET /coupons
 */
const getAllCoupons = async (req, res) => {
  try {
    const { isActive, expired } = req.query;
    const query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const coupons = await Coupon.find(query).sort({ createdAt: -1 });
    
    // Filter expired if requested
    let filteredCoupons = coupons;
    if (expired === 'false') {
      const now = new Date();
      filteredCoupons = coupons.filter(c => c.validUntil > now && c.startDate <= now);
    } else if (expired === 'true') {
      const now = new Date();
      filteredCoupons = coupons.filter(c => c.validUntil <= now || c.startDate > now);
    }
    
    res.status(200).json({
      success: true,
      data: { coupons: filteredCoupons },
      count: filteredCoupons.length,
    });
  } catch (error) {
    logger.error('Error fetching coupons:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching coupons', 
      error: error.message 
    });
  }
};

/**
 * @desc    Get a single coupon by ID
 * @route   GET /coupons/:id
 */
const getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ 
        success: false,
        message: 'Coupon not found' 
      });
    }
    res.status(200).json({
      success: true,
      data: { coupon },
    });
  } catch (error) {
    logger.error('Error fetching coupon:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching coupon', 
      error: error.message 
    });
  }
};

/**
 * @desc    Get coupon by code
 * @route   GET /coupons/code/:code
 */
const getCouponByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const coupon = await Coupon.findOne({ 
      couponCode: code.toUpperCase().trim() 
    });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: { coupon },
    });
  } catch (error) {
    logger.error('Error fetching coupon by code:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching coupon',
      error: error.message,
    });
  }
};

/**
 * @desc    Validate and apply coupon
 * @route   POST /coupons/validate
 */
const validateCoupon = async (req, res) => {
  try {
    const { couponCode, userId, rideFare, service, rideType } = req.body;
    
    if (!couponCode || !userId || rideFare === undefined) {
      return res.status(400).json({
        success: false,
        message: 'couponCode, userId, and rideFare are required',
      });
    }
    
    // Find coupon
    const coupon = await Coupon.findOne({ 
      couponCode: couponCode.toUpperCase().trim() 
    });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code',
      });
    }
    
    // Check if user can use this coupon
    const canUse = coupon.canUserUse(userId);
    if (!canUse.canUse) {
      return res.status(400).json({
        success: false,
        message: canUse.reason,
      });
    }
    
    // Check service applicability
    if (coupon.applicableServices && coupon.applicableServices.length > 0) {
      if (!service || !coupon.applicableServices.includes(service)) {
        return res.status(400).json({
          success: false,
          message: `This coupon is not applicable for ${service || 'this service'}`,
        });
      }
    }
    
    // Check ride type applicability
    if (coupon.applicableRideTypes && coupon.applicableRideTypes.length > 0) {
      if (!rideType || !coupon.applicableRideTypes.includes(rideType)) {
        return res.status(400).json({
          success: false,
          message: `This coupon is not applicable for ${rideType || 'this ride type'}`,
        });
      }
    }
    
    // Calculate discount
    const discountResult = coupon.calculateDiscount(rideFare);
    
    if (discountResult.reason) {
      return res.status(400).json({
        success: false,
        message: discountResult.reason,
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Coupon is valid',
      data: {
        coupon: {
          code: coupon.couponCode,
          type: coupon.type,
          description: coupon.description,
        },
        originalFare: rideFare,
        discountAmount: discountResult.discount,
        finalFare: discountResult.finalFare,
        canApply: true,
      },
    });
  } catch (error) {
    logger.error('Error validating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating coupon',
      error: error.message,
    });
  }
};

/**
 * @desc    Apply coupon to ride
 * @route   POST /coupons/apply
 */
const applyCoupon = async (req, res) => {
  try {
    const { couponCode, userId, rideId, rideFare } = req.body;
    
    if (!couponCode || !userId || !rideId || rideFare === undefined) {
      return res.status(400).json({
        success: false,
        message: 'couponCode, userId, rideId, and rideFare are required',
      });
    }
    
    // Find coupon
    const coupon = await Coupon.findOne({ 
      couponCode: couponCode.toUpperCase().trim() 
    });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code',
      });
    }
    
    // Check if user can use this coupon
    const canUse = coupon.canUserUse(userId);
    if (!canUse.canUse) {
      return res.status(400).json({
        success: false,
        message: canUse.reason,
      });
    }
    
    // Calculate discount
    const discountResult = coupon.calculateDiscount(rideFare);
    
    if (discountResult.reason) {
      return res.status(400).json({
        success: false,
        message: discountResult.reason,
      });
    }
    
    // Record usage
    await coupon.recordUsage(
      userId,
      rideId,
      discountResult.discount,
      rideFare,
      discountResult.finalFare
    );
    
    // Update ride with coupon info
    await Ride.findByIdAndUpdate(rideId, {
      promoCode: coupon.couponCode,
      discount: discountResult.discount,
      fare: discountResult.finalFare,
    });
    
    logger.info(`Coupon applied: ${coupon.couponCode} to ride ${rideId}, discount: ₹${discountResult.discount}`);
    
    res.status(200).json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        coupon: {
          code: coupon.couponCode,
          type: coupon.type,
        },
        originalFare: rideFare,
        discountAmount: discountResult.discount,
        finalFare: discountResult.finalFare,
      },
    });
  } catch (error) {
    logger.error('Error applying coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying coupon',
      error: error.message,
    });
  }
};

/**
 * @desc    Update a coupon by ID
 * @route   PUT /coupons/:id
 */
const updateCoupon = async (req, res) => {
  try {
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      {
        new: true,
        runValidators: true,
      }
    );
    if (!updatedCoupon) {
      return res.status(404).json({ 
        success: false,
        message: 'Coupon not found' 
      });
    }
    logger.info(`Coupon updated: ${updatedCoupon.couponCode}`);
    res.status(200).json({ 
      success: true,
      message: 'Coupon updated successfully', 
      data: { coupon: updatedCoupon } 
    });
  } catch (error) {
    logger.error('Error updating coupon:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating coupon', 
      error: error.message 
    });
  }
};

/**
 * @desc    Delete a coupon by ID
 * @route   DELETE /coupons/:id
 */
const deleteCoupon = async (req, res) => {
  try {
    const deletedCoupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!deletedCoupon) {
      return res.status(404).json({ 
        success: false,
        message: 'Coupon not found' 
      });
    }
    logger.info(`Coupon deleted: ${deletedCoupon.couponCode}`);
    res.status(200).json({ 
      success: true,
      message: 'Coupon deleted successfully' 
    });
  } catch (error) {
    logger.error('Error deleting coupon:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting coupon', 
      error: error.message 
    });
  }
};

/**
 * @desc    Get coupon usage statistics
 * @route   GET /coupons/:id/statistics
 */
const getCouponStatistics = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found',
      });
    }
    
    const statistics = {
      totalUsage: coupon.usageCount,
      maxUsage: coupon.maxUsage,
      usageLimitReached: coupon.isUsageLimitReached,
      uniqueUsers: coupon.usedBy.length,
      usageHistory: coupon.usageHistory.slice(-10), // Last 10 uses
      isActive: coupon.isActive,
      isExpired: coupon.isExpired,
      validUntil: coupon.validUntil,
    };
    
    res.status(200).json({
      success: true,
      data: { statistics },
    });
  } catch (error) {
    logger.error('Error fetching coupon statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching coupon statistics',
      error: error.message,
    });
  }
};

/**
 * Generate a random coupon code
 */
const generateCouponCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * @desc    Get available gifts for a user
 * @route   GET /coupons/user/:userId/gifts
 */
const getUserGifts = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get available gifts
    const gifts = await getAvailableGiftsForUser(userId);

    // Format response
    const formattedGifts = gifts.map(gift => {
      const coupon = gift.couponId || gift;
      return {
        id: coupon._id,
        couponId: coupon._id,
        couponCode: coupon.couponCode,
        title: coupon.giftTitle || coupon.description,
        description: coupon.giftDescription || coupon.description,
        discount: coupon.type === 'percentage' 
          ? `${coupon.discountValue}% OFF` 
          : `₹${coupon.discountValue} OFF`,
        discountValue: coupon.discountValue,
        discountType: coupon.type,
        expiryDate: coupon.validUntil,
        isUnlocked: !gift.isVirtual, // Virtual gifts are not yet unlocked
        isUsed: gift.isUsed || false,
        code: coupon.couponCode,
        image: coupon.giftImage || 'assets/gift-box.png',
        assignedAt: gift.assignedAt,
        usedAt: gift.usedAt,
        priority: coupon.priority || 0,
      };
    });

    // Sort by priority (higher first), then by assigned date
    formattedGifts.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return new Date(b.assignedAt) - new Date(a.assignedAt);
    });

    res.status(200).json({
      success: true,
      message: 'Gifts retrieved successfully',
      data: formattedGifts,
    });
  } catch (error) {
    logger.error('Error getting user gifts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user gifts',
      error: error.message,
    });
  }
};

/**
 * @desc    Manually assign gift to user
 * @route   POST /coupons/:couponId/assign/:userId
 */
const assignGift = async (req, res) => {
  try {
    const { couponId, userId } = req.params;
    const adminId = req.admin?._id || null;

    if (!couponId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Coupon ID and User ID are required',
      });
    }

    // Verify coupon exists
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found',
      });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Assign gift
    const result = await assignGiftToUser(userId, couponId, adminId);

    if (!result.assigned) {
      return res.status(400).json({
        success: false,
        message: result.reason || 'Failed to assign gift',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Gift assigned successfully',
      data: { userGift: result.userGift },
    });
  } catch (error) {
    logger.error('Error assigning gift:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning gift',
      error: error.message,
    });
  }
};

module.exports = {
  addCoupon,
  getAllCoupons,
  getCouponById,
  getCouponByCode,
  validateCoupon,
  applyCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponStatistics,
  getUserGifts,
  assignGift,
};
