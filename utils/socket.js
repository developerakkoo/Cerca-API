const { Server } = require("socket.io");
const logger = require("./logger");
const Driver = require("../Models/Driver/driver.model");
const Ride = require("../Models/Driver/ride.model");
const {
  updateDriverStatus,
  updateDriverLocation,
  clearDriverSocket,
  clearUserSocket,
  assignDriverToRide,
  cancelRide,
  startRide,
  completeRide,
  createRide,
  setUserSocket,
  setDriverSocket,
  searchNearbyDrivers,
  verifyStartOtp,
  verifyStopOtp,
  markDriverArrived,
  updateRideStartTime,
  updateRideEndTime,
  submitRating,
  saveMessage,
  markMessageAsRead,
  getRideMessages,
  createNotification,
  markNotificationAsRead,
  getUserNotifications,
  createEmergencyAlert,
  resolveEmergency,
  autoAssignDriver,
} = require("./ride_booking_functions");

let io;
let socketToUser = new Map();
let socketToDriver = new Map();

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    },
  });

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // ============================
    // RIDER CONNECTION
    // ============================
    socket.on('riderConnect', async (data) => {
      try {
        const { userId } = data || {};
        if (!userId) return;

        await setUserSocket(userId, socket.id);
        socketToUser.set(socket.id, String(userId));
        socket.join('rider');
        socket.join(`user_${userId}`);

        console.log('Rider online:', userId, socket.id);
        io.emit('riderConnect', { userId });
      } catch (err) {
        console.error('riderConnect error', err);
        socket.emit('errorEvent', { message: 'Failed to register rider socket' });
      }
    });

    // ============================
    // DRIVER CONNECTION
    // ============================
    socket.on('driverConnect', async (data) => {
      try {
        const { driverId } = data || {};
        if (!driverId) return;

        const driver = await setDriverSocket(driverId, socket.id);
        await Driver.findByIdAndUpdate(driverId, { isOnline: true });
        socketToDriver.set(socket.id, String(driverId));
        socket.join('driver');
        socket.join(`driver_${driverId}`);

        console.log('Driver online:', driverId, socket.id);
        if (driver) io.emit('driverConnected', driver);
        io.emit('driverConnect', { driverId });
      } catch (err) {
        console.error('driverConnect error', err);
        socket.emit('errorEvent', { message: 'Failed to register driver socket' });
      }
    });

    // ============================
    // DRIVER LOCATION UPDATE
    // ============================
    socket.on('driverLocationUpdate', async (data) => {
      try {
        await updateDriverLocation(data.driverId, data.location);
        io.emit('driverLocationUpdate', data);
        
        // Notify specific rider if ride is in progress
        if (data.rideId) {
          const ride = await Ride.findById(data.rideId);
          if (ride && ride.userSocketId) {
            io.to(ride.userSocketId).emit('driverLocationUpdate', data);
          }
        }
      } catch (error) {
        console.error('Error updating driver location:', error);
        socket.emit('errorEvent', { message: 'Failed to update location' });
      }
    });

    // ============================
    // DRIVER DISCONNECT
    // ============================
    socket.on('driverDisconnect', async (data) => {
      try {
        const { driverId } = data || {};
        if (!driverId) return;

        await clearDriverSocket(driverId, socket.id);
        await updateDriverStatus(driverId, false, '');
        await Driver.findByIdAndUpdate(driverId, { isOnline: false });
        io.emit('driverDisconnect', { driverId });
      } catch (err) {
        console.error('driverDisconnect error', err);
      }
    });

    // ============================
    // CREATE NEW RIDE REQUEST
    // ============================
    socket.on('newRideRequest', async (data) => {
      try {
        logger.info('newRideRequest received:', data);
        const ride = await createRide(data);
        
        const populatedRide = await Ride.findById(ride._id)
          .populate('rider', 'fullName name phone email')
          .exec();

        // Find nearby drivers
        const nearbyDrivers = await autoAssignDriver(
          ride._id, 
          ride.pickupLocation, 
          10000 // 10km radius
        );

        if (nearbyDrivers.length > 0) {
          // Notify specific nearby drivers
          nearbyDrivers.forEach(driver => {
            if (driver.socketId) {
              io.to(driver.socketId).emit('newRideRequest', populatedRide);
            }
          });
          
          // Create notifications for nearby drivers
          nearbyDrivers.forEach(async (driver) => {
            await createNotification({
              recipientId: driver._id,
              recipientModel: 'Driver',
              title: 'New Ride Request',
              message: `New ride request nearby from ${populatedRide.pickupAddress}`,
              type: 'ride_request',
              relatedRide: ride._id,
            });
          });
        } else {
          // Notify all drivers if no nearby drivers
          io.to('driver').emit('newRideRequest', populatedRide);
        }

        // Ack to the rider
        if (populatedRide.userSocketId) {
          io.to(populatedRide.userSocketId).emit('rideRequested', populatedRide);
        }
        
        // Create notification for rider
        await createNotification({
          recipientId: data.riderId,
          recipientModel: 'User',
          title: 'Ride Requested',
          message: 'Your ride request has been sent to nearby drivers',
          type: 'ride_request',
          relatedRide: ride._id,
        });
      } catch (err) {
        console.error('newRideRequest error', err);
        socket.emit('rideError', { message: 'Failed to create ride' });
      }
    });

    // ============================
    // DRIVER ACCEPTS RIDE
    // ============================
    socket.on('rideAccepted', async (data) => {
      try {
        logger.info('rideAccepted received:', data);
        const { rideId, driverId } = data || {};
        if (!rideId || !driverId) return;

        const assignedRide = await assignDriverToRide(rideId, driverId, socket.id);

        // Notify rider
        if (assignedRide.userSocketId) {
          io.to(assignedRide.userSocketId).emit('rideAccepted', assignedRide);
        }
        
        // Notify driver
        if (assignedRide.driverSocketId) {
          io.to(assignedRide.driverSocketId).emit('rideAssigned', assignedRide);
        }

        // Create notifications
        await createNotification({
          recipientId: assignedRide.rider._id,
          recipientModel: 'User',
          title: 'Driver Accepted',
          message: `${assignedRide.driver.name} is coming to pick you up`,
          type: 'ride_accepted',
          relatedRide: rideId,
        });
        
        await createNotification({
          recipientId: assignedRide.driver._id,
          recipientModel: 'Driver',
          title: 'Ride Assigned',
          message: 'You have accepted a new ride',
          type: 'ride_accepted',
          relatedRide: rideId,
        });

        io.emit('rideAccepted', assignedRide);
      } catch (err) {
        console.error('rideAccepted error', err);
        socket.emit('rideError', { message: err.message || 'Failed to accept ride' });
      }
    });

    // ============================
    // DRIVER ARRIVED AT PICKUP
    // ============================
    socket.on('driverArrived', async (data) => {
      try {
        const { rideId } = data || {};
        if (!rideId) return;

        const ride = await markDriverArrived(rideId);
        
        // Notify rider
        if (ride.userSocketId) {
          io.to(ride.userSocketId).emit('driverArrived', ride);
        }
        
        // Create notification for rider
        await createNotification({
          recipientId: ride.rider._id,
          recipientModel: 'User',
          title: 'Driver Arrived',
          message: 'Your driver has arrived at the pickup location',
          type: 'driver_arrived',
          relatedRide: rideId,
        });

        logger.info('Driver arrived:', ride._id);
      } catch (err) {
        console.error('driverArrived error', err);
        socket.emit('rideError', { message: 'Failed to mark driver arrived' });
      }
    });

    // ============================
    // VERIFY START OTP & START RIDE
    // ============================
    socket.on('verifyStartOtp', async (data) => {
      try {
        const { rideId, otp } = data || {};
        if (!rideId || !otp) {
          socket.emit('otpVerificationFailed', { message: 'Ride ID and OTP required' });
          return;
        }

        const { success, ride } = await verifyStartOtp(rideId, otp);
        
        if (success) {
          socket.emit('otpVerified', { success: true, ride });
        }
      } catch (err) {
        console.error('verifyStartOtp error', err);
        socket.emit('otpVerificationFailed', { message: err.message });
      }
    });

    socket.on('rideStarted', async (data) => {
      try {
        const { rideId, otp } = data || {};
        if (!rideId) return;

        // Verify OTP if provided
        if (otp) {
          const { success } = await verifyStartOtp(rideId, otp);
          if (!success) {
            socket.emit('rideError', { message: 'Invalid OTP' });
            return;
          }
        }

        const startedRide = await startRide(rideId);
        await updateRideStartTime(rideId);

        logger.info('Ride started:', startedRide._id);
        
        if (startedRide.userSocketId) {
          io.to(startedRide.userSocketId).emit('rideStarted', startedRide);
        }
        if (startedRide.driverSocketId) {
          io.to(startedRide.driverSocketId).emit('rideStarted', startedRide);
        }

        // Create notifications
        await createNotification({
          recipientId: startedRide.rider._id,
          recipientModel: 'User',
          title: 'Ride Started',
          message: 'Your ride has started',
          type: 'ride_started',
          relatedRide: rideId,
        });
        
        await createNotification({
          recipientId: startedRide.driver._id,
          recipientModel: 'Driver',
          title: 'Ride Started',
          message: 'Ride in progress',
          type: 'ride_started',
          relatedRide: rideId,
        });

        io.emit('rideStarted', startedRide);
      } catch (err) {
        console.error('rideStarted error', err);
        socket.emit('rideError', { message: 'Failed to start ride' });
      }
    });

    // ============================
    // RIDE IN PROGRESS UPDATES
    // ============================
    socket.on('rideInProgress', (data) => {
      try {
        io.emit('rideInProgress', data);
      } catch (err) {
        console.error('rideInProgress error', err);
      }
    });

    socket.on('rideLocationUpdate', (data) => {
      try {
        io.emit('rideLocationUpdate', data);
        
        // Notify specific rider if rideId provided
        if (data.rideId && data.userSocketId) {
          io.to(data.userSocketId).emit('rideLocationUpdate', data);
        }
      } catch (err) {
        console.error('rideLocationUpdate error', err);
      }
    });

    // ============================
    // VERIFY STOP OTP & COMPLETE RIDE
    // ============================
    socket.on('verifyStopOtp', async (data) => {
      try {
        const { rideId, otp } = data || {};
        if (!rideId || !otp) {
          socket.emit('otpVerificationFailed', { message: 'Ride ID and OTP required' });
          return;
        }

        const { success, ride } = await verifyStopOtp(rideId, otp);
        
        if (success) {
          socket.emit('otpVerified', { success: true, ride });
        }
      } catch (err) {
        console.error('verifyStopOtp error', err);
        socket.emit('otpVerificationFailed', { message: err.message });
      }
    });

    socket.on('rideCompleted', async (data) => {
      try {
        const { rideId, fare, otp } = data || {};
        if (!rideId) return;

        // Verify OTP if provided
        if (otp) {
          const { success } = await verifyStopOtp(rideId, otp);
          if (!success) {
            socket.emit('rideError', { message: 'Invalid OTP' });
            return;
          }
        }

        const completedRide = await completeRide(rideId, fare);
        await updateRideEndTime(rideId);
        
        logger.info('Ride completed:', completedRide._id);
        
        if (completedRide.userSocketId) {
          io.to(completedRide.userSocketId).emit('rideCompleted', completedRide);
        }
        if (completedRide.driverSocketId) {
          io.to(completedRide.driverSocketId).emit('rideCompleted', completedRide);
        }

        // Create notifications
        await createNotification({
          recipientId: completedRide.rider._id,
          recipientModel: 'User',
          title: 'Ride Completed',
          message: 'Your ride has been completed. Please rate your driver.',
          type: 'ride_completed',
          relatedRide: rideId,
        });
        
        await createNotification({
          recipientId: completedRide.driver._id,
          recipientModel: 'Driver',
          title: 'Ride Completed',
          message: 'Ride completed successfully',
          type: 'ride_completed',
          relatedRide: rideId,
        });

        io.emit('rideCompleted', completedRide);
      } catch (err) {
        console.error('rideCompleted error', err);
        socket.emit('rideError', { message: 'Failed to complete ride' });
      }
    });

    // ============================
    // CANCEL RIDE
    // ============================
    socket.on('rideCancelled', async (data) => {
      try {
        const { rideId, cancelledBy, reason } = data || {};
        if (!rideId) return;

        const cancelledRide = await cancelRide(rideId, cancelledBy);
        
        // Update cancellation reason if provided
        if (reason) {
          await Ride.findByIdAndUpdate(rideId, { cancellationReason: reason });
        }
        
        if (cancelledRide.userSocketId) {
          io.to(cancelledRide.userSocketId).emit('rideCancelled', cancelledRide);
        }
        if (cancelledRide.driverSocketId) {
          io.to(cancelledRide.driverSocketId).emit('rideCancelled', cancelledRide);
        }

        // Create notifications
        if (cancelledRide.rider) {
          await createNotification({
            recipientId: cancelledRide.rider._id,
            recipientModel: 'User',
            title: 'Ride Cancelled',
            message: `Ride cancelled by ${cancelledBy}`,
            type: 'ride_cancelled',
            relatedRide: rideId,
          });
        }
        
        if (cancelledRide.driver) {
          await createNotification({
            recipientId: cancelledRide.driver._id,
            recipientModel: 'Driver',
            title: 'Ride Cancelled',
            message: `Ride cancelled by ${cancelledBy}`,
            type: 'ride_cancelled',
            relatedRide: rideId,
          });
        }

        io.emit('rideCancelled', cancelledRide);
      } catch (err) {
        console.error('rideCancelled error', err);
        socket.emit('rideError', { message: 'Failed to cancel ride' });
      }
    });

    // ============================
    // RATING SYSTEM
    // ============================
    socket.on('submitRating', async (data) => {
      try {
        const rating = await submitRating(data);
        
        socket.emit('ratingSubmitted', { success: true, rating });
        
        // Notify the rated person
        const recipientSocketId = data.ratedToModel === 'Driver' 
          ? (await Driver.findById(data.ratedTo))?.socketId
          : (await require('../Models/User/user.model').findById(data.ratedTo))?.socketId;
        
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('ratingReceived', rating);
        }
        
        // Create notification
        await createNotification({
          recipientId: data.ratedTo,
          recipientModel: data.ratedToModel,
          title: 'New Rating',
          message: `You received a ${data.rating}-star rating`,
          type: 'rating_received',
          relatedRide: data.rideId,
        });
      } catch (err) {
        console.error('submitRating error', err);
        socket.emit('ratingError', { message: err.message });
      }
    });

    // ============================
    // MESSAGING SYSTEM
    // ============================
    socket.on('sendMessage', async (data) => {
      try {
        const message = await saveMessage(data);
        
        // Notify receiver
        const receiverSocketId = data.receiverModel === 'Driver'
          ? (await Driver.findById(data.receiverId))?.socketId
          : (await require('../Models/User/user.model').findById(data.receiverId))?.socketId;
        
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('receiveMessage', message);
        }
        
        socket.emit('messageSent', { success: true, message });
      } catch (err) {
        console.error('sendMessage error', err);
        socket.emit('messageError', { message: err.message });
      }
    });

    socket.on('markMessageRead', async (data) => {
      try {
        const { messageId } = data || {};
        await markMessageAsRead(messageId);
        socket.emit('messageMarkedRead', { success: true });
      } catch (err) {
        console.error('markMessageRead error', err);
      }
    });

    socket.on('getRideMessages', async (data) => {
      try {
        const { rideId } = data || {};
        const messages = await getRideMessages(rideId);
        socket.emit('rideMessages', messages);
      } catch (err) {
        console.error('getRideMessages error', err);
        socket.emit('messageError', { message: err.message });
      }
    });

    // ============================
    // NOTIFICATIONS
    // ============================
    socket.on('getNotifications', async (data) => {
      try {
        const { userId, userModel } = data || {};
        const notifications = await getUserNotifications(userId, userModel);
        socket.emit('notifications', notifications);
      } catch (err) {
        console.error('getNotifications error', err);
        socket.emit('notificationError', { message: err.message });
      }
    });

    socket.on('markNotificationRead', async (data) => {
      try {
        const { notificationId } = data || {};
        await markNotificationAsRead(notificationId);
        socket.emit('notificationMarkedRead', { success: true });
      } catch (err) {
        console.error('markNotificationRead error', err);
      }
    });

    // ============================
    // EMERGENCY / SOS
    // ============================
    socket.on('emergencyAlert', async (data) => {
      try {
        const emergency = await createEmergencyAlert(data);
        
        logger.warn('EMERGENCY ALERT:', emergency);
        
        // Notify both rider and driver
        const ride = await Ride.findById(data.rideId).populate('rider driver');
        
        if (ride) {
          if (ride.userSocketId) {
            io.to(ride.userSocketId).emit('emergencyAlert', emergency);
          }
          if (ride.driverSocketId) {
            io.to(ride.driverSocketId).emit('emergencyAlert', emergency);
          }
          
          // Broadcast to admin/support (you can add admin sockets later)
          io.emit('emergencyBroadcast', emergency);
          
          // Create notifications
          if (ride.rider) {
            await createNotification({
              recipientId: ride.rider._id,
              recipientModel: 'User',
              title: 'Emergency Alert',
              message: 'Emergency alert has been triggered',
              type: 'emergency',
              relatedRide: data.rideId,
            });
          }
          
          if (ride.driver) {
            await createNotification({
              recipientId: ride.driver._id,
              recipientModel: 'Driver',
              title: 'Emergency Alert',
              message: 'Emergency alert has been triggered',
              type: 'emergency',
              relatedRide: data.rideId,
            });
          }
        }
        
        socket.emit('emergencyAlertCreated', { success: true, emergency });
      } catch (err) {
        console.error('emergencyAlert error', err);
        socket.emit('emergencyError', { message: err.message });
      }
    });

    // ============================
    // RIDER DISCONNECT
    // ============================
    socket.on('riderDisconnect', async (data) => {
      try {
        console.log('Rider disconnected:', data);
        await clearUserSocket(data.userId, socket.id);
        socketToUser.delete(socket.id);
        io.emit('riderDisconnect', data);
      } catch (err) {
        console.error('riderDisconnect error', err);
      }
    });

    // ============================
    // SOCKET DISCONNECT
    // ============================
    socket.on('disconnect', async () => {
      try {
        const userId = socketToUser.get(socket.id);
        const driverId = socketToDriver.get(socket.id);

        if (userId) {
          await clearUserSocket(userId, socket.id);
          socketToUser.delete(socket.id);
          io.emit('riderDisconnect', { userId });
        }

        if (driverId) {
          await clearDriverSocket(driverId, socket.id);
          await updateDriverStatus(driverId, false, '');
          await Driver.findByIdAndUpdate(driverId, { isOnline: false });
          socketToDriver.delete(socket.id);
          io.emit('driverDisconnect', { driverId });
        }
      } catch (err) {
        console.error('disconnect cleanup error', err);
      }

      console.log('Disconnected:', socket.id);
    });
  });
}

// Function to get the Socket.IO instance
function getSocketIO() {
  if (!io) {
    throw new Error(
      "Socket.IO is not initialized. Call initializeSocket first."
    );
  }
  return io;
}

module.exports = { initializeSocket, getSocketIO };
