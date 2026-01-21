const Coupon = require('../Models/Admin/coupon.modal');
const UserGift = require('../Models/User/userGift.model');
const User = require('../Models/User/user.model');
const Ride = require('../Models/Driver/ride.model');
const logger = require('./logger');

/**
 * Check and assign new user gift
 * @param {string} userId - User ID
 */
async function checkAndAssignNewUserGift(userId) {
  try {
    // Check if user already has a new user gift assigned
    const existingGift = await UserGift.findOne({
      userId,
      assignedBy: 'AUTO',
    }).populate('couponId');

    if (existingGift && existingGift.couponId && existingGift.couponId.giftType === 'AUTO_NEW_USER') {
      logger.info(`User ${userId} already has new user gift assigned`);
      return { assigned: false, reason: 'Already assigned' };
    }

    // Find active new user gift coupons
    const newUserCoupons = await Coupon.find({
      isGift: true,
      giftType: 'AUTO_NEW_USER',
      isActive: true,
      startDate: { $lte: new Date() },
      validUntil: { $gte: new Date() },
    }).sort({ priority: -1 });

    if (newUserCoupons.length === 0) {
      logger.info(`No new user gift coupons found for user ${userId}`);
      return { assigned: false, reason: 'No coupons available' };
    }

    // Assign the highest priority coupon
    const couponToAssign = newUserCoupons[0];

    // Check if already assigned
    const alreadyAssigned = await UserGift.findOne({
      userId,
      couponId: couponToAssign._id,
    });

    if (alreadyAssigned) {
      logger.info(`User ${userId} already has coupon ${couponToAssign.couponCode} assigned`);
      return { assigned: false, reason: 'Already assigned' };
    }

    // Create user gift assignment
    const userGift = new UserGift({
      userId,
      couponId: couponToAssign._id,
      assignedBy: 'AUTO',
    });

    await userGift.save();

    logger.info(`Assigned new user gift ${couponToAssign.couponCode} to user ${userId}`);
    return { assigned: true, couponId: couponToAssign._id, couponCode: couponToAssign.couponCode };
  } catch (error) {
    logger.error(`Error assigning new user gift to ${userId}:`, error);
    return { assigned: false, error: error.message };
  }
}

/**
 * Check and assign first ride gift
 * @param {string} userId - User ID
 */
async function checkAndAssignFirstRideGift(userId) {
  try {
    // Check if user has exactly 1 completed ride
    const completedRides = await Ride.countDocuments({
      rider: userId,
      status: 'completed',
    });

    if (completedRides !== 1) {
      logger.info(`User ${userId} has ${completedRides} completed rides, not eligible for first ride gift`);
      return { assigned: false, reason: `User has ${completedRides} completed rides, not 1` };
    }

    // Check if user already has a first ride gift assigned
    const existingGift = await UserGift.findOne({
      userId,
      assignedBy: 'AUTO',
    }).populate('couponId');

    if (existingGift && existingGift.couponId && existingGift.couponId.giftType === 'AUTO_FIRST_RIDE') {
      logger.info(`User ${userId} already has first ride gift assigned`);
      return { assigned: false, reason: 'Already assigned' };
    }

    // Find active first ride gift coupons
    const firstRideCoupons = await Coupon.find({
      isGift: true,
      giftType: 'AUTO_FIRST_RIDE',
      isActive: true,
      startDate: { $lte: new Date() },
      validUntil: { $gte: new Date() },
    }).sort({ priority: -1 });

    if (firstRideCoupons.length === 0) {
      logger.info(`No first ride gift coupons found for user ${userId}`);
      return { assigned: false, reason: 'No coupons available' };
    }

    // Assign the highest priority coupon
    const couponToAssign = firstRideCoupons[0];

    // Check if already assigned
    const alreadyAssigned = await UserGift.findOne({
      userId,
      couponId: couponToAssign._id,
    });

    if (alreadyAssigned) {
      logger.info(`User ${userId} already has coupon ${couponToAssign.couponCode} assigned`);
      return { assigned: false, reason: 'Already assigned' };
    }

    // Create user gift assignment
    const userGift = new UserGift({
      userId,
      couponId: couponToAssign._id,
      assignedBy: 'AUTO',
    });

    await userGift.save();

    logger.info(`Assigned first ride gift ${couponToAssign.couponCode} to user ${userId}`);
    return { assigned: true, couponId: couponToAssign._id, couponCode: couponToAssign.couponCode };
  } catch (error) {
    logger.error(`Error assigning first ride gift to ${userId}:`, error);
    return { assigned: false, error: error.message };
  }
}

/**
 * Check and assign loyalty gift based on ride count
 * @param {string} userId - User ID
 */
async function checkAndAssignLoyaltyGift(userId) {
  try {
    // Get user's completed ride count
    const completedRides = await Ride.countDocuments({
      rider: userId,
      status: 'completed',
    });

    // Find active loyalty gift coupons
    const loyaltyCoupons = await Coupon.find({
      isGift: true,
      giftType: 'AUTO_LOYALTY',
      isActive: true,
      startDate: { $lte: new Date() },
      validUntil: { $gte: new Date() },
      'autoAssignConditions.minRideCount': { $lte: completedRides },
    }).sort({ priority: -1, 'autoAssignConditions.minRideCount': -1 });

    if (loyaltyCoupons.length === 0) {
      logger.info(`No loyalty gift coupons found for user ${userId} with ${completedRides} rides`);
      return { assigned: false, reason: 'No coupons available' };
    }

    // Find the highest priority coupon that user hasn't received yet
    for (const coupon of loyaltyCoupons) {
      const alreadyAssigned = await UserGift.findOne({
        userId,
        couponId: coupon._id,
      });

      if (!alreadyAssigned) {
        // Create user gift assignment
        const userGift = new UserGift({
          userId,
          couponId: coupon._id,
          assignedBy: 'AUTO',
        });

        await userGift.save();

        logger.info(`Assigned loyalty gift ${coupon.couponCode} to user ${userId} for ${completedRides} rides`);
        return { assigned: true, couponId: coupon._id, couponCode: coupon.couponCode };
      }
    }

    return { assigned: false, reason: 'All eligible coupons already assigned' };
  } catch (error) {
    logger.error(`Error assigning loyalty gift to ${userId}:`, error);
    return { assigned: false, error: error.message };
  }
}

/**
 * Get all available gifts for a user
 * @param {string} userId - User ID
 */
async function getAvailableGiftsForUser(userId) {
  try {
    // Get all assigned gifts that are not used
    const assignedGifts = await UserGift.find({
      userId,
      isUsed: false,
    }).populate({
      path: 'couponId',
      match: {
        isActive: true,
        startDate: { $lte: new Date() },
        validUntil: { $gte: new Date() },
      },
    });

    // Filter out null coupons (expired or inactive)
    const validGifts = assignedGifts.filter(gift => gift.couponId !== null);

    // Also get auto-eligible gifts that haven't been assigned yet
    const user = await User.findById(userId);
    if (!user) {
      return validGifts;
    }

    // Get completed ride count
    const completedRides = await Ride.countDocuments({
      rider: userId,
      status: 'completed',
    });

    // Find auto-eligible coupons
    const autoEligibleCoupons = await Coupon.find({
      isGift: true,
      isActive: true,
      startDate: { $lte: new Date() },
      validUntil: { $gte: new Date() },
      $or: [
        { giftType: 'AUTO_NEW_USER', _id: { $nin: validGifts.map(g => g.couponId._id) } },
        { 
          giftType: 'AUTO_FIRST_RIDE', 
          _id: { $nin: validGifts.map(g => g.couponId._id) },
          // Only if user has exactly 1 completed ride
          ...(completedRides === 1 ? {} : { _id: null }) // This will exclude if condition not met
        },
        {
          giftType: 'AUTO_LOYALTY',
          _id: { $nin: validGifts.map(g => g.couponId._id) },
          'autoAssignConditions.minRideCount': { $lte: completedRides },
        },
      ],
    });

    // Filter out coupons that don't match conditions
    const eligibleCoupons = autoEligibleCoupons.filter(coupon => {
      if (coupon.giftType === 'AUTO_NEW_USER' && completedRides > 0) {
        return false;
      }
      if (coupon.giftType === 'AUTO_FIRST_RIDE' && completedRides !== 1) {
        return false;
      }
      return true;
    });

    // Create virtual assignments for auto-eligible coupons
    const virtualGifts = eligibleCoupons.map(coupon => ({
      userId,
      couponId: coupon,
      assignedAt: new Date(),
      assignedBy: 'AUTO',
      isUsed: false,
      isVirtual: true, // Mark as virtual (not yet assigned)
    }));

    return [...validGifts, ...virtualGifts];
  } catch (error) {
    logger.error(`Error getting available gifts for user ${userId}:`, error);
    return [];
  }
}

/**
 * Manually assign gift to user
 * @param {string} userId - User ID
 * @param {string} couponId - Coupon ID
 * @param {string} adminId - Admin ID (optional)
 */
async function assignGiftToUser(userId, couponId, adminId = null) {
  try {
    // Check if already assigned
    const existing = await UserGift.findOne({
      userId,
      couponId,
    });

    if (existing) {
      return { assigned: false, reason: 'Gift already assigned to user' };
    }

    // Verify coupon exists and is active
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return { assigned: false, reason: 'Coupon not found' };
    }

    if (!coupon.isActive) {
      return { assigned: false, reason: 'Coupon is not active' };
    }

    // Create user gift assignment
    const userGift = new UserGift({
      userId,
      couponId,
      assignedBy: adminId ? 'ADMIN' : 'AUTO',
      assignedByAdmin: adminId || null,
    });

    await userGift.save();

    logger.info(`Assigned gift ${coupon.couponCode} to user ${userId} by ${adminId ? 'admin' : 'auto'}`);
    return { assigned: true, userGift };
  } catch (error) {
    logger.error(`Error assigning gift to user ${userId}:`, error);
    return { assigned: false, error: error.message };
  }
}

module.exports = {
  checkAndAssignNewUserGift,
  checkAndAssignFirstRideGift,
  checkAndAssignLoyaltyGift,
  getAvailableGiftsForUser,
  assignGiftToUser,
};

