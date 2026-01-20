const express = require('express');
const {
  listRides,
  getRideById,
  cancelRide,
  assignDriver,
  getRideTimeline,
} = require('../../Controllers/Admin/rides.controller');
const { authenticateAdmin } = require('../../utils/adminAuth');

const router = express.Router();

router.use(authenticateAdmin);
router.get('/rides', listRides);
router.get('/rides/:id', getRideById);
router.patch('/rides/:id/cancel', cancelRide);
router.patch('/rides/:id/assign', assignDriver);
router.get('/rides/:id/timeline', getRideTimeline);

module.exports = router;

