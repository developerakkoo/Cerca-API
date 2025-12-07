const express = require('express');
const router = express.Router();
const {
  getAvailableBalance,
  requestPayout,
  getPayoutHistory,
  getPayoutById,
  updateBankAccount,
  getBankAccount,
} = require('../../Controllers/Driver/payout.controller');

/**
 * @route   GET /api/drivers/:driverId/payout/available-balance
 * @desc    Get available balance for payout
 */
router.get('/:driverId/payout/available-balance', getAvailableBalance);

/**
 * @route   POST /api/drivers/:driverId/payout/request
 * @desc    Request payout
 */
router.post('/:driverId/payout/request', requestPayout);

/**
 * @route   GET /api/drivers/:driverId/payout/history
 * @desc    Get payout history
 */
router.get('/:driverId/payout/history', getPayoutHistory);

/**
 * @route   GET /api/drivers/:driverId/payout/:payoutId
 * @desc    Get payout by ID
 */
router.get('/:driverId/payout/:payoutId', getPayoutById);

/**
 * @route   GET /api/drivers/:driverId/payout/bank-account
 * @desc    Get bank account
 */
router.get('/:driverId/payout/bank-account', getBankAccount);

/**
 * @route   PUT /api/drivers/:driverId/payout/bank-account
 * @desc    Update bank account
 */
router.put('/:driverId/payout/bank-account', updateBankAccount);

module.exports = router;

