const express =  require('express');
const {
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
} = require('../Controllers/adminSettings.controller.js');

const router = express.Router();

// Routes for admin management
router.post('/', createSubAdmin); // Create a new sub-admin
router.get('/', getAllSubAdmins); // Get all sub-admins
router.delete('/:id', deleteSubAdmin); // Delete a s
// Sub-admin by ID
router.post('/login', adminLogin); // Admin login

// Routes for settings
router.post('/settings', addSettings);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.patch('/settings/maintenance-mode', toggleMaintenanceMode);
router.patch('/settings/force-update', toggleForceUpdate);

// Route for admin earnings analytics
router.get('/earnings', getAdminEarnings);

module.exports = router;