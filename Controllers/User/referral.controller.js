const User = require('../../Models/User/user.model');
const Referral = require('../../Models/User/referral.model');
const Ride = require('../../Models/Driver/ride.model');
const WalletTransaction = require('../../Models/User/walletTransaction.model');
const logger = require('../../utils/logger');

/**
 * @desc    Generate referral code for user
 * @route   POST /api/users/:userId/referral/generate
 */
const generateReferralCode = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // If user already has a referral code, return it
    if (user.referralCode) {
      return res.status(200).json({
        success: true,
        message: 'Referral code already exists',
        data: {
          referralCode: user.referralCode,
        },
      });
    }
    
    // Generate unique referral code
    let referralCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      referralCode = generateUniqueReferralCode();
      const existing = await User.findOne({ referralCode });
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }
    
    if (!isUnique) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate unique referral code. Please try again.',
      });
    }
    
    // Update user with referral code
    user.referralCode = referralCode;
    await user.save();
    
    logger.info(`Referral code generated for user ${userId}: ${referralCode}`);
    
    res.status(200).json({
      success: true,
      message: 'Referral code generated successfully',
      data: {
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    logger.error('Error generating referral code:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating referral code',
      error: error.message,
    });
  }
};

/**
 * @desc    Get user's referral code
 * @route   GET /api/users/:userId/referral
 */
const getUserReferralCode = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('referralCode totalReferrals referralRewardsEarned');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // Generate code if doesn't exist
    if (!user.referralCode) {
      let referralCode;
      let isUnique = false;
      let attempts = 0;
      
      while (!isUnique && attempts < 10) {
        referralCode = generateUniqueReferralCode();
        const existing = await User.findOne({ referralCode });
        if (!existing) {
          isUnique = true;
        }
        attempts++;
      }
      
      if (isUnique) {
        user.referralCode = referralCode;
        await user.save();
      }
    }
    
    // Get referral statistics
    const referrals = await Referral.find({ referrer: userId });
    const completedReferrals = referrals.filter(r => r.status === 'COMPLETED' || r.status === 'REWARDED').length;
    
    res.status(200).json({
      success: true,
      data: {
        referralCode: user.referralCode,
        totalReferrals: user.totalReferrals || 0,
        completedReferrals,
        referralRewardsEarned: user.referralRewardsEarned || 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching referral code:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching referral code',
      error: error.message,
    });
  }
};

/**
 * @desc    Apply referral code (when new user signs up)
 * @route   POST /api/users/:userId/referral/apply
 */
const applyReferralCode = async (req, res) => {
  try {
    const { userId } = req.params;
    const { referralCode } = req.body;
    
    if (!referralCode) {
      return res.status(400).json({
        success: false,
        message: 'Referral code is required',
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // Check if user already used a referral code
    if (user.referralCodeUsed) {
      return res.status(400).json({
        success: false,
        message: 'You have already used a referral code',
      });
    }
    
    // Check if user is referring themselves
    if (user.referralCode === referralCode.toUpperCase().trim()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot use your own referral code',
      });
    }
    
    // Find referrer
    const referrer = await User.findOne({ 
      referralCode: referralCode.toUpperCase().trim() 
    });
    
    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code',
      });
    }
    
    // Check if referral already exists
    const existingReferral = await Referral.findOne({ referee: userId });
    if (existingReferral) {
      return res.status(400).json({
        success: false,
        message: 'Referral code already applied',
      });
    }
    
    // Create referral record
    const referral = await Referral.create({
      referrer: referrer._id,
      referee: userId,
      referralCode: referralCode.toUpperCase().trim(),
      status: 'PENDING',
    });
    
    // Update user
    user.referralCodeUsed = referralCode.toUpperCase().trim();
    user.referredBy = referrer._id;
    await user.save();
    
    // Update referrer's total referrals count
    referrer.totalReferrals = (referrer.totalReferrals || 0) + 1;
    await referrer.save();
    
    logger.info(`Referral code applied: ${referralCode} by user ${userId}, referrer: ${referrer._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Referral code applied successfully. Complete your first ride to earn rewards!',
      data: {
        referral: {
          id: referral._id,
          referrerName: referrer.fullName,
          status: referral.status,
        },
      },
    });
  } catch (error) {
    logger.error('Error applying referral code:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Referral code already applied',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error applying referral code',
      error: error.message,
    });
  }
};

/**
 * @desc    Process referral reward (called when referee completes first ride)
 * @route   POST /api/users/:userId/referral/process-reward
 */
const processReferralReward = async (req, res) => {
  try {
    const { userId } = req.params;
    const { rideId } = req.body;
    
    // Find referral
    const referral = await Referral.findOne({ referee: userId, status: 'PENDING' })
      .populate('referrer', 'fullName walletBalance');
    
    if (!referral) {
      return res.status(404).json({
        success: false,
        message: 'No pending referral found',
      });
    }
    
    // Check if ride exists and is completed
    const ride = await Ride.findById(rideId);
    if (!ride || ride.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Ride must be completed to process referral reward',
      });
    }
    
    // Get referral reward settings (you can move this to settings model)
    const referrerReward = 100; // ₹100 for referrer
    const refereeReward = 50;   // ₹50 for referee
    
    // Update referral status
    referral.status = 'COMPLETED';
    referral.firstRideCompletedAt = new Date();
    referral.reward = {
      referrerReward,
      refereeReward,
      rewardType: 'WALLET_CREDIT',
    };
    await referral.save();
    
    // Credit referrer's wallet
    const referrer = await User.findById(referral.referrer);
    if (referrer) {
      const balanceBefore = referrer.walletBalance || 0;
      const balanceAfter = balanceBefore + referrerReward;
      
      referrer.walletBalance = balanceAfter;
      referrer.referralRewardsEarned = (referrer.referralRewardsEarned || 0) + referrerReward;
      await referrer.save();
      
      // Create wallet transaction for referrer
      await WalletTransaction.create({
        user: referrer._id,
        transactionType: 'REFERRAL_REWARD',
        amount: referrerReward,
        balanceBefore,
        balanceAfter,
        status: 'COMPLETED',
        description: `Referral reward for referring ${referral.referee}`,
        metadata: {
          referralId: referral._id,
          refereeId: userId,
        },
      });
    }
    
    // Credit referee's wallet
    const referee = await User.findById(userId);
    if (referee) {
      const balanceBefore = referee.walletBalance || 0;
      const balanceAfter = balanceBefore + refereeReward;
      
      referee.walletBalance = balanceAfter;
      await referee.save();
      
      // Create wallet transaction for referee
      await WalletTransaction.create({
        user: userId,
        transactionType: 'REFERRAL_REWARD',
        amount: refereeReward,
        balanceBefore,
        balanceAfter,
        relatedRide: rideId,
        status: 'COMPLETED',
        description: 'Welcome bonus for using referral code',
        metadata: {
          referralId: referral._id,
          referrerId: referral.referrer,
        },
      });
    }
    
    // Mark referral as rewarded
    referral.status = 'REWARDED';
    referral.rewardedAt = new Date();
    await referral.save();
    
    logger.info(`Referral reward processed: Referrer ${referral.referrer} got ₹${referrerReward}, Referee ${userId} got ₹${refereeReward}`);
    
    res.status(200).json({
      success: true,
      message: 'Referral rewards processed successfully',
      data: {
        referrerReward,
        refereeReward,
        referralId: referral._id,
      },
    });
  } catch (error) {
    logger.error('Error processing referral reward:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing referral reward',
      error: error.message,
    });
  }
};

/**
 * @desc    Get referral history
 * @route   GET /api/users/:userId/referral/history
 */
const getReferralHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;
    
    const query = { referrer: userId };
    if (status) {
      query.status = status;
    }
    
    const referrals = await Referral.find(query)
      .populate('referee', 'fullName email phoneNumber')
      .sort({ createdAt: -1 });
    
    const statistics = {
      total: referrals.length,
      pending: referrals.filter(r => r.status === 'PENDING').length,
      completed: referrals.filter(r => r.status === 'COMPLETED').length,
      rewarded: referrals.filter(r => r.status === 'REWARDED').length,
    };
    
    res.status(200).json({
      success: true,
      data: {
        referrals,
        statistics,
      },
    });
  } catch (error) {
    logger.error('Error fetching referral history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching referral history',
      error: error.message,
    });
  }
};

/**
 * Generate unique referral code
 */
const generateUniqueReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  // Use user's name initials or random
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

module.exports = {
  generateReferralCode,
  getUserReferralCode,
  applyReferralCode,
  processReferralReward,
  getReferralHistory,
};

