const User = require('../../Models/User/user.model');
const WalletTransaction = require('../../Models/User/walletTransaction.model');
const logger = require('../../utils/logger');

/**
 * @desc    Get user wallet balance
 * @route   GET /api/users/:userId/wallet
 */
const getUserWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('walletBalance fullName email phoneNumber');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        walletBalance: user.walletBalance || 0,
        currency: 'INR',
        user: {
          name: user.fullName,
          email: user.email,
          phone: user.phoneNumber,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching wallet balance',
      error: error.message,
    });
  }
};

/**
 * @desc    Get wallet transaction history
 * @route   GET /api/users/:userId/wallet/transactions
 */
const getWalletTransactions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      transactionType, 
      status,
      startDate,
      endDate,
    } = req.query;
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // Build query
    const query = { user: userId };
    
    if (transactionType) {
      query.transactionType = transactionType;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get transactions
    const transactions = await WalletTransaction.find(query)
      .populate('relatedRide', 'pickupAddress dropoffAddress fare status')
      .populate('adjustedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count
    const totalTransactions = await WalletTransaction.countDocuments(query);
    
    // Calculate summary
    const summary = await WalletTransaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalCredits: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['TOP_UP', 'REFUND', 'BONUS', 'REFERRAL_REWARD', 'PROMO_CREDIT', 'ADMIN_ADJUSTMENT']] },
                '$amount',
                0,
              ],
            },
          },
          totalDebits: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['RIDE_PAYMENT', 'WITHDRAWAL', 'CANCELLATION_FEE']] },
                '$amount',
                0,
              ],
            },
          },
        },
      },
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTransactions / parseInt(limit)),
          totalTransactions,
          limit: parseInt(limit),
        },
        summary: summary[0] || { totalCredits: 0, totalDebits: 0 },
        currentBalance: user.walletBalance || 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching wallet transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching wallet transactions',
      error: error.message,
    });
  }
};

/**
 * @desc    Add money to wallet (Top-up)
 * @route   POST /api/users/:userId/wallet/top-up
 */
const topUpWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, paymentMethod, paymentGatewayTransactionId, description } = req.body;
    
    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Amount must be greater than 0',
      });
    }
    
    if (amount < 10) {
      return res.status(400).json({
        success: false,
        message: 'Minimum top-up amount is ₹10',
      });
    }
    
    if (amount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum top-up amount is ₹50,000',
      });
    }
    
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // Calculate new balance
    const balanceBefore = user.walletBalance || 0;
    const balanceAfter = balanceBefore + amount;
    
    // Create transaction record
    const transaction = await WalletTransaction.create({
      user: userId,
      transactionType: 'TOP_UP',
      amount,
      balanceBefore,
      balanceAfter,
      paymentMethod: paymentMethod || 'RAZORPAY',
      paymentGatewayTransactionId,
      status: 'COMPLETED',
      description: description || `Wallet top-up of ₹${amount}`,
      metadata: {
        topUpMethod: paymentMethod,
        gatewayTransactionId: paymentGatewayTransactionId,
      },
    });
    
    // Update user wallet balance
    user.walletBalance = balanceAfter;
    await user.save();
    
    logger.info(`Wallet top-up successful - User: ${userId}, Amount: ₹${amount}, New Balance: ₹${balanceAfter}`);
    
    res.status(200).json({
      success: true,
      message: 'Wallet topped up successfully',
      data: {
        transaction: transaction,
        newBalance: balanceAfter,
        previousBalance: balanceBefore,
      },
    });
  } catch (error) {
    logger.error('Error topping up wallet:', error);
    res.status(500).json({
      success: false,
      message: 'Error topping up wallet',
      error: error.message,
    });
  }
};

/**
 * @desc    Deduct money from wallet (for ride payment)
 * @route   POST /api/users/:userId/wallet/deduct
 */
const deductFromWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, rideId, description } = req.body;
    
    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount',
      });
    }
    
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    const balanceBefore = user.walletBalance || 0;
    
    // Check sufficient balance
    if (balanceBefore < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
        data: {
          required: amount,
          available: balanceBefore,
          shortfall: amount - balanceBefore,
        },
      });
    }
    
    // Calculate new balance
    const balanceAfter = balanceBefore - amount;
    
    // Create transaction record
    const transaction = await WalletTransaction.create({
      user: userId,
      transactionType: 'RIDE_PAYMENT',
      amount,
      balanceBefore,
      balanceAfter,
      relatedRide: rideId,
      paymentMethod: 'WALLET',
      status: 'COMPLETED',
      description: description || `Ride payment of ₹${amount}`,
    });
    
    // Update user wallet balance
    user.walletBalance = balanceAfter;
    await user.save();
    
    logger.info(`Wallet deduction successful - User: ${userId}, Amount: ₹${amount}, New Balance: ₹${balanceAfter}`);
    
    res.status(200).json({
      success: true,
      message: 'Amount deducted successfully',
      data: {
        transaction: transaction,
        newBalance: balanceAfter,
        previousBalance: balanceBefore,
      },
    });
  } catch (error) {
    logger.error('Error deducting from wallet:', error);
    res.status(500).json({
      success: false,
      message: 'Error deducting from wallet',
      error: error.message,
    });
  }
};

/**
 * @desc    Refund to wallet
 * @route   POST /api/users/:userId/wallet/refund
 */
const refundToWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, rideId, reason, description } = req.body;
    
    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid refund amount',
      });
    }
    
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    const balanceBefore = user.walletBalance || 0;
    const balanceAfter = balanceBefore + amount;
    
    // Create transaction record
    const transaction = await WalletTransaction.create({
      user: userId,
      transactionType: 'REFUND',
      amount,
      balanceBefore,
      balanceAfter,
      relatedRide: rideId,
      paymentMethod: 'WALLET',
      status: 'COMPLETED',
      description: description || `Refund of ₹${amount}${reason ? ` - ${reason}` : ''}`,
      metadata: {
        refundReason: reason,
      },
    });
    
    // Update user wallet balance
    user.walletBalance = balanceAfter;
    await user.save();
    
    logger.info(`Wallet refund successful - User: ${userId}, Amount: ₹${amount}, New Balance: ₹${balanceAfter}`);
    
    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        transaction: transaction,
        newBalance: balanceAfter,
        previousBalance: balanceBefore,
      },
    });
  } catch (error) {
    logger.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing refund',
      error: error.message,
    });
  }
};

/**
 * @desc    Request wallet withdrawal
 * @route   POST /api/users/:userId/wallet/withdraw
 */
const requestWithdrawal = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      amount, 
      bankAccountNumber, 
      ifscCode, 
      accountHolderName, 
      bankName,
      description,
    } = req.body;
    
    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid withdrawal amount',
      });
    }
    
    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is ₹100',
      });
    }
    
    if (!bankAccountNumber || !ifscCode || !accountHolderName || !bankName) {
      return res.status(400).json({
        success: false,
        message: 'Bank account details are required',
      });
    }
    
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    const balanceBefore = user.walletBalance || 0;
    
    // Check sufficient balance
    if (balanceBefore < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
        data: {
          required: amount,
          available: balanceBefore,
        },
      });
    }
    
    // Calculate new balance (deduct immediately, process withdrawal separately)
    const balanceAfter = balanceBefore - amount;
    
    // Create withdrawal transaction (status: PENDING)
    const transaction = await WalletTransaction.create({
      user: userId,
      transactionType: 'WITHDRAWAL',
      amount,
      balanceBefore,
      balanceAfter,
      paymentMethod: 'NETBANKING',
      status: 'PENDING',
      description: description || `Withdrawal request of ₹${amount}`,
      withdrawalRequest: {
        bankAccountNumber,
        ifscCode,
        accountHolderName,
        bankName,
        requestedAt: new Date(),
      },
    });
    
    // Update user wallet balance
    user.walletBalance = balanceAfter;
    await user.save();
    
    logger.info(`Withdrawal request created - User: ${userId}, Amount: ₹${amount}, Transaction: ${transaction._id}`);
    
    res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted successfully. It will be processed within 3-5 business days.',
      data: {
        transaction: transaction,
        newBalance: balanceAfter,
        previousBalance: balanceBefore,
      },
    });
  } catch (error) {
    logger.error('Error creating withdrawal request:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating withdrawal request',
      error: error.message,
    });
  }
};

/**
 * @desc    Get wallet transaction by ID
 * @route   GET /api/users/:userId/wallet/transactions/:transactionId
 */
const getWalletTransactionById = async (req, res) => {
  try {
    const { userId, transactionId } = req.params;
    
    const transaction = await WalletTransaction.findOne({
      _id: transactionId,
      user: userId,
    })
      .populate('relatedRide', 'pickupAddress dropoffAddress fare status')
      .populate('adjustedBy', 'fullName email')
      .populate('withdrawalRequest.processedBy', 'fullName email');
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        transaction,
      },
    });
  } catch (error) {
    logger.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction',
      error: error.message,
    });
  }
};

/**
 * @desc    Get wallet statistics
 * @route   GET /api/users/:userId/wallet/statistics
 */
const getWalletStatistics = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // Build date filter
    const dateFilter = { user: userId };
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.createdAt.$lte = new Date(endDate);
      }
    }
    
    // Get statistics
    const stats = await WalletTransaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalTopUps: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'TOP_UP'] }, '$amount', 0],
            },
          },
          totalRidePayments: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'RIDE_PAYMENT'] }, '$amount', 0],
            },
          },
          totalRefunds: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'REFUND'] }, '$amount', 0],
            },
          },
          totalBonuses: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'BONUS'] }, '$amount', 0],
            },
          },
          totalWithdrawals: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'WITHDRAWAL'] }, '$amount', 0],
            },
          },
          transactionCount: { $sum: 1 },
        },
      },
    ]);
    
    // Get transaction count by type
    const transactionsByType = await WalletTransaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$transactionType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);
    
    // Get monthly breakdown
    const monthlyBreakdown = await WalletTransaction.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          credits: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['TOP_UP', 'REFUND', 'BONUS', 'REFERRAL_REWARD', 'PROMO_CREDIT']] },
                '$amount',
                0,
              ],
            },
          },
          debits: {
            $sum: {
              $cond: [
                { $in: ['$transactionType', ['RIDE_PAYMENT', 'WITHDRAWAL', 'CANCELLATION_FEE']] },
                '$amount',
                0,
              ],
            },
          },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        currentBalance: user.walletBalance || 0,
        statistics: stats[0] || {
          totalTopUps: 0,
          totalRidePayments: 0,
          totalRefunds: 0,
          totalBonuses: 0,
          totalWithdrawals: 0,
          transactionCount: 0,
        },
        transactionsByType,
        monthlyBreakdown,
      },
    });
  } catch (error) {
    logger.error('Error fetching wallet statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching wallet statistics',
      error: error.message,
    });
  }
};

/**
 * @desc    Process hybrid payment (wallet + Razorpay)
 * @route   POST /api/users/:userId/wallet/hybrid-payment
 */
const processHybridPayment = async (req, res) => {
  try {
    const { userId } = req.params;
    const { rideId, totalAmount, walletAmount, razorpayPaymentId } = req.body;
    
    // Validation
    if (!rideId) {
      return res.status(400).json({
        success: false,
        message: 'Ride ID is required',
      });
    }
    
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid total amount',
      });
    }
    
    if (!walletAmount || walletAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet amount',
      });
    }
    
    if (!razorpayPaymentId) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay payment ID is required',
      });
    }
    
    // Verify amounts add up
    const razorpayAmount = totalAmount - walletAmount;
    if (razorpayAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Wallet amount cannot exceed total amount',
      });
    }
    
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    const balanceBefore = user.walletBalance || 0;
    
    // Check sufficient balance if wallet amount > 0
    if (walletAmount > 0 && balanceBefore < walletAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
        data: {
          required: walletAmount,
          available: balanceBefore,
          shortfall: walletAmount - balanceBefore,
        },
      });
    }
    
    // Import Ride model
    const Ride = require('../../Models/Driver/ride.model');
    
    // Verify ride exists
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Ride not found',
      });
    }
    
    // Deduct wallet amount if applicable
    let walletTransaction = null;
    let balanceAfter = balanceBefore;
    
    if (walletAmount > 0) {
      balanceAfter = balanceBefore - walletAmount;
      
      // Create wallet transaction record
      walletTransaction = await WalletTransaction.create({
        user: userId,
        transactionType: 'RIDE_PAYMENT',
        amount: walletAmount,
        balanceBefore,
        balanceAfter,
        relatedRide: rideId,
        paymentMethod: 'WALLET',
        status: 'COMPLETED',
        description: `Ride payment (hybrid) - Wallet: ₹${walletAmount}, Razorpay: ₹${razorpayAmount}`,
        metadata: {
          hybridPayment: true,
          razorpayPaymentId,
          totalAmount,
        },
      });
      
      // Update user wallet balance
      user.walletBalance = balanceAfter;
      await user.save();
    }
    
    // Update ride with payment details
    ride.walletAmountUsed = walletAmount;
    ride.razorpayAmountPaid = razorpayAmount;
    ride.razorpayPaymentId = razorpayPaymentId;
    ride.paymentStatus = 'completed';
    ride.transactionId = razorpayPaymentId;
    await ride.save();
    
    logger.info(`Hybrid payment processed - User: ${userId}, Ride: ${rideId}, Wallet: ₹${walletAmount}, Razorpay: ₹${razorpayAmount}`);
    
    res.status(200).json({
      success: true,
      message: 'Hybrid payment processed successfully',
      data: {
        walletTransaction: walletTransaction,
        newBalance: balanceAfter,
        previousBalance: balanceBefore,
        razorpayAmount: razorpayAmount,
        walletAmount: walletAmount,
        totalAmount: totalAmount,
      },
    });
  } catch (error) {
    logger.error('Error processing hybrid payment:', error);
    
    // If wallet was deducted but ride update failed, refund wallet
    if (req.body.walletAmount > 0 && userId) {
      try {
        const user = await User.findById(userId);
        if (user) {
          user.walletBalance = (user.walletBalance || 0) + req.body.walletAmount;
          await user.save();
          
          // Create refund transaction
          await WalletTransaction.create({
            user: userId,
            transactionType: 'REFUND',
            amount: req.body.walletAmount,
            balanceBefore: user.walletBalance - req.body.walletAmount,
            balanceAfter: user.walletBalance,
            relatedRide: req.body.rideId,
            paymentMethod: 'WALLET',
            status: 'COMPLETED',
            description: `Refund due to hybrid payment processing error`,
            metadata: {
              originalError: error.message,
            },
          });
          
          logger.info(`Wallet refunded due to hybrid payment error - User: ${userId}, Amount: ₹${req.body.walletAmount}`);
        }
      } catch (refundError) {
        logger.error('Error refunding wallet after hybrid payment failure:', refundError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Error processing hybrid payment',
      error: error.message,
    });
  }
};

module.exports = {
  getUserWallet,
  getWalletTransactions,
  topUpWallet,
  deductFromWallet,
  refundToWallet,
  requestWithdrawal,
  getWalletTransactionById,
  getWalletStatistics,
  processHybridPayment,
};

