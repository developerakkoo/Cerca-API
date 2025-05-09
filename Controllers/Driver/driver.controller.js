const Driver = require('../../Models/Driver/driver.model.js');
const Ride = require('../../Models/Driver/ride.model.js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger.js');

/**
 * @desc    Add a new driver
 * @route   POST /drivers
 */
const addDriver = async (req, res) => {
    try {
        const { name, email, phone, password, location } = req.body;

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new driver
        const driver = new Driver({
            name,
            email,
            phone,
            password: hashedPassword,
            location,
            documents: [], // Initialize with an empty array
        });

        await driver.save();

        logger.info(`Driver added successfully: ${driver.email}`);
        res.status(201).json(driver);
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
        const driver = await Driver.findById(req.params.id).populate('rides.rideId');

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        if(driver.rides.length === 0) {
            res.status(200).json({ message: 'No rides found for this driver', rides: [] });
            return;
        }
        res.status(200).json({ rides: driver.rides });
    } catch (error) {
        logger.error('Error fetching rides of driver:', error);
        res.status(500).json({ message: 'Error fetching rides of driver', error });
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
};