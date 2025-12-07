const express = require('express');
const router = express.Router();
const {
  getDriverEarnings,
  getPaymentHistory,
} = require('../../Controllers/Driver/earnings.controller');

/**
 * @route   GET /api/drivers/:driverId/earnings
 * @desc    Get driver earnings dashboard
 */
router.get('/:driverId/earnings', getDriverEarnings);

/**
 * @route   GET /api/drivers/:driverId/earnings/payments
 * @desc    Get driver payment history
 */
router.get('/:driverId/earnings/payments', getPaymentHistory);

module.exports = router;

