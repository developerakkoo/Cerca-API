import Ride from '../../Models/Driver/ride.model.js';
import Settings from '../../Models/Admin/settings.modal.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';
import { initializeSocket } from '../../socket.js';
import { getSocketIO } from '../../utils/socket.js';
/**
 * @desc    Create a new ride
 * @route   POST /rides
 */
export const createRide = async (req, res) => {
    try {
        const rideData = req.body;

        // Fetch admin settings
        const settings = await Settings.findOne();
        if (!settings) {
            return res.status(500).json({ message: 'Admin settings not found' });
        }

        const { baseFare, perKmRate, minimumFare } = settings.pricingConfigurations;

        // Calculate distance (in km) between pickup and dropoff locations
        const [pickupLng, pickupLat] = rideData.pickupLocation.coordinates;
        const [dropoffLng, dropoffLat] = rideData.dropoffLocation.coordinates;
        const distance = calculateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);

        // Add distance to the ride data
        rideData.distanceInKm = distance;

        // Calculate fare
        let fare = baseFare + distance * perKmRate;
        fare = Math.max(fare, minimumFare); // Ensure fare is at least the minimum fare

        // Add fare to the ride data
        rideData.fare = fare;

        // Generate start and stop OTPs
        const startOtp = crypto.randomInt(1000, 9999).toString();
        const stopOtp = crypto.randomInt(1000, 9999).toString();

        // Add OTPs to the ride data
        rideData.startOtp = startOtp;
        rideData.stopOtp = stopOtp;

        // Create a new ride
        const ride = new Ride(rideData);
        await ride.save();
        getSocketIO().to('drivers').emit('rideCreated', ride); // Emit event to notify clients
        logger.info(`Ride created successfully with ID: ${ride._id}`);
        res.status(201).json({
            ride,
            startOtp,
            stopOtp,
        });
    } catch (error) {
        logger.error('Error creating ride:', error);
        res.status(400).json({ message: 'Error creating ride', error });
    }
};

/**
 * Calculate the distance between two coordinates using the Haversine formula
 * @param {number} lat1 - Latitude of the first point
 * @param {number} lon1 - Longitude of the first point
 * @param {number} lat2 - Latitude of the second point
 * @param {number} lon2 - Longitude of the second point
 * @returns {number} - Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const R = 6371; // Radius of the Earth in kilometers

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * @desc    Get all rides
 * @route   GET /rides
 */
export const getAllRides = async (req, res) => {
    try {
        const rides = await Ride.find();
        res.status(200).json(rides);
    } catch (error) {
        logger.error('Error fetching rides:', error);
        res.status(500).json({ message: 'Error fetching rides', error });
    }
};

/**
 * @desc    Get a single ride by ID
 * @route   GET /rides/:id
 */
export const getRideById = async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.id);
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }
        res.status(200).json(ride);
    } catch (error) {
        logger.error('Error fetching ride:', error);
        res.status(500).json({ message: 'Error fetching ride', error });
    }
};

/**
 * @desc    Update a ride by ID
 * @route   PUT /rides/:id
 */
export const updateRide = async (req, res) => {
    try {
        const ride = await Ride.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        logger.info(`Ride updated successfully: ${ride._id}`);
        res.status(200).json(ride);
    } catch (error) {
        logger.error('Error updating ride:', error);
        res.status(400).json({ message: 'Error updating ride', error });
    }
};

/**
 * @desc    Delete a ride by ID
 * @route   DELETE /rides/:id
 */
export const deleteRide = async (req, res) => {
    try {
        const ride = await Ride.findByIdAndDelete(req.params.id);

        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        logger.info(`Ride deleted successfully: ${ride._id}`);
        res.status(200).json({ message: 'Ride deleted successfully' });
    } catch (error) {
        logger.error('Error deleting ride:', error);
        res.status(500).json({ message: 'Error deleting ride', error });
    }
};

/**
 * @desc    Get rides for a specific user by user ID
 * @route   GET /rides/user/:userId
 */
export const getRidesByUserId = async (req, res) => {
    try {
        const rides = await Ride.find({ rider: req.params.userId });
        if (!rides || rides.length === 0) {
            return res.status(404).json({ message: 'No rides found for this user' });
        }
        res.status(200).json(rides);
    } catch (error) {
        logger.error('Error fetching rides for user:', error);
        res.status(500).json({ message: 'Error fetching rides for user', error });
    }
};

/**
 * @desc    Get rides for a specific driver by driver ID
 * @route   GET /rides/driver/:driverId
 */
export const getRidesByDriverId = async (req, res) => {
    try {
        const rides = await Ride.find({ driver: req.params.driverId });
        if (!rides || rides.length === 0) {
            return res.status(404).json({ message: 'No rides found for this driver' });
        }
        res.status(200).json(rides);
    } catch (error) {
        logger.error('Error fetching rides for driver:', error);
        res.status(500).json({ message: 'Error fetching rides for driver', error });
    }
};