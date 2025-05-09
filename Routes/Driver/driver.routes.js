const express = require('express');
const multer = require('multer');
const {
    addDriver,
    loginDriver,
    getAllDrivers,
    getDriverById,
    deleteDriver,
    updateDriver,
    addDriverDocuments,
    updateDriverDocuments,
    getAllRidesOfDriver,
} = require('../../Controllers/Driver/driver.controller.js');

const router = express.Router();

// Configure multer for document uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/driverDocuments/'); // Directory to save driver documents
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Unique file name
    },
});

const upload = multer({ storage });

// Routes for driver management
router.post('/', addDriver); // Add a new driver with documents
router.post('/login', loginDriver); // Login driver
router.get('/', getAllDrivers); // Get all drivers
router.get('/:id', getDriverById); // Get a driver by ID
router.delete('/:id', deleteDriver); // Delete a driver by ID
router.put('/:id', updateDriver); // Update a driver with optional new documents

// Route to add documents to a driver's documents array
router.post('/:id/documents', upload.array('documents', 10), addDriverDocuments);

// Route to update a driver's documents
router.put('/:id/documents', upload.array('documents', 10), updateDriverDocuments);

// Route to get all rides of a driver
router.get('/:id/rides', getAllRidesOfDriver);

module.exports = router;