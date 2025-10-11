const express = require('express');
const {
    createNotification,
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    deleteAllNotifications,
    getUnreadCount,
} = require('../../Controllers/User/notification.controller.js');

const router = express.Router();

// Create a notification
router.post('/', createNotification);

// Get all notifications for a user/driver
// Query params: recipientModel (User or Driver), limit, skip, unreadOnly
router.get('/:recipientId', getUserNotifications);

// Get unread count
router.get('/:recipientId/unread-count', getUnreadCount);

// Mark notification as read
router.patch('/:id/read', markNotificationAsRead);

// Mark all notifications as read
router.patch('/read-all/:recipientId', markAllNotificationsAsRead);

// Delete a notification
router.delete('/:id', deleteNotification);

// Delete all notifications
router.delete('/all/:recipientId', deleteAllNotifications);

module.exports = router;

