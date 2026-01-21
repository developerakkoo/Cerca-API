const express =  require('express');
const {
    createAdmin,
    createSubAdmin,
    getAllSubAdmins,
    deleteSubAdmin,
    adminLogin,
    getAdminEarnings,
} = require('../Controllers/admin.controller.js');
const {
    getSettings,
    updateSettings,
    toggleMaintenanceMode,
    toggleForceUpdate,
    addSettings,
    getVehicleServices,
} = require('../Controllers/adminSettings.controller.js');
const {
    listDriverEarnings,
    getDriverEarningsById,
    updateEarningStatus,
    bulkUpdateEarningStatus,
    getEarningsStats,
} = require('../Controllers/Admin/driverEarnings.controller.js');

const { authenticateAdmin, requireRole } = require('../utils/adminAuth');

const router = express.Router();

// Admin login (public)
router.post('/login', adminLogin);

// Create admin (public for initial setup, or protected for ADMIN role)
// Note: For production, consider adding additional security (e.g., secret key check)
router.post('/create-admin', createAdmin);

// Public route for vehicle services (for user app)
router.get('/settings/vehicle-services', getVehicleServices);

// Protected admin routes
router.use(authenticateAdmin);

// Routes for admin management
router.post('/', requireRole(['ADMIN']), createSubAdmin);
router.get('/', requireRole(['ADMIN']), getAllSubAdmins);
router.delete('/:id', requireRole(['ADMIN']), deleteSubAdmin);

// Routes for settings
router.post('/settings', addSettings);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.patch('/settings/maintenance-mode', toggleMaintenanceMode);
router.patch('/settings/force-update', toggleForceUpdate);

// Route for admin earnings analytics
router.get('/earnings', getAdminEarnings);

// Routes for driver earnings management
router.get('/drivers/earnings', listDriverEarnings);
router.get('/drivers/earnings/stats', getEarningsStats);
router.get('/drivers/:driverId/earnings', getDriverEarningsById);
router.patch('/drivers/earnings/:earningId/status', updateEarningStatus);
router.patch('/drivers/earnings/bulk-status', bulkUpdateEarningStatus);

module.exports = router;