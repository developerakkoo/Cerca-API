// routes/ride.routes.js
import express from 'express';
import {
  createRide,
  getAllRides,
  getRideById,
  updateRide,
  deleteRide,
  getRidesByUserId,
  getRidesByDriverId,
  searchRide,
  calculateFare
} from '../Controllers/User/ride.controller.js';

const router = express.Router();

// Create a new ride
// POST /rides
router.post('/rides', createRide);

// Calculate fare
// POST /rides/calculate-fare
router.post('/rides/calculate-fare', calculateFare);

// Get all rides
// GET /rides
router.get('/rides', getAllRides);

// Get a single ride by ID
// GET /rides/:id
router.get('/rides/:id', getRideById);

// Update a ride by ID
// PUT /rides/:id
router.put('/rides/:id', updateRide);

// Delete a ride by ID
// DELETE /rides/:id
router.delete('/rides/:id', deleteRide);

// Get rides for a specific user
// GET /rides/user/:userId
router.get('/rides/user/:userId', getRidesByUserId);

// Get rides for a specific driver
// GET /rides/driver/:driverId
router.get('/rides/driver/:driverId', getRidesByDriverId);

// Search for nearby drivers for a user (your controller uses req.params.id and req.body.pickupLocation)
// POST /rides/search/:id
router.post('/rides/search/:id', searchRide);

export default router;
