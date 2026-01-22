const Driver = require('../../Models/Driver/driver.model');
const Ride = require('../../Models/Driver/ride.model');
const Payout = require('../../Models/Driver/payout.model');
const AdminEarnings = require('../../Models/Admin/adminEarnings.model');
const logger = require('../../utils/logger');

const parseBoolean = (value) => {
  if (value === undefined) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

const listDrivers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isActive, isVerified, isOnline } = req.query;
    const query = {};

    const activeValue = parseBoolean(isActive);
    if (activeValue !== undefined) query.isActive = activeValue;

    const verifiedValue = parseBoolean(isVerified);
    if (verifiedValue !== undefined) query.isVerified = verifiedValue;

    const onlineValue = parseBoolean(isOnline);
    if (onlineValue !== undefined) query.isOnline = onlineValue;

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [drivers, total] = await Promise.all([
      Driver.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)),
      Driver.countDocuments(query),
    ]);

    const driverIds = drivers.map((driver) => driver._id);
    const earningsSummary = await AdminEarnings.aggregate([
      { $match: { driverId: { $in: driverIds } } },
      {
        $group: {
          _id: '$driverId',
          totalEarnings: { $sum: '$driverEarning' }
        }
      }
    ]);

    const earningsMap = earningsSummary.reduce((acc, item) => {
      acc[item._id.toString()] = item.totalEarnings || 0;
      return acc;
    }, {});

    const driversWithEarnings = drivers.map((driver) => ({
      ...driver.toObject(),
      totalEarnings: Math.round((earningsMap[driver._id.toString()] || 0) * 100) / 100
    }));

    res.status(200).json({
      drivers: driversWithEarnings,
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
        total,
        limit: parseInt(limit, 10),
      },
    });
  } catch (error) {
    logger.error('Error fetching drivers:', error);
    res.status(500).json({ message: 'Error fetching drivers', error: error.message });
  }
};

const getDriverDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const [rides, payouts] = await Promise.all([
      Ride.find({ driver: id }).sort({ createdAt: -1 }).limit(20),
      Payout.find({ driver: id }).sort({ requestedAt: -1 }).limit(20),
    ]);

    res.status(200).json({
      driver,
      rides,
      payouts,
    });
  } catch (error) {
    logger.error('Error fetching driver details:', error);
    res.status(500).json({ message: 'Error fetching driver details', error: error.message });
  }
};

const approveDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json({ message: 'Driver approved', driver });
  } catch (error) {
    logger.error('Error approving driver:', error);
    res.status(500).json({ message: 'Error approving driver', error: error.message });
  }
};

const rejectDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json({ message: 'Driver rejected', driver });
  } catch (error) {
    logger.error('Error rejecting driver:', error);
    res.status(500).json({ message: 'Error rejecting driver', error: error.message });
  }
};

const blockDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const activeValue = parseBoolean(isActive);
    if (activeValue === undefined) {
      return res.status(400).json({ message: 'isActive must be true or false' });
    }

    const driver = await Driver.findByIdAndUpdate(
      id,
      { isActive: activeValue },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json({ message: 'Driver status updated', driver });
  } catch (error) {
    logger.error('Error updating driver status:', error);
    res.status(500).json({ message: 'Error updating driver status', error: error.message });
  }
};

const verifyDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const verifiedValue = parseBoolean(isVerified);
    if (verifiedValue === undefined) {
      return res.status(400).json({ message: 'isVerified must be true or false' });
    }

    const driver = await Driver.findByIdAndUpdate(
      id,
      { isVerified: verifiedValue },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json({ message: 'Driver verification updated', driver });
  } catch (error) {
    logger.error('Error verifying driver:', error);
    res.status(500).json({ message: 'Error verifying driver', error: error.message });
  }
};

const getDriverDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id).select('documents');

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json({ documents: driver.documents || [] });
  } catch (error) {
    logger.error('Error fetching driver documents:', error);
    res.status(500).json({ message: 'Error fetching driver documents', error: error.message });
  }
};

module.exports = {
  listDrivers,
  getDriverDetails,
  approveDriver,
  rejectDriver,
  blockDriver,
  verifyDriver,
  getDriverDocuments,
};

