const Driver = require('../../Models/Driver/driver.model');
const Payout = require('../../Models/Driver/payout.model');
const AdminEarnings = require('../../Models/Admin/adminEarnings.model');
const Settings = require('../../Models/Admin/settings.modal');
const logger = require('../../utils/logger');

/**
 * @desc    Get driver's available balance for payout
 * @route   GET /api/drivers/:driverId/payout/available-balance
 */
const getAvailableBalance = async (req, res) => {
  try {
    const { driverId } = req.params;
    
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }
    
    // Get settings for minimum payout threshold
    const settings = await Settings.findOne();
    const minPayoutThreshold = settings?.payoutConfigurations?.minPayoutThreshold || 500;
    
    const allEarnings = await AdminEarnings.find({
      driverId,
      paymentStatus: 'pending'
    });
    const allPayouts = await Payout.find({ 
      driver: driverId, 
      status: { $in: ['COMPLETED', 'PROCESSING'] } 
    });
    
    // Get earnings already paid out
    const paidEarningIds = new Set();
    allPayouts.forEach(payout => {
      if (!Array.isArray(payout.relatedEarnings)) return;
      payout.relatedEarnings.forEach(earningId => {
        paidEarningIds.add(earningId.toString());
      });
    });
    
    // Calculate available balance
    const unpaidEarnings = allEarnings.filter(
      earning => !paidEarningIds.has(earning._id.toString())
    );
    
    const availableBalance = unpaidEarnings.reduce(
      (sum, earning) => sum + (earning.driverEarning || 0), 
      0
    );
    
    // Get tips from unpaid rides
    const Ride = require('../../Models/Driver/ride.model');
    const unpaidRideIds = unpaidEarnings
      .map((earning) => earning.rideId)
      .filter(Boolean);
    const unpaidRides = await Ride.find({ _id: { $in: unpaidRideIds } }).select('tips');
    const totalTips = unpaidRides.reduce((sum, ride) => sum + (ride.tips || 0), 0);
    
    const totalAvailable = availableBalance + totalTips;
    
    res.status(200).json({
      success: true,
      data: {
        availableBalance: Math.round(availableBalance * 100) / 100,
        totalTips: Math.round(totalTips * 100) / 100,
        totalAvailable: Math.round(totalAvailable * 100) / 100,
        minPayoutThreshold,
        canRequestPayout: totalAvailable >= minPayoutThreshold,
        unpaidRidesCount: unpaidEarnings.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching available balance:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available balance',
      error: error.message,
    });
  }
};

/**
 * @desc    Request payout
 * @route   POST /api/drivers/:driverId/payout/request
 */
const requestPayout = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { amount, bankAccount, notes } = req.body;
    
    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payout amount',
      });
    }
    
    if (!bankAccount || !bankAccount.accountNumber || !bankAccount.ifscCode || 
        !bankAccount.accountHolderName || !bankAccount.bankName) {
      return res.status(400).json({
        success: false,
        message: 'Bank account details are required',
      });
    }
    
    // Get driver
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }
    
    // Get settings
    const settings = await Settings.findOne();
    const minPayoutThreshold = settings?.payoutConfigurations?.minPayoutThreshold || 500;
    
    // Check available balance
    const allEarnings = await AdminEarnings.find({
      driverId,
      paymentStatus: 'pending'
    });
    const allPayouts = await Payout.find({ 
      driver: driverId, 
      status: { $in: ['COMPLETED', 'PROCESSING', 'PENDING'] } 
    });
    
    const paidEarningIds = new Set();
    allPayouts.forEach(payout => {
      if (!Array.isArray(payout.relatedEarnings)) return;
      payout.relatedEarnings.forEach(earningId => {
        paidEarningIds.add(earningId.toString());
      });
    });
    
    const unpaidEarnings = allEarnings.filter(
      earning => !paidEarningIds.has(earning._id.toString())
    );
    
    const availableBalance = unpaidEarnings.reduce(
      (sum, earning) => sum + (earning.driverEarning || 0), 
      0
    );
    
    const Ride = require('../../Models/Driver/ride.model');
    const unpaidRideIds = unpaidEarnings
      .map((earning) => earning.rideId)
      .filter(Boolean);
    const unpaidRides = await Ride.find({ _id: { $in: unpaidRideIds } }).select('tips');
    const totalTips = unpaidRides.reduce((sum, ride) => sum + (ride.tips || 0), 0);
    const totalAvailable = availableBalance + totalTips;
    
    if (amount > totalAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance for payout',
        data: {
          requested: amount,
          available: totalAvailable,
        },
      });
    }
    
    if (amount < minPayoutThreshold) {
      return res.status(400).json({
        success: false,
        message: `Minimum payout amount is ₹${minPayoutThreshold}`,
      });
    }
    
    // Check for pending payout
    const pendingPayout = await Payout.findOne({
      driver: driverId,
      status: { $in: ['PENDING', 'PROCESSING'] },
    });
    
    if (pendingPayout) {
      return res.status(400).json({
        success: false,
        message: 'You have a pending payout request. Please wait for it to be processed.',
      });
    }
    
    const getRideIdString = (earning) => {
      const rideIdValue = earning?.rideId?._id || earning?.rideId;
      if (!rideIdValue) return null;
      try {
        return rideIdValue.toString();
      } catch (err) {
        return null;
      }
    };

    // Select earnings to include in payout (up to requested amount)
    let remainingAmount = amount;
    const selectedEarnings = [];
    const selectedEarningsDetails = [];
    
    for (const earning of unpaidEarnings) {
      if (remainingAmount <= 0) break;
      
      const earningAmount = earning.driverEarning || 0;
      const rideIdString = getRideIdString(earning);
      const ride = rideIdString
        ? unpaidRides.find(r => r._id && r._id.toString() === rideIdString)
        : null;
      const tips = ride?.tips || 0;
      const totalEarning = earningAmount + tips;
      
      selectedEarnings.push(earning._id);
      selectedEarningsDetails.push({
        earningId: earning._id,
        rideId: rideIdString,
        driverEarning: Math.round(earningAmount * 100) / 100,
        tips: Math.round(tips * 100) / 100,
        total: Math.round(totalEarning * 100) / 100
      });
      remainingAmount -= totalEarning;
    }

    const selectedTotal = selectedEarningsDetails.reduce((sum, item) => sum + (item.total || 0), 0);
    if (selectedTotal < amount) {
      return res.status(400).json({
        success: false,
        message: 'Selected earnings do not cover the requested amount',
        data: {
          requested: amount,
          selectedTotal: Math.round(selectedTotal * 100) / 100
        }
      });
    }
    
    // Generate transaction reference
    const transactionReference = `PAYOUT-${Date.now()}-${driverId.toString().slice(-6)}`;
    
    // Create payout request
    const payout = await Payout.create({
      driver: driverId,
      amount,
      bankAccount,
      status: 'PENDING',
      relatedEarnings: selectedEarnings,
      transactionReference,
      notes,
    });
    
    // Update driver's bank account if provided
    if (bankAccount) {
      driver.bankAccount = bankAccount;
      await driver.save();
    }
    
    logger.info(`Payout request created: ${payout._id}, Driver: ${driverId}, Amount: ₹${amount}`);
    
    res.status(200).json({
      success: true,
      message: 'Payout request submitted successfully. It will be processed within 1-3 business days.',
      data: {
        payout: {
          id: payout._id,
          amount: payout.amount,
          status: payout.status,
          transactionReference: payout.transactionReference,
          requestedAt: payout.requestedAt,
        },
        earningsBreakdown: {
          selectedEarnings: selectedEarningsDetails,
          totalSelected: Math.round(selectedTotal * 100) / 100
        }
      },
    });
  } catch (error) {
    logger.error('Error creating payout request:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payout request',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payout history
 * @route   GET /api/drivers/:driverId/payout/history
 */
const getPayoutHistory = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }
    
    const query = { driver: driverId };
    if (status) {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const payouts = await Payout.find(query)
      .populate('processedBy', 'fullName email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalPayouts = await Payout.countDocuments(query);
    
    // Calculate statistics
    const allPayouts = await Payout.find({ driver: driverId });
    const totalPayoutAmount = allPayouts
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const pendingPayouts = allPayouts.filter(p => p.status === 'PENDING' || p.status === 'PROCESSING');
    const pendingAmount = pendingPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    res.status(200).json({
      success: true,
      data: {
        payouts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPayouts / parseInt(limit)),
          totalPayouts,
          limit: parseInt(limit),
        },
        statistics: {
          totalPayoutAmount: Math.round(totalPayoutAmount * 100) / 100,
          totalPayouts: allPayouts.filter(p => p.status === 'COMPLETED').length,
          pendingAmount: Math.round(pendingAmount * 100) / 100,
          pendingCount: pendingPayouts.length,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching payout history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payout history',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payout by ID
 * @route   GET /api/drivers/:driverId/payout/:payoutId
 */
const getPayoutById = async (req, res) => {
  try {
    const { driverId, payoutId } = req.params;
    
    const payout = await Payout.findOne({
      _id: payoutId,
      driver: driverId,
    })
      .populate('processedBy', 'fullName email')
      .populate('relatedEarnings');
    
    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: { payout },
    });
  } catch (error) {
    logger.error('Error fetching payout:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payout',
      error: error.message,
    });
  }
};

/**
 * @desc    Update bank account
 * @route   PUT /api/drivers/:driverId/payout/bank-account
 */
const updateBankAccount = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { bankAccount } = req.body;
    
    if (!bankAccount || !bankAccount.accountNumber || !bankAccount.ifscCode || 
        !bankAccount.accountHolderName || !bankAccount.bankName) {
      return res.status(400).json({
        success: false,
        message: 'All bank account fields are required',
      });
    }
    
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }
    
    driver.bankAccount = bankAccount;
    await driver.save();
    
    logger.info(`Bank account updated for driver: ${driverId}`);
    
    res.status(200).json({
      success: true,
      message: 'Bank account updated successfully',
      data: {
        bankAccount: driver.bankAccount,
      },
    });
  } catch (error) {
    logger.error('Error updating bank account:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating bank account',
      error: error.message,
    });
  }
};

/**
 * @desc    Get bank account
 * @route   GET /api/drivers/:driverId/payout/bank-account
 */
const getBankAccount = async (req, res) => {
  try {
    const { driverId } = req.params;
    
    const driver = await Driver.findById(driverId).select('bankAccount');
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        bankAccount: driver.bankAccount || null,
      },
    });
  } catch (error) {
    logger.error('Error fetching bank account:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bank account',
      error: error.message,
    });
  }
};

module.exports = {
  getAvailableBalance,
  requestPayout,
  getPayoutHistory,
  getPayoutById,
  updateBankAccount,
  getBankAccount,
};

