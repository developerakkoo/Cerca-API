const AdminEarnings = require('../../Models/Admin/adminEarnings.model');
const Driver = require('../../Models/Driver/driver.model');
const Ride = require('../../Models/Driver/ride.model');
const Payout = require('../../Models/Driver/payout.model');
const logger = require('../../utils/logger');

/**
 * @desc    List all driver earnings with filters
 * @route   GET /api/admin/drivers/earnings
 */
const listDriverEarnings = async (req, res) => {
  try {
    const {
      driverId,
      status, // 'pending', 'completed', 'failed', 'refunded'
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    // Build filter
    const filter = {};
    if (driverId) filter.driverId = driverId;
    if (status) filter.paymentStatus = status;

    // Date range filter
    if (startDate || endDate) {
      filter.rideDate = {};
      if (startDate) filter.rideDate.$gte = new Date(startDate);
      if (endDate) filter.rideDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get earnings with pagination
    const [earnings, total] = await Promise.all([
      AdminEarnings.find(filter)
        .populate('driverId', 'name phone email')
        .populate('riderId', 'fullName phoneNumber')
        .populate('rideId', 'fare tips pickupAddress dropoffAddress')
        .sort({ rideDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AdminEarnings.countDocuments(filter),
    ]);

    // Format response
    const earningsList = earnings.map(earning => ({
      id: earning._id,
      rideId: earning.rideId?._id || earning.rideId,
      driver: earning.driverId ? {
        id: earning.driverId._id,
        name: earning.driverId.name,
        phone: earning.driverId.phone,
        email: earning.driverId.email,
      } : null,
      rider: earning.riderId ? {
        id: earning.riderId._id,
        name: earning.riderId.fullName,
        phone: earning.riderId.phoneNumber,
      } : null,
      grossFare: earning.grossFare,
      platformFee: earning.platformFee,
      driverEarning: earning.driverEarning,
      paymentStatus: earning.paymentStatus,
      rideDate: earning.rideDate,
      createdAt: earning.createdAt,
      updatedAt: earning.updatedAt,
      ride: earning.rideId ? {
        fare: earning.rideId.fare,
        tips: earning.rideId.tips || 0,
        pickupAddress: earning.rideId.pickupAddress,
        dropoffAddress: earning.rideId.dropoffAddress,
      } : null,
    }));

    res.status(200).json({
      success: true,
      data: {
        earnings: earningsList,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalEarnings: total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    logger.error('Error listing driver earnings:', error);
    res.status(500).json({
      success: false,
      message: 'Error listing driver earnings',
      error: error.message,
    });
  }
};

/**
 * @desc    Get earnings for specific driver
 * @route   GET /api/admin/drivers/:driverId/earnings
 */
const getDriverEarningsById = async (req, res) => {
  try {
    const { driverId } = req.params;
    const {
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    // Verify driver exists
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found',
      });
    }

    // Build filter
    const filter = { driverId };
    if (status) filter.paymentStatus = status;

    // Date range filter
    if (startDate || endDate) {
      filter.rideDate = {};
      if (startDate) filter.rideDate.$gte = new Date(startDate);
      if (endDate) filter.rideDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get earnings
    const [earnings, total] = await Promise.all([
      AdminEarnings.find(filter)
        .populate('riderId', 'fullName phoneNumber')
        .populate('rideId', 'fare tips pickupAddress dropoffAddress')
        .sort({ rideDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AdminEarnings.countDocuments(filter),
    ]);

    // Calculate totals
    const allEarnings = await AdminEarnings.find({ driverId });
    const totalGrossEarnings = allEarnings.reduce((sum, e) => sum + (e.grossFare || 0), 0);
    const totalDriverEarnings = allEarnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);
    const pendingEarnings = allEarnings.filter(e => e.paymentStatus === 'pending');
    const completedEarnings = allEarnings.filter(e => e.paymentStatus === 'completed');
    const totalPendingEarnings = pendingEarnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);
    const totalCompletedEarnings = completedEarnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);

    // Format response
    const earningsList = earnings.map(earning => ({
      id: earning._id,
      rideId: earning.rideId?._id || earning.rideId,
      rider: earning.riderId ? {
        id: earning.riderId._id,
        name: earning.riderId.fullName,
        phone: earning.riderId.phoneNumber,
      } : null,
      grossFare: earning.grossFare,
      platformFee: earning.platformFee,
      driverEarning: earning.driverEarning,
      paymentStatus: earning.paymentStatus,
      rideDate: earning.rideDate,
      createdAt: earning.createdAt,
      updatedAt: earning.updatedAt,
      ride: earning.rideId ? {
        fare: earning.rideId.fare,
        tips: earning.rideId.tips || 0,
        pickupAddress: earning.rideId.pickupAddress,
        dropoffAddress: earning.rideId.dropoffAddress,
      } : null,
    }));

    res.status(200).json({
      success: true,
      data: {
        driver: {
          id: driver._id,
          name: driver.name,
          phone: driver.phone,
          email: driver.email,
        },
        earnings: earningsList,
        summary: {
          totalEarnings: allEarnings.length,
          totalGrossEarnings: Math.round(totalGrossEarnings * 100) / 100,
          totalDriverEarnings: Math.round(totalDriverEarnings * 100) / 100,
          totalPendingEarnings: Math.round(totalPendingEarnings * 100) / 100,
          totalCompletedEarnings: Math.round(totalCompletedEarnings * 100) / 100,
          pendingCount: pendingEarnings.length,
          completedCount: completedEarnings.length,
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalEarnings: total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching driver earnings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching driver earnings',
      error: error.message,
    });
  }
};

/**
 * @desc    Update single earning payment status
 * @route   PATCH /api/admin/drivers/earnings/:earningId/status
 */
const updateEarningStatus = async (req, res) => {
  try {
    const { earningId } = req.params;
    const { paymentStatus, notes } = req.body;

    // Validate payment status
    const validStatuses = ['pending', 'completed', 'failed', 'refunded'];
    if (!paymentStatus || !validStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Find earning
    const earning = await AdminEarnings.findById(earningId);
    if (!earning) {
      return res.status(404).json({
        success: false,
        message: 'Earning not found',
      });
    }

    // Update status
    const oldStatus = earning.paymentStatus;
    earning.paymentStatus = paymentStatus;
    await earning.save();

    // Log notes if provided (for audit trail)
    if (notes) {
      logger.info(
        `Earning ${earningId} status change notes by admin ${req.adminId}: ${notes}`
      );
    }

    logger.info(
      `Earning ${earningId} status updated from ${oldStatus} to ${paymentStatus} by admin ${req.adminId}`
    );

    res.status(200).json({
      success: true,
      message: 'Earning status updated successfully',
      data: {
        id: earning._id,
        paymentStatus: earning.paymentStatus,
        previousStatus: oldStatus,
        updatedAt: earning.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error updating earning status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating earning status',
      error: error.message,
    });
  }
};

/**
 * @desc    Bulk update payment status for multiple earnings
 * @route   PATCH /api/admin/drivers/earnings/bulk-status
 */
const bulkUpdateEarningStatus = async (req, res) => {
  try {
    const { earningIds, paymentStatus, notes } = req.body;

    // Validate input
    if (!Array.isArray(earningIds) || earningIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'earningIds must be a non-empty array',
      });
    }

    const validStatuses = ['pending', 'completed', 'failed', 'refunded'];
    if (!paymentStatus || !validStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Update all earnings
    const updateResult = await AdminEarnings.updateMany(
      { _id: { $in: earningIds } },
      {
        $set: {
          paymentStatus: paymentStatus,
        },
      }
    );

    // Log notes if provided (for audit trail)
    if (notes) {
      logger.info(
        `Bulk status change notes by admin ${req.adminId}: ${notes}`
      );
    }

    logger.info(
      `Bulk updated ${updateResult.modifiedCount} earnings to status ${paymentStatus} by admin ${req.adminId}`
    );

    res.status(200).json({
      success: true,
      message: `Successfully updated ${updateResult.modifiedCount} earnings`,
      data: {
        updatedCount: updateResult.modifiedCount,
        requestedCount: earningIds.length,
        paymentStatus,
      },
    });
  } catch (error) {
    logger.error('Error bulk updating earning status:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk updating earning status',
      error: error.message,
    });
  }
};

/**
 * @desc    Get earnings statistics
 * @route   GET /api/admin/drivers/earnings/stats
 */
const getEarningsStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.rideDate = {};
      if (startDate) dateFilter.rideDate.$gte = new Date(startDate);
      if (endDate) dateFilter.rideDate.$lte = new Date(endDate);
    }

    // Get all earnings for stats
    const earnings = await AdminEarnings.find(dateFilter);

    // Calculate statistics
    const totalEarnings = earnings.length;
    const totalGrossEarnings = earnings.reduce((sum, e) => sum + (e.grossFare || 0), 0);
    const totalPlatformFees = earnings.reduce((sum, e) => sum + (e.platformFee || 0), 0);
    const totalDriverEarnings = earnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);

    // Status breakdown
    const pendingEarnings = earnings.filter(e => e.paymentStatus === 'pending');
    const completedEarnings = earnings.filter(e => e.paymentStatus === 'completed');
    const failedEarnings = earnings.filter(e => e.paymentStatus === 'failed');
    const refundedEarnings = earnings.filter(e => e.paymentStatus === 'refunded');

    const totalPendingAmount = pendingEarnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);
    const totalCompletedAmount = completedEarnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);
    const totalFailedAmount = failedEarnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);
    const totalRefundedAmount = refundedEarnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);

    // Driver breakdown (top 10 earning drivers)
    const driverMap = new Map();
    earnings.forEach(earning => {
      const driverId = earning.driverId.toString();
      if (!driverMap.has(driverId)) {
        driverMap.set(driverId, {
          driverId,
          totalEarnings: 0,
          pendingAmount: 0,
          completedAmount: 0,
          rideCount: 0,
        });
      }
      const driverData = driverMap.get(driverId);
      driverData.totalEarnings += earning.driverEarning || 0;
      driverData.rideCount += 1;
      if (earning.paymentStatus === 'pending') {
        driverData.pendingAmount += earning.driverEarning || 0;
      } else if (earning.paymentStatus === 'completed') {
        driverData.completedAmount += earning.driverEarning || 0;
      }
    });

    const topDrivers = Array.from(driverMap.values())
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, 10)
      .map(driverData => ({
        driverId: driverData.driverId,
        totalEarnings: Math.round(driverData.totalEarnings * 100) / 100,
        pendingAmount: Math.round(driverData.pendingAmount * 100) / 100,
        completedAmount: Math.round(driverData.completedAmount * 100) / 100,
        rideCount: driverData.rideCount,
      }));

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalEarnings,
          totalGrossEarnings: Math.round(totalGrossEarnings * 100) / 100,
          totalPlatformFees: Math.round(totalPlatformFees * 100) / 100,
          totalDriverEarnings: Math.round(totalDriverEarnings * 100) / 100,
        },
        statusBreakdown: {
          pending: {
            count: pendingEarnings.length,
            amount: Math.round(totalPendingAmount * 100) / 100,
          },
          completed: {
            count: completedEarnings.length,
            amount: Math.round(totalCompletedAmount * 100) / 100,
          },
          failed: {
            count: failedEarnings.length,
            amount: Math.round(totalFailedAmount * 100) / 100,
          },
          refunded: {
            count: refundedEarnings.length,
            amount: Math.round(totalRefundedAmount * 100) / 100,
          },
        },
        topDrivers,
      },
    });
  } catch (error) {
    logger.error('Error fetching earnings statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching earnings statistics',
      error: error.message,
    });
  }
};

/**
 * @desc    Get driver earnings analytics for admin dashboard
 * @route   GET /api/admin/drivers/earnings/analytics
 */
const getEarningsAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.rideDate = {};
      if (startDate) dateFilter.rideDate.$gte = new Date(startDate);
      if (endDate) dateFilter.rideDate.$lte = new Date(endDate);
    }

    const [earnings, payoutSummary, topDrivers] = await Promise.all([
      AdminEarnings.find(dateFilter).select('platformFee driverEarning'),
      Payout.aggregate([
        {
          $group: {
            _id: '$status',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),
      AdminEarnings.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$driverId',
            totalEarnings: { $sum: '$driverEarning' },
            rideCount: { $sum: 1 }
          }
        },
        { $sort: { totalEarnings: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'drivers',
            localField: '_id',
            foreignField: '_id',
            as: 'driver'
          }
        },
        { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            driverId: '$_id',
            totalEarnings: 1,
            rideCount: 1,
            name: '$driver.name',
            phone: '$driver.phone'
          }
        }
      ])
    ]);

    const totalPlatformRevenue = earnings.reduce((sum, e) => sum + (e.platformFee || 0), 0);
    const totalDriverEarnings = earnings.reduce((sum, e) => sum + (e.driverEarning || 0), 0);

    const payoutMap = payoutSummary.reduce((acc, item) => {
      acc[item._id] = item;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        totals: {
          totalPlatformRevenue: Math.round(totalPlatformRevenue * 100) / 100,
          totalDriverEarnings: Math.round(totalDriverEarnings * 100) / 100,
          totalDriverPayouts: Math.round((payoutMap.COMPLETED?.totalAmount || 0) * 100) / 100
        },
        payouts: {
          pendingCount: (payoutMap.PENDING?.count || 0) + (payoutMap.PROCESSING?.count || 0),
          pendingAmount: Math.round(((payoutMap.PENDING?.totalAmount || 0) + (payoutMap.PROCESSING?.totalAmount || 0)) * 100) / 100
        },
        topDrivers: topDrivers.map((driver) => ({
          driverId: driver.driverId,
          name: driver.name || 'Unknown',
          phone: driver.phone || '',
          totalEarnings: Math.round((driver.totalEarnings || 0) * 100) / 100,
          rideCount: driver.rideCount || 0
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching earnings analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching earnings analytics',
      error: error.message
    });
  }
};

module.exports = {
  listDriverEarnings,
  getDriverEarningsById,
  updateEarningStatus,
  bulkUpdateEarningStatus,
  getEarningsStats,
  getEarningsAnalytics,
};

