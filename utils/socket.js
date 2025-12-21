const { Server } = require("socket.io");
const logger = require("./logger");
const Driver = require("../Models/Driver/driver.model");
const User = require("../Models/User/user.model");
const Ride = require("../Models/Driver/ride.model");
const Message = require("../Models/Driver/message.model");
const AdminEarnings = require("../Models/Admin/adminEarnings.model");
const Settings = require("../Models/Admin/settings.modal");
const rideBookingQueue = require("../src/queues/rideBooking.queue");
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
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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

        // Check if user already has a socketId (reconnection scenario)
        const currentUser = await User.findById(userId);
        if (currentUser?.socketId && currentUser.socketId !== socket.id) {
          logger.info(`Rider ${userId} reconnecting. Old socketId: ${currentUser.socketId}, New socketId: ${socket.id}`);

          // Check if old socket is still connected
          const oldSocket = io.sockets.sockets.get(currentUser.socketId);
          if (oldSocket && oldSocket.connected) {
            logger.warn(`Rider ${userId} reconnecting from new device/connection. Disconnecting old socket: ${currentUser.socketId}`);
            oldSocket.disconnect();
          } else {
            logger.info(`Rider ${userId} old socket ${currentUser.socketId} is not connected, cleaning up stale socketId`);
          }

          // Clear old socketId before setting new one
          await clearUserSocket(userId, currentUser.socketId);
          logger.info(`Cleaned up old socketId for rider ${userId}`);
        }

        await setUserSocket(userId, socket.id);
        socketToUser.set(socket.id, String(userId));
        socket.join('rider');
        socket.join(`user_${userId}`);

        // Auto-join all active ride rooms for this user
        logger.info(`🚪 [Socket] Auto-joining user to active ride rooms...`);
        const activeRides = await Ride.find({
          rider: userId,
          status: { $in: ['requested', 'accepted', 'arrived', 'in_progress'] }
        }).select('_id status').lean();

        if (!socket.data.rooms) {
          socket.data.rooms = [];
        }

        for (const ride of activeRides) {
          const roomName = `ride_${ride._id}`;
          socket.join(roomName);
          if (!socket.data.rooms.includes(roomName)) {
            socket.data.rooms.push(roomName);
          }
          logger.info(`✅ [Socket] User auto-joined room: ${roomName} (ride status: ${ride.status})`);
        }

        logger.info(`✅ [Socket] User auto-joined ${activeRides.length} active ride rooms`);

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

        // Check if driver already has a socketId (reconnection scenario)
        const currentDriver = await Driver.findById(driverId);
        if (currentDriver?.socketId && currentDriver.socketId !== socket.id) {
          logger.info(`Driver ${driverId} reconnecting. Old socketId: ${currentDriver.socketId}, New socketId: ${socket.id}`);

          // Check if old socket is still connected
          const oldSocket = io.sockets.sockets.get(currentDriver.socketId);
          if (oldSocket && oldSocket.connected) {
            logger.warn(`Driver ${driverId} reconnecting from new device/connection. Disconnecting old socket: ${currentDriver.socketId}`);
            oldSocket.disconnect();
          } else {
            logger.info(`Driver ${driverId} old socket ${currentDriver.socketId} is not connected, cleaning up stale socketId`);
          }

          // Clear old socketId before setting new one
          await clearDriverSocket(driverId, currentDriver.socketId);
          logger.info(`Cleaned up old socketId for driver ${driverId}`);
        }

        // Now set the new socketId
        const driver = await setDriverSocket(driverId, socket.id);
        // Only set isOnline, but don't change isActive status
        // isActive (toggle) should be controlled separately by driverToggleStatus event
        await Driver.findByIdAndUpdate(driverId, { isOnline: true });
        socketToDriver.set(socket.id, String(driverId));
        socket.join('driver');
        socket.join(`driver_${driverId}`);

        // Auto-join all active ride rooms for this driver
        logger.info(`🚪 [Socket] Auto-joining driver to active ride rooms...`);
        const activeRides = await Ride.find({
          driver: driverId,
          status: { $in: ['requested', 'accepted', 'arrived', 'in_progress'] }
        }).select('_id status').lean();

        if (!socket.data.rooms) {
          socket.data.rooms = [];
        }

        for (const ride of activeRides) {
          const roomName = `ride_${ride._id}`;
          socket.join(roomName);
          if (!socket.data.rooms.includes(roomName)) {
            socket.data.rooms.push(roomName);
          }
          logger.info(`✅ [Socket] Driver auto-joined room: ${roomName} (ride status: ${ride.status})`);
        }

        logger.info(`✅ [Socket] Driver auto-joined ${activeRides.length} active ride rooms`);

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

        // Process hybrid payment if applicable
        if (data.paymentMethod === 'RAZORPAY' && data.walletAmountUsed && data.walletAmountUsed > 0 && data.razorpayPaymentId) {
          try {
            const User = require('../Models/User/user.model');
            const WalletTransaction = require('../Models/User/walletTransaction.model');
            const riderId = data.rider || data.riderId;

            // Get user
            const user = await User.findById(riderId);
            if (user) {
              const balanceBefore = user.walletBalance || 0;
              const walletAmount = data.walletAmountUsed;

              // Check sufficient balance
              if (balanceBefore >= walletAmount) {
                const balanceAfter = balanceBefore - walletAmount;

                // Create wallet transaction
                await WalletTransaction.create({
                  user: riderId,
                  transactionType: 'RIDE_PAYMENT',
                  amount: walletAmount,
                  balanceBefore,
                  balanceAfter,
                  relatedRide: ride._id,
                  paymentMethod: 'WALLET',
                  status: 'COMPLETED',
                  description: `Ride payment (hybrid) - Wallet: ₹${walletAmount}, Razorpay: ₹${data.razorpayAmountPaid || 0}`,
                  metadata: {
                    hybridPayment: true,
                    razorpayPaymentId: data.razorpayPaymentId,
                    totalAmount: ride.fare,
                  },
                });

                // Update user wallet balance
                user.walletBalance = balanceAfter;
                await user.save();

                // Update ride with payment details
                ride.walletAmountUsed = walletAmount;
                ride.razorpayAmountPaid = data.razorpayAmountPaid || (ride.fare - walletAmount);
                ride.razorpayPaymentId = data.razorpayPaymentId;
                ride.paymentStatus = 'completed';
                ride.transactionId = data.razorpayPaymentId;
                await ride.save();

                logger.info(`Hybrid payment processed - Ride: ${ride._id}, Wallet: ₹${walletAmount}, Razorpay: ₹${data.razorpayAmountPaid || 0}`);
              } else {
                logger.warn(`Insufficient wallet balance for hybrid payment - Ride: ${ride._id}, Required: ₹${walletAmount}, Available: ₹${balanceBefore}`);
                // Don't fail ride creation, but log warning
              }
            }
          } catch (hybridError) {
            logger.error(`Error processing hybrid payment for ride ${ride._id}:`, hybridError);
            // Don't fail ride creation if hybrid payment processing fails
            // The ride will be created but payment status may be pending
          }
        }

        const populatedRide = await Ride.findById(ride._id)
          .populate('rider', 'fullName name phone email')
          .exec();

        // ============================
        // PUSH RIDE TO REDIS QUEUE
        // ============================
        logger.info(`📥 Queuing ride ${ride._id} for driver discovery`);

        await rideBookingQueue.add('process-ride', {
          rideId: ride._id.toString()
        });

        logger.info(`✅ Ride ${ride._id} successfully added to Redis queue`);


        // // Find nearby drivers using progressive radius expansion (3km → 6km → 9km → 12km)
        // logger.info(`🔍 Searching for drivers for rideId: ${ride._id}`);
        // logger.info(`   Pickup location: ${JSON.stringify(ride.pickupLocation)}`);
        // logger.info(`   Pickup coordinates: [${ride.pickupLocation.coordinates[0]}, ${ride.pickupLocation.coordinates[1]}]`);

        // const { drivers: nearbyDrivers, radiusUsed } = await searchDriversWithProgressiveRadius(
        //   ride.pickupLocation,
        //   [3000, 6000, 9000, 12000] // Progressive radii in meters
        // );

        // logger.info(`Found ${nearbyDrivers.length} nearby drivers for rideId: ${ride._id} within ${radiusUsed}m radius`);

        // if (nearbyDrivers.length > 0) {
        //   let notifiedCount = 0;
        //   let skippedCount = 0;
        //   const skippedReasons = {
        //     noSocketId: 0,
        //     socketNotConnected: 0,
        //     socketNotFound: 0
        //   };

        //   // Notify specific nearby drivers - verify socket connection is active
        //   nearbyDrivers.forEach(driver => {
        //     if (driver.socketId) {
        //       // Verify socket connection is still active
        //       const socketConnection = io.sockets.sockets.get(driver.socketId);
        //       if (socketConnection && socketConnection.connected) {
        //         io.to(driver.socketId).emit('newRideRequest', populatedRide);
        //         logger.info(`✅ Ride request sent to driver: ${driver._id} (socketId: ${driver.socketId})`);
        //         notifiedCount++;
        //       } else {
        //         if (socketConnection) {
        //           logger.warn(`⚠️ Driver ${driver._id} has socketId but socket is not connected: ${driver.socketId}`);
        //           skippedReasons.socketNotConnected++;
        //         } else {
        //           logger.warn(`⚠️ Driver ${driver._id} has socketId but socket not found in server: ${driver.socketId}`);
        //           skippedReasons.socketNotFound++;
        //         }
        //         skippedCount++;
        //       }
        //     } else {
        //       logger.warn(`⚠️ Driver ${driver._id} has no socketId, cannot send ride request`);
        //       skippedReasons.noSocketId++;
        //       skippedCount++;
        //     }
        //   });

        //   // Log notification summary
        //   logger.info(`📊 Ride request notification summary for rideId: ${ride._id}`);
        //   logger.info(`   ✅ Successfully notified: ${notifiedCount} drivers`);
        //   logger.info(`   ⚠️ Skipped: ${skippedCount} drivers`);
        //   if (skippedCount > 0) {
        //     logger.info(`   📋 Skip reasons: noSocketId=${skippedReasons.noSocketId}, socketNotConnected=${skippedReasons.socketNotConnected}, socketNotFound=${skippedReasons.socketNotFound}`);
        //   }

        //   // Track notified drivers in ride document
        //   const notifiedDriverIds = nearbyDrivers.map(driver => driver._id);
        //   await Ride.findByIdAndUpdate(ride._id, {
        //     $set: {
        //       notifiedDrivers: notifiedDriverIds
        //     }
        //   });
        //   logger.info(`📝 Tracked ${notifiedDriverIds.length} notified drivers for rideId: ${ride._id}`);

        //   // Create notifications for nearby drivers (including those who didn't receive socket notification)
        //   nearbyDrivers.forEach(async (driver) => {
        //     await createNotification({
        //       recipientId: driver._id,
        //       recipientModel: 'Driver',
        //       title: 'New Ride Request',
        //       message: `New ride request nearby from ${populatedRide.pickupAddress}`,
        //       type: 'ride_request',
        //       relatedRide: ride._id,
        //     });
        //   });
        // } else {
        //   // No drivers found after progressive radius expansion
        //   logger.warn(`❌ No drivers found for rideId: ${ride._id} after searching up to ${radiusUsed}m radius`);

        //   // Add detailed debugging information
        //   try {
        //     // Check total drivers in database
        //     const totalDrivers = await Driver.countDocuments({});
        //     logger.warn(`   📊 Total drivers in database: ${totalDrivers}`);

        //     // Check drivers by status
        //     const activeDrivers = await Driver.countDocuments({ isActive: true });
        //     const onlineDrivers = await Driver.countDocuments({ isOnline: true });
        //     const busyDrivers = await Driver.countDocuments({ isBusy: true });
        //     const availableDrivers = await Driver.countDocuments({ 
        //       isActive: true, 
        //       isBusy: false, 
        //       isOnline: true 
        //     });

        //     logger.warn(`   📊 Driver status breakdown:`);
        //     logger.warn(`      - Total drivers: ${totalDrivers}`);
        //     logger.warn(`      - isActive=true: ${activeDrivers}`);
        //     logger.warn(`      - isOnline=true: ${onlineDrivers}`);
        //     logger.warn(`      - isBusy=true: ${busyDrivers}`);
        //     logger.warn(`      - Available (isActive=true, isBusy=false, isOnline=true): ${availableDrivers}`);

        //     // Check if there are any drivers near the pickup location (without filters)
        //     const nearbyWithoutFilters = await Driver.find({
        //       location: {
        //         $near: {
        //           $geometry: {
        //             type: 'Point',
        //             coordinates: ride.pickupLocation.coordinates,
        //           },
        //           $maxDistance: radiusUsed,
        //         },
        //       },
        //     }).limit(10);

        //     logger.warn(`   📍 Drivers within ${radiusUsed}m radius (no filters): ${nearbyWithoutFilters.length}`);

        //     if (nearbyWithoutFilters.length > 0) {
        //       logger.warn(`   ⚠️ Found ${nearbyWithoutFilters.length} drivers nearby but all were excluded by filters:`);
        //       nearbyWithoutFilters.forEach((driver, index) => {
        //         logger.warn(`      Driver ${index + 1} (${driver._id}):`);
        //         logger.warn(`        - isActive: ${driver.isActive}`);
        //         logger.warn(`        - isBusy: ${driver.isBusy}`);
        //         logger.warn(`        - isOnline: ${driver.isOnline}`);
        //         logger.warn(`        - Location: [${driver.location.coordinates[0]}, ${driver.location.coordinates[1]}]`);
        //       });
        //     } else {
        //       logger.warn(`   📍 No drivers found within ${radiusUsed}m radius (even without filters)`);
        //       logger.warn(`   💡 This suggests either:`);
        //       logger.warn(`      1. No drivers exist in the database`);
        //       logger.warn(`      2. All drivers are very far from pickup location`);
        //       logger.warn(`      3. Driver location data is missing or incorrect`);
        //     }

        //     // Verify coordinate format
        //     const coords = ride.pickupLocation.coordinates;
        //     logger.warn(`   📐 Coordinate format verification:`);
        //     logger.warn(`      - Coordinates: [${coords[0]}, ${coords[1]}]`);
        //     logger.warn(`      - Format: [longitude, latitude]`);
        //     logger.warn(`      - Longitude range: -180 to 180 (current: ${coords[0]})`);
        //     logger.warn(`      - Latitude range: -90 to 90 (current: ${coords[1]})`);

        //     if (coords[0] < -180 || coords[0] > 180) {
        //       logger.error(`      ❌ INVALID: Longitude out of range!`);
        //     }
        //     if (coords[1] < -90 || coords[1] > 90) {
        //       logger.error(`      ❌ INVALID: Latitude out of range!`);
        //     }
        //   } catch (debugError) {
        //     logger.error(`   ❌ Error gathering debug information: ${debugError.message}`);
        //   }

        //   // Emit noDriverFound event to rider (NEW event - optional for apps)
        //   if (populatedRide.userSocketId) {
        //     io.to(populatedRide.userSocketId).emit('noDriverFound', {
        //       rideId: ride._id,
        //       message: 'No drivers found within 12km radius. Please try again later.',
        //     });
        //     logger.info(`No driver found event sent to rider: ${populatedRide.rider._id}`);
        //   } else {
        //     logger.warn(`   ⚠️ Cannot send noDriverFound event: userSocketId is missing`);
        //   }
        // }

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

        // Auto-join both user and driver sockets to ride room
        const roomName = `ride_${rideId}`;
        logger.info(`🚪 [Socket] Auto-joining sockets to room: ${roomName}`);

        // Join driver socket to room
        if (assignedRide.driverSocketId) {
          const driverSocket = io.sockets.sockets.get(assignedRide.driverSocketId);
          if (driverSocket) {
            driverSocket.join(roomName);
            if (!driverSocket.data.rooms) {
              driverSocket.data.rooms = [];
            }
            if (!driverSocket.data.rooms.includes(roomName)) {
              driverSocket.data.rooms.push(roomName);
            }
            logger.info(`✅ [Socket] Driver socket ${assignedRide.driverSocketId} auto-joined room: ${roomName}`);
          } else {
            logger.warn(`⚠️ [Socket] Driver socket not found: ${assignedRide.driverSocketId}`);
          }
        }

        // Join user socket to room
        if (assignedRide.userSocketId) {
          const userSocket = io.sockets.sockets.get(assignedRide.userSocketId);
          if (userSocket) {
            userSocket.join(roomName);
            if (!userSocket.data.rooms) {
              userSocket.data.rooms = [];
            }
            if (!userSocket.data.rooms.includes(roomName)) {
              userSocket.data.rooms.push(roomName);
            }
            logger.info(`✅ [Socket] User socket ${assignedRide.userSocketId} auto-joined room: ${roomName}`);
          } else {
            logger.warn(`⚠️ [Socket] User socket not found: ${assignedRide.userSocketId}`);
          }
        }

        io.emit('rideAccepted', assignedRide);
        logger.info(`rideAccepted completed successfully - rideId: ${rideId}`);
      } catch (err) {
        logger.error('rideAccepted error:', err);
        socket.emit('rideError', { message: err.message || 'Failed to accept ride' });
      }
    });

    // ============================
    // DRIVER REJECTS RIDE
    // ============================
    socket.on('rideRejected', async (data) => {
      try {
        logger.info(`rideRejected event - rideId: ${data?.rideId}, driverId: ${data?.driverId}`);
        const { rideId, driverId } = data || {};
        if (!rideId || !driverId) {
          logger.warn('rideRejected: Missing rideId or driverId');
          return;
        }

        // Get the ride to check current status
        const ride = await Ride.findById(rideId).populate('rider', 'fullName name phone email');
        if (!ride) {
          logger.warn(`rideRejected: Ride not found - rideId: ${rideId}`);
          return;
        }

        // Check if ride is already accepted or completed
        if (ride.status !== 'requested') {
          logger.info(`rideRejected: Ride ${rideId} is already ${ride.status}, ignoring rejection`);
          return;
        }

        // Add driver to rejectedDrivers array (avoid duplicates)
        const updatedRide = await Ride.findByIdAndUpdate(
          rideId,
          {
            $addToSet: { rejectedDrivers: driverId }
          },
          { new: true }
        );

        logger.info(`Driver ${driverId} rejected ride ${rideId}. Total rejections: ${updatedRide.rejectedDrivers.length}`);

        // Check if all notified drivers have rejected
        const notifiedCount = updatedRide.notifiedDrivers ? updatedRide.notifiedDrivers.length : 0;
        const rejectedCount = updatedRide.rejectedDrivers.length;

        logger.info(`Rejection status for rideId: ${rideId} - Notified: ${notifiedCount}, Rejected: ${rejectedCount}`);

        if (notifiedCount > 0 && rejectedCount >= notifiedCount) {
          // All notified drivers have rejected
          logger.warn(`All ${notifiedCount} notified drivers have rejected ride ${rideId}`);

          // Try searching again with larger radius (15km, 20km, 25km)
          logger.info(`🔍 Retrying driver search with larger radius for rideId: ${rideId}`);
          const { drivers: newDrivers, radiusUsed } = await searchDriversWithProgressiveRadius(
            ride.pickupLocation,
            [15000, 20000, 25000] // Larger radii in meters
          );

          // Filter out already rejected drivers
          const rejectedDriverIds = updatedRide.rejectedDrivers.map(id => id.toString());
          const availableNewDrivers = newDrivers.filter(
            driver => !rejectedDriverIds.includes(driver._id.toString())
          );

          logger.info(`Found ${availableNewDrivers.length} new available drivers (excluding ${rejectedCount} rejected) within ${radiusUsed}m radius`);

          if (availableNewDrivers.length > 0) {
            // Found new drivers, notify them
            let notifiedCount = 0;
            const newNotifiedDriverIds = [];

            availableNewDrivers.forEach(driver => {
              if (driver.socketId) {
                const socketConnection = io.sockets.sockets.get(driver.socketId);
                if (socketConnection && socketConnection.connected) {
                  const populatedRide = {
                    ...ride.toObject(),
                    _id: ride._id
                  };
                  io.to(driver.socketId).emit('newRideRequest', populatedRide);
                  logger.info(`✅ Retry: Ride request sent to driver: ${driver._id} (socketId: ${driver.socketId})`);
                  notifiedCount++;
                  newNotifiedDriverIds.push(driver._id);
                } else {
                  logger.warn(`⚠️ Retry: Driver ${driver._id} has socketId but socket is not connected`);
                }
              } else {
                logger.warn(`⚠️ Retry: Driver ${driver._id} has no socketId`);
              }
            });

            // Update notifiedDrivers to include new drivers
            const allNotifiedDrivers = [
              ...(updatedRide.notifiedDrivers || []),
              ...newNotifiedDriverIds
            ];
            await Ride.findByIdAndUpdate(rideId, {
              $set: { notifiedDrivers: allNotifiedDrivers }
            });

            logger.info(`📝 Updated notifiedDrivers: ${allNotifiedDrivers.length} total drivers notified for rideId: ${rideId}`);
            logger.info(`✅ Retry search successful - ${notifiedCount} new drivers notified for rideId: ${rideId}`);
          } else {
            // No more drivers available, cancel the ride
            logger.warn(`❌ No more drivers available for rideId: ${rideId} after all rejections. Cancelling ride.`);

            await Ride.findByIdAndUpdate(rideId, {
              $set: {
                status: 'cancelled',
                cancelledBy: 'system',
                cancellationReason: 'All drivers rejected or unavailable'
              }
            });

            // Notify rider
            if (ride.userSocketId) {
              io.to(ride.userSocketId).emit('noDriverFound', {
                rideId: ride._id,
                message: 'No drivers available. All nearby drivers have declined the ride. Please try again later.',
              });
              logger.info(`No driver found event sent to rider: ${ride.rider._id}`);
            } else {
              logger.warn(`⚠️ Cannot send noDriverFound event: userSocketId is missing`);
            }

            // Create notification for rider
            await createNotification({
              recipientId: ride.rider._id,
              recipientModel: 'User',
              title: 'Ride Cancelled',
              message: 'No drivers available. All nearby drivers have declined the ride.',
              type: 'ride_cancelled',
              relatedRide: rideId,
            });

            logger.info(`Ride ${rideId} cancelled due to all drivers rejecting`);
          }
        } else {
          // Not all drivers have rejected yet, wait for more responses
          logger.info(`Not all drivers have rejected yet. Waiting for more responses for rideId: ${rideId}`);
        }

        logger.info(`rideRejected completed successfully - rideId: ${rideId}, driverId: ${driverId}`);
      } catch (err) {
        logger.error('rideRejected error:', err);
        socket.emit('rideError', { message: err.message || 'Failed to process ride rejection' });
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

        // Process referral reward if this is user's first completed ride (non-blocking)
        processReferralRewardIfFirstRide(completedRide.rider._id || completedRide.rider, rideId).catch(err => {
          logger.error(`Error processing referral reward for rideId: ${rideId}:`, err);
          // Don't fail ride completion if referral processing fails
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

    // ============================
    // ROOM MANAGEMENT - Join/Leave Ride Rooms
    // ============================

    socket.on('joinRideRoom', async (data) => {
      try {
        logger.info('🚪 ========================================');
        logger.info('🚪 [Socket] joinRideRoom event received');
        logger.info('🚪 ========================================');
        logger.info(`🆔 Ride ID: ${data?.rideId}`);
        logger.info(`👤 User/Driver ID: ${data?.userId || data?.driverId}`);
        logger.info(`👤 User Type: ${data?.userType || 'unknown'}`);
        logger.info(`🔌 Socket ID: ${socket.id}`);
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`);

        const { rideId, userId, driverId, userType } = data || {};

        if (!rideId) {
          logger.warn('⚠️ [Socket] joinRideRoom: rideId is missing');
          socket.emit('roomJoinError', { message: 'Ride ID is required' });
          return;
        }

        // Validate rideId format (MongoDB ObjectId)
        if (!/^[0-9a-fA-F]{24}$/.test(rideId)) {
          logger.warn(`⚠️ [Socket] joinRideRoom: Invalid rideId format: ${rideId}`);
          socket.emit('roomJoinError', { message: 'Invalid ride ID format' });
          return;
        }

        // Verify ride exists
        const ride = await Ride.findById(rideId);
        if (!ride) {
          logger.warn(`⚠️ [Socket] joinRideRoom: Ride not found - rideId: ${rideId}`);
          socket.emit('roomJoinError', { message: 'Ride not found' });
          return;
        }

        // Check ride status (only allow join for active rides)
        const activeStatuses = ['requested', 'accepted', 'arrived', 'in_progress'];
        if (!activeStatuses.includes(ride.status)) {
          logger.warn(`⚠️ [Socket] joinRideRoom: Ride is not active - status: ${ride.status}`);
          socket.emit('roomJoinError', { message: 'Ride is not active' });
          return;
        }

        // Verify user/driver has access to this ride
        const userIdToCheck = userId || driverId;
        const userTypeToCheck = userType || (userId ? 'User' : 'Driver');

        if (userTypeToCheck === 'User') {
          const rideUserId = ride.rider?.toString() || ride.rider;
          if (rideUserId !== userIdToCheck) {
            logger.warn(`⚠️ [Socket] joinRideRoom: User ${userIdToCheck} does not have access to ride ${rideId}`);
            socket.emit('roomJoinError', { message: 'Access denied' });
            return;
          }
        } else if (userTypeToCheck === 'Driver') {
          const rideDriverId = ride.driver?.toString() || ride.driver;
          if (rideDriverId !== userIdToCheck) {
            logger.warn(`⚠️ [Socket] joinRideRoom: Driver ${userIdToCheck} does not have access to ride ${rideId}`);
            socket.emit('roomJoinError', { message: 'Access denied' });
            return;
          }
        }

        // Join socket to room
        const roomName = `ride_${rideId}`;
        socket.join(roomName);

        // Store rideId in socket data for reference
        if (!socket.data.rooms) {
          socket.data.rooms = [];
        }
        if (!socket.data.rooms.includes(roomName)) {
          socket.data.rooms.push(roomName);
        }

        logger.info(`✅ [Socket] Socket ${socket.id} joined room: ${roomName}`);
        logger.info(`   User/Driver: ${userIdToCheck} (${userTypeToCheck})`);
        logger.info(`   Ride Status: ${ride.status}`);
        logger.info(`   Total rooms for socket: ${socket.data.rooms.length}`);

        // Emit confirmation back to client
        socket.emit('roomJoined', {
          success: true,
          rideId: rideId,
          roomName: roomName
        });

        logger.info('✅ [Socket] joinRideRoom completed successfully');
        logger.info('========================================');
      } catch (err) {
        logger.error('❌ [Socket] joinRideRoom error:', err);
        logger.error(`   Error message: ${err.message}`);
        logger.error(`   Error stack: ${err.stack}`);
        socket.emit('roomJoinError', { message: err.message });
        logger.info('========================================');
      }
    });

    socket.on('leaveRideRoom', async (data) => {
      try {
        logger.info('🚪 ========================================');
        logger.info('🚪 [Socket] leaveRideRoom event received');
        logger.info('🚪 ========================================');
        logger.info(`🆔 Ride ID: ${data?.rideId}`);
        logger.info(`🔌 Socket ID: ${socket.id}`);
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`);

        const { rideId } = data || {};

        if (!rideId) {
          logger.warn('⚠️ [Socket] leaveRideRoom: rideId is missing');
          socket.emit('roomLeaveError', { message: 'Ride ID is required' });
          return;
        }

        // Leave socket from room
        const roomName = `ride_${rideId}`;
        socket.leave(roomName);

        // Remove from socket data
        if (socket.data.rooms) {
          socket.data.rooms = socket.data.rooms.filter(r => r !== roomName);
        }

        logger.info(`✅ [Socket] Socket ${socket.id} left room: ${roomName}`);
        logger.info(`   Remaining rooms for socket: ${socket.data.rooms?.length || 0}`);

        // Emit confirmation back to client
        socket.emit('roomLeft', {
          success: true,
          rideId: rideId,
          roomName: roomName
        });

        logger.info('✅ [Socket] leaveRideRoom completed successfully');
        logger.info('========================================');
      } catch (err) {
        logger.error('❌ [Socket] leaveRideRoom error:', err);
        logger.error(`   Error message: ${err.message}`);
        logger.error(`   Error stack: ${err.stack}`);
        socket.emit('roomLeaveError', { message: err.message });
        logger.info('========================================');
      }
    });

    // Helper function to emit unread count update to receiver
    const emitUnreadCountUpdate = async (rideId, receiverId, receiverModel) => {
      try {
        logger.info('🔔 ========================================');
        logger.info('🔔 [Socket] emitUnreadCountUpdate() called');
        logger.info('🔔 ========================================');
        logger.info(`🆔 Ride ID: ${rideId}`);
        logger.info(`👤 Receiver ID: ${receiverId}`);
        logger.info(`👤 Receiver Model: ${receiverModel}`);
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`);

        logger.info('📊 [Socket] Counting unread messages...');
        const unreadCount = await Message.countDocuments({
          ride: rideId,
          receiver: receiverId,
          receiverModel,
          isRead: false
        });
        logger.info(`✅ [Socket] Unread count: ${unreadCount}`);

        logger.info(`🔍 [Socket] Looking up receiver socket ID (${receiverModel})...`);
        const receiverSocketId = receiverModel === 'Driver'
          ? (await Driver.findById(receiverId))?.socketId
          : (await User.findById(receiverId))?.socketId;

        logger.info(`🔌 [Socket] Receiver socket ID: ${receiverSocketId || 'null'}`);

        if (receiverSocketId) {
          const unreadCountData = {
            rideId,
            receiverId,
            receiverModel,
            count: unreadCount
          };

          logger.info('📤 [Socket] Emitting unreadCountUpdated event...');
          logger.info(`📦 [Socket] Event data:`, JSON.stringify(unreadCountData));

          io.to(receiverSocketId).emit('unreadCountUpdated', unreadCountData);

          logger.info(`✅ [Socket] Unread count updated - rideId: ${rideId}, receiver: ${receiverId} (${receiverModel}), count: ${unreadCount}`);
          logger.info('========================================');
        } else {
          logger.warn(`⚠️ [Socket] Receiver socket not found - rideId: ${rideId}, receiver: ${receiverId} (${receiverModel})`);
          logger.info('========================================');
        }
      } catch (err) {
        logger.error('❌ [Socket] Error emitting unread count update:', err);
        logger.error(`   Error message: ${err.message}`);
        logger.error(`   Error stack: ${err.stack}`);
        logger.info('========================================');
      }
    };

    socket.on('sendMessage', async (data) => {
      try {
        logger.info('📤 ========================================');
        logger.info('📤 [Socket] sendMessage event received');
        logger.info('📤 ========================================');
        logger.info(`🆔 Ride ID: ${data?.rideId}`);
        logger.info(`👤 Sender ID: ${data?.senderId}`);
        logger.info(`👤 Sender Model: ${data?.senderModel}`);
        logger.info(`👤 Receiver ID: ${data?.receiverId}`);
        logger.info(`👤 Receiver Model: ${data?.receiverModel}`);
        logger.info(`💬 Message: ${data?.message?.substring(0, 50)}${data?.message?.length > 50 ? '...' : ''}`);
        logger.info(`📝 Message Type: ${data?.messageType || 'text'}`);
        logger.info(`🔌 Socket ID: ${socket.id}`);
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`);

        logger.info('💾 [Socket] Saving message to database...');
        const message = await saveMessage(data);
        logger.info(`✅ [Socket] Message saved - messageId: ${message._id}`);

        logger.info('🔄 [Socket] Populating message with sender/receiver details...');
        // Populate message with sender and receiver details before emitting
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'name fullName')
          .populate('receiver', 'name fullName')
          .lean();

        logger.info(`✅ [Socket] Message populated`);
        logger.info(`   Sender: ${populatedMessage?.sender?.name || populatedMessage?.sender?.fullName || 'unknown'}`);
        logger.info(`   Receiver: ${populatedMessage?.receiver?.name || populatedMessage?.receiver?.fullName || 'unknown'}`);

        // Emit message to room (both user and driver in the room will receive it)
        const roomName = `ride_${data.rideId}`;
        logger.info(`📤 [Socket] Emitting receiveMessage event to room: ${roomName}`);
        logger.info(`📦 [Socket] Message data:`, JSON.stringify({
          _id: populatedMessage._id,
          rideId: populatedMessage.ride,
          sender: populatedMessage.sender?._id,
          receiver: populatedMessage.receiver?._id,
          message: populatedMessage.message?.substring(0, 50)
        }));

        // Emit to room - both user and driver will receive if they're in the room
        io.to(roomName).emit('receiveMessage', populatedMessage);
        logger.info(`✅ [Socket] Message delivered to room: ${roomName}`);

        // Fallback: Also try direct socket emission if room fails (for backward compatibility)
        const receiverSocketId = data.receiverModel === 'Driver'
          ? (await Driver.findById(data.receiverId))?.socketId
          : (await User.findById(data.receiverId))?.socketId;

        if (receiverSocketId) {
          logger.info(`🔌 [Socket] Fallback: Also emitting to receiver socket: ${receiverSocketId}`);
          io.to(receiverSocketId).emit('receiveMessage', populatedMessage);
        } else {
          logger.info(`ℹ️ [Socket] Receiver socket not found (may be offline or not connected)`);
        }

        logger.info('🔔 [Socket] Emitting unread count update...');
        // Emit unread count update to receiver
        await emitUnreadCountUpdate(data.rideId, data.receiverId, data.receiverModel);

        logger.info('📤 [Socket] Sending confirmation to sender...');
        // Also send populated message to sender for confirmation
        const confirmationData = { success: true, message: populatedMessage };
        socket.emit('messageSent', confirmationData);
        logger.info(`✅ [Socket] Confirmation sent to sender: ${data.senderId}`);

        logger.info('✅ [Socket] sendMessage event completed successfully');
        logger.info('========================================');
      } catch (err) {
        logger.error('❌ [Socket] sendMessage error:', err);
        logger.error(`   Error message: ${err.message}`);
        logger.error(`   Error stack: ${err.stack}`);
        logger.error(`   Failed data:`, JSON.stringify(data));
        socket.emit('messageError', { message: err.message });
        logger.info('========================================');
      }
    });

    socket.on('markMessageRead', async (data) => {
      try {
        logger.info('📖 ========================================');
        logger.info('📖 [Socket] markMessageRead event received');
        logger.info('📖 ========================================');
        logger.info(`🆔 Message ID: ${data?.messageId}`);
        logger.info(`🔌 Socket ID: ${socket.id}`);
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`);

        const { messageId } = data || {};
        if (!messageId) {
          logger.warn('⚠️ [Socket] markMessageRead: messageId is missing');
          return;
        }

        logger.info('💾 [Socket] Marking message as read in database...');
        const message = await markMessageAsRead(messageId);

        if (message) {
          logger.info(`✅ [Socket] Message marked as read - messageId: ${messageId}`);
          logger.info(`🆔 [Socket] Ride ID: ${message.ride.toString()}`);
          logger.info(`👤 [Socket] Receiver ID: ${message.receiver.toString()}`);
          logger.info(`👤 [Socket] Receiver Model: ${message.receiverModel}`);

          logger.info('🔔 [Socket] Emitting unread count update...');
          // Emit unread count update to receiver (the one who marked it as read)
          await emitUnreadCountUpdate(
            message.ride.toString(),
            message.receiver.toString(),
            message.receiverModel
          );
        } else {
          logger.warn(`⚠️ [Socket] Message not found - messageId: ${messageId}`);
        }

        logger.info('📤 [Socket] Sending confirmation to client...');
        socket.emit('messageMarkedRead', { success: true });
        logger.info(`✅ [Socket] Confirmation sent - messageId: ${messageId}`);
        logger.info('========================================');
      } catch (err) {
        logger.error('❌ [Socket] markMessageRead error:', err);
        logger.error(`   Error message: ${err.message}`);
        logger.error(`   Error stack: ${err.stack}`);
        logger.error(`   Failed data:`, JSON.stringify(data));
        logger.info('========================================');
      }
    });

    socket.on('getRideMessages', async (data) => {
      try {
        logger.info('📚 ========================================');
        logger.info('📚 [Socket] getRideMessages event received');
        logger.info('📚 ========================================');
        logger.info(`🆔 Ride ID: ${data?.rideId}`);
        logger.info(`🔌 Socket ID: ${socket.id}`);
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`);

        const { rideId } = data || {};
        if (!rideId) {
          logger.warn('⚠️ [Socket] getRideMessages: rideId is missing');
          socket.emit('messageError', { message: 'rideId is required' });
          return;
        }

        logger.info('💾 [Socket] Fetching messages from database...');
        const messages = await getRideMessages(rideId);
        logger.info(`✅ [Socket] Messages fetched - count: ${messages?.length || 0}`);

        logger.info('🔄 [Socket] Formatting messages...');
        // Ensure messages are properly formatted with all required fields
        const formattedMessages = messages.map((msg, index) => {
          const formatted = {
            _id: msg._id,
            ride: msg.ride,
            rideId: msg.ride?.toString() || msg.ride,
            sender: msg.sender,
            senderModel: msg.senderModel,
            receiver: msg.receiver,
            receiverModel: msg.receiverModel,
            message: msg.message,
            messageType: msg.messageType || 'text',
            isRead: msg.isRead || false,
            createdAt: msg.createdAt,
            updatedAt: msg.updatedAt,
          };

          if (index < 3) {
            logger.info(`   Message ${index + 1}:`, {
              id: formatted._id,
              sender: formatted.senderModel,
              receiver: formatted.receiverModel,
              message: formatted.message?.substring(0, 30)
            });
          }

          return formatted;
        });

        logger.info(`✅ [Socket] Formatted ${formattedMessages.length} messages`);
        logger.info('📤 [Socket] Emitting rideMessages event...');
        socket.emit('rideMessages', formattedMessages);
        logger.info(`✅ [Socket] Ride messages sent - rideId: ${rideId}, count: ${formattedMessages?.length || 0}`);
        logger.info('========================================');
      } catch (err) {
        logger.error('❌ [Socket] getRideMessages error:', err);
        logger.error(`   Error message: ${err.message}`);
        logger.error(`   Error stack: ${err.stack}`);
        logger.error(`   Failed data:`, JSON.stringify(data));
        socket.emit('messageError', { message: err.message });
        logger.info('========================================');
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

// Process referral reward if this is user's first completed ride
async function processReferralRewardIfFirstRide(userId, rideId) {
  try {
    const Referral = require('../Models/User/referral.model');
    const User = require('../Models/User/user.model');
    const WalletTransaction = require('../Models/User/walletTransaction.model');

    // Check if user has a pending referral
    const referral = await Referral.findOne({
      referee: userId,
      status: 'PENDING'
    }).populate('referrer', 'fullName walletBalance');

    if (!referral) {
      return; // No referral to process
    }

    // Check if this is user's first completed ride
    const Ride = require('../Models/Driver/ride.model');
    const completedRides = await Ride.countDocuments({
      rider: userId,
      status: 'completed'
    });

    if (completedRides > 1) {
      return; // Not the first ride
    }

    // Get referral reward settings
    const referrerReward = 100; // ₹100 for referrer
    const refereeReward = 50;   // ₹50 for referee

    // Update referral status
    referral.status = 'COMPLETED';
    referral.firstRideCompletedAt = new Date();
    referral.reward = {
      referrerReward,
      refereeReward,
      rewardType: 'WALLET_CREDIT',
    };
    await referral.save();

    // Credit referrer's wallet
    const referrer = await User.findById(referral.referrer);
    if (referrer) {
      const balanceBefore = referrer.walletBalance || 0;
      const balanceAfter = balanceBefore + referrerReward;

      referrer.walletBalance = balanceAfter;
      referrer.referralRewardsEarned = (referrer.referralRewardsEarned || 0) + referrerReward;
      await referrer.save();

      // Create wallet transaction for referrer
      await WalletTransaction.create({
        user: referrer._id,
        transactionType: 'REFERRAL_REWARD',
        amount: referrerReward,
        balanceBefore,
        balanceAfter,
        status: 'COMPLETED',
        description: `Referral reward for referring user`,
        metadata: {
          referralId: referral._id,
          refereeId: userId,
        },
      });
    }

    // Credit referee's wallet
    const referee = await User.findById(userId);
    if (referee) {
      const balanceBefore = referee.walletBalance || 0;
      const balanceAfter = balanceBefore + refereeReward;

      referee.walletBalance = balanceAfter;
      await referee.save();

      // Create wallet transaction for referee
      await WalletTransaction.create({
        user: userId,
        transactionType: 'REFERRAL_REWARD',
        amount: refereeReward,
        balanceBefore,
        balanceAfter,
        relatedRide: rideId,
        status: 'COMPLETED',
        description: 'Welcome bonus for using referral code',
        metadata: {
          referralId: referral._id,
          referrerId: referral.referrer,
        },
      });
    }

    // Mark referral as rewarded
    referral.status = 'REWARDED';
    referral.rewardedAt = new Date();
    await referral.save();

    logger.info(`Referral reward processed automatically: Referrer ${referral.referrer} got ₹${referrerReward}, Referee ${userId} got ₹${refereeReward}`);
  } catch (error) {
    logger.error('Error processing referral reward automatically:', error);
    // Don't throw - this is a background operation
  }
}

module.exports = { initializeSocket, getSocketIO };
