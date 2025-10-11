const express = require('express');
const {
    createEmergencyAlert,
    getAllEmergencies,
    getEmergencyById,
    getEmergenciesByRide,
    getEmergenciesByUser,
    resolveEmergency,
    dismissEmergency,
    getActiveEmergencies,
    deleteEmergency,
} = require('../../Controllers/User/emergency.controller.js');

const router = express.Router();

// Create an emergency alert
router.post('/', createEmergencyAlert);

// Get all emergencies (admin)
// Query params: status, limit, skip
router.get('/', getAllEmergencies);

// Get active emergencies
router.get('/active', getActiveEmergencies);

// Get emergency by ID
router.get('/:id', getEmergencyById);

// Get emergencies for a ride
router.get('/ride/:rideId', getEmergenciesByRide);

// Get emergencies by user/driver
// Query param: userModel (User or Driver)
router.get('/user/:userId', getEmergenciesByUser);

// Resolve an emergency
router.patch('/:id/resolve', resolveEmergency);

// Dismiss an emergency
router.patch('/:id/dismiss', dismissEmergency);

// Delete an emergency (admin only)
router.delete('/:id', deleteEmergency);

module.exports = router;

