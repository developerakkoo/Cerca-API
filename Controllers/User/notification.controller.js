const Notification = require('../../Models/User/notification.model.js');
const logger = require('../../utils/logger.js');

/**
 * @desc    Create a notification
 * @route   POST /notifications
 */
const createNotification = async (req, res) => {
    try {
        const { recipientId, recipientModel, title, message, type, relatedRide, data } = req.body;

        // Validate required fields
        if (!recipientId || !recipientModel || !title || !message || !type) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Validate models
        if (!['User', 'Driver'].includes(recipientModel)) {
            return res.status(400).json({ message: 'Invalid recipient model' });
        }

        // Create notification
        const notification = await Notification.create({
            recipient: recipientId,
            recipientModel,
            title,
            message,
            type,
            relatedRide,
            data,
        });

        logger.info(`Notification created: ${notification._id}`);
        res.status(201).json({ 
            message: 'Notification created successfully', 
            notification 
        });
    } catch (error) {
        logger.error('Error creating notification:', error);
        res.status(500).json({ message: 'Error creating notification', error: error.message });
    }
};

/**
 * @desc    Get all notifications for a user/driver
 * @route   GET /notifications/:recipientId
 */
const getUserNotifications = async (req, res) => {
    try {
        const { recipientId } = req.params;
        const { recipientModel, limit = 50, skip = 0, unreadOnly = false } = req.query;

        if (!recipientModel || !['User', 'Driver'].includes(recipientModel)) {
            return res.status(400).json({ message: 'Invalid or missing recipientModel query parameter' });
        }

        const query = { 
            recipient: recipientId, 
            recipientModel 
        };

        if (unreadOnly === 'true') {
            query.isRead = false;
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .populate('relatedRide', 'pickupAddress dropoffAddress status');

        const totalNotifications = await Notification.countDocuments({ 
            recipient: recipientId, 
            recipientModel 
        });

        const unreadCount = await Notification.countDocuments({ 
            recipient: recipientId, 
            recipientModel,
            isRead: false 
        });

        res.status(200).json({ 
            notifications,
            total: totalNotifications,
            unreadCount,
            count: notifications.length 
        });
    } catch (error) {
        logger.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications', error: error.message });
    }
};

/**
 * @desc    Mark notification as read
 * @route   PATCH /notifications/:id/read
 */
const markNotificationAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findByIdAndUpdate(
            id,
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.status(200).json({ 
            message: 'Notification marked as read',
            notification 
        });
    } catch (error) {
        logger.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Error marking notification as read', error: error.message });
    }
};

/**
 * @desc    Mark all notifications as read for a user/driver
 * @route   PATCH /notifications/read-all/:recipientId
 */
const markAllNotificationsAsRead = async (req, res) => {
    try {
        const { recipientId } = req.params;
        const { recipientModel } = req.body;

        if (!recipientModel || !['User', 'Driver'].includes(recipientModel)) {
            return res.status(400).json({ message: 'Invalid or missing recipientModel' });
        }

        const result = await Notification.updateMany(
            { recipient: recipientId, recipientModel, isRead: false },
            { isRead: true }
        );

        res.status(200).json({ 
            message: 'All notifications marked as read',
            modifiedCount: result.modifiedCount 
        });
    } catch (error) {
        logger.error('Error marking all notifications as read:', error);
        res.status(500).json({ message: 'Error marking all notifications as read', error: error.message });
    }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /notifications/:id
 */
const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;

        const notification = await Notification.findByIdAndDelete(id);

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        logger.info(`Notification deleted: ${id}`);
        res.status(200).json({ message: 'Notification deleted successfully' });
    } catch (error) {
        logger.error('Error deleting notification:', error);
        res.status(500).json({ message: 'Error deleting notification', error: error.message });
    }
};

/**
 * @desc    Delete all notifications for a user/driver
 * @route   DELETE /notifications/all/:recipientId
 */
const deleteAllNotifications = async (req, res) => {
    try {
        const { recipientId } = req.params;
        const { recipientModel } = req.body;

        if (!recipientModel || !['User', 'Driver'].includes(recipientModel)) {
            return res.status(400).json({ message: 'Invalid or missing recipientModel' });
        }

        const result = await Notification.deleteMany({ 
            recipient: recipientId, 
            recipientModel 
        });

        logger.info(`All notifications deleted for ${recipientModel} ${recipientId}`);
        res.status(200).json({ 
            message: 'All notifications deleted successfully',
            deletedCount: result.deletedCount 
        });
    } catch (error) {
        logger.error('Error deleting all notifications:', error);
        res.status(500).json({ message: 'Error deleting all notifications', error: error.message });
    }
};

/**
 * @desc    Get unread count for a user/driver
 * @route   GET /notifications/:recipientId/unread-count
 */
const getUnreadCount = async (req, res) => {
    try {
        const { recipientId } = req.params;
        const { recipientModel } = req.query;

        if (!recipientModel || !['User', 'Driver'].includes(recipientModel)) {
            return res.status(400).json({ message: 'Invalid or missing recipientModel query parameter' });
        }

        const unreadCount = await Notification.countDocuments({ 
            recipient: recipientId, 
            recipientModel,
            isRead: false 
        });

        res.status(200).json({ unreadCount });
    } catch (error) {
        logger.error('Error fetching unread count:', error);
        res.status(500).json({ message: 'Error fetching unread count', error: error.message });
    }
};

module.exports = {
    createNotification,
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    deleteAllNotifications,
    getUnreadCount,
};

