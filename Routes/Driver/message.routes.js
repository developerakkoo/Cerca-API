const express = require('express');
const {
    sendMessage,
    getRideMessages,
    getUnreadMessages,
    markMessageAsRead,
    markAllMessagesAsRead,
    deleteMessage,
    getConversation,
    getUnreadCountForRide,
} = require('../../Controllers/Driver/message.controller.js');

const router = express.Router();

// Send a message
router.post('/', sendMessage);

// Get all messages for a ride
router.get('/ride/:rideId', getRideMessages);

// Get unread message count for a specific ride
// Query params: receiverId, receiverModel (User or Driver)
router.get('/ride/:rideId/unread-count', getUnreadCountForRide);

// Get unread messages for a user/driver
// Query param: receiverModel (User or Driver)
router.get('/unread/:receiverId', getUnreadMessages);

// Get conversation for a ride
router.get('/conversation/:rideId/:userId', getConversation);

// Mark message as read
router.patch('/:id/read', markMessageAsRead);

// Mark all messages as read for a ride
router.patch('/ride/:rideId/read-all', markAllMessagesAsRead);

// Delete a message
router.delete('/:id', deleteMessage);

module.exports = router;

