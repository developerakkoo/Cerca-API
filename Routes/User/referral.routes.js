const express = require('express');
const router = express.Router();
const {
  generateReferralCode,
  getUserReferralCode,
  applyReferralCode,
  processReferralReward,
  getReferralHistory,
} = require('../../Controllers/User/referral.controller');

/**
 * @route   GET /api/users/:userId/referral
 * @desc    Get user's referral code and statistics
 */
router.get('/:userId/referral', getUserReferralCode);

/**
 * @route   POST /api/users/:userId/referral/generate
 * @desc    Generate referral code for user
 */
router.post('/:userId/referral/generate', generateReferralCode);

/**
 * @route   POST /api/users/:userId/referral/apply
 * @desc    Apply referral code (when new user signs up)
 */
router.post('/:userId/referral/apply', applyReferralCode);

/**
 * @route   POST /api/users/:userId/referral/process-reward
 * @desc    Process referral reward (when referee completes first ride)
 */
router.post('/:userId/referral/process-reward', processReferralReward);

/**
 * @route   GET /api/users/:userId/referral/history
 * @desc    Get referral history
 */
router.get('/:userId/referral/history', getReferralHistory);

module.exports = router;

