const Driver = require('../../Models/Driver/driver.model');
const AdminEarnings = require('../../Models/Admin/adminEarnings.model');
const Ride = require('../../Models/Driver/ride.model');
const Settings = require('../../Models/Admin/settings.modal');
const logger = require('../../utils/logger');

/**
 * @desc    Get driver earnings dashboard
 * @route   GET /api/drivers/:driverId/earnings
 */
const getDriverEarnings = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { 
      period = 'all', // 'today', 'week', 'month', 'year', 'all'
      startDate,
      endDate,
    } = req.query;
    
    logger.info(`getDriverEarnings: Fetching earnings for driverId: ${driverId}`, {
      period,
      startDate,
      endDate
    });
    
    // Verify driver exists
    const driver = await Driver.findById(driverId);
    if (!driver) {
      logger.warn(`getDriverEarnings: Driver not found - driverId: ${driverId}`);
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }
    
    logger.info(`getDriverEarnings: Driver found - driverId: ${driverId}, name: ${driver.fullName || 'N/A'}`);
    
    // Get settings for commission calculation
    const settings = await Settings.findOne();
    if (!settings) {
      logger.error('getDriverEarnings: Settings not found');
      return res.status(500).json({
        success: false,
        message: 'Settings not found',
      });
    }
    
    const { platformFees, driverCommissions } = settings.pricingConfigurations;
    logger.info(`getDriverEarnings: Settings loaded - platformFees: ${platformFees}%, driverCommissions: ${driverCommissions}%`);
    
    // Build date filter
    const dateFilter = { driverId };
    let periodStart, periodEnd;
    
    if (startDate && endDate) {
      dateFilter.rideDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
      logger.info(`getDriverEarnings: Custom date range - start: ${periodStart.toISOString()}, end: ${periodEnd.toISOString()}`);
    } else {
      const now = new Date();
      switch (period) {
        case 'today':
          periodStart = new Date(now.setHours(0, 0, 0, 0));
          periodEnd = new Date(now.setHours(23, 59, 59, 999));
          dateFilter.rideDate = { $gte: periodStart, $lte: periodEnd };
          break;
        case 'week':
          periodStart = new Date(now);
          periodStart.setDate(now.getDate() - 7);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date();
          dateFilter.rideDate = { $gte: periodStart, $lte: periodEnd };
          break;
        case 'month':
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          periodEnd.setHours(23, 59, 59, 999);
          dateFilter.rideDate = { $gte: periodStart, $lte: periodEnd };
          break;
        case 'year':
          periodStart = new Date(now.getFullYear(), 0, 1);
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(now.getFullYear(), 11, 31);
          periodEnd.setHours(23, 59, 59, 999);
          dateFilter.rideDate = { $gte: periodStart, $lte: periodEnd };
          break;
        default:
          // 'all' - no date filter
          logger.info(`getDriverEarnings: No date filter applied (period: ${period})`);
          break;
      }
      if (periodStart && periodEnd) {
        logger.info(`getDriverEarnings: Period filter - start: ${periodStart.toISOString()}, end: ${periodEnd.toISOString()}`);
      }
    }
    
    logger.info(`getDriverEarnings: Query filter:`, JSON.stringify(dateFilter, null, 2));
    
    // Get earnings from AdminEarnings
    const earnings = await AdminEarnings.find(dateFilter)
      .populate('rideId', 'fare tips discount distanceInKm pickupAddress dropoffAddress')
      .populate('riderId', 'fullName')
      .sort({ rideDate: -1 });
    
    logger.info(`getDriverEarnings: Found ${earnings.length} earnings records for driverId: ${driverId}`);
    
    // Calculate totals
    const totalGrossEarnings = earnings.reduce((sum, e) => sum + (e.grossFare || 0), 0);
    const totalPlatformFees = earnings.reduce((sum, e) => sum + (e.platformFee || 0), 0);
    const totalDriverEarnings = earnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);
    const totalRides = earnings.length;
    
    logger.info(`getDriverEarnings: Calculated totals - totalRides: ${totalRides}, totalGrossEarnings: ₹${totalGrossEarnings}, totalDriverEarnings: ₹${totalDriverEarnings}`);
    
    // Calculate payment status totals
    const pendingEarnings = earnings.filter(e => e.paymentStatus === 'pending');
    const completedEarnings = earnings.filter(e => e.paymentStatus === 'completed');
    const totalPendingEarnings = pendingEarnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);
    const totalCompletedEarnings = completedEarnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);
    const pendingEarningsCount = pendingEarnings.length;
    const completedEarningsCount = completedEarnings.length;
    
    logger.info(`getDriverEarnings: Payment status breakdown - pending: ${pendingEarningsCount} (₹${totalPendingEarnings}), completed: ${completedEarningsCount} (₹${totalCompletedEarnings})`);
    
    const getRideIdString = (earning) => {
      // Handle null/undefined earning
      if (!earning) {
        logger.warn('getDriverEarnings: Earning is null or undefined');
        return null;
      }
      
      // Try to get rideId value with multiple fallbacks
      let rideIdValue = null;
      if (earning.rideId) {
        if (earning.rideId._id) {
          rideIdValue = earning.rideId._id;
        } else if (earning.rideId.toString) {
          rideIdValue = earning.rideId;
        }
      }
      
      // If still no rideId, return null
      if (!rideIdValue) {
        logger.debug('getDriverEarnings: No rideId found for earning', {
          earningId: earning._id?.toString() || 'unknown',
        });
        return null;
      }
      
      // Safely convert to string
      try {
        if (typeof rideIdValue === 'string') {
          return rideIdValue;
        }
        if (rideIdValue && typeof rideIdValue.toString === 'function') {
          return rideIdValue.toString();
        }
        logger.warn('getDriverEarnings: rideIdValue is not stringifiable', {
          rideIdValue,
          type: typeof rideIdValue,
        });
        return null;
      } catch (err) {
        logger.warn('getDriverEarnings: Failed to stringify rideId', {
          rideIdValue,
          error: err?.message,
          earningId: earning._id?.toString() || 'unknown',
        });
        return null;
      }
    };

    // Calculate tips (from rides)
    const rideIds = earnings
      .map(getRideIdString)
      .filter(Boolean);
    const rides = rideIds.length > 0 
      ? await Ride.find({ _id: { $in: rideIds } }).select('tips')
      : [];
    const totalTips = rides.reduce((sum, ride) => sum + (ride.tips || 0), 0);
    
    // Calculate bonuses (if any - can be added later)
    const totalBonuses = 0; // Placeholder for future bonus system
    
    // Calculate net earnings (driver earnings + tips + bonuses)
    const netEarnings = totalDriverEarnings + totalTips + totalBonuses;
    
    // Calculate averages
    const averageGrossPerRide = totalRides > 0 ? (totalGrossEarnings / totalRides) : 0;
    const averageNetPerRide = totalRides > 0 ? (netEarnings / totalRides) : 0;
    
    // Daily breakdown
    const dailyBreakdown = [];
    const dailyMap = new Map();
    
    earnings.forEach(earning => {
      const date = new Date(earning.rideDate);
      const dateKey = date.toISOString().split('T')[0];
      
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          rides: 0,
          grossEarnings: 0,
          driverEarnings: 0,
          tips: 0,
          netEarnings: 0,
        });
      }
      
      const dayData = dailyMap.get(dateKey);
      dayData.rides += 1;
      dayData.grossEarnings += earning.grossFare || 0;
      dayData.driverEarnings += earning.driverEarning || 0;
      
      // Get tips for this ride
      const rideIdString = getRideIdString(earning);
      let ride = null;
      if (rideIdString) {
        try {
          ride = rides.find(r => {
            if (!r || !r._id) return false;
            try {
              return r._id.toString() === rideIdString;
            } catch (err) {
              logger.warn('getDriverEarnings: Failed to compare rideId in daily breakdown', {
                rideId: r._id,
                error: err?.message,
              });
              return false;
            }
          });
        } catch (err) {
          logger.warn('getDriverEarnings: Error finding ride in daily breakdown', {
            rideIdString,
            error: err?.message,
          });
        }
      }
      if (ride) {
        dayData.tips += ride.tips || 0;
      }
      
      dayData.netEarnings = dayData.driverEarnings + dayData.tips;
    });
    
    dailyMap.forEach((value) => {
      dailyBreakdown.push({
        date: value.date,
        rides: value.rides,
        grossEarnings: Math.round(value.grossEarnings * 100) / 100,
        driverEarnings: Math.round(value.driverEarnings * 100) / 100,
        tips: Math.round(value.tips * 100) / 100,
        netEarnings: Math.round(value.netEarnings * 100) / 100,
      });
    });
    
    dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date));
    
    // Weekly breakdown
    const weeklyBreakdown = [];
    const weeklyMap = new Map();
    
    earnings.forEach(earning => {
      const date = new Date(earning.rideDate);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          weekStart: weekKey,
          rides: 0,
          grossEarnings: 0,
          driverEarnings: 0,
          tips: 0,
          netEarnings: 0,
        });
      }
      
      const weekData = weeklyMap.get(weekKey);
      weekData.rides += 1;
      weekData.grossEarnings += earning.grossFare || 0;
      weekData.driverEarnings += earning.driverEarning || 0;
      
      const rideIdString = getRideIdString(earning);
      let ride = null;
      if (rideIdString) {
        try {
          ride = rides.find(r => {
            if (!r || !r._id) return false;
            try {
              return r._id.toString() === rideIdString;
            } catch (err) {
              logger.warn('getDriverEarnings: Failed to compare rideId in weekly breakdown', {
                rideId: r._id,
                error: err?.message,
              });
              return false;
            }
          });
        } catch (err) {
          logger.warn('getDriverEarnings: Error finding ride in weekly breakdown', {
            rideIdString,
            error: err?.message,
          });
        }
      }
      if (ride) {
        weekData.tips += ride.tips || 0;
      }
      
      weekData.netEarnings = weekData.driverEarnings + weekData.tips;
    });
    
    weeklyMap.forEach((value) => {
      weeklyBreakdown.push({
        weekStart: value.weekStart,
        rides: value.rides,
        grossEarnings: Math.round(value.grossEarnings * 100) / 100,
        driverEarnings: Math.round(value.driverEarnings * 100) / 100,
        tips: Math.round(value.tips * 100) / 100,
        netEarnings: Math.round(value.netEarnings * 100) / 100,
      });
    });
    
    weeklyBreakdown.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    
    // Monthly breakdown
    const monthlyBreakdown = [];
    const monthlyMap = new Map();
    
    earnings.forEach(earning => {
      const date = new Date(earning.rideDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          month: monthKey,
          rides: 0,
          grossEarnings: 0,
          driverEarnings: 0,
          tips: 0,
          netEarnings: 0,
        });
      }
      
      const monthData = monthlyMap.get(monthKey);
      monthData.rides += 1;
      monthData.grossEarnings += earning.grossFare || 0;
      monthData.driverEarnings += earning.driverEarning || 0;
      
      const rideIdString = getRideIdString(earning);
      let ride = null;
      if (rideIdString) {
        try {
          ride = rides.find(r => {
            if (!r || !r._id) return false;
            try {
              return r._id.toString() === rideIdString;
            } catch (err) {
              logger.warn('getDriverEarnings: Failed to compare rideId in monthly breakdown', {
                rideId: r._id,
                error: err?.message,
              });
              return false;
            }
          });
        } catch (err) {
          logger.warn('getDriverEarnings: Error finding ride in monthly breakdown', {
            rideIdString,
            error: err?.message,
          });
        }
      }
      if (ride) {
        monthData.tips += ride.tips || 0;
      }
      
      monthData.netEarnings = monthData.driverEarnings + monthData.tips;
    });
    
    monthlyMap.forEach((value) => {
      monthlyBreakdown.push({
        month: value.month,
        rides: value.rides,
        grossEarnings: Math.round(value.grossEarnings * 100) / 100,
        driverEarnings: Math.round(value.driverEarnings * 100) / 100,
        tips: Math.round(value.tips * 100) / 100,
        netEarnings: Math.round(value.netEarnings * 100) / 100,
      });
    });
    
    monthlyBreakdown.sort((a, b) => a.month.localeCompare(b.month));
    
    // Recent rides (last 10)
    const recentRides = earnings.slice(0, 10).map(earning => {
      const rideIdString = getRideIdString(earning);
      let ride = null;
      if (rideIdString) {
        try {
          ride = rides.find(r => {
            if (!r || !r._id) return false;
            try {
              return r._id.toString() === rideIdString;
            } catch (err) {
              logger.warn('getDriverEarnings: Failed to compare rideId in recent rides', {
                rideId: r._id,
                error: err?.message,
              });
              return false;
            }
          });
        } catch (err) {
          logger.warn('getDriverEarnings: Error finding ride in recent rides', {
            rideIdString,
            error: err?.message,
          });
        }
      }
      
      return {
        rideId: rideIdString,
        date: earning.rideDate,
        grossFare: earning.grossFare,
        driverEarning: earning.driverEarning,
        platformFee: earning.platformFee,
        tips: ride?.tips || 0,
        paymentStatus: earning.paymentStatus || 'pending',
        rider: earning.riderId ? {
          name: earning.riderId.fullName,
        } : null,
        pickupAddress: earning.rideId?.pickupAddress,
        dropoffAddress: earning.rideId?.dropoffAddress,
      };
    });
    
    res.status(200).json({
      success: true,
      data: {
        period: {
          type: period,
          start: periodStart,
          end: periodEnd,
        },
        summary: {
          totalRides,
          totalGrossEarnings: Math.round(totalGrossEarnings * 100) / 100,
          totalPlatformFees: Math.round(totalPlatformFees * 100) / 100,
          totalDriverEarnings: Math.round(totalDriverEarnings * 100) / 100,
          totalTips: Math.round(totalTips * 100) / 100,
          totalBonuses: Math.round(totalBonuses * 100) / 100,
          netEarnings: Math.round(netEarnings * 100) / 100,
          averageGrossPerRide: Math.round(averageGrossPerRide * 100) / 100,
          averageNetPerRide: Math.round(averageNetPerRide * 100) / 100,
          // Payment status summary
          totalPendingEarnings: Math.round(totalPendingEarnings * 100) / 100,
          totalCompletedEarnings: Math.round(totalCompletedEarnings * 100) / 100,
          pendingEarningsCount,
          completedEarningsCount,
        },
        commission: {
          platformFeePercentage: platformFees || 0,
          driverCommissionPercentage: driverCommissions || 0,
        },
        breakdown: {
          daily: dailyBreakdown,
          weekly: weeklyBreakdown,
          monthly: monthlyBreakdown,
        },
        recentRides,
      },
    });
    
    logger.info(`getDriverEarnings: Successfully returned earnings data for driverId: ${driverId}`);
  } catch (error) {
    const errorDriverId = req.params?.driverId || 'unknown';
    logger.error(`getDriverEarnings: Error fetching driver earnings for driverId: ${errorDriverId}`, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching driver earnings',
      error: error.message,
    });
  }
};

/**
 * @desc    Get driver payment history
 * @route   GET /api/drivers/:driverId/earnings/payments
 */
const getPaymentHistory = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    // Verify driver exists
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get earnings (payment history)
    const earnings = await AdminEarnings.find({ driverId })
      .populate('rideId', 'fare tips pickupAddress dropoffAddress')
      .populate('riderId', 'fullName')
      .sort({ rideDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalEarnings = await AdminEarnings.countDocuments({ driverId });
    
    const paymentHistory = earnings.map(earning => ({
      id: earning._id,
      rideId: earning.rideId?._id || earning.rideId,
      date: earning.rideDate,
      grossFare: earning.grossFare,
      driverEarning: earning.driverEarning,
      platformFee: earning.platformFee,
      tips: earning.rideId?.tips || 0,
      netAmount: earning.driverEarning + (earning.rideId?.tips || 0),
      rider: earning.riderId ? {
        name: earning.riderId.fullName,
      } : null,
      pickupAddress: earning.rideId?.pickupAddress,
      dropoffAddress: earning.rideId?.dropoffAddress,
      paymentStatus: earning.paymentStatus,
    }));
    
    res.status(200).json({
      success: true,
      data: {
        payments: paymentHistory,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalEarnings / parseInt(limit)),
          totalPayments: totalEarnings,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment history',
      error: error.message,
    });
  }
};

module.exports = {
  getDriverEarnings,
  getPaymentHistory,
};

