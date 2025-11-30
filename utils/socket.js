const { Server } = require("socket.io");
const logger = require("./logger");
const Driver = require("../Models/Driver/driver.model");
const Ride = require("../Models/Driver/ride.model");
const AdminEarnings = require("../Models/Admin/adminEarnings.model");
const Settings = require("../Models/Admin/settings.modal");
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
  searchDriversWithProgressiveRadius,
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
    logger.info(`Socket connected: ${socket.id}`);

    // ============================
    // RIDER CONNECTION
    // ============================
    socket.on('riderConnect', async (data) => {
      try {
        logger.info(`riderConnect event - userId: ${data?.userId}, socketId: ${socket.id}`);
        const { userId } = data || {};
        if (!userId) {
          logger.warn('riderConnect: userId is missing');
          return;
        }

        await setUserSocket(userId, socket.id);
        socketToUser.set(socket.id, String(userId));
        socket.join('rider');
        socket.join(`user_${userId}`);

        logger.info(`Rider connected successfully - userId: ${userId}, socketId: ${socket.id}`);
        io.emit('riderConnect', { userId });
      } catch (err) {
        logger.error('riderConnect error:', err);
        socket.emit('errorEvent', { message: 'Failed to register rider socket' });
      }
    });

    // ============================
    // DRIVER CONNECTION
    // ============================
    socket.on('driverConnect', async (data) => {
      try {
        logger.info(`driverConnect event - driverId: ${data?.driverId}, socketId: ${socket.id}`);
        const { driverId } = data || {};
        if (!driverId) {
          logger.warn('driverConnect: driverId is missing');
          return;
        }

        const driver = await setDriverSocket(driverId, socket.id);
        // Only set isOnline, but don't change isActive status
        // isActive (toggle) should be controlled separately by driverToggleStatus event
        await Driver.findByIdAndUpdate(driverId, { isOnline: true });
        socketToDriver.set(socket.id, String(driverId));
        socket.join('driver');
        socket.join(`driver_${driverId}`);

        logger.info(`Driver connected successfully - driverId: ${driverId}, socketId: ${socket.id}, isActive: ${driver?.isActive}`);
        if (driver) io.emit('driverConnected', driver);
        
        // Send back driver status to the connected driver
        socket.emit('driverStatusUpdate', { 
          driverId,
          isOnline: true,
          isActive: driver?.isActive || false,
          isBusy: driver?.isBusy || false
        });
      } catch (err) {
        logger.error('driverConnect error:', err);
        socket.emit('errorEvent', { message: 'Failed to register driver socket' });
      }
    });

    // ============================
    // DRIVER TOGGLE STATUS (ON/OFF for accepting rides)
    // ============================
    socket.on('driverToggleStatus', async (data) => {
      try {
        logger.info(`driverToggleStatus event - driverId: ${data?.driverId}, isActive: ${data?.isActive}`);
        const { driverId, isActive } = data || {};
        
        if (!driverId) {
          logger.warn('driverToggleStatus: driverId is missing');
          socket.emit('errorEvent', { message: 'Driver ID is required' });
          return;
        }

        if (typeof isActive !== 'boolean') {
          logger.warn('driverToggleStatus: isActive must be boolean');
          socket.emit('errorEvent', { message: 'isActive must be a boolean value' });
          return;
        }

        // Update driver's isActive status (toggle)
        const driver = await Driver.findByIdAndUpdate(
          driverId,
          { isActive },
          { new: true }
        );

        if (!driver) {
          logger.error(`driverToggleStatus: Driver not found - ${driverId}`);
          socket.emit('errorEvent', { message: 'Driver not found' });
          return;
        }

        logger.info(`Driver toggle status updated - driverId: ${driverId}, isActive: ${isActive}, isOnline: ${driver.isOnline}`);
        
        // Send confirmation back to driver
        socket.emit('driverStatusUpdate', {
          driverId,
          isOnline: driver.isOnline,
          isActive: driver.isActive,
          isBusy: driver.isBusy,
          message: isActive ? 'You are now accepting ride requests' : 'You are now offline for ride requests'
        });

        // Broadcast status change to admin/monitoring systems if needed
        io.emit('driverStatusChanged', {
          driverId,
          isActive: driver.isActive,
          isOnline: driver.isOnline
        });

      } catch (err) {
        logger.error('driverToggleStatus error:', err);
        socket.emit('errorEvent', { message: 'Failed to update driver status' });
      }
    });

    // ============================
    // DRIVER LOCATION UPDATE
    // ============================
    socket.on('driverLocationUpdate', async (data) => {
      try {
        logger.info(`driverLocationUpdate - driverId: ${data?.driverId}, rideId: ${data?.rideId || 'none'}`);
        await updateDriverLocation(data.driverId, data.location);
        io.emit('driverLocationUpdate', data);
        
        // Notify specific rider if ride is in progress
        if (data.rideId) {
          const ride = await Ride.findById(data.rideId);
          if (ride && ride.userSocketId) {
            io.to(ride.userSocketId).emit('driverLocationUpdate', data);
            logger.info(`Location update sent to rider - rideId: ${data.rideId}`);
          }
        }
        logger.info(`Driver location updated successfully - driverId: ${data.driverId}`);
      } catch (error) {
        logger.error('Error updating driver location:', error);
        socket.emit('errorEvent', { message: 'Failed to update location' });
      }
    });

    // ============================
    // DRIVER DISCONNECT
    // ============================
    socket.on('driverDisconnect', async (data) => {
      try {
        logger.info(`driverDisconnect event - driverId: ${data?.driverId}, socketId: ${socket.id}`);
        const { driverId } = data || {};
        if (!driverId) {
          logger.warn('driverDisconnect: driverId is missing');
          return;
        }

        await clearDriverSocket(driverId, socket.id);
        await updateDriverStatus(driverId, false, '');
        await Driver.findByIdAndUpdate(driverId, { isOnline: false });
        io.emit('driverDisconnect', { driverId });
        logger.info(`Driver disconnected successfully - driverId: ${driverId}`);
      } catch (err) {
        logger.error('driverDisconnect error:', err);
      }
    });

    // ============================
    // CREATE NEW RIDE REQUEST
    // ============================
    socket.on('newRideRequest', async (data) => {
      try {
        logger.info(`newRideRequest event - riderId: ${data?.rider || data?.riderId}, service: ${data?.service}`);
        const ride = await createRide(data);
        logger.info(`Ride created - rideId: ${ride._id}, fare: ${ride.fare}, distance: ${ride.distanceInKm}km`);
        
        const populatedRide = await Ride.findById(ride._id)
          .populate('rider', 'fullName name phone email')
          .exec();

        // Find nearby drivers using progressive radius expansion (3km → 6km → 9km → 12km)
        const { drivers: nearbyDrivers, radiusUsed } = await searchDriversWithProgressiveRadius(
          ride.pickupLocation,
          [3000, 6000, 9000, 12000] // Progressive radii in meters
        );

        logger.info(`Found ${nearbyDrivers.length} nearby drivers for rideId: ${ride._id} within ${radiusUsed}m radius`);

        if (nearbyDrivers.length > 0) {
          // Notify specific nearby drivers
          nearbyDrivers.forEach(driver => {
            if (driver.socketId) {
              io.to(driver.socketId).emit('newRideRequest', populatedRide);
              logger.info(`Ride request sent to driver: ${driver._id}`);
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
          // No drivers found after progressive radius expansion
          logger.warn(`No drivers found for rideId: ${ride._id} after searching up to ${radiusUsed}m radius`);
          
          // Emit noDriverFound event to rider (NEW event - optional for apps)
          if (populatedRide.userSocketId) {
            io.to(populatedRide.userSocketId).emit('noDriverFound', {
              rideId: ride._id,
              message: 'No drivers found within 12km radius. Please try again later.',
            });
            logger.info(`No driver found event sent to rider: ${populatedRide.rider._id}`);
          }
        }

        // Ack to the rider (backward compatible - existing apps expect this)
        if (populatedRide.userSocketId) {
          io.to(populatedRide.userSocketId).emit('rideRequested', populatedRide);
          logger.info(`Ride request confirmation sent to rider: ${data.rider || data.riderId}`);
        }
        
        // Create notification for rider
        await createNotification({
          recipientId: data.rider || data.riderId,
          recipientModel: 'User',
          title: 'Ride Requested',
          message: 'Your ride request has been sent to nearby drivers',
          type: 'ride_request',
          relatedRide: ride._id,
        });
        
        logger.info(`newRideRequest completed successfully - rideId: ${ride._id}`);
      } catch (err) {
        logger.error('newRideRequest error:', err);
        socket.emit('rideError', { message: 'Failed to create ride' });
      }
    });

    // ============================
    // DRIVER ACCEPTS RIDE
    // ============================
    socket.on('rideAccepted', async (data) => {
      try {
        logger.info(`rideAccepted event - rideId: ${data?.rideId}, driverId: ${data?.driverId}`);
        const { rideId, driverId } = data || {};
        if (!rideId || !driverId) {
          logger.warn('rideAccepted: Missing rideId or driverId');
          return;
        }

        const assignedRide = await assignDriverToRide(rideId, driverId, socket.id);
        logger.info(`Ride assigned successfully - rideId: ${rideId}, driverId: ${driverId}, driver: ${assignedRide.driver.name}`);

        // Notify rider
        if (assignedRide.userSocketId) {
          io.to(assignedRide.userSocketId).emit('rideAccepted', assignedRide);
          logger.info(`Ride acceptance notification sent to rider: ${assignedRide.rider._id}`);
        }
        
        // Notify driver
        if (assignedRide.driverSocketId) {
          io.to(assignedRide.driverSocketId).emit('rideAssigned', assignedRide);
          logger.info(`Ride assignment confirmation sent to driver: ${driverId}`);
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
        logger.info(`rideAccepted completed successfully - rideId: ${rideId}`);
      } catch (err) {
        logger.error('rideAccepted error:', err);
        socket.emit('rideError', { message: err.message || 'Failed to accept ride' });
      }
    });

    // ============================
    // DRIVER ARRIVED AT PICKUP
    // ============================
    socket.on('driverArrived', async (data) => {
      try {
        logger.info(`driverArrived event - rideId: ${data?.rideId}`);
        const { rideId } = data || {};
        if (!rideId) {
          logger.warn('driverArrived: rideId is missing');
          return;
        }

        const ride = await markDriverArrived(rideId);
        logger.info(`Driver marked as arrived - rideId: ${rideId}`);
        
        // Notify rider
        if (ride.userSocketId) {
          io.to(ride.userSocketId).emit('driverArrived', ride);
          logger.info(`Driver arrival notification sent to rider - rideId: ${rideId}`);
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

        logger.info(`driverArrived completed successfully - rideId: ${rideId}`);
      } catch (err) {
        logger.error('driverArrived error:', err);
        socket.emit('rideError', { message: 'Failed to mark driver arrived' });
      }
    });

    // ============================
    // VERIFY START OTP & START RIDE
    // ============================
    socket.on('verifyStartOtp', async (data) => {
      try {
        logger.info(`verifyStartOtp event - rideId: ${data?.rideId}`);
        const { rideId, otp } = data || {};
        if (!rideId || !otp) {
          logger.warn('verifyStartOtp: Missing rideId or OTP');
          socket.emit('otpVerificationFailed', { message: 'Ride ID and OTP required' });
          return;
        }

        const { success, ride } = await verifyStartOtp(rideId, otp);
        
        if (success) {
          logger.info(`Start OTP verified successfully - rideId: ${rideId}`);
          socket.emit('otpVerified', { success: true, ride });
        } else {
          logger.warn(`Start OTP verification failed - rideId: ${rideId}`);
        }
      } catch (err) {
        logger.error('verifyStartOtp error:', err);
        socket.emit('otpVerificationFailed', { message: err.message });
      }
    });

    socket.on('rideStarted', async (data) => {
      try {
        logger.info(`rideStarted event - rideId: ${data?.rideId}, otp provided: ${!!data?.otp}`);
        const { rideId, otp } = data || {};
        if (!rideId) {
          logger.warn('rideStarted: rideId is missing');
          return;
        }

        // Verify OTP if provided
        if (otp) {
          const { success } = await verifyStartOtp(rideId, otp);
          if (!success) {
            logger.warn(`Invalid start OTP - rideId: ${rideId}`);
            socket.emit('rideError', { message: 'Invalid OTP' });
            return;
          }
          logger.info(`OTP verified, starting ride - rideId: ${rideId}`);
        }

        const startedRide = await startRide(rideId);
        await updateRideStartTime(rideId);

        logger.info(`Ride started successfully - rideId: ${rideId}`);
        
        if (startedRide.userSocketId) {
          io.to(startedRide.userSocketId).emit('rideStarted', startedRide);
          logger.info(`Ride start notification sent to rider - rideId: ${rideId}`);
        }
        if (startedRide.driverSocketId) {
          io.to(startedRide.driverSocketId).emit('rideStarted', startedRide);
          logger.info(`Ride start confirmation sent to driver - rideId: ${rideId}`);
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
        logger.error('rideStarted error:', err);
        socket.emit('rideError', { message: 'Failed to start ride' });
      }
    });

    // ============================
    // RIDE IN PROGRESS UPDATES
    // ============================
    socket.on('rideInProgress', (data) => {
      try {
        logger.info(`rideInProgress event - rideId: ${data?.rideId}`);
        io.emit('rideInProgress', data);
      } catch (err) {
        logger.error('rideInProgress error:', err);
      }
    });

    socket.on('rideLocationUpdate', (data) => {
      try {
        logger.info(`rideLocationUpdate event - rideId: ${data?.rideId}`);
        io.emit('rideLocationUpdate', data);
        
        // Notify specific rider if rideId provided
        if (data.rideId && data.userSocketId) {
          io.to(data.userSocketId).emit('rideLocationUpdate', data);
          logger.info(`Ride location update sent to rider - rideId: ${data.rideId}`);
        }
      } catch (err) {
        logger.error('rideLocationUpdate error:', err);
      }
    });

    // ============================
    // VERIFY STOP OTP & COMPLETE RIDE
    // ============================
    socket.on('verifyStopOtp', async (data) => {
      try {
        logger.info(`verifyStopOtp event - rideId: ${data?.rideId}`);
        const { rideId, otp } = data || {};
        if (!rideId || !otp) {
          logger.warn('verifyStopOtp: Missing rideId or OTP');
          socket.emit('otpVerificationFailed', { message: 'Ride ID and OTP required' });
          return;
        }

        const { success, ride } = await verifyStopOtp(rideId, otp);
        
        if (success) {
          logger.info(`Stop OTP verified successfully - rideId: ${rideId}`);
          socket.emit('otpVerified', { success: true, ride });
        } else {
          logger.warn(`Stop OTP verification failed - rideId: ${rideId}`);
        }
      } catch (err) {
        logger.error('verifyStopOtp error:', err);
        socket.emit('otpVerificationFailed', { message: err.message });
      }
    });

    socket.on('rideCompleted', async (data) => {
      try {
        logger.info(`rideCompleted event - rideId: ${data?.rideId}, fare: ${data?.fare}`);
        const { rideId, fare, otp } = data || {};
        if (!rideId) {
          logger.warn('rideCompleted: rideId is missing');
          return;
        }

        // Verify OTP if provided
        if (otp) {
          const { success } = await verifyStopOtp(rideId, otp);
          if (!success) {
            logger.warn(`Invalid stop OTP - rideId: ${rideId}`);
            socket.emit('rideError', { message: 'Invalid OTP' });
            return;
          }
          logger.info(`OTP verified, completing ride - rideId: ${rideId}`);
        }

        const completedRide = await completeRide(rideId, fare);
        await updateRideEndTime(rideId);
        
        logger.info(`Ride completed successfully - rideId: ${rideId}, finalFare: ${completedRide.fare}`);
        
        // Store earnings for admin analytics (non-blocking)
        storeRideEarnings(completedRide).catch(err => {
          logger.error(`Error storing ride earnings for rideId: ${rideId}:`, err);
          // Don't fail ride completion if earnings storage fails
        });
        
        if (completedRide.userSocketId) {
          io.to(completedRide.userSocketId).emit('rideCompleted', completedRide);
          logger.info(`Ride completion notification sent to rider - rideId: ${rideId}`);
        }
        if (completedRide.driverSocketId) {
          io.to(completedRide.driverSocketId).emit('rideCompleted', completedRide);
          logger.info(`Ride completion confirmation sent to driver - rideId: ${rideId}`);
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
        logger.error('rideCompleted error:', err);
        socket.emit('rideError', { message: 'Failed to complete ride' });
      }
    });

    // ============================
    // CANCEL RIDE
    // ============================
    socket.on('rideCancelled', async (data) => {
      try {
        logger.info(`rideCancelled event - rideId: ${data?.rideId}, cancelledBy: ${data?.cancelledBy}`);
        const { rideId, cancelledBy, reason } = data || {};
        if (!rideId) {
          logger.warn('rideCancelled: rideId is missing');
          return;
        }

        // Validate and set cancellation reason (backward compatible)
        let cancellationReason = reason;
        if (!cancellationReason || cancellationReason.trim() === '') {
          cancellationReason = 'No reason provided';
          logger.warn(`rideCancelled: No reason provided for rideId: ${rideId}, using default`);
        }

        // Cancel ride with reason
        const cancelledRide = await cancelRide(rideId, cancelledBy, cancellationReason);
        logger.info(`Ride cancelled successfully - rideId: ${rideId}, cancelledBy: ${cancelledBy}, reason: ${cancellationReason}`);
        
        if (cancelledRide.userSocketId) {
          io.to(cancelledRide.userSocketId).emit('rideCancelled', cancelledRide);
          logger.info(`Cancellation notification sent to rider - rideId: ${rideId}`);
        }
        if (cancelledRide.driverSocketId) {
          io.to(cancelledRide.driverSocketId).emit('rideCancelled', cancelledRide);
          logger.info(`Cancellation notification sent to driver - rideId: ${rideId}`);
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
        logger.info(`rideCancelled completed successfully - rideId: ${rideId}`);
      } catch (err) {
        logger.error('rideCancelled error:', err);
        socket.emit('rideError', { message: 'Failed to cancel ride' });
      }
    });

    // ============================
    // RATING SYSTEM
    // ============================
    socket.on('submitRating', async (data) => {
      try {
        logger.info(`submitRating event - rideId: ${data?.rideId}, rating: ${data?.rating}, ratedBy: ${data?.ratedBy} (${data?.ratedByModel}), ratedTo: ${data?.ratedTo} (${data?.ratedToModel})`);
        const rating = await submitRating(data);
        logger.info(`Rating submitted successfully - ratingId: ${rating._id}, value: ${rating.rating}`);
        
        socket.emit('ratingSubmitted', { success: true, rating });
        
        // Notify the rated person
        const recipientSocketId = data.ratedToModel === 'Driver' 
          ? (await Driver.findById(data.ratedTo))?.socketId
          : (await require('../Models/User/user.model').findById(data.ratedTo))?.socketId;
        
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('ratingReceived', rating);
          logger.info(`Rating notification sent to ${data.ratedToModel}: ${data.ratedTo}`);
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
        logger.error('submitRating error:', err);
        socket.emit('ratingError', { message: err.message });
      }
    });

    // ============================
    // MESSAGING SYSTEM
    // ============================
    socket.on('sendMessage', async (data) => {
      try {
        logger.info(`sendMessage event - rideId: ${data?.rideId}, from: ${data?.senderId} (${data?.senderModel}), to: ${data?.receiverId} (${data?.receiverModel})`);
        const message = await saveMessage(data);
        logger.info(`Message saved - messageId: ${message._id}`);
        
        // Notify receiver
        const receiverSocketId = data.receiverModel === 'Driver'
          ? (await Driver.findById(data.receiverId))?.socketId
          : (await require('../Models/User/user.model').findById(data.receiverId))?.socketId;
        
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('receiveMessage', message);
          logger.info(`Message delivered to receiver: ${data.receiverId}`);
        } else {
          logger.warn(`Receiver socket not found for: ${data.receiverId}`);
        }
        
        socket.emit('messageSent', { success: true, message });
      } catch (err) {
        logger.error('sendMessage error:', err);
        socket.emit('messageError', { message: err.message });
      }
    });

    socket.on('markMessageRead', async (data) => {
      try {
        logger.info(`markMessageRead event - messageId: ${data?.messageId}`);
        const { messageId } = data || {};
        await markMessageAsRead(messageId);
        socket.emit('messageMarkedRead', { success: true });
        logger.info(`Message marked as read - messageId: ${messageId}`);
      } catch (err) {
        logger.error('markMessageRead error:', err);
      }
    });

    socket.on('getRideMessages', async (data) => {
      try {
        logger.info(`getRideMessages event - rideId: ${data?.rideId}`);
        const { rideId } = data || {};
        const messages = await getRideMessages(rideId);
        socket.emit('rideMessages', messages);
        logger.info(`Ride messages retrieved - rideId: ${rideId}, count: ${messages?.length || 0}`);
      } catch (err) {
        logger.error('getRideMessages error:', err);
        socket.emit('messageError', { message: err.message });
      }
    });

    // ============================
    // NOTIFICATIONS
    // ============================
    socket.on('getNotifications', async (data) => {
      try {
        logger.info(`getNotifications event - userId: ${data?.userId}, userModel: ${data?.userModel}`);
        const { userId, userModel } = data || {};
        const notifications = await getUserNotifications(userId, userModel);
        socket.emit('notifications', notifications);
        logger.info(`Notifications retrieved - userId: ${userId}, count: ${notifications?.length || 0}`);
      } catch (err) {
        logger.error('getNotifications error:', err);
        socket.emit('notificationError', { message: err.message });
      }
    });

    socket.on('markNotificationRead', async (data) => {
      try {
        logger.info(`markNotificationRead event - notificationId: ${data?.notificationId}`);
        const { notificationId } = data || {};
        await markNotificationAsRead(notificationId);
        socket.emit('notificationMarkedRead', { success: true });
        logger.info(`Notification marked as read - notificationId: ${notificationId}`);
      } catch (err) {
        logger.error('markNotificationRead error:', err);
      }
    });

    // ============================
    // EMERGENCY / SOS
    // ============================
    socket.on('emergencyAlert', async (data) => {
      try {
        logger.warn(`🚨 EMERGENCY ALERT - rideId: ${data?.rideId}, triggeredBy: ${data?.triggeredBy} (${data?.triggeredByModel})`);
        const emergency = await createEmergencyAlert(data);
        logger.warn(`Emergency alert created - emergencyId: ${emergency._id}, location: ${JSON.stringify(data.location)}`);
        
        // Notify both rider and driver
        const ride = await Ride.findById(data.rideId).populate('rider driver');
        
        if (ride) {
          if (ride.userSocketId) {
            io.to(ride.userSocketId).emit('emergencyAlert', emergency);
            logger.warn(`Emergency alert sent to rider - rideId: ${data.rideId}`);
          }
          if (ride.driverSocketId) {
            io.to(ride.driverSocketId).emit('emergencyAlert', emergency);
            logger.warn(`Emergency alert sent to driver - rideId: ${data.rideId}`);
          }
          
          // Broadcast to admin/support (you can add admin sockets later)
          io.emit('emergencyBroadcast', emergency);
          logger.warn(`Emergency broadcast sent to all admins - rideId: ${data.rideId}`);
          
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
        logger.warn(`🚨 Emergency alert processing completed - emergencyId: ${emergency._id}`);
      } catch (err) {
        logger.error('emergencyAlert error:', err);
        socket.emit('emergencyError', { message: err.message });
      }
    });

    // ============================
    // RIDER DISCONNECT
    // ============================
    socket.on('riderDisconnect', async (data) => {
      try {
        logger.info(`riderDisconnect event - userId: ${data?.userId}, socketId: ${socket.id}`);
        await clearUserSocket(data.userId, socket.id);
        socketToUser.delete(socket.id);
        io.emit('riderDisconnect', data);
        logger.info(`Rider disconnected successfully - userId: ${data?.userId}`);
      } catch (err) {
        logger.error('riderDisconnect error:', err);
      }
    });

    // ============================
    // SOCKET DISCONNECT
    // ============================
    socket.on('disconnect', async () => {
      try {
        logger.info(`Socket disconnecting - socketId: ${socket.id}`);
        const userId = socketToUser.get(socket.id);
        const driverId = socketToDriver.get(socket.id);

        if (userId) {
          await clearUserSocket(userId, socket.id);
          socketToUser.delete(socket.id);
          io.emit('riderDisconnect', { userId });
          logger.info(`Rider socket cleanup completed - userId: ${userId}, socketId: ${socket.id}`);
        }

        if (driverId) {
          await clearDriverSocket(driverId, socket.id);
          await updateDriverStatus(driverId, false, '');
          await Driver.findByIdAndUpdate(driverId, { isOnline: false });
          socketToDriver.delete(socket.id);
          io.emit('driverDisconnect', { driverId });
          logger.info(`Driver socket cleanup completed - driverId: ${driverId}, socketId: ${socket.id}`);
        }

        logger.info(`Socket disconnected - socketId: ${socket.id}`);
      } catch (err) {
        logger.error('disconnect cleanup error:', err);
      }
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

// Store ride earnings for admin analytics (non-blocking)
async function storeRideEarnings(ride) {
  try {
    if (!ride || !ride._id || !ride.driver || !ride.rider) {
      logger.warn('storeRideEarnings: Invalid ride data, skipping');
      return;
    }

    // Check if earnings already stored (prevent duplicates)
    const existing = await AdminEarnings.findOne({ rideId: ride._id });
    if (existing) {
      logger.info(`Earnings already stored for rideId: ${ride._id}`);
      return;
    }

    // Get settings for commission calculation
    const settings = await Settings.findOne();
    if (!settings) {
      logger.warn('storeRideEarnings: Settings not found, skipping earnings storage');
      return;
    }

    const { platformFees, driverCommissions } = settings.pricingConfigurations;
    const grossFare = ride.fare || 0;

    // Calculate platform fee and driver earning
    const platformFee = platformFees ? grossFare * (platformFees / 100) : 0;
    const driverEarning = driverCommissions 
      ? grossFare * (driverCommissions / 100) 
      : grossFare - platformFee;

    // Create earnings record
    const earnings = await AdminEarnings.create({
      rideId: ride._id,
      driverId: ride.driver._id || ride.driver,
      riderId: ride.rider._id || ride.rider,
      grossFare: grossFare,
      platformFee: Math.round(platformFee * 100) / 100, // Round to 2 decimal places
      driverEarning: Math.round(driverEarning * 100) / 100, // Round to 2 decimal places
      rideDate: ride.actualEndTime || new Date(),
      paymentStatus: ride.paymentStatus || 'completed',
    });

    logger.info(`Earnings stored for rideId: ${ride._id}, platformFee: ${earnings.platformFee}, driverEarning: ${earnings.driverEarning}`);
  } catch (error) {
    logger.error('Error storing ride earnings:', error);
    // Don't throw - this is a background operation
  }
}

module.exports = { initializeSocket, getSocketIO };
