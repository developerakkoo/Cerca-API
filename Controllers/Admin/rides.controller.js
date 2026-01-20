const Ride = require('../../Models/Driver/ride.model');
const Driver = require('../../Models/Driver/driver.model');
const logger = require('../../utils/logger');

const listRides = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      riderId,
      driverId,
      startDate,
      endDate,
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (riderId) query.rider = riderId;
    if (driverId) query.driver = driverId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [rides, total] = await Promise.all([
      Ride.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .populate('rider', 'fullName phoneNumber')
        .populate('driver', 'name phone'),
      Ride.countDocuments(query),
    ]);

    res.status(200).json({
      rides,
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
        total,
        limit: parseInt(limit, 10),
      },
    });
  } catch (error) {
    logger.error('Error fetching rides:', error);
    res.status(500).json({ message: 'Error fetching rides', error: error.message });
  }
};

const getRideById = async (req, res) => {
  try {
    const { id } = req.params;
    const ride = await Ride.findById(id)
      .populate('rider', 'fullName phoneNumber')
      .populate('driver', 'name phone');

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    res.status(200).json({ ride });
  } catch (error) {
    logger.error('Error fetching ride:', error);
    res.status(500).json({ message: 'Error fetching ride', error: error.message });
  }
};

const cancelRide = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, cancellationFee } = req.body;

    const ride = await Ride.findById(id);
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    ride.status = 'cancelled';
    ride.cancelledBy = 'system';
    if (reason) ride.cancellationReason = reason;
    if (cancellationFee !== undefined) ride.cancellationFee = cancellationFee;
    await ride.save();

    res.status(200).json({ message: 'Ride cancelled', ride });
  } catch (error) {
    logger.error('Error cancelling ride:', error);
    res.status(500).json({ message: 'Error cancelling ride', error: error.message });
  }
};

const assignDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({ message: 'driverId is required' });
    }

    const [ride, driver] = await Promise.all([
      Ride.findById(id),
      Driver.findById(driverId),
    ]);

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    ride.driver = driverId;
    ride.status = 'accepted';
    await ride.save();

    res.status(200).json({ message: 'Driver assigned', ride });
  } catch (error) {
    logger.error('Error assigning driver:', error);
    res.status(500).json({ message: 'Error assigning driver', error: error.message });
  }
};

const getRideTimeline = async (req, res) => {
  try {
    const { id } = req.params;
    const ride = await Ride.findById(id);

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    const events = [
      { label: 'Ride Requested', time: ride.createdAt },
      { label: 'Driver Assigned', time: ride.driver ? ride.updatedAt : null },
      { label: 'Driver Arrived', time: ride.driverArrivedAt },
      { label: 'Ride Started', time: ride.actualStartTime },
      { label: 'Ride Completed', time: ride.actualEndTime },
      { label: 'Ride Cancelled', time: ride.status === 'cancelled' ? ride.updatedAt : null },
    ].filter((event) => event.time);

    res.status(200).json({ events });
  } catch (error) {
    logger.error('Error fetching ride timeline:', error);
    res.status(500).json({ message: 'Error fetching ride timeline', error: error.message });
  }
};

module.exports = {
  listRides,
  getRideById,
  cancelRide,
  assignDriver,
  getRideTimeline,
};

