const User = require('../../Models/User/user.model');
const Driver = require('../../Models/Driver/driver.model');
const Ride = require('../../Models/Driver/ride.model');
const Emergency = require('../../Models/User/emergency.model');
const AdminEarnings = require('../../Models/Admin/adminEarnings.model');
const logger = require('../../utils/logger');

const buildDateFilter = (startDate, endDate) => {
  const filter = {};
  if (startDate) {
    filter.$gte = new Date(startDate);
  }
  if (endDate) {
    filter.$lte = new Date(endDate);
  }
  return Object.keys(filter).length ? filter : null;
};

const getDashboard = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateRange = buildDateFilter(startDate, endDate);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeUsers,
      newUsersToday,
      totalDrivers,
      activeDrivers,
      onlineDrivers,
      pendingDrivers,
      totalRides,
      activeRides,
      completedRides,
      activeEmergencies,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
      Driver.countDocuments({}),
      Driver.countDocuments({ isActive: true }),
      Driver.countDocuments({ isOnline: true }),
      Driver.countDocuments({ isActive: false }),
      Ride.countDocuments({}),
      Ride.countDocuments({ status: { $in: ['requested', 'accepted', 'in_progress'] } }),
      Ride.countDocuments({ status: 'completed' }),
      Emergency.countDocuments({ status: 'active' }),
    ]);

    const earningsMatch = dateRange ? { rideDate: dateRange } : {};
    const earningsAgg = await AdminEarnings.aggregate([
      { $match: earningsMatch },
      {
        $group: {
          _id: null,
          totalPlatformEarnings: { $sum: '$platformFee' },
          totalGrossFare: { $sum: '$grossFare' },
          totalDriverEarnings: { $sum: '$driverEarning' },
          totalRides: { $sum: 1 },
        },
      },
    ]);
    const earnings = earningsAgg[0] || {
      totalPlatformEarnings: 0,
      totalGrossFare: 0,
      totalDriverEarnings: 0,
      totalRides: 0,
    };

    const recentRides = await Ride.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('rider', 'fullName')
      .populate('driver', 'name')
      .select('status fare createdAt rider driver');

    const recentActivities = recentRides.map((ride) => ({
      type: 'ride',
      message: `Ride ${ride.status} - ${ride.rider?.fullName || 'Rider'} with ${ride.driver?.name || 'Driver'}`,
      time: ride.createdAt,
      fare: ride.fare || 0,
    }));

    res.status(200).json({
      stats: {
        totalUsers,
        activeUsers,
        newUsersToday,
        totalDrivers,
        activeDrivers,
        onlineDrivers,
        pendingDrivers,
        totalRides,
        activeRides,
        completedRides,
        activeEmergencies,
      },
      revenue: {
        totalPlatformEarnings: Math.round(earnings.totalPlatformEarnings * 100) / 100,
        totalGrossFare: Math.round(earnings.totalGrossFare * 100) / 100,
        totalDriverEarnings: Math.round(earnings.totalDriverEarnings * 100) / 100,
        totalRides: earnings.totalRides,
      },
      recentActivities,
    });
  } catch (error) {
    logger.error('Error fetching admin dashboard:', error);
    res.status(500).json({ message: 'Error fetching admin dashboard', error: error.message });
  }
};

module.exports = { getDashboard };

