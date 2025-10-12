const mongoose = require('mongoose');
const Settings = require('../Models/Admin/settings.modal');

/**
 * @desc    Get all settings
 * @route   GET /settings
 */
const getSettings = async (req, res) => {
    try {
        const settings = await Settings.findOne();
        if (!settings) {
            return res.status(404).json({ message: 'Settings not found' });
        }
        res.status(200).json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching settings', error });
    }
};

/**
 * @desc    Update settings
 * @route   PUT /settings
 */
const updateSettings = async (req, res) => {
    try {
        const updatedSettings = await Settings.findOneAndUpdate({}, req.body, {
            new: true,
            runValidators: true,
        });
        if (!updatedSettings) {
            return res.status(404).json({ message: 'Settings not found' });
        }
        res.status(200).json(updatedSettings);
    } catch (error) {
        res.status(500).json({ message: 'Error updating settings', error });
    }
};

/**
 * @desc    Add new settings (or update if exists)
 * @route   POST /settings
 */
const addSettings = async (req, res) => {
    try {
        // Check if settings already exist
        const existingSettings = await Settings.findOne();
        
        if (existingSettings) {
            // If settings exist, update them instead
            const updatedSettings = await Settings.findOneAndUpdate(
                {},
                req.body,
                { new: true, runValidators: true }
            );
            return res.status(200).json({ 
                message: 'Settings already existed and have been updated', 
                settings: updatedSettings 
            });
        }
        
        // If no settings exist, create new
        const settings = new Settings(req.body);
        await settings.save();
        res.status(201).json({ message: 'Settings added successfully', settings });
    } catch (error) {
        console.error('Error adding settings:', error);
        res.status(500).json({ 
            message: 'Error adding settings', 
            error: error.message,
            details: error 
        });
    }
};

/**
 * @desc    Toggle maintenance mode
 * @route   PATCH /settings/maintenance-mode
 */
const toggleMaintenanceMode = async (req, res) => {
    try {
        const { maintenanceMode } = req.body;
        const settings = await Settings.findOne();
        if (!settings) {
            return res.status(404).json({ message: 'Settings not found' });
        }
        settings.systemSettings.maintenanceMode = maintenanceMode;
        await settings.save();
        res.status(200).json({ message: 'Maintenance mode updated', maintenanceMode });
    } catch (error) {
        res.status(500).json({ message: 'Error toggling maintenance mode', error });
    }
};

/**
 * @desc    Toggle force update
 * @route   PATCH /settings/force-update
 */
const toggleForceUpdate = async (req, res) => {
    try {
        const { forceUpdate } = req.body;
        const settings = await Settings.findOne();
        if (!settings) {
            return res.status(404).json({ message: 'Settings not found' });
        }
        settings.systemSettings.forceUpdate = forceUpdate;
        await settings.save();
        res.status(200).json({ message: 'Force update status updated', forceUpdate });
    } catch (error) {
        res.status(500).json({ message: 'Error toggling force update', error });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    toggleMaintenanceMode,
    toggleForceUpdate,
    addSettings,
};