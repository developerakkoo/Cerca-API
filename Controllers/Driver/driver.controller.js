const Driver = require('../../Models/Driver/driver.model.js');
const Ride = require('../../Models/Driver/ride.model.js');
const bcrypt = require("bcryptjs");
const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger.js');

/**
 * @desc    Add a new driver
 * @route   POST /drivers
 */
const addDriver = async (req, res) => {
    try {
        const { name, email, phone, password, location } = req.body;

        console.log('Received driver data:');
        console.log(req.body);
        
        let driver = await Driver.findOne({ phone });
        if (driver) {
            return res.status(400).json({ message: 'Driver with this phone number already exists' });
        }
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new driver
        const driverObj = new Driver({
            name,
            email,
            phone,
            password: hashedPassword,
            location,
            documents: [], // Initialize with an empty array
        });

        await driverObj.save();

        logger.info(`Driver added successfully: ${driverObj.email}`);
        res.status(201).json({ id: driverObj, message: 'Driver added successfully' });
    } catch (error) {
        logger.error('Error adding driver:', error);
        res.status(400).json({ message: 'Error adding driver', error });
    }
};

/**
 * @desc    Add documents to a driver's documents array
 * @route   POST /drivers/:id/documents
 */
const addDriverDocuments = async (req, res) => {
    try {
        const driverId = req.params.id;

        // Check if files are uploaded
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        // Generate complete URLs for the uploaded documents
        const documentPaths = req.files.map((file) => {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            return `${baseUrl}/${file.path}`;
        });

        // Find the driver and update the documents array
        const driver = await Driver.findById(driverId);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        driver.documents.push(...documentPaths);
        await driver.save();

        logger.info(`Documents added to driver: ${driver.email}`);
        res.status(200).json({ message: 'Documents added successfully', documents: driver.documents });
    } catch (error) {
        logger.error('Error adding documents to driver:', error);
        res.status(500).json({ message: 'Error adding documents to driver', error });
    }
};

/**
 * @desc    Login driver by email and password
 * @route   POST /drivers/login
 */
const loginDriver = async (req, res) => {
    const { email, password } = req.body;

    try {
        const driver = await Driver.findOne({ email });

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, driver.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: driver._id, email: driver.email },
            "@#@!#@dasd4234jkdh3874#$@#$#$@#$#$dkjashdlk$#442343%#$%f34234T$vtwefcEC$%",
            { expiresIn: '7d' }
        );

        logger.info(`Driver logged in: ${driver.email}`);
        res.status(200).json({ message: 'Login successful', token, id:driver._id });
    } catch (error) {
        logger.error('Error during driver login:', error);
        res.status(500).json({ message: 'An error occurred during login', error });
    }
};

/**
 * @desc    Get all drivers
 * @route   GET /drivers
 */
const getAllDrivers = async (req, res) => {
    try {
        const drivers = await Driver.find();
        res.status(200).json(drivers);
    } catch (error) {
        logger.error('Error fetching drivers:', error);
        res.status(500).json({ message: 'Error fetching drivers', error });
    }
};

/**
 * @desc    Get a driver by ID
 * @route   GET /drivers/:id
 */
const getDriverById = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }
        res.status(200).json(driver);
    } catch (error) {
        logger.error('Error fetching driver:', error);
        res.status(500).json({ message: 'Error fetching driver', error });
    }
};

/**
 * @desc    Delete a driver by ID
 * @route   DELETE /drivers/:id
 */
const deleteDriver = async (req, res) => {
    try {
        const driver = await Driver.findByIdAndDelete(req.params.id);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        logger.info(`Driver deleted successfully: ${driver.email}`);
        res.status(200).json({ message: 'Driver deleted successfully' });
    } catch (error) {
        logger.error('Error deleting driver:', error);
        res.status(500).json({ message: 'Error deleting driver', error });
    }
};

/**
 * @desc    Update a driver by ID
 * @route   PUT /drivers/:id
 */
const updateDriver = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Update the driver with the new data (excluding files)
        const updatedDriver = await Driver.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });

        logger.info(`Driver updated successfully: ${updatedDriver.email}`);
        res.status(200).json(updatedDriver);
    } catch (error) {
        logger.error('Error updating driver:', error);
        res.status(400).json({ message: 'Error updating driver', error });
    }
};

/**
 * @desc    Update a driver's documents
 * @route   PUT /drivers/:id/documents
 */
const updateDriverDocuments = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Check if new documents are uploaded
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        // Delete previous files
        const fs = require('fs');
        driver.documents.forEach((filePath) => {
            const fullPath = filePath.replace(`${req.protocol}://${req.get('host')}/`, '');
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        });

        // Generate complete URLs for the new documents
        const documentPaths = req.files.map((file) => {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            return `${baseUrl}/${file.path}`;
        });

        // Update the driver's documents array
        driver.documents = documentPaths;
        await driver.save();

        logger.info(`Driver documents updated successfully: ${driver.email}`);
        res.status(200).json({ message: 'Driver documents updated successfully', documents: driver.documents });
    } catch (error) {
        logger.error('Error updating driver documents:', error);
        res.status(500).json({ message: 'Error updating driver documents', error });
    }
};

/**
 * @desc    Update the isActive status of a driver
 * @route   PATCH /drivers/:id/isActive
 */
const updateDriverIsReadyForRides = async (req, res) => {
    try {
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'isActive must be a boolean value' });
        }

        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        driver.isActive = isActive;
        await driver.save();

        logger.info(`Driver isActive status updated: ${driver.email}, isActive: ${isActive}`);
        res.status(200).json({ message: 'Driver isActive status updated successfully', driver });
    } catch (error) {
        logger.error('Error updating driver isActive status:', error);
        res.status(500).json({ message: 'Error updating driver isActive status', error });
    }
};

/**
 * @desc    Get all rides of a driver
 * @route   GET /drivers/:id/rides
 */
const getAllRidesOfDriver = async (req, res) => {
    try {
        // Check if driver exists
        const driver = await Driver.findById(req.params.id);
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Query Ride model directly for all rides with this driver
        const rides = await Ride.find({ driver: req.params.id })
            .populate('rider', 'fullName email phoneNumber profilePic')
            .sort({ createdAt: -1 }); // Most recent first

        if(rides.length === 0) {
            return res.status(200).json({ message: 'No rides found for this driver', rides: [] });
        }
        
        // Sort rides by status priority: active statuses first, then completed/cancelled
        // Status priority: in_progress > accepted > requested > completed > cancelled
        const statusPriority = {
            'in_progress': 1,
            'accepted': 2,
            'requested': 3,
            'completed': 4,
            'cancelled': 5
        };
        
        const sortedRides = rides.sort((a, b) => {
            const priorityA = statusPriority[a.status] || 99;
            const priorityB = statusPriority[b.status] || 99;
            
            // If same status, sort by most recent first
            if (priorityA === priorityB) {
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
            
            return priorityA - priorityB;
        });
        
        res.status(200).json({ rides: sortedRides });
    } catch (error) {
        logger.error('Error fetching rides of driver:', error);
        res.status(500).json({ message: 'Error fetching rides of driver', error });
    }
};

/**
 * @desc    Get upcoming scheduled bookings for a driver
 * @route   GET /drivers/:id/upcoming-bookings
 */
const getUpcomingBookings = async (req, res) => {
    try {
        const { getUpcomingBookingsForDriver } = require('../../utils/ride_booking_functions');
        
        // Check if driver exists
        const driver = await Driver.findById(req.params.id);
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Get upcoming bookings
        const upcomingBookings = await getUpcomingBookingsForDriver(req.params.id);

        res.status(200).json({
            message: 'Upcoming bookings retrieved successfully',
            bookings: upcomingBookings,
            count: upcomingBookings.length
        });
    } catch (error) {
        logger.error('Error fetching upcoming bookings:', error);
        res.status(500).json({ message: 'Error fetching upcoming bookings', error: error.message });
    }
};

/**
 * @desc    Update the location of a driver
 * @route   PATCH /drivers/:id/location
 */
const updateDriverLocation = async (req, res) => {
    try {
        const { coordinates } = req.body;

        if (!Array.isArray(coordinates) || coordinates.length !== 2) {
            return res.status(400).json({ message: 'Invalid coordinates. Must be an array of [longitude, latitude].' });
        }

        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        driver.location.coordinates = coordinates;
        await driver.save();

        res.status(200).json({ message: 'Driver location updated successfully', location: driver.location });
    } catch (error) {
        logger.error('Error updating driver location:', error);
        res.status(500).json({ message: 'Error updating driver location', error });
    }
};

/**
 * @desc    Update driver online/offline status
 * @route   PATCH /drivers/:id/online-status
 */
const updateDriverOnlineStatus = async (req, res) => {
    try {
        const { isOnline } = req.body;

        if (typeof isOnline !== 'boolean') {
            return res.status(400).json({ message: 'isOnline must be a boolean value' });
        }

        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        driver.isOnline = isOnline;
        driver.lastSeen = new Date();
        await driver.save();

        logger.info(`Driver online status updated: ${driver.email}, isOnline: ${isOnline}`);
        res.status(200).json({ 
            message: 'Driver online status updated successfully', 
            driver 
        });
    } catch (error) {
        logger.error('Error updating driver online status:', error);
        res.status(500).json({ message: 'Error updating driver online status', error });
    }
};

/**
 * @desc    Update driver vehicle information
 * @route   PATCH /drivers/:id/vehicle
 */
const updateDriverVehicle = async (req, res) => {
    try {
        const { make, model, year, color, licensePlate, vehicleType } = req.body;

        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        driver.vehicleInfo = {
            make: make || driver.vehicleInfo?.make,
            model: model || driver.vehicleInfo?.model,
            year: year || driver.vehicleInfo?.year,
            color: color || driver.vehicleInfo?.color,
            licensePlate: licensePlate || driver.vehicleInfo?.licensePlate,
            vehicleType: vehicleType || driver.vehicleInfo?.vehicleType || 'sedan',
        };

        await driver.save();

        logger.info(`Driver vehicle info updated: ${driver.email}`);
        res.status(200).json({ 
            message: 'Driver vehicle information updated successfully', 
            vehicleInfo: driver.vehicleInfo 
        });
    } catch (error) {
        logger.error('Error updating driver vehicle:', error);
        res.status(500).json({ message: 'Error updating driver vehicle information', error });
    }
};

/**
 * @desc    Get driver earnings
 * @route   GET /drivers/:id/earnings
 */
const getDriverEarnings = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Get settings for commission calculation
        const Settings = require('../../Models/Admin/settings.modal.js');
        const settings = await Settings.findOne();
        
        if (!settings) {
            return res.status(500).json({ message: 'Admin settings not found' });
        }

        const { platformFees, driverCommissions } = settings.pricingConfigurations;

        // Get completed rides
        const completedRides = await Ride.find({ 
            driver: req.params.id,
            status: 'completed'
        }).sort({ createdAt: -1 });

        // Calculate total gross earnings (total fare collected)
        const totalGrossEarnings = completedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
        const totalRides = completedRides.length;

        logger.info(
          `[Fare Tracking] getDriverEarnings - driverId: ${req.params.id}, totalRides: ${totalRides}, totalGrossEarnings: ₹${totalGrossEarnings}, platformFees: ${platformFees}%, driverCommissions: ${driverCommissions}%`
        );

        // Calculate platform fees (amount platform takes)
        const totalPlatformFees = platformFees ? totalGrossEarnings * (platformFees / 100) : 0;

        // Calculate driver commission (percentage driver keeps)
        // If driverCommissions is 80%, driver gets 80% of fare
        const totalDriverEarnings = driverCommissions 
            ? totalGrossEarnings * (driverCommissions / 100) 
            : totalGrossEarnings - totalPlatformFees;

        // Calculate per ride averages
        const averageGrossPerRide = totalRides > 0 ? (totalGrossEarnings / totalRides).toFixed(2) : 0;
        const averageNetPerRide = totalRides > 0 ? (totalDriverEarnings / totalRides).toFixed(2) : 0;

        res.status(200).json({ 
            totalGrossEarnings, // Total fare collected from riders
            totalPlatformFees, // Amount deducted by platform
            totalDriverEarnings, // Net amount driver receives
            platformFeePercentage: platformFees || 0,
            driverCommissionPercentage: driverCommissions || 0,
            totalRides,
            averageGrossPerRide,
            averageNetPerRide,
            recentRides: completedRides.slice(0, 10).map(ride => ({
                _id: ride._id,
                fare: ride.fare,
                platformFee: platformFees ? (ride.fare * (platformFees / 100)).toFixed(2) : 0,
                driverEarning: driverCommissions 
                    ? (ride.fare * (driverCommissions / 100)).toFixed(2)
                    : (ride.fare - (ride.fare * (platformFees / 100))).toFixed(2),
                distanceInKm: ride.distanceInKm,
                actualDuration: ride.actualDuration,
                pickupAddress: ride.pickupAddress,
                dropoffAddress: ride.dropoffAddress,
                createdAt: ride.createdAt,
                completedAt: ride.actualEndTime,
            })),
        });
    } catch (error) {
        logger.error('Error fetching driver earnings:', error);
        res.status(500).json({ message: 'Error fetching driver earnings', error });
    }
};

/**
 * @desc    Get driver statistics
 * @route   GET /drivers/:id/stats
 */
const getDriverStats = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Get all rides
        const allRides = await Ride.find({ driver: req.params.id });

        const stats = {
            totalRides: allRides.length,
            completedRides: allRides.filter(r => r.status === 'completed').length,
            cancelledRides: allRides.filter(r => r.status === 'cancelled').length,
            inProgressRides: allRides.filter(r => r.status === 'in_progress').length,
            rating: driver.rating || 0,
            totalRatings: driver.totalRatings || 0,
            totalEarnings: driver.totalEarnings || 0,
            isOnline: driver.isOnline,
            isActive: driver.isActive,
            isBusy: driver.isBusy,
            lastSeen: driver.lastSeen,
        };

        res.status(200).json({ stats });
    } catch (error) {
        logger.error('Error fetching driver stats:', error);
        res.status(500).json({ message: 'Error fetching driver statistics', error });
    }
};

/**
 * @desc    Get nearby drivers
 * @route   GET /drivers/nearby
 */
const getNearbyDrivers = async (req, res) => {
    try {
        const { longitude, latitude, maxDistance = 10000 } = req.query; // maxDistance in meters

        if (!longitude || !latitude) {
            return res.status(400).json({ message: 'longitude and latitude are required' });
        }

        const drivers = await Driver.find({
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)],
                    },
                    $maxDistance: parseInt(maxDistance),
                },
            },
            isActive: true,
            isOnline: true,
            isBusy: false,
        }).select('-password -documents');

        res.status(200).json({ 
            drivers,
            count: drivers.length 
        });
    } catch (error) {
        logger.error('Error fetching nearby drivers:', error);
        res.status(500).json({ message: 'Error fetching nearby drivers', error });
    }
};

/**
 * @desc    Update driver busy status
 * @route   PATCH /drivers/:id/busy-status
 */
const updateDriverBusyStatus = async (req, res) => {
    try {
        const { isBusy } = req.body;

        if (typeof isBusy !== 'boolean') {
            return res.status(400).json({ message: 'isBusy must be a boolean value' });
        }

        const driver = await Driver.findByIdAndUpdate(
            req.params.id,
            { isBusy },
            { new: true }
        ).select('-password');

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        logger.info(`Driver busy status updated: ${driver.email}, isBusy: ${isBusy}`);
        res.status(200).json({ 
            message: 'Driver busy status updated successfully', 
            driver 
        });
    } catch (error) {
        logger.error('Error updating driver busy status:', error);
        res.status(500).json({ message: 'Error updating driver busy status', error });
    }
};

module.exports = {
    addDriver,
    addDriverDocuments,
    loginDriver,
    getAllDrivers,
    getDriverById,
    deleteDriver,
    updateDriver,
    updateDriverDocuments,
    updateDriverIsReadyForRides,
    getAllRidesOfDriver,
    getUpcomingBookings,
    updateDriverLocation,
    updateDriverOnlineStatus,
    updateDriverVehicle,
    getDriverEarnings,
    getDriverStats,
    getNearbyDrivers,
    updateDriverBusyStatus,
};