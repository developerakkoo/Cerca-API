const Message = require('../../Models/Driver/message.model.js');
const Ride = require('../../Models/Driver/ride.model.js');
const logger = require('../../utils/logger.js');

/**
 * @desc    Send a message
 * @route   POST /messages
 */
const sendMessage = async (req, res) => {
    try {
        logger.info('📤 ========================================');
        logger.info('📤 [MessageController] sendMessage() called');
        logger.info('📤 ========================================');
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`);
        logger.info(`🌐 Request IP: ${req.ip || req.connection.remoteAddress}`);
        logger.info(`📦 Request body:`, JSON.stringify({
            rideId: req.body.rideId,
            senderId: req.body.senderId,
            senderModel: req.body.senderModel,
            receiverId: req.body.receiverId,
            receiverModel: req.body.receiverModel,
            message: req.body.message?.substring(0, 50) + (req.body.message?.length > 50 ? '...' : ''),
            messageType: req.body.messageType
        }));

        const { rideId, senderId, senderModel, receiverId, receiverModel, message, messageType } = req.body;

        // Validate required fields
        logger.info('✅ [MessageController] Validating required fields...');
        if (!rideId || !senderId || !senderModel || !receiverId || !receiverModel || !message) {
            logger.warn('⚠️ [MessageController] Missing required fields');
            logger.warn(`   rideId: ${!!rideId}, senderId: ${!!senderId}, senderModel: ${!!senderModel}, receiverId: ${!!receiverId}, receiverModel: ${!!receiverModel}, message: ${!!message}`);
            return res.status(400).json({ message: 'Missing required fields' });
        }
        logger.info('✅ [MessageController] All required fields present');

        // Validate models
        logger.info('✅ [MessageController] Validating models...');
        if (!['User', 'Driver'].includes(senderModel) || !['User', 'Driver'].includes(receiverModel)) {
            logger.warn(`⚠️ [MessageController] Invalid models - senderModel: ${senderModel}, receiverModel: ${receiverModel}`);
            return res.status(400).json({ message: 'Invalid sender or receiver model' });
        }
        logger.info('✅ [MessageController] Models validated');

        // Check if ride exists
        logger.info(`🔍 [MessageController] Checking if ride exists: ${rideId}`);
        const ride = await Ride.findById(rideId);
        if (!ride) {
            logger.warn(`⚠️ [MessageController] Ride not found: ${rideId}`);
            return res.status(404).json({ message: 'Ride not found' });
        }
        logger.info(`✅ [MessageController] Ride found: ${rideId}`);

        // Create message
        logger.info('💾 [MessageController] Creating message in database...');
        const newMessage = await Message.create({
            ride: rideId,
            sender: senderId,
            senderModel,
            receiver: receiverId,
            receiverModel,
            message,
            messageType: messageType || 'text',
        });
        logger.info(`✅ [MessageController] Message created - ID: ${newMessage._id}`);

        logger.info('🔄 [MessageController] Populating message with sender/receiver details...');
        const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender', 'name fullName')
            .populate('receiver', 'name fullName');
        logger.info(`✅ [MessageController] Message populated`);
        logger.info(`   Sender: ${populatedMessage?.sender?.name || populatedMessage?.sender?.fullName || 'unknown'}`);
        logger.info(`   Receiver: ${populatedMessage?.receiver?.name || populatedMessage?.receiver?.fullName || 'unknown'}`);

        logger.info(`✅ [MessageController] Message sent successfully - ID: ${newMessage._id}`);
        logger.info('========================================');
        res.status(201).json({ 
            message: 'Message sent successfully', 
            data: populatedMessage 
        });
    } catch (error) {
        logger.error('❌ [MessageController] Error sending message:', error);
        logger.error(`   Error message: ${error.message}`);
        logger.error(`   Error stack: ${error.stack}`);
        logger.info('========================================');
        res.status(500).json({ message: 'Error sending message', error: error.message });
    }
};

/**
 * @desc    Get all messages for a ride
 * @route   GET /messages/ride/:rideId
 */
const getRideMessages = async (req, res) => {
    try {
        logger.info('📚 ========================================');
        logger.info('📚 [MessageController] getRideMessages() called');
        logger.info('📚 ========================================');
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`);
        logger.info(`🌐 Request IP: ${req.ip || req.connection.remoteAddress}`);
        logger.info(`🆔 Ride ID: ${req.params.rideId}`);
        logger.info(`📊 Limit: ${req.query.limit || 100}`);

        const { rideId } = req.params;
        const { limit = 100 } = req.query;

        logger.info(`🔍 [MessageController] Fetching messages for ride: ${rideId}`);
        const messages = await Message.find({ ride: rideId })
            .sort({ createdAt: 1 })
            .limit(parseInt(limit))
            .populate('sender', 'name fullName')
            .populate('receiver', 'name fullName');

        logger.info(`✅ [MessageController] Messages fetched - count: ${messages.length}`);
        if (messages.length > 0) {
            logger.info(`   First message: ${messages[0]._id} from ${messages[0].senderModel}`);
            logger.info(`   Last message: ${messages[messages.length - 1]._id} from ${messages[messages.length - 1].senderModel}`);
        }

        logger.info('✅ [MessageController] getRideMessages() completed successfully');
        logger.info('========================================');
        res.status(200).json({ 
            messages,
            count: messages.length 
        });
    } catch (error) {
        logger.error('❌ [MessageController] Error fetching ride messages:', error);
        logger.error(`   Error message: ${error.message}`);
        logger.error(`   Error stack: ${error.stack}`);
        logger.info('========================================');
        res.status(500).json({ message: 'Error fetching ride messages', error: error.message });
    }
};

/**
 * @desc    Get unread messages for a user/driver
 * @route   GET /messages/unread/:receiverId
 */
const getUnreadMessages = async (req, res) => {
    try {
        const { receiverId } = req.params;
        const { receiverModel } = req.query; // 'User' or 'Driver'

        if (!receiverModel || !['User', 'Driver'].includes(receiverModel)) {
            return res.status(400).json({ message: 'Invalid or missing receiverModel query parameter' });
        }

        const messages = await Message.find({ 
            receiver: receiverId,
            receiverModel,
            isRead: false 
        })
        .sort({ createdAt: -1 })
        .populate('sender', 'name fullName')
        .populate('ride', 'pickupAddress dropoffAddress');

        res.status(200).json({ 
            messages,
            count: messages.length 
        });
    } catch (error) {
        logger.error('Error fetching unread messages:', error);
        res.status(500).json({ message: 'Error fetching unread messages', error: error.message });
    }
};

/**
 * @desc    Mark message as read
 * @route   PATCH /messages/:id/read
 */
const markMessageAsRead = async (req, res) => {
    try {
        const { id } = req.params;

        const message = await Message.findByIdAndUpdate(
            id,
            { isRead: true },
            { new: true }
        );

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        res.status(200).json({ 
            message: 'Message marked as read',
            data: message 
        });
    } catch (error) {
        logger.error('Error marking message as read:', error);
        res.status(500).json({ message: 'Error marking message as read', error: error.message });
    }
};

/**
 * @desc    Mark all messages as read for a ride
 * @route   PATCH /messages/ride/:rideId/read-all
 */
const markAllMessagesAsRead = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { receiverId } = req.body;

        if (!receiverId) {
            return res.status(400).json({ message: 'receiverId is required' });
        }

        const result = await Message.updateMany(
            { ride: rideId, receiver: receiverId, isRead: false },
            { isRead: true }
        );

        res.status(200).json({ 
            message: 'All messages marked as read',
            modifiedCount: result.modifiedCount 
        });
    } catch (error) {
        logger.error('Error marking all messages as read:', error);
        res.status(500).json({ message: 'Error marking all messages as read', error: error.message });
    }
};

/**
 * @desc    Delete a message
 * @route   DELETE /messages/:id
 */
const deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;

        const message = await Message.findByIdAndDelete(id);

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        logger.info(`Message deleted: ${id}`);
        res.status(200).json({ message: 'Message deleted successfully' });
    } catch (error) {
        logger.error('Error deleting message:', error);
        res.status(500).json({ message: 'Error deleting message', error: error.message });
    }
};

/**
 * @desc    Get conversation between two users for a ride
 * @route   GET /messages/conversation/:rideId/:userId
 */
const getConversation = async (req, res) => {
    try {
        const { rideId, userId } = req.params;

        const messages = await Message.find({
            ride: rideId,
            $or: [
                { sender: userId },
                { receiver: userId }
            ]
        })
        .sort({ createdAt: 1 })
        .populate('sender', 'name fullName')
        .populate('receiver', 'name fullName');

        res.status(200).json({ 
            messages,
            count: messages.length 
        });
    } catch (error) {
        logger.error('Error fetching conversation:', error);
        res.status(500).json({ message: 'Error fetching conversation', error: error.message });
    }
};

/**
 * @desc    Get unread message count for a specific ride
 * @route   GET /messages/ride/:rideId/unread-count
 * @query   receiverId - ID of the receiver (User or Driver)
 * @query   receiverModel - 'User' or 'Driver'
 */
const getUnreadCountForRide = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { receiverId, receiverModel } = req.query;

        if (!receiverId || !receiverModel || !['User', 'Driver'].includes(receiverModel)) {
            return res.status(400).json({ 
                message: 'Invalid or missing receiverId/receiverModel query parameters' 
            });
        }

        const unreadCount = await Message.countDocuments({
            ride: rideId,
            receiver: receiverId,
            receiverModel,
            isRead: false
        });

        logger.info(`Unread count for ride ${rideId}, receiver ${receiverId} (${receiverModel}): ${unreadCount}`);

        res.status(200).json({ 
            unreadCount,
            rideId 
        });
    } catch (error) {
        logger.error('Error fetching unread count:', error);
        res.status(500).json({ message: 'Error fetching unread count', error: error.message });
    }
};

module.exports = {
    sendMessage,
    getRideMessages,
    getUnreadMessages,
    markMessageAsRead,
    markAllMessagesAsRead,
    deleteMessage,
    getConversation,
    getUnreadCountForRide,
};

