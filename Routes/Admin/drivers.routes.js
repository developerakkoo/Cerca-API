const express = require('express');
const {
  listDrivers,
  getDriverDetails,
  approveDriver,
  rejectDriver,
  blockDriver,
  verifyDriver,
  getDriverDocuments,
} = require('../../Controllers/Admin/drivers.controller');
const { authenticateAdmin } = require('../../utils/adminAuth');

const router = express.Router();

router.use(authenticateAdmin);
router.get('/drivers', listDrivers);
router.get('/drivers/:id', getDriverDetails);
router.patch('/drivers/:id/approve', approveDriver);
router.patch('/drivers/:id/reject', rejectDriver);
router.patch('/drivers/:id/block', blockDriver);
router.patch('/drivers/:id/verify', verifyDriver);
router.get('/drivers/:id/documents', getDriverDocuments);

module.exports = router;

