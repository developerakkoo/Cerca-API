const Emergency = require('../../Models/User/emergency.model.js');
const Ride = require('../../Models/Driver/ride.model.js');
const logger = require('../../utils/logger.js');

/**
 * @desc    Create an emergency alert
 * @route   POST /emergencies
 */
const createEmergencyAlert = async (req, res) => {
    try {
        const { rideId, triggeredBy, triggeredByModel, location, reason, description } = req.body;

        // Validate required fields
        if (!rideId || !triggeredBy || !triggeredByModel || !location || !reason) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Validate models
        if (!['User', 'Driver'].includes(triggeredByModel)) {
            return res.status(400).json({ message: 'Invalid triggeredBy model' });
        }

        // Validate location
        if (!location.longitude || !location.latitude) {
            return res.status(400).json({ message: 'Invalid location. longitude and latitude required' });
        }

        // Check if ride exists
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        // Create emergency alert
        const emergency = await Emergency.create({
            ride: rideId,
            triggeredBy,
            triggeredByModel,
            location: {
                type: 'Point',
                coordinates: [location.longitude, location.latitude],
            },
            reason,
            description,
        });

        // Update ride status to cancelled
        await Ride.findByIdAndUpdate(rideId, { 
            status: 'cancelled',
            cancelledBy: 'system',
            cancellationReason: `Emergency: ${reason}`,
        });

        const populatedEmergency = await Emergency.findById(emergency._id)
            .populate('ride')
            .populate('triggeredBy', 'name fullName phone email');

        logger.warn(`EMERGENCY ALERT CREATED: ${emergency._id} for ride ${rideId}`);
        res.status(201).json({ 
            message: 'Emergency alert created successfully', 
            emergency: populatedEmergency 
        });
    } catch (error) {
        logger.error('Error creating emergency alert:', error);
        res.status(500).json({ message: 'Error creating emergency alert', error: error.message });
    }
};

/**
 * @desc    Get all emergency alerts
 * @route   GET /emergencies
 */
const getAllEmergencies = async (req, res) => {
    try {
        const { status, limit = 50, skip = 0 } = req.query;

        const query = {};
        if (status) {
            query.status = status;
        }

        const emergencies = await Emergency.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .populate('ride')
            .populate('triggeredBy', 'name fullName phone email');

        const totalEmergencies = await Emergency.countDocuments(query);

        res.status(200).json({ 
            emergencies,
            total: totalEmergencies,
            count: emergencies.length 
        });
    } catch (error) {
        logger.error('Error fetching emergencies:', error);
        res.status(500).json({ message: 'Error fetching emergencies', error: error.message });
    }
};

/**
 * @desc    Get emergency by ID
 * @route   GET /emergencies/:id
 */
const getEmergencyById = async (req, res) => {
    try {
        const { id } = req.params;

        const emergency = await Emergency.findById(id)
            .populate('ride')
            .populate('triggeredBy', 'name fullName phone email');

        if (!emergency) {
            return res.status(404).json({ message: 'Emergency not found' });
        }

        res.status(200).json({ emergency });
    } catch (error) {
        logger.error('Error fetching emergency:', error);
        res.status(500).json({ message: 'Error fetching emergency', error: error.message });
    }
};

/**
 * @desc    Get emergencies for a specific ride
 * @route   GET /emergencies/ride/:rideId
 */
const getEmergenciesByRide = async (req, res) => {
    try {
        const { rideId } = req.params;

        const emergencies = await Emergency.find({ ride: rideId })
            .sort({ createdAt: -1 })
            .populate('triggeredBy', 'name fullName phone email');

        res.status(200).json({ 
            emergencies,
            count: emergencies.length 
        });
    } catch (error) {
        logger.error('Error fetching ride emergencies:', error);
        res.status(500).json({ message: 'Error fetching ride emergencies', error: error.message });
    }
};

/**
 * @desc    Get emergencies triggered by a user/driver
 * @route   GET /emergencies/user/:userId
 */
const getEmergenciesByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { userModel } = req.query;

        if (!userModel || !['User', 'Driver'].includes(userModel)) {
            return res.status(400).json({ message: 'Invalid or missing userModel query parameter' });
        }

        const emergencies = await Emergency.find({ 
            triggeredBy: userId,
            triggeredByModel: userModel 
        })
        .sort({ createdAt: -1 })
        .populate('ride');

        res.status(200).json({ 
            emergencies,
            count: emergencies.length 
        });
    } catch (error) {
        logger.error('Error fetching user emergencies:', error);
        res.status(500).json({ message: 'Error fetching user emergencies', error: error.message });
    }
};

/**
 * @desc    Resolve an emergency
 * @route   PATCH /emergencies/:id/resolve
 */
const resolveEmergency = async (req, res) => {
    try {
        const { id } = req.params;

        const emergency = await Emergency.findByIdAndUpdate(
            id,
            { 
                status: 'resolved',
                resolvedAt: new Date(),
            },
            { new: true }
        ).populate('ride').populate('triggeredBy', 'name fullName');

        if (!emergency) {
            return res.status(404).json({ message: 'Emergency not found' });
        }

        logger.info(`Emergency resolved: ${id}`);
        res.status(200).json({ 
            message: 'Emergency resolved successfully',
            emergency 
        });
    } catch (error) {
        logger.error('Error resolving emergency:', error);
        res.status(500).json({ message: 'Error resolving emergency', error: error.message });
    }
};

/**
 * @desc    Dismiss an emergency
 * @route   PATCH /emergencies/:id/dismiss
 */
const dismissEmergency = async (req, res) => {
    try {
        const { id } = req.params;

        const emergency = await Emergency.findByIdAndUpdate(
            id,
            { status: 'dismissed' },
            { new: true }
        );

        if (!emergency) {
            return res.status(404).json({ message: 'Emergency not found' });
        }

        logger.info(`Emergency dismissed: ${id}`);
        res.status(200).json({ 
            message: 'Emergency dismissed successfully',
            emergency 
        });
    } catch (error) {
        logger.error('Error dismissing emergency:', error);
        res.status(500).json({ message: 'Error dismissing emergency', error: error.message });
    }
};

/**
 * @desc    Get active emergencies (for admin dashboard)
 * @route   GET /emergencies/active
 */
const getActiveEmergencies = async (req, res) => {
    try {
        const emergencies = await Emergency.find({ status: 'active' })
            .sort({ createdAt: -1 })
            .populate('ride')
            .populate('triggeredBy', 'name fullName phone email');

        res.status(200).json({ 
            emergencies,
            count: emergencies.length 
        });
    } catch (error) {
        logger.error('Error fetching active emergencies:', error);
        res.status(500).json({ message: 'Error fetching active emergencies', error: error.message });
    }
};

/**
 * @desc    Delete an emergency (admin only)
 * @route   DELETE /emergencies/:id
 */
const deleteEmergency = async (req, res) => {
    try {
        const { id } = req.params;

        const emergency = await Emergency.findByIdAndDelete(id);

        if (!emergency) {
            return res.status(404).json({ message: 'Emergency not found' });
        }

        logger.info(`Emergency deleted: ${id}`);
        res.status(200).json({ message: 'Emergency deleted successfully' });
    } catch (error) {
        logger.error('Error deleting emergency:', error);
        res.status(500).json({ message: 'Error deleting emergency', error: error.message });
    }
};

module.exports = {
    createEmergencyAlert,
    getAllEmergencies,
    getEmergencyById,
    getEmergenciesByRide,
    getEmergenciesByUser,
    resolveEmergency,
    dismissEmergency,
    getActiveEmergencies,
    deleteEmergency,
};

