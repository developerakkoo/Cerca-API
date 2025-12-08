const express = require('express');
const router = express.Router();
const {
  getUserWallet,
  getWalletTransactions,
  topUpWallet,
  deductFromWallet,
  refundToWallet,
  requestWithdrawal,
  getWalletTransactionById,
  getWalletStatistics,
  processHybridPayment,
} = require('../../Controllers/User/wallet.controller');

/**
 * @route   GET /api/users/:userId/wallet
 * @desc    Get user wallet balance
 */
router.get('/:userId/wallet', getUserWallet);

/**
 * @route   GET /api/users/:userId/wallet/transactions
 * @desc    Get wallet transaction history
 */
router.get('/:userId/wallet/transactions', getWalletTransactions);

/**
 * @route   GET /api/users/:userId/wallet/transactions/:transactionId
 * @desc    Get specific wallet transaction
 */
router.get('/:userId/wallet/transactions/:transactionId', getWalletTransactionById);

/**
 * @route   GET /api/users/:userId/wallet/statistics
 * @desc    Get wallet statistics
 */
router.get('/:userId/wallet/statistics', getWalletStatistics);

/**
 * @route   POST /api/users/:userId/wallet/top-up
 * @desc    Add money to wallet (Top-up)
 */
router.post('/:userId/wallet/top-up', topUpWallet);

/**
 * @route   POST /api/users/:userId/wallet/deduct
 * @desc    Deduct money from wallet (for ride payment)
 */
router.post('/:userId/wallet/deduct', deductFromWallet);

/**
 * @route   POST /api/users/:userId/wallet/refund
 * @desc    Refund money to wallet
 */
router.post('/:userId/wallet/refund', refundToWallet);

/**
 * @route   POST /api/users/:userId/wallet/withdraw
 * @desc    Request wallet withdrawal
 */
router.post('/:userId/wallet/withdraw', requestWithdrawal);

/**
 * @route   POST /api/users/:userId/wallet/hybrid-payment
 * @desc    Process hybrid payment (wallet + Razorpay)
 */
router.post('/:userId/wallet/hybrid-payment', processHybridPayment);

module.exports = router;

