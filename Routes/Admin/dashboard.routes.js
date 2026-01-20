const express = require('express');
const { getDashboard } = require('../../Controllers/Admin/dashboard.controller');
const { authenticateAdmin } = require('../../utils/adminAuth');

const router = express.Router();

router.use(authenticateAdmin);
router.get('/dashboard', getDashboard);

module.exports = router;

