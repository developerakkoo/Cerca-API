const { Server } = require('socket.io')
const logger = require('./logger')
const Driver = require('../Models/Driver/driver.model')
const User = require('../Models/User/user.model')
const Ride = require('../Models/Driver/ride.model')
const Message = require('../Models/Driver/message.model')
const AdminEarnings = require('../Models/Admin/adminEarnings.model')
const Settings = require('../Models/Admin/settings.modal')
const rideBookingQueue = require('../src/queues/rideBooking.queue')

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
  validateAndFixDriverStatus
} = require('./ride_booking_functions')

let io
let socketToUser = new Map()
let socketToDriver = new Map()

function initializeSocket (server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    },
    transports: ['polling', 'websocket'], // Allow both transports for better compatibility with reverse proxies
    pingInterval: 25000,
    pingTimeout: 60000
  })

  io.on('connection', socket => {
    logger.info(`Socket connected: ${socket.id}`)

    // ============================
    // RIDER CONNECTION
    // ============================
    socket.on('riderConnect', async data => {
      try {
        logger.info(
          `riderConnect event - userId: ${data?.userId}, socketId: ${socket.id}`
        )
        const { userId } = data || {}
        if (!userId) {
          logger.warn('riderConnect: userId is missing')
          return
        }

        // Check if user already has a socketId (reconnection scenario)
        const currentUser = await User.findById(userId)
        if (currentUser?.socketId && currentUser.socketId !== socket.id) {
          logger.info(
            `Rider ${userId} reconnecting. Old socketId: ${currentUser.socketId}, New socketId: ${socket.id}`
          )

          // // Check if old socket is still connected
          // const oldSocket = io.sockets.sockets.get(currentUser.socketId);
          // if (oldSocket && oldSocket.connected) {
          //   logger.warn(`Rider ${userId} reconnecting from new device/connection. Disconnecting old socket: ${currentUser.socketId}`);
          //   oldSocket.disconnect();
          // } else {
          //   logger.info(`Rider ${userId} old socket ${currentUser.socketId} is not connected, cleaning up stale socketId`);
          // }

          // 🔥 MULTI-SERVER SAFE RECONNECTION HANDLING
          logger.info(
            `Rider ${userId} reconnecting. Clearing old socketId: ${currentUser.socketId}`
          )

          // Just clear old socketId from DB
          // Do NOT try to disconnect old socket (it may be on another server)
          await clearUserSocket(userId, currentUser.socketId)

          // Clear old socketId before setting new one

          logger.info(`Cleaned up old socketId for rider ${userId}`)
        }

        await setUserSocket(userId, socket.id)
        socketToUser.set(socket.id, String(userId))
        socket.join('rider')
        socket.join(`user_${userId}`)

        // Auto-join all active ride rooms for this user
        logger.info(`🚪 [Socket] Auto-joining user to active ride rooms...`)
        const activeRides = await Ride.find({
          rider: userId,
          status: { $in: ['requested', 'accepted', 'arrived', 'in_progress'] }
        })
          .select('_id status')
          .lean()

        if (!socket.data.rooms) {
          socket.data.rooms = []
        }

        for (const ride of activeRides) {
          const roomName = `ride_${ride._id}`
          socket.join(roomName)
          if (!socket.data.rooms.includes(roomName)) {
            socket.data.rooms.push(roomName)
          }
          logger.info(
            `✅ [Socket] User auto-joined room: ${roomName} (ride status: ${ride.status})`
          )
        }

        logger.info(
          `✅ [Socket] User auto-joined ${activeRides.length} active ride rooms`
        )

        logger.info(
          `Rider connected successfully - userId: ${userId}, socketId: ${socket.id}`
        )
        // io.emit('riderConnect', { userId })
      } catch (err) {
        logger.error('riderConnect error:', err)
        socket.emit('errorEvent', {
          message: 'Failed to register rider socket'
        })
      }
    })

    // ============================
    // DRIVER CONNECTION
    // ============================
   socket.on('driverConnect', async data => {
  try {
    logger.info(
      `driverConnect event - driverId: ${data?.driverId}, socketId: ${socket.id}`
    )

    const { driverId } = data || {}
    if (!driverId) {
      logger.warn('driverConnect: driverId is missing')
      return
    }

    // ============================
    // RECONNECTION HANDLING
    // ============================
    const currentDriver = await Driver.findById(driverId)

    if (currentDriver?.socketId && currentDriver.socketId !== socket.id) {
      logger.info(
        `Driver ${driverId} reconnecting. Old socketId: ${currentDriver.socketId}, New socketId: ${socket.id}`
      )

      // 🔥 MULTI-SERVER SAFE: only clean DB, do NOT disconnect old socket
      await clearDriverSocket(driverId, currentDriver.socketId)

      logger.info(`Cleaned up old socketId for driver ${driverId}`)
    }

    // ============================
    // SET NEW SOCKET
    // ============================
    const driver = await setDriverSocket(driverId, socket.id)

    // ✅ CHANGE: ensure driver is online
    await Driver.findByIdAndUpdate(driverId, {
      isOnline: true,
      socketId: socket.id,
      lastSeen: new Date()
    })

    // ============================
    // BIND SOCKET ↔ DRIVER (CRITICAL)
    // ============================
    socketToDriver.set(socket.id, String(driverId))
    socket.data.driverId = driverId        // ✅ CHANGE (MOST IMPORTANT)

    socket.join('driver')
    socket.join(`driver_${driverId}`)

    // ============================
    // AUTO-JOIN ACTIVE RIDE ROOMS
    // ============================
    logger.info(`🚪 [Socket] Auto-joining driver to active ride rooms...`)

    const activeRides = await Ride.find({
      driver: driverId,
      status: { $in: ['requested', 'accepted', 'arrived', 'in_progress'] }
    })
      .select('_id status')
      .lean()

    if (!socket.data.rooms) {
      socket.data.rooms = []
    }

    for (const ride of activeRides) {
      const roomName = `ride_${ride._id}`
      socket.join(roomName)

      if (!socket.data.rooms.includes(roomName)) {
        socket.data.rooms.push(roomName)
      }

      logger.info(
        `✅ [Socket] Driver auto-joined room: ${roomName} (ride status: ${ride.status})`
      )
    }

    logger.info(
      `✅ [Socket] Driver auto-joined ${activeRides.length} active ride rooms`
    )

    // ============================
    // VALIDATE AND FIX DRIVER STATUS
    // ============================
    // Ensure driver isBusy status matches actual active rides
    let correctedDriver = driver
    try {
      const validationResult = await validateAndFixDriverStatus(driverId)
      if (validationResult.corrected) {
        logger.info(
          `✅ [Socket] Driver ${driverId} status corrected on connection: ${validationResult.reason}`
        )
        // Refresh driver data after correction
        correctedDriver = await Driver.findById(driverId)
      }
    } catch (validationError) {
      logger.error(
        `❌ [Socket] Error validating driver status for ${driverId}: ${validationError.message}`
      )
      // Continue with connection even if validation fails
    }

    // ============================
    // VALIDATE SOCKET ID
    // ============================
    // Ensure socketId is properly set and not empty
    const updatedDriver = await Driver.findById(driverId)
    if (!updatedDriver?.socketId || updatedDriver.socketId.trim() === '') {
      logger.warn(
        `⚠️ [Socket] Driver ${driverId} socketId is missing or empty after connection. Setting to ${socket.id}`
      )
      await Driver.findByIdAndUpdate(driverId, {
        socketId: socket.id
      })
    } else if (updatedDriver.socketId !== socket.id) {
      logger.warn(
        `⚠️ [Socket] Driver ${driverId} socketId mismatch. Expected: ${socket.id}, Found: ${updatedDriver.socketId}. Updating...`
      )
      await Driver.findByIdAndUpdate(driverId, {
        socketId: socket.id
      })
    }

    // ============================
    // FINAL CONFIRMATIONS
    // ============================
    // Get final driver state after all corrections
    const finalDriver = await Driver.findById(driverId)
    
    logger.info(
      `Driver connected successfully - driverId: ${driverId}, socketId: ${socket.id}, isActive: ${finalDriver?.isActive}, isBusy: ${finalDriver?.isBusy}`
    )

    if (finalDriver) {
      io.to('admin').emit('driverConnected', {
        driverId: finalDriver._id,
        isOnline: true
      })
    }

    socket.emit('driverStatusUpdate', {
      driverId,
      isOnline: true,
      isActive: finalDriver?.isActive || false,
      isBusy: finalDriver?.isBusy || false
    })
  } catch (err) {
    logger.error('driverConnect error:', err)
    socket.emit('errorEvent', {
      message: 'Failed to register driver socket'
    })
  }
})


    // ============================
    // DRIVER TOGGLE STATUS (ON/OFF for accepting rides)
    // ============================
    socket.on('driverToggleStatus', async data => {
      try {
        logger.info(
          `driverToggleStatus event - driverId: ${data?.driverId}, isActive: ${data?.isActive}`
        )
        const { driverId, isActive } = data || {}

        if (!driverId) {
          logger.warn('driverToggleStatus: driverId is missing')
          socket.emit('errorEvent', { message: 'Driver ID is required' })
          return
        }

        if (typeof isActive !== 'boolean') {
          logger.warn('driverToggleStatus: isActive must be boolean')
          socket.emit('errorEvent', {
            message: 'isActive must be a boolean value'
          })
          return
        }

        // Update driver's isActive status (toggle)
        const driver = await Driver.findByIdAndUpdate(
          driverId,
          { isActive },
          { new: true }
        )

        if (!driver) {
          logger.error(`driverToggleStatus: Driver not found - ${driverId}`)
          socket.emit('errorEvent', { message: 'Driver not found' })
          return
        }

        logger.info(
          `Driver toggle status updated - driverId: ${driverId}, isActive: ${isActive}, isOnline: ${driver.isOnline}`
        )

        // Send confirmation back to driver
        socket.emit('driverStatusUpdate', {
          driverId,
          isOnline: driver.isOnline,
          isActive: driver.isActive,
          isBusy: driver.isBusy,
          message: isActive
            ? 'You are now accepting ride requests'
            : 'You are now offline for ride requests'
        })

        // Broadcast status change to admin/monitoring systems if needed
        // io.emit('driverStatusChanged', {
        //   driverId,
        //   isActive: driver.isActive,
        //   isOnline: driver.isOnline
        // })

        io.to('admin').emit('driverStatusChanged', {
          driverId,
          isActive: driver.isActive,
          isOnline: driver.isOnline
        })
      } catch (err) {
        logger.error('driverToggleStatus error:', err)
        socket.emit('errorEvent', { message: 'Failed to update driver status' })
      }
    })

    // ============================
    // DRIVER LOCATION UPDATE
    // ============================
    socket.on('driverLocationUpdate', async data => {
      try {
        const coords = data.location?.coordinates || [
          data.location?.longitude,
          data.location?.latitude
        ]
        logger.info(
          `driverLocationUpdate - driverId: ${data?.driverId}, rideId: ${
            data?.rideId || 'none'
          }, coordinates: [${coords[0]}, ${coords[1]}]`
        )
        await updateDriverLocation(data.driverId, data.location)
        // io.emit('driverLocationUpdate', data)

        if (data.rideId) {
          io.to(`ride_${data.rideId}`).emit('driverLocationUpdate', data)
        }

        // Notify specific rider if ride is in progress
        if (data.rideId) {
          // const ride = await Ride.findById(data.rideId)
          // if (ride && ride.userSocketId) {
          //   io.to(ride.userSocketId).emit('driverLocationUpdate', data)
          //   logger.info(
          //     `Location update sent to rider - rideId: ${data.rideId}`
          //   )
          // }
        }
        logger.info(
          `Driver location updated successfully - driverId: ${data.driverId}`
        )
      } catch (error) {
        logger.error('Error updating driver location:', error)
        socket.emit('errorEvent', { message: 'Failed to update location' })
      }
    })

    // ============================
    // DRIVER DISCONNECT
    // ============================
    socket.on('driverDisconnect', async data => {
      try {
        logger.info(
          `driverDisconnect event - driverId: ${data?.driverId}, socketId: ${socket.id}`
        )
        const { driverId } = data || {}
        if (!driverId) {
          logger.warn('driverDisconnect: driverId is missing')
          return
        }

        await clearDriverSocket(driverId, socket.id)
        // await updateDriverStatus(driverId, false, '')
        // await Driver.findByIdAndUpdate(driverId, { isOnline: false })
        // Don't change `isActive` here; driver toggle should be explicit via `driverToggleStatus`.
        // `clearDriverSocket` sets `isOnline:false` and clears `socketId` when appropriate.
        // io.emit('driverDisconnect', { driverId })
        io.to('admin').emit('driverDisconnect', { driverId })

        logger.info(`Driver disconnected successfully - driverId: ${driverId}`)
      } catch (err) {
        logger.error('driverDisconnect error:', err)
      }
    })

    // ============================
    // CREATE NEW RIDE REQUEST
    // ============================
    socket.on('newRideRequest', async data => {
      try {
        logger.info(
          `newRideRequest event - riderId: ${
            data?.rider || data?.riderId
          }, service: ${data?.service}`
        )

        // Verify Razorpay payment if payment method is RAZORPAY
        if (data.paymentMethod === 'RAZORPAY' && data.razorpayPaymentId) {
          try {
            const Razorpay = require('razorpay')
            const razorpayKey =
              process.env.RAZORPAY_ID || 'rzp_live_S6q5OGF0WYChTn'
            const razorpaySecret =
              process.env.RAZORPAY_SECRET || 'EZv5VecWiWi0FLyffYLDTM3H'
            const razorpayInstance = new Razorpay({
              key_id: razorpayKey,
              key_secret: razorpaySecret
            })

            // Fetch payment details from Razorpay
            const payment = await razorpayInstance.payments.fetch(
              data.razorpayPaymentId
            )

            // Verify payment status
            if (
              payment.status !== 'captured' &&
              payment.status !== 'authorized'
            ) {
              logger.warn(
                `Razorpay payment not captured - Payment ID: ${data.razorpayPaymentId}, Status: ${payment.status}`
              )
              socket.emit('rideError', {
                message: 'Payment not verified. Please complete payment first.',
                code: 'PAYMENT_NOT_VERIFIED'
              })
              return
            }

            // Verify payment amount matches expected Razorpay amount (allow 1 paise difference for rounding)
            const paymentAmount = payment.amount / 100 // Convert from paise to rupees
            const expectedAmount =
              data.razorpayAmountPaid !== undefined
                ? Number(data.razorpayAmountPaid)
                : Number(data.fare || 0)

            if (!expectedAmount || expectedAmount <= 0) {
              logger.warn(
                `Invalid expected Razorpay amount - Expected: ₹${expectedAmount}`
              )
              socket.emit('rideError', {
                message: 'Invalid payment amount. Please try again.',
                code: 'PAYMENT_AMOUNT_INVALID'
              })
              return
            }

            if (Math.abs(paymentAmount - expectedAmount) > 0.01) {
              logger.warn(
                `Payment amount mismatch - Payment: ₹${paymentAmount}, Expected: ₹${expectedAmount}`
              )
              socket.emit('rideError', {
                message: 'Payment amount mismatch. Please try again.',
                code: 'PAYMENT_AMOUNT_MISMATCH'
              })
              return
            }

            logger.info(
              `Razorpay payment verified - Payment ID: ${data.razorpayPaymentId}, Amount: ₹${paymentAmount}`
            )
          } catch (paymentError) {
            logger.error(`Error verifying Razorpay payment:`, paymentError)
            socket.emit('rideError', {
              message: 'Payment verification failed. Please try again.',
              code: 'PAYMENT_VERIFICATION_FAILED'
            })
            return
          }
        }

        // Check for existing active ride to prevent duplicates
        const riderId = data.rider || data.riderId
        if (riderId) {
          const existingActiveRide = await Ride.findOne({
            rider: riderId,
            status: { $in: ['requested', 'accepted', 'in_progress'] }
          })

          if (existingActiveRide) {
            logger.warn(
              `Duplicate ride attempt prevented for rider ${riderId}. Active ride: ${existingActiveRide._id}`
            )
            socket.emit('rideError', {
              message:
                'You already have an active ride. Please cancel it before booking a new one.',
              code: 'DUPLICATE_RIDE_ATTEMPT',
              activeRideId: existingActiveRide._id
            })
            return
          }
        }

        // Log fare information from frontend
        logger.info(
          `[Fare Tracking] newRideRequest - fare from frontend: ₹${data.fare || 'not provided'}, distance: ${data.distanceInKm || 'not provided'}km, service: ${data.service || 'not provided'}`
        )

        const ride = await createRide(data)
        logger.info(
          `Ride created - rideId: ${ride._id}, fare stored: ₹${ride.fare}, distance: ${ride.distanceInKm}km`
        )
        
        logger.info(
          `[Fare Tracking] Ride creation complete - rideId: ${ride._id}, fare from frontend: ₹${data.fare || 'not provided'}, fare stored in ride: ₹${ride.fare}`
        )

        // Process hybrid payment if applicable
        if (
          data.paymentMethod === 'RAZORPAY' &&
          data.walletAmountUsed &&
          data.walletAmountUsed > 0 &&
          data.razorpayPaymentId
        ) {
          try {
            const User = require('../Models/User/user.model')
            const WalletTransaction = require('../Models/User/walletTransaction.model')
            const riderId = data.rider || data.riderId
            const walletAmount = Number(data.walletAmountUsed || 0)
            const razorpayAmountPaid = Number(data.razorpayAmountPaid || 0)

            if (walletAmount <= 0 || walletAmount > ride.fare) {
              logger.warn(
                `Invalid wallet amount for hybrid payment - Ride: ${ride._id}, Wallet: ₹${walletAmount}, Fare: ₹${ride.fare}`
              )
              ride.paymentStatus = 'failed'
              await ride.save()
              return
            }

            if (razorpayAmountPaid > 0 && razorpayAmountPaid < 10) {
              logger.warn(
                `Invalid Razorpay amount for hybrid payment (min ₹10) - Ride: ${ride._id}, Razorpay: ₹${razorpayAmountPaid}`
              )
              ride.paymentStatus = 'failed'
              await ride.save()
              return
            }

            if (Math.abs(walletAmount + razorpayAmountPaid - ride.fare) > 0.01) {
              logger.warn(
                `Hybrid payment total mismatch - Ride: ${ride._id}, Wallet: ₹${walletAmount}, Razorpay: ₹${razorpayAmountPaid}, Fare: ₹${ride.fare}`
              )
              ride.paymentStatus = 'failed'
              await ride.save()
              return
            }

            // Get user
            const user = await User.findById(riderId)
            if (user) {
              const balanceBefore = user.walletBalance || 0

              // Idempotency: prevent double deduction for the same ride
              const existingTransaction = await WalletTransaction.findOne({
                relatedRide: ride._id,
                transactionType: 'RIDE_PAYMENT',
                'metadata.hybridPayment': true
              })

              if (existingTransaction) {
                logger.warn(
                  `Hybrid payment already processed - Ride: ${ride._id}, Transaction: ${existingTransaction._id}`
                )
                return
              }

              // Check sufficient balance
              if (balanceBefore >= walletAmount) {
                const balanceAfter = balanceBefore - walletAmount

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
                  description: `Ride payment (hybrid) - Wallet: ₹${walletAmount}, Razorpay: ₹${
                    data.razorpayAmountPaid || 0
                  }`,
                  metadata: {
                    hybridPayment: true,
                    razorpayPaymentId: data.razorpayPaymentId,
                    totalAmount: ride.fare
                  }
                })

                // Update user wallet balance
                user.walletBalance = balanceAfter
                await user.save()

                // Update ride with payment details
                ride.walletAmountUsed = walletAmount
                ride.razorpayAmountPaid = razorpayAmountPaid || ride.fare - walletAmount
                ride.razorpayPaymentId = data.razorpayPaymentId
                ride.paymentStatus = 'completed'
                ride.transactionId = data.razorpayPaymentId
                await ride.save()

                logger.info(
                  `Hybrid payment processed - Ride: ${
                    ride._id
                  }, Wallet: ₹${walletAmount}, Razorpay: ₹${
                    data.razorpayAmountPaid || 0
                  }`
                )
              } else {
                logger.warn(
                  `Insufficient wallet balance for hybrid payment - Ride: ${ride._id}, Required: ₹${walletAmount}, Available: ₹${balanceBefore}`
                )
                // Don't fail ride creation, but log warning
              }
            }
          } catch (hybridError) {
            logger.error(
              `Error processing hybrid payment for ride ${ride._id}:`,
              hybridError
            )
            // Don't fail ride creation if hybrid payment processing fails
            // The ride will be created but payment status may be pending
          }
        }

        const populatedRide = await Ride.findById(ride._id)
          .populate('rider', 'fullName name phone email')
          .exec()

        // ============================
        // PUSH RIDE TO QUEUE (Redis or in-process fallback)
        // ============================
        logger.info(`📥 Queuing ride ${ride._id} for driver discovery`)

        // If Redis is enabled we already export a real queue; otherwise the in-process
        // queue implementation will call `processRideJob` immediately.
        await rideBookingQueue.add('process-ride', {
          rideId: ride._id.toString()
        })

        logger.info(`✅ Ride ${ride._id} queued for driver discovery`)

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
          io.to(populatedRide.userSocketId).emit('rideRequested', populatedRide)
          logger.info(
            `Ride request confirmation sent to rider: ${
              data.rider || data.riderId
            }`
          )
        }

        // Create notification for rider
        await createNotification({
          recipientId: data.rider || data.riderId,
          recipientModel: 'User',
          title: 'Ride Requested',
          message: 'Your ride request has been sent to nearby drivers',
          type: 'ride_request',
          relatedRide: ride._id
        })

        logger.info(
          `newRideRequest completed successfully - rideId: ${ride._id}`
        )
      } catch (err) {
        logger.error('newRideRequest error:', err)
        logger.error('Error details:', {
          message: err.message,
          stack: err.stack,
          rideData: {
            rider: data?.rider || data?.riderId,
            service: data?.service,
            bookingType: data?.bookingType,
            hasBookingMeta: !!data?.bookingMeta,
            bookingMetaKeys: data?.bookingMeta
              ? Object.keys(data.bookingMeta)
              : [],
            hasPickupLocation: !!data?.pickupLocation,
            hasDropoffLocation: !!data?.dropoffLocation,
            pickupLocationFormat: data?.pickupLocation
              ? data.pickupLocation.coordinates
                ? 'GeoJSON'
                : 'lat/lng'
              : 'missing',
            dropoffLocationFormat: data?.dropoffLocation
              ? data.dropoffLocation.coordinates
                ? 'GeoJSON'
                : 'lat/lng'
              : 'missing'
          }
        })

        // Extract error message - handle nested errors
        let errorMessage = 'Failed to create ride'
        if (err.message) {
          errorMessage = err.message
        } else if (err.toString && err.toString() !== '[object Object]') {
          errorMessage = err.toString()
        }

        // Extract error code if available
        const errorCode = err.code || 'RIDE_CREATION_FAILED'

        // Send detailed error to client (always include details for debugging)
        socket.emit('rideError', {
          message: errorMessage,
          code: errorCode,
          details: err.stack || err.toString()
        })
      }
    })

    // ============================
    // DRIVER ACCEPTS RIDE
    // ============================
    socket.on('rideAccepted', async data => {
      try {
        logger.info(
          `rideAccepted event - rideId: ${data?.rideId}, driverId: ${data?.driverId}`
        )
        const { rideId, driverId } = data || {}
        if (!rideId || !driverId) {
          logger.warn('rideAccepted: Missing rideId or driverId')
          return
        }

        const assignedRide = await assignDriverToRide(
          rideId,
          driverId,
          socket.id
        )
        logger.info(
          `Ride assigned successfully - rideId: ${rideId}, driverId: ${driverId}, driver: ${assignedRide.driver.name}`
        )

        // Check if this is a Full Day booking
        const isFullDayBooking = assignedRide.bookingType === 'FULL_DAY'

        // Add metadata to ride object for client-side handling
        const rideWithMetadata = {
          ...(assignedRide.toObject ? assignedRide.toObject() : assignedRide),
          isFullDayBooking
        }

        // Notify rider
        if (assignedRide.userSocketId) {
          io.to(assignedRide.userSocketId).emit(
            'rideAccepted',
            rideWithMetadata
          )
          logger.info(
            `Ride acceptance notification sent to rider: ${assignedRide.rider._id} | isFullDayBooking: ${isFullDayBooking}`
          )
        }

        // Notify driver
        if (assignedRide.driverSocketId) {
          io.to(assignedRide.driverSocketId).emit(
            'rideAssigned',
            rideWithMetadata
          )
          logger.info(
            `Ride assignment confirmation sent to driver: ${driverId} | isFullDayBooking: ${isFullDayBooking}`
          )
        }

        // Create notifications
        await createNotification({
          recipientId: assignedRide.rider._id,
          recipientModel: 'User',
          title: 'Driver Accepted',
          message: `${assignedRide.driver.name} is coming to pick you up`,
          type: 'ride_accepted',
          relatedRide: rideId
        })

        await createNotification({
          recipientId: assignedRide.driver._id,
          recipientModel: 'Driver',
          title: 'Ride Assigned',
          message: 'You have accepted a new ride',
          type: 'ride_accepted',
          relatedRide: rideId
        })

        // Auto-join both user and driver sockets to ride room
        const roomName = `ride_${rideId}`
        logger.info(`🚪 [Socket] Auto-joining sockets to room: ${roomName}`)

        // // Join driver socket to room
        // if (assignedRide.driverSocketId) {
        //   const driverSocket = io.sockets.sockets.get(
        //     assignedRide.driverSocketId
        //   )
        //   if (driverSocket) {
        //     driverSocket.join(roomName)
        //     if (!driverSocket.data.rooms) {
        //       driverSocket.data.rooms = []
        //     }
        //     if (!driverSocket.data.rooms.includes(roomName)) {
        //       driverSocket.data.rooms.push(roomName)
        //     }
        //     logger.info(
        //       `✅ [Socket] Driver socket ${assignedRide.driverSocketId} auto-joined room: ${roomName}`
        //     )
        //   } else {
        //     logger.warn(
        //       `⚠️ [Socket] Driver socket not found: ${assignedRide.driverSocketId}`
        //     )
        //   }
        // }

        // 🔥 MULTI-SERVER SAFE: ask client to join the ride room itself
        if (assignedRide.driverSocketId) {
          io.to(assignedRide.driverSocketId).emit('joinRideRoom', {
            rideId,
            driverId: assignedRide.driver._id || assignedRide.driver,
            userType: 'Driver'
          })

          logger.info(
            `📡 [Socket] Sent joinRideRoom request to driver socket ${assignedRide.driverSocketId} for room ${roomName}`
          )
        }

        // Join user socket to room
        // if (assignedRide.userSocketId) {
        //   const userSocket = io.sockets.sockets.get(assignedRide.userSocketId)
        //   if (userSocket) {
        //     userSocket.join(roomName)
        //     if (!userSocket.data.rooms) {
        //       userSocket.data.rooms = []
        //     }
        //     if (!userSocket.data.rooms.includes(roomName)) {
        //       userSocket.data.rooms.push(roomName)
        //     }
        //     logger.info(
        //       `✅ [Socket] User socket ${assignedRide.userSocketId} auto-joined room: ${roomName}`
        //     )
        //   } else {
        //     logger.warn(
        //       `⚠️ [Socket] User socket not found: ${assignedRide.userSocketId}`
        //     )
        //   }
        // }

        // 🔥 MULTI-SERVER SAFE: ask user client to join the ride room itself
        // 🔥 MULTI-SERVER SAFE: ask user client to join the ride room itself
        if (assignedRide.userSocketId) {
          io.to(assignedRide.userSocketId).emit('joinRideRoom', {
            rideId,
            userId: assignedRide.rider._id || assignedRide.rider,
            userType: 'User'
          })

          logger.info(
            `📡 [Socket] Sent joinRideRoom request to user socket ${assignedRide.userSocketId} for room ${roomName}`
          )
        }

        // io.emit('rideAccepted', rideWithMetadata)
        io.to(`ride_${rideId}`).emit('rideAccepted', rideWithMetadata)

        // 🔥 Notify all other drivers that this ride is no longer available
        try {
          const rideWithNotifiedDrivers = await Ride.findById(rideId)
            .select('notifiedDrivers driver')
            .lean()

          if (rideWithNotifiedDrivers && rideWithNotifiedDrivers.notifiedDrivers) {
            const acceptingDriverId = assignedRide.driver._id || assignedRide.driver
            const otherDriverIds = rideWithNotifiedDrivers.notifiedDrivers.filter(
              (id) => id.toString() !== acceptingDriverId.toString()
            )

            if (otherDriverIds.length > 0) {
              logger.info(
                `📢 Notifying ${otherDriverIds.length} other drivers that ride ${rideId} is no longer available`
              )

              // Get socketIds for all other drivers
              const Driver = require('../Models/Driver/driver.model')
              const otherDrivers = await Driver.find({
                _id: { $in: otherDriverIds }
              }).select('socketId _id').lean()

              let notifiedOtherDrivers = 0
              for (const otherDriver of otherDrivers) {
                if (otherDriver.socketId) {
                  io.to(otherDriver.socketId).emit('rideNoLongerAvailable', {
                    rideId: rideId,
                    message: 'This ride has been accepted by another driver'
                  })
                  notifiedOtherDrivers++
                }
              }

              logger.info(
                `✅ Notified ${notifiedOtherDrivers} other drivers that ride ${rideId} is no longer available`
              )
            }
          }
        } catch (notifyError) {
          logger.error(
            `❌ Error notifying other drivers about ride removal: ${notifyError.message}`
          )
          // Don't fail the ride acceptance if notification fails
        }

        logger.info(
          `rideAccepted completed successfully - rideId: ${rideId} | isFullDayBooking: ${isFullDayBooking}`
        )
      } catch (err) {
        logger.error('rideAccepted error:', err)
        
        // Provide specific error messages based on error type
        let errorMessage = err.message || 'Failed to accept ride'
        let errorCode = 'RIDE_ACCEPTANCE_FAILED'
        
        if (err.message && err.message.includes('already accepted')) {
          errorMessage = 'This ride has already been accepted by another driver'
          errorCode = 'RIDE_ALREADY_ACCEPTED'
        } else if (err.message && err.message.includes('no longer available')) {
          errorMessage = 'This ride is no longer available'
          errorCode = 'RIDE_NO_LONGER_AVAILABLE'
        } else if (err.message && err.message.includes('not found')) {
          errorMessage = 'Ride not found'
          errorCode = 'RIDE_NOT_FOUND'
        } else if (err.message && err.message.includes('not available on selected dates')) {
          errorMessage = 'You are not available on the selected dates'
          errorCode = 'DRIVER_NOT_AVAILABLE'
        }
        
        socket.emit('rideError', {
          message: errorMessage,
          code: errorCode,
          rideId: data?.rideId
        })
        
        logger.warn(
          `Ride acceptance failed - rideId: ${data?.rideId}, driverId: ${data?.driverId}, error: ${errorMessage}`
        )
      }
    })

    // ============================
    // DRIVER REJECTS RIDE
    // ============================
    socket.on('rideRejected', async data => {
      try {
        logger.info(
          `rideRejected event - rideId: ${data?.rideId}, driverId: ${data?.driverId}`
        )
        const { rideId, driverId } = data || {}
        if (!rideId || !driverId) {
          logger.warn('rideRejected: Missing rideId or driverId')
          return
        }

        // Get the ride to check current status
        const ride = await Ride.findById(rideId).populate(
          'rider',
          'fullName name phone email'
        )
        if (!ride) {
          logger.warn(`rideRejected: Ride not found - rideId: ${rideId}`)
          return
        }

        // Check if ride is already accepted or completed
        if (ride.status !== 'requested') {
          logger.info(
            `rideRejected: Ride ${rideId} is already ${ride.status}, ignoring rejection`
          )
          return
        }

        // Add driver to rejectedDrivers array (avoid duplicates)
        const updatedRide = await Ride.findByIdAndUpdate(
          rideId,
          {
            $addToSet: { rejectedDrivers: driverId }
          },
          { new: true }
        )

        logger.info(
          `Driver ${driverId} rejected ride ${rideId}. Total rejections: ${updatedRide.rejectedDrivers.length}`
        )

        // Clean up any redis lock and ensure driver is marked not busy
        try {
          // Ensure driver is not stuck as busy after rejecting the ride
          await Driver.findByIdAndUpdate(driverId, {
            isBusy: false,
            busyUntil: null
          })

          logger.info(
            `Driver ${driverId} marked as available after rejecting ride ${rideId}`
          )
        } catch (cleanupErr) {
          logger.warn(
            `Failed to clear busy state for driver ${driverId} after rejection: ${cleanupErr.message}`
          )
        }

        // Check if all notified drivers have rejected
        const notifiedCount = updatedRide.notifiedDrivers
          ? updatedRide.notifiedDrivers.length
          : 0
        const rejectedCount = updatedRide.rejectedDrivers.length

        logger.info(
          `Rejection status for rideId: ${rideId} - Notified: ${notifiedCount}, Rejected: ${rejectedCount}`
        )

        if (notifiedCount > 0 && rejectedCount >= notifiedCount) {
          // All notified drivers have rejected
          logger.warn(
            `All ${notifiedCount} notified drivers have rejected ride ${rideId}`
          )

          // 🔒 CRITICAL: Check ride status before retrying search
          // This prevents retrying for cancelled rides
          const rideStatusCheck = await Ride.findById(rideId).select('status')
          if (!rideStatusCheck) {
            logger.warn(
              `⚠️ Ride ${rideId} not found during status check before retry, aborting retry`
            )
            return
          }

          if (rideStatusCheck.status !== 'requested') {
            logger.warn(
              `⚠️ Ride ${rideId} status changed to '${rideStatusCheck.status}' before retry search. Skipping retry.`
            )
            return
          }

          logger.info(
            `✅ Ride ${rideId} status verified as 'requested' before retry search`
          )

          // Try searching again with larger radius (15km, 20km, 25km)
          logger.info(
            `🔍 Retrying driver search with larger radius for rideId: ${rideId}`
          )
          const { drivers: newDrivers, radiusUsed } =
            await searchDriversWithProgressiveRadius(
              ride.pickupLocation,
              [15000, 20000, 25000], // Larger radii in meters
              ride.bookingType || null
            )

          // Filter out already rejected drivers
          const rejectedDriverIds = updatedRide.rejectedDrivers.map(id =>
            id.toString()
          )
          const availableNewDrivers = newDrivers.filter(
            driver => !rejectedDriverIds.includes(driver._id.toString())
          )

          logger.info(
            `Found ${availableNewDrivers.length} new available drivers (excluding ${rejectedCount} rejected) within ${radiusUsed}m radius`
          )
          logger.info(
            `🔍 Retry search status - RideId: ${rideId}, New drivers found: ${availableNewDrivers.length}, Radius used: ${radiusUsed}m`
          )

          if (availableNewDrivers.length > 0) {
            // Found new drivers, notify them
            let notifiedCount = 0
            let skippedCount = 0
            let statusChangedCount = 0
            const newNotifiedDriverIds = []

            // Use for loop instead of forEach to allow breaking on status change
            for (const driver of availableNewDrivers) {
              if (!driver.socketId) {
                logger.warn(`⚠️ Retry: Driver ${driver._id} has no socketId`)
                skippedCount++
                continue
              }

              // 🔒 ATOMIC CHECK: Verify ride status before each retry notification
              // This prevents sending requests for cancelled/accepted rides
              const currentRideStatus = await Ride.findById(rideId).select('status')
              if (!currentRideStatus) {
                logger.warn(
                  `⚠️ Retry: Ride ${rideId} not found during notification to driver ${driver._id}, aborting remaining notifications`
                )
                skippedCount++
                break // Break loop if ride doesn't exist
              }

              if (currentRideStatus.status !== 'requested') {
                logger.warn(
                  `⚠️ Retry: Ride ${rideId} status changed to '${currentRideStatus.status}' before notifying driver ${driver._id}. Skipping notification and remaining drivers.`
                )
                statusChangedCount++
                skippedCount++
                break // Break loop if ride status changed
              }

              const populatedRide = {
                ...ride.toObject(),
                _id: ride._id
              }

              // ✅ MULTI-SERVER SAFE emit
              io.to(driver.socketId).emit('newRideRequest', populatedRide)

              logger.info(
                `📡 Retry: Ride request sent to driver ${driver._id} (socketId: ${driver.socketId}) | Status: ${currentRideStatus.status}`
              )

              notifiedCount++
              newNotifiedDriverIds.push(driver._id)
            }

            if (statusChangedCount > 0) {
              logger.warn(
                `⚠️ Retry: ${statusChangedCount} driver notification(s) skipped due to ride status change during retry processing`
              )
            }

            // Update notifiedDrivers to include new drivers
            const allNotifiedDrivers = [
              ...(updatedRide.notifiedDrivers || []),
              ...newNotifiedDriverIds
            ]
            await Ride.findByIdAndUpdate(rideId, {
              $set: { notifiedDrivers: allNotifiedDrivers }
            })

            logger.info(
              `📝 Updated notifiedDrivers: ${allNotifiedDrivers.length} total drivers notified for rideId: ${rideId}`
            )
            logger.info(
              `✅ Retry search successful - ${notifiedCount} new drivers notified for rideId: ${rideId}, Skipped: ${skippedCount}, StatusChanged: ${statusChangedCount}`
            )

            if (statusChangedCount > 0) {
              logger.warn(
                `⚠️ Retry: ${statusChangedCount} driver notification(s) skipped due to ride status change during retry processing for rideId: ${rideId}`
              )
            }
          } else {
            // No more drivers available, cancel the ride
            // 🔒 CRITICAL: Check ride status before cancelling
            // This prevents cancelling already-cancelled or accepted rides
            const cancelStatusCheck = await Ride.findById(rideId).select('status')
            if (!cancelStatusCheck) {
              logger.warn(
                `⚠️ Ride ${rideId} not found during status check before cancellation, aborting cancellation`
              )
              return
            }

            if (cancelStatusCheck.status !== 'requested') {
              logger.warn(
                `⚠️ Ride ${rideId} status changed to '${cancelStatusCheck.status}' before cancellation. Skipping cancellation (ride already ${cancelStatusCheck.status}).`
              )
              return
            }

            logger.info(
              `✅ Ride ${rideId} status verified as 'requested' before cancellation`
            )
            logger.info(
              `🔍 Retry cancellation status - RideId: ${rideId}, Status: ${cancelStatusCheck.status}, Reason: All drivers rejected or unavailable`
            )

            logger.warn(
              `❌ No more drivers available for rideId: ${rideId} after all rejections. Cancelling ride.`
            )

            await Ride.findByIdAndUpdate(rideId, {
              $set: {
                status: 'cancelled',
                cancelledBy: 'system',
                cancellationReason: 'All drivers rejected or unavailable'
              }
            })

            // Notify rider
            if (ride.userSocketId) {
              io.to(ride.userSocketId).emit('noDriverFound', {
                rideId: ride._id,
                message:
                  'No drivers available. All nearby drivers have declined the ride. Please try again later.'
              })
              logger.info(
                `No driver found event sent to rider: ${ride.rider._id}`
              )
            } else {
              logger.warn(
                `⚠️ Cannot send noDriverFound event: userSocketId is missing`
              )
            }

            // Create notification for rider
            await createNotification({
              recipientId: ride.rider._id,
              recipientModel: 'User',
              title: 'Ride Cancelled',
              message:
                'No drivers available. All nearby drivers have declined the ride.',
              type: 'ride_cancelled',
              relatedRide: rideId
            })

            logger.info(`Ride ${rideId} cancelled due to all drivers rejecting`)
          }
        } else {
          // Not all drivers have rejected yet, wait for more responses
          logger.info(
            `Not all drivers have rejected yet. Waiting for more responses for rideId: ${rideId}`
          )
        }

        logger.info(
          `rideRejected completed successfully - rideId: ${rideId}, driverId: ${driverId}`
        )
      } catch (err) {
        logger.error('rideRejected error:', err)
        socket.emit('rideError', {
          message: err.message || 'Failed to process ride rejection'
        })
      }
    })

    // ============================
    // DRIVER ARRIVED AT PICKUP
    // ============================
    socket.on('driverArrived', async data => {
      try {
        logger.info(`driverArrived event - rideId: ${data?.rideId}`)
        const { rideId } = data || {}
        if (!rideId) {
          logger.warn('driverArrived: rideId is missing')
          return
        }

        const ride = await markDriverArrived(rideId)
        logger.info(`Driver marked as arrived - rideId: ${rideId}`)

        // Notify rider
        if (ride.userSocketId) {
          io.to(ride.userSocketId).emit('driverArrived', ride)
          logger.info(
            `Driver arrival notification sent to rider - rideId: ${rideId}`
          )
        }

        // Create notification for rider
        await createNotification({
          recipientId: ride.rider._id,
          recipientModel: 'User',
          title: 'Driver Arrived',
          message: 'Your driver has arrived at the pickup location',
          type: 'driver_arrived',
          relatedRide: rideId
        })

        logger.info(`driverArrived completed successfully - rideId: ${rideId}`)
      } catch (err) {
        logger.error('driverArrived error:', err)
        socket.emit('rideError', { message: 'Failed to mark driver arrived' })
      }
    })

    // ============================
    // VERIFY START OTP & START RIDE
    // ============================
    socket.on('verifyStartOtp', async data => {
      try {
        logger.info(`verifyStartOtp event - rideId: ${data?.rideId}`)
        const { rideId, otp } = data || {}
        if (!rideId || !otp) {
          logger.warn('verifyStartOtp: Missing rideId or OTP')
          socket.emit('otpVerificationFailed', {
            message: 'Ride ID and OTP required'
          })
          return
        }

        const { success, ride } = await verifyStartOtp(rideId, otp)

        if (success) {
          logger.info(`Start OTP verified successfully - rideId: ${rideId}`)
          socket.emit('otpVerified', { success: true, ride })
        } else {
          logger.warn(`Start OTP verification failed - rideId: ${rideId}`)
        }
      } catch (err) {
        logger.error('verifyStartOtp error:', err)
        socket.emit('otpVerificationFailed', { message: err.message })
      }
    })

    socket.on('rideStarted', async data => {
      try {
        logger.info(
          `rideStarted event - rideId: ${
            data?.rideId
          }, otp provided: ${!!data?.otp}`
        )
        const { rideId, otp } = data || {}
        if (!rideId) {
          logger.warn('rideStarted: rideId is missing')
          return
        }

        // Verify OTP if provided
        if (otp) {
          const { success } = await verifyStartOtp(rideId, otp)
          if (!success) {
            logger.warn(`Invalid start OTP - rideId: ${rideId}`)
            socket.emit('rideError', { message: 'Invalid OTP' })
            return
          }
          logger.info(`OTP verified, starting ride - rideId: ${rideId}`)
        }

        const startedRide = await startRide(rideId)
        await updateRideStartTime(rideId)

        logger.info(`Ride started successfully - rideId: ${rideId}`)

        if (startedRide.userSocketId) {
          io.to(startedRide.userSocketId).emit('rideStarted', startedRide)
          logger.info(
            `Ride start notification sent to rider - rideId: ${rideId}`
          )
        }
        if (startedRide.driverSocketId) {
          io.to(startedRide.driverSocketId).emit('rideStarted', startedRide)
          logger.info(
            `Ride start confirmation sent to driver - rideId: ${rideId}`
          )
        }

        // Create notifications
        await createNotification({
          recipientId: startedRide.rider._id,
          recipientModel: 'User',
          title: 'Ride Started',
          message: 'Your ride has started',
          type: 'ride_started',
          relatedRide: rideId
        })

        await createNotification({
          recipientId: startedRide.driver._id,
          recipientModel: 'Driver',
          title: 'Ride Started',
          message: 'Ride in progress',
          type: 'ride_started',
          relatedRide: rideId
        })

        // io.emit('rideStarted', startedRide)
        io.to(`ride_${startedRide._id}`).emit('rideStarted', startedRide)
      } catch (err) {
        logger.error('rideStarted error:', err)
        socket.emit('rideError', { message: 'Failed to start ride' })
      }
    })

    // ============================
    // RIDE IN PROGRESS UPDATES
    // ============================
    socket.on('rideInProgress', data => {
      try {
        logger.info(`rideInProgress event - rideId: ${data?.rideId}`)
        // io.emit('rideInProgress', data)
        io.to(`ride_${data.rideId}`).emit('rideInProgress', data)
      } catch (err) {
        logger.error('rideInProgress error:', err)
      }
    })

    socket.on('rideLocationUpdate', data => {
      try {
        logger.info(`rideLocationUpdate event - rideId: ${data?.rideId}`)
        // io.emit('rideLocationUpdate', data)
        io.to(`ride_${data.rideId}`).emit('rideLocationUpdate', data)

        // Notify specific rider if rideId provided
        if (data.rideId && data.userSocketId) {
          io.to(data.userSocketId).emit('rideLocationUpdate', data)
          logger.info(
            `Ride location update sent to rider - rideId: ${data.rideId}`
          )
        }
      } catch (err) {
        logger.error('rideLocationUpdate error:', err)
      }
    })

    // ============================
    // VERIFY STOP OTP & COMPLETE RIDE
    // ============================
    socket.on('verifyStopOtp', async data => {
      try {
        logger.info(`verifyStopOtp event - rideId: ${data?.rideId}`)
        const { rideId, otp } = data || {}
        if (!rideId || !otp) {
          logger.warn('verifyStopOtp: Missing rideId or OTP')
          socket.emit('otpVerificationFailed', {
            message: 'Ride ID and OTP required'
          })
          return
        }

        const { success, ride } = await verifyStopOtp(rideId, otp)

        if (success) {
          logger.info(`Stop OTP verified successfully - rideId: ${rideId}`)
          socket.emit('otpVerified', { success: true, ride })
        } else {
          logger.warn(`Stop OTP verification failed - rideId: ${rideId}`)
        }
      } catch (err) {
        logger.error('verifyStopOtp error:', err)
        socket.emit('otpVerificationFailed', { message: err.message })
      }
    })

    socket.on('rideCompleted', async data => {
      try {
        logger.info(
          `rideCompleted event - rideId: ${data?.rideId}, fare: ${data?.fare}`
        )
        const { rideId, fare, otp } = data || {}
        if (!rideId) {
          logger.warn('rideCompleted: rideId is missing')
          return
        }

        // Verify OTP if provided
        if (otp) {
          const { success } = await verifyStopOtp(rideId, otp)
          if (!success) {
            logger.warn(`Invalid stop OTP - rideId: ${rideId}`)
            socket.emit('rideError', { message: 'Invalid OTP' })
            return
          }
          logger.info(`OTP verified, completing ride - rideId: ${rideId}`)
        }

        // Log fare information before completing ride
        logger.info(
          `[Fare Tracking] rideCompleted event - rideId: ${rideId}, fare from event: ₹${fare || 'not provided'}`
        )

        // completeRide internally calls updateRideEndTime and recalculates fare
        const completedRide = await completeRide(rideId, fare)

        logger.info(
          `Ride completed successfully - rideId: ${rideId}, finalFare stored in ride: ₹${completedRide.fare}`
        )
        
        // Log fare tracking for debugging
        const fareDifference = completedRide._fareDifference || 0
        const oldFare = completedRide._oldFare || fare || 0
        logger.info(
          `[Fare Tracking] Ride completion - rideId: ${rideId}, oldFare: ₹${oldFare}, newFare: ₹${completedRide.fare}, difference: ₹${fareDifference}, paymentMethod: ${completedRide.paymentMethod || 'not set'}`
        )
        
        // Handle payment adjustment if fare changed
        if (Math.abs(fareDifference) > 0.01 && completedRide.paymentMethod !== 'CASH') {
          await handleFareDifference(completedRide, oldFare, completedRide.fare, completedRide.paymentMethod)
        }
        
        // Log ride data for debugging
        logger.info(`storeRideEarnings: Ride data check - rideId: ${rideId}, driver: ${completedRide.driver ? (completedRide.driver._id || completedRide.driver) : 'missing'}, rider: ${completedRide.rider ? (completedRide.rider._id || completedRide.rider) : 'missing'}, fare: ${completedRide.fare}`)

        // Store earnings IMMEDIATELY after completing ride (before any saves that might lose populated fields)
        // This ensures driver/rider are still populated from completeRide()
        // Earnings are calculated from final fare (after recalculation)
        storeRideEarnings(completedRide).catch(err => {
          logger.error(
            `Error storing ride earnings for rideId: ${rideId}:`,
            err
          )
          // Don't fail ride completion if earnings storage fails
        })

        // Assign gifts based on ride completion (first ride, loyalty, etc.)
        if (completedRide.rider) {
          const riderId = completedRide.rider._id || completedRide.rider
          try {
            const {
              checkAndAssignFirstRideGift,
              checkAndAssignLoyaltyGift,
            } = require('./giftAssignment')
            
            // Check and assign first ride gift
            const firstRideResult = await checkAndAssignFirstRideGift(riderId.toString())
            if (firstRideResult.assigned) {
              logger.info(`First ride gift assigned to rider ${riderId}: ${firstRideResult.couponCode}`)
            }
            
            // Check and assign loyalty gift
            const loyaltyResult = await checkAndAssignLoyaltyGift(riderId.toString())
            if (loyaltyResult.assigned) {
              logger.info(`Loyalty gift assigned to rider ${riderId}: ${loyaltyResult.couponCode}`)
            }
          } catch (giftError) {
            logger.error(`Error assigning gifts to rider ${riderId} after ride completion:`, giftError)
            // Don't fail ride completion if gift assignment fails
          }
        }

        // Process WALLET payment deduction if payment method is WALLET
        // Note: Payment adjustment is handled in handleFareDifference if fare changed
        if (completedRide.paymentMethod === 'WALLET' && Math.abs(fareDifference) <= 0.01) {
          // Only process if fare didn't change (already handled in handleFareDifference)
          try {
            const User = require('../Models/User/user.model')
            const WalletTransaction = require('../Models/User/walletTransaction.model')
            const riderId = completedRide.rider._id || completedRide.rider
            // Use fare from completed ride (which should be the correct fare after completeRide)
            const fareAmount = completedRide.fare || fare || 0

            logger.info(
              `[Fare Tracking] Wallet deduction - rideId: ${rideId}, fareAmount: ₹${fareAmount}, fare from ride: ₹${completedRide.fare}, fare from event: ₹${fare || 'not provided'}`
            )

            if (fareAmount > 0) {
              if (completedRide.paymentStatus === 'completed') {
                logger.warn(
                  `Wallet payment already completed - Ride: ${rideId}, skipping deduction`
                )
                return
              }

              const rider = await User.findById(riderId)
              if (!rider) {
                logger.warn(
                  `Rider not found for wallet deduction - Ride: ${rideId}, RiderId: ${riderId}`
                )
              } else {
                const balanceBefore = rider.walletBalance || 0

                logger.info(
                  `[Fare Tracking] Wallet balance check - rideId: ${rideId}, balanceBefore: ₹${balanceBefore}, fareAmount: ₹${fareAmount}`
                )

                if (balanceBefore >= fareAmount) {
                  const balanceAfter = balanceBefore - fareAmount
                  rider.walletBalance = balanceAfter
                  await rider.save()

                  // Create wallet transaction
                  await WalletTransaction.create({
                    user: riderId,
                    transactionType: 'RIDE_PAYMENT',
                    amount: fareAmount,
                    balanceBefore: balanceBefore,
                    balanceAfter: balanceAfter,
                    relatedRide: rideId,
                    paymentMethod: 'WALLET',
                    status: 'COMPLETED',
                    description: `Ride payment of ₹${fareAmount}`
                  })

                  // Update ride payment status
                  completedRide.paymentStatus = 'completed'
                  await completedRide.save()

                  logger.info(
                    `[Fare Tracking] Wallet payment deducted successfully - Ride: ${rideId}, Amount: ₹${fareAmount}, Balance Before: ₹${balanceBefore}, Balance After: ₹${balanceAfter}`
                  )
                } else {
                  // Handle insufficient balance - mark payment as failed
                  completedRide.paymentStatus = 'failed'
                  await completedRide.save()
                  logger.warn(
                    `Insufficient wallet balance - Ride: ${rideId}, Required: ₹${fareAmount}, Available: ₹${balanceBefore}`
                  )
                }
              }
            }
          } catch (walletError) {
            logger.error(
              `Error processing wallet payment for ride ${rideId}:`,
              walletError
            )
            // Don't fail ride completion if wallet deduction fails, but mark payment status appropriately
            try {
              completedRide.paymentStatus = 'failed'
              await completedRide.save()
            } catch (updateError) {
              logger.error(
                `Error updating payment status for ride ${rideId}:`,
                updateError
              )
            }
          }
        }

        // Process referral reward if this is user's first completed ride (non-blocking)
        processReferralRewardIfFirstRide(
          completedRide.rider._id || completedRide.rider,
          rideId
        ).catch(err => {
          logger.error(
            `Error processing referral reward for rideId: ${rideId}:`,
            err
          )
          // Don't fail ride completion if referral processing fails
        })

        if (completedRide.userSocketId) {
          io.to(completedRide.userSocketId).emit('rideCompleted', completedRide)
          logger.info(
            `Ride completion notification sent to rider - rideId: ${rideId}`
          )
        }
        if (completedRide.driverSocketId) {
          io.to(completedRide.driverSocketId).emit(
            'rideCompleted',
            completedRide
          )
          logger.info(
            `Ride completion confirmation sent to driver - rideId: ${rideId}`
          )
        }

        // Create notifications
        await createNotification({
          recipientId: completedRide.rider._id,
          recipientModel: 'User',
          title: 'Ride Completed',
          message: 'Your ride has been completed. Please rate your driver.',
          type: 'ride_completed',
          relatedRide: rideId
        })

        await createNotification({
          recipientId: completedRide.driver._id,
          recipientModel: 'Driver',
          title: 'Ride Completed',
          message: 'Ride completed successfully',
          type: 'ride_completed',
          relatedRide: rideId
        })

        // io.emit('rideCompleted', completedRide)
        io.to(`ride_${completedRide._id}`).emit('rideCompleted', completedRide)
      } catch (err) {
        logger.error('rideCompleted error:', err)
        socket.emit('rideError', { message: 'Failed to complete ride' })
      }
    })

    // ============================
    // CANCEL RIDE
    // ============================
    socket.on('rideCancelled', async data => {
      try {
        logger.info(
          `rideCancelled event - rideId: ${data?.rideId}, cancelledBy: ${data?.cancelledBy}`
        )
        const { rideId, cancelledBy, reason } = data || {}
        if (!rideId) {
          logger.warn('rideCancelled: rideId is missing')
          return
        }

        // Validate and set cancellation reason (backward compatible)
        let cancellationReason = reason
        if (!cancellationReason || cancellationReason.trim() === '') {
          cancellationReason = 'No reason provided'
          logger.warn(
            `rideCancelled: No reason provided for rideId: ${rideId}, using default`
          )
        }

        // Cancel ride with reason
        const cancelledRide = await cancelRide(
          rideId,
          cancelledBy,
          cancellationReason
        )
        logger.info(
          `Ride cancelled successfully - rideId: ${rideId}, cancelledBy: ${cancelledBy}, reason: ${cancellationReason}`
        )

        if (cancelledRide.userSocketId) {
          io.to(cancelledRide.userSocketId).emit('rideCancelled', cancelledRide)
          logger.info(
            `Cancellation notification sent to rider - rideId: ${rideId}`
          )
        }
        if (cancelledRide.driverSocketId) {
          io.to(cancelledRide.driverSocketId).emit(
            'rideCancelled',
            cancelledRide
          )
          logger.info(
            `Cancellation notification sent to driver - rideId: ${rideId}`
          )
        }

        // Create notifications
        if (cancelledRide.rider) {
          await createNotification({
            recipientId: cancelledRide.rider._id,
            recipientModel: 'User',
            title: 'Ride Cancelled',
            message: `Ride cancelled by ${cancelledBy}`,
            type: 'ride_cancelled',
            relatedRide: rideId
          })
        }

        if (cancelledRide.driver) {
          await createNotification({
            recipientId: cancelledRide.driver._id,
            recipientModel: 'Driver',
            title: 'Ride Cancelled',
            message: `Ride cancelled by ${cancelledBy}`,
            type: 'ride_cancelled',
            relatedRide: rideId
          })
        }

        // 🔥 CRITICAL: Notify all notified drivers that ride is no longer available
        // This ensures drivers viewing the ride or have it in their pending list get notified
        try {
          const rideWithNotifiedDrivers = await Ride.findById(rideId)
            .select('notifiedDrivers driver')
            .lean()

          if (rideWithNotifiedDrivers?.notifiedDrivers?.length > 0) {
            const Driver = require('../Models/Driver/driver.model')
            const acceptingDriverId = cancelledRide.driver
              ? cancelledRide.driver._id || cancelledRide.driver
              : null

            // Get all notified drivers except the one who accepted (if any)
            const otherDriverIds = rideWithNotifiedDrivers.notifiedDrivers.filter(
              (id) => {
                if (!acceptingDriverId) return true
                return id.toString() !== acceptingDriverId.toString()
              }
            )

            if (otherDriverIds.length > 0) {
              logger.info(
                `📢 Notifying ${otherDriverIds.length} notified drivers that ride ${rideId} is cancelled`
              )

              const notifiedDrivers = await Driver.find({
                _id: { $in: otherDriverIds }
              })
                .select('socketId _id')
                .lean()

              let notifiedCount = 0
              for (const driver of notifiedDrivers) {
                if (driver.socketId) {
                  io.to(driver.socketId).emit('rideNoLongerAvailable', {
                    rideId: rideId,
                    message: `Ride cancelled by ${cancelledBy}`,
                    reason: cancellationReason,
                    cancelledBy: cancelledBy
                  })
                  notifiedCount++
                  logger.info(
                    `✅ Notified driver ${driver._id} that ride ${rideId} is cancelled`
                  )
                }
              }

              logger.info(
                `✅ Successfully notified ${notifiedCount} drivers about ride cancellation`
              )
            }
          }
        } catch (notifyError) {
          logger.error(
            `❌ Error notifying drivers about ride cancellation: ${notifyError.message}`
          )
          // Don't fail cancellation if notification fails
        }

        // io.emit('rideCancelled', cancelledRide)
        io.to(`ride_${cancelledRide._id}`).emit('rideCancelled', cancelledRide)

        logger.info(`rideCancelled completed successfully - rideId: ${rideId}`)
      } catch (err) {
        logger.error('rideCancelled error:', err)
        socket.emit('rideError', { message: 'Failed to cancel ride' })
      }
    })

    // ============================
    // RATING SYSTEM
    // ============================
    socket.on('submitRating', async data => {
      try {
        logger.info(
          `submitRating event - rideId: ${data?.rideId}, rating: ${data?.rating}, ratedBy: ${data?.ratedBy} (${data?.ratedByModel}), ratedTo: ${data?.ratedTo} (${data?.ratedToModel})`
        )
        const rating = await submitRating(data)
        logger.info(
          `Rating submitted successfully - ratingId: ${rating._id}, value: ${rating.rating}`
        )

        socket.emit('ratingSubmitted', { success: true, rating })

        // Notify the rated person
        const recipientSocketId =
          data.ratedToModel === 'Driver'
            ? (await Driver.findById(data.ratedTo))?.socketId
            : (
                await require('../Models/User/user.model').findById(
                  data.ratedTo
                )
              )?.socketId

        if (recipientSocketId) {
          io.to(recipientSocketId).emit('ratingReceived', rating)
          logger.info(
            `Rating notification sent to ${data.ratedToModel}: ${data.ratedTo}`
          )
        }

        // Create notification
        await createNotification({
          recipientId: data.ratedTo,
          recipientModel: data.ratedToModel,
          title: 'New Rating',
          message: `You received a ${data.rating}-star rating`,
          type: 'rating_received',
          relatedRide: data.rideId
        })
      } catch (err) {
        logger.error('submitRating error:', err)
        socket.emit('ratingError', { message: err.message })
      }
    })

    // ============================
    // MESSAGING SYSTEM
    // ============================

    // ============================
    // ROOM MANAGEMENT - Join/Leave Ride Rooms
    // ============================

    socket.on('joinRideRoom', async data => {
      try {
        logger.info('🚪 ========================================')
        logger.info('🚪 [Socket] joinRideRoom event received')
        logger.info('🚪 ========================================')
        logger.info(`🆔 Ride ID: ${data?.rideId}`)
        logger.info(`👤 User/Driver ID: ${data?.userId || data?.driverId}`)
        logger.info(`👤 User Type: ${data?.userType || 'unknown'}`)
        logger.info(`🔌 Socket ID: ${socket.id}`)
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`)

        const { rideId, userId, driverId, userType } = data || {}

        if (!rideId) {
          logger.warn('⚠️ [Socket] joinRideRoom: rideId is missing')
          socket.emit('roomJoinError', { message: 'Ride ID is required' })
          return
        }

        // Validate rideId format (MongoDB ObjectId)
        if (!/^[0-9a-fA-F]{24}$/.test(rideId)) {
          logger.warn(
            `⚠️ [Socket] joinRideRoom: Invalid rideId format: ${rideId}`
          )
          socket.emit('roomJoinError', { message: 'Invalid ride ID format' })
          return
        }

        // Verify ride exists
        const ride = await Ride.findById(rideId)
        if (!ride) {
          logger.warn(
            `⚠️ [Socket] joinRideRoom: Ride not found - rideId: ${rideId}`
          )
          socket.emit('roomJoinError', { message: 'Ride not found' })
          return
        }

        // Check ride status (only allow join for active rides)
        const activeStatuses = [
          'requested',
          'accepted',
          'arrived',
          'in_progress'
        ]
        if (!activeStatuses.includes(ride.status)) {
          logger.warn(
            `⚠️ [Socket] joinRideRoom: Ride is not active - status: ${ride.status}`
          )
          socket.emit('roomJoinError', { message: 'Ride is not active' })
          return
        }

        // Verify user/driver has access to this ride
        const userIdToCheck = userId || driverId
        const userTypeToCheck = userType || (userId ? 'User' : 'Driver')

        if (userTypeToCheck === 'User') {
          const rideUserId = ride.rider?.toString() || ride.rider
          if (rideUserId !== userIdToCheck) {
            logger.warn(
              `⚠️ [Socket] joinRideRoom: User ${userIdToCheck} does not have access to ride ${rideId}`
            )
            socket.emit('roomJoinError', { message: 'Access denied' })
            return
          }
        } else if (userTypeToCheck === 'Driver') {
          const rideDriverId = ride.driver?.toString() || ride.driver
          if (rideDriverId !== userIdToCheck) {
            logger.warn(
              `⚠️ [Socket] joinRideRoom: Driver ${userIdToCheck} does not have access to ride ${rideId}`
            )
            socket.emit('roomJoinError', { message: 'Access denied' })
            return
          }
        }

        // Join socket to room
        const roomName = `ride_${rideId}`
        socket.join(roomName)

        // Store rideId in socket data for reference
        if (!socket.data.rooms) {
          socket.data.rooms = []
        }
        if (!socket.data.rooms.includes(roomName)) {
          socket.data.rooms.push(roomName)
        }

        logger.info(`✅ [Socket] Socket ${socket.id} joined room: ${roomName}`)
        logger.info(`   User/Driver: ${userIdToCheck} (${userTypeToCheck})`)
        logger.info(`   Ride Status: ${ride.status}`)
        logger.info(`   Total rooms for socket: ${socket.data.rooms.length}`)

        // Emit confirmation back to client
        socket.emit('roomJoined', {
          success: true,
          rideId: rideId,
          roomName: roomName
        })

        logger.info('✅ [Socket] joinRideRoom completed successfully')
        logger.info('========================================')
      } catch (err) {
        logger.error('❌ [Socket] joinRideRoom error:', err)
        logger.error(`   Error message: ${err.message}`)
        logger.error(`   Error stack: ${err.stack}`)
        socket.emit('roomJoinError', { message: err.message })
        logger.info('========================================')
      }
    })

    socket.on('leaveRideRoom', async data => {
      try {
        logger.info('🚪 ========================================')
        logger.info('🚪 [Socket] leaveRideRoom event received')
        logger.info('🚪 ========================================')
        logger.info(`🆔 Ride ID: ${data?.rideId}`)
        logger.info(`🔌 Socket ID: ${socket.id}`)
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`)

        const { rideId } = data || {}

        if (!rideId) {
          logger.warn('⚠️ [Socket] leaveRideRoom: rideId is missing')
          socket.emit('roomLeaveError', { message: 'Ride ID is required' })
          return
        }

        // Leave socket from room
        const roomName = `ride_${rideId}`
        socket.leave(roomName)

        // Remove from socket data
        if (socket.data.rooms) {
          socket.data.rooms = socket.data.rooms.filter(r => r !== roomName)
        }

        logger.info(`✅ [Socket] Socket ${socket.id} left room: ${roomName}`)
        logger.info(
          `   Remaining rooms for socket: ${socket.data.rooms?.length || 0}`
        )

        // Emit confirmation back to client
        socket.emit('roomLeft', {
          success: true,
          rideId: rideId,
          roomName: roomName
        })

        logger.info('✅ [Socket] leaveRideRoom completed successfully')
        logger.info('========================================')
      } catch (err) {
        logger.error('❌ [Socket] leaveRideRoom error:', err)
        logger.error(`   Error message: ${err.message}`)
        logger.error(`   Error stack: ${err.stack}`)
        socket.emit('roomLeaveError', { message: err.message })
        logger.info('========================================')
      }
    })

    // Helper function to emit unread count update to receiver
    const emitUnreadCountUpdate = async (rideId, receiverId, receiverModel) => {
      try {
        logger.info('🔔 ========================================')
        logger.info('🔔 [Socket] emitUnreadCountUpdate() called')
        logger.info('🔔 ========================================')
        logger.info(`🆔 Ride ID: ${rideId}`)
        logger.info(`👤 Receiver ID: ${receiverId}`)
        logger.info(`👤 Receiver Model: ${receiverModel}`)
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`)

        logger.info('📊 [Socket] Counting unread messages...')
        const unreadCount = await Message.countDocuments({
          ride: rideId,
          receiver: receiverId,
          receiverModel,
          isRead: false
        })
        logger.info(`✅ [Socket] Unread count: ${unreadCount}`)

        logger.info(
          `🔍 [Socket] Looking up receiver socket ID (${receiverModel})...`
        )
        const receiverSocketId =
          receiverModel === 'Driver'
            ? (await Driver.findById(receiverId))?.socketId
            : (await User.findById(receiverId))?.socketId

        logger.info(
          `🔌 [Socket] Receiver socket ID: ${receiverSocketId || 'null'}`
        )

        if (receiverSocketId) {
          const unreadCountData = {
            rideId,
            receiverId,
            receiverModel,
            count: unreadCount
          }

          logger.info('📤 [Socket] Emitting unreadCountUpdated event...')
          logger.info(
            `📦 [Socket] Event data:`,
            JSON.stringify(unreadCountData)
          )

          io.to(receiverSocketId).emit('unreadCountUpdated', unreadCountData)

          logger.info(
            `✅ [Socket] Unread count updated - rideId: ${rideId}, receiver: ${receiverId} (${receiverModel}), count: ${unreadCount}`
          )
          logger.info('========================================')
        } else {
          logger.warn(
            `⚠️ [Socket] Receiver socket not found - rideId: ${rideId}, receiver: ${receiverId} (${receiverModel})`
          )
          logger.info('========================================')
        }
      } catch (err) {
        logger.error('❌ [Socket] Error emitting unread count update:', err)
        logger.error(`   Error message: ${err.message}`)
        logger.error(`   Error stack: ${err.stack}`)
        logger.info('========================================')
      }
    }

    socket.on('sendMessage', async data => {
      try {
        logger.info('📤 ========================================')
        logger.info('📤 [Socket] sendMessage event received')
        logger.info('📤 ========================================')
        logger.info(`🆔 Ride ID: ${data?.rideId}`)
        logger.info(`👤 Sender ID: ${data?.senderId}`)
        logger.info(`👤 Sender Model: ${data?.senderModel}`)
        logger.info(`👤 Receiver ID: ${data?.receiverId}`)
        logger.info(`👤 Receiver Model: ${data?.receiverModel}`)
        logger.info(
          `💬 Message: ${data?.message?.substring(0, 50)}${
            data?.message?.length > 50 ? '...' : ''
          }`
        )
        logger.info(`📝 Message Type: ${data?.messageType || 'text'}`)
        logger.info(`🔌 Socket ID: ${socket.id}`)
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`)

        logger.info('💾 [Socket] Saving message to database...')
        const message = await saveMessage(data)
        logger.info(`✅ [Socket] Message saved - messageId: ${message._id}`)

        logger.info(
          '🔄 [Socket] Populating message with sender/receiver details...'
        )
        // Populate message with sender and receiver details before emitting
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'name fullName')
          .populate('receiver', 'name fullName')
          .lean()

        logger.info(`✅ [Socket] Message populated`)
        logger.info(
          `   Sender: ${
            populatedMessage?.sender?.name ||
            populatedMessage?.sender?.fullName ||
            'unknown'
          }`
        )
        logger.info(
          `   Receiver: ${
            populatedMessage?.receiver?.name ||
            populatedMessage?.receiver?.fullName ||
            'unknown'
          }`
        )

        // Emit message to room (both user and driver in the room will receive it)
        const roomName = `ride_${data.rideId}`
        logger.info(
          `📤 [Socket] Emitting receiveMessage event to room: ${roomName}`
        )
        logger.info(
          `📦 [Socket] Message data:`,
          JSON.stringify({
            _id: populatedMessage._id,
            rideId: populatedMessage.ride,
            sender: populatedMessage.sender?._id,
            receiver: populatedMessage.receiver?._id,
            message: populatedMessage.message?.substring(0, 50)
          })
        )

        // Emit to room - both user and driver will receive if they're in the room
        io.to(roomName).emit('receiveMessage', populatedMessage)
        logger.info(`✅ [Socket] Message delivered to room: ${roomName}`)

        // Fallback: Also try direct socket emission if room fails (for backward compatibility)
        const receiverSocketId =
          data.receiverModel === 'Driver'
            ? (await Driver.findById(data.receiverId))?.socketId
            : (await User.findById(data.receiverId))?.socketId

        if (receiverSocketId) {
          logger.info(
            `🔌 [Socket] Fallback: Also emitting to receiver socket: ${receiverSocketId}`
          )
          io.to(receiverSocketId).emit('receiveMessage', populatedMessage)
        } else {
          logger.info(
            `ℹ️ [Socket] Receiver socket not found (may be offline or not connected)`
          )
        }

        logger.info('🔔 [Socket] Emitting unread count update...')
        // Emit unread count update to receiver
        await emitUnreadCountUpdate(
          data.rideId,
          data.receiverId,
          data.receiverModel
        )

        logger.info('📤 [Socket] Sending confirmation to sender...')
        // Also send populated message to sender for confirmation
        const confirmationData = { success: true, message: populatedMessage }
        socket.emit('messageSent', confirmationData)
        logger.info(`✅ [Socket] Confirmation sent to sender: ${data.senderId}`)

        logger.info('✅ [Socket] sendMessage event completed successfully')
        logger.info('========================================')
      } catch (err) {
        logger.error('❌ [Socket] sendMessage error:', err)
        logger.error(`   Error message: ${err.message}`)
        logger.error(`   Error stack: ${err.stack}`)
        logger.error(`   Failed data:`, JSON.stringify(data))
        socket.emit('messageError', { message: err.message })
        logger.info('========================================')
      }
    })

    socket.on('markMessageRead', async data => {
      try {
        logger.info('📖 ========================================')
        logger.info('📖 [Socket] markMessageRead event received')
        logger.info('📖 ========================================')
        logger.info(`🆔 Message ID: ${data?.messageId}`)
        logger.info(`🔌 Socket ID: ${socket.id}`)
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`)

        const { messageId } = data || {}
        if (!messageId) {
          logger.warn('⚠️ [Socket] markMessageRead: messageId is missing')
          return
        }

        logger.info('💾 [Socket] Marking message as read in database...')
        const message = await markMessageAsRead(messageId)

        if (message) {
          logger.info(
            `✅ [Socket] Message marked as read - messageId: ${messageId}`
          )
          logger.info(`🆔 [Socket] Ride ID: ${message.ride.toString()}`)
          logger.info(`👤 [Socket] Receiver ID: ${message.receiver.toString()}`)
          logger.info(`👤 [Socket] Receiver Model: ${message.receiverModel}`)

          logger.info('🔔 [Socket] Emitting unread count update...')
          // Emit unread count update to receiver (the one who marked it as read)
          await emitUnreadCountUpdate(
            message.ride.toString(),
            message.receiver.toString(),
            message.receiverModel
          )
        } else {
          logger.warn(`⚠️ [Socket] Message not found - messageId: ${messageId}`)
        }

        logger.info('📤 [Socket] Sending confirmation to client...')
        socket.emit('messageMarkedRead', { success: true })
        logger.info(`✅ [Socket] Confirmation sent - messageId: ${messageId}`)
        logger.info('========================================')
      } catch (err) {
        logger.error('❌ [Socket] markMessageRead error:', err)
        logger.error(`   Error message: ${err.message}`)
        logger.error(`   Error stack: ${err.stack}`)
        logger.error(`   Failed data:`, JSON.stringify(data))
        logger.info('========================================')
      }
    })

    socket.on('getRideMessages', async data => {
      try {
        logger.info('📚 ========================================')
        logger.info('📚 [Socket] getRideMessages event received')
        logger.info('📚 ========================================')
        logger.info(`🆔 Ride ID: ${data?.rideId}`)
        logger.info(`🔌 Socket ID: ${socket.id}`)
        logger.info(`⏰ Timestamp: ${new Date().toISOString()}`)

        const { rideId } = data || {}
        if (!rideId) {
          logger.warn('⚠️ [Socket] getRideMessages: rideId is missing')
          socket.emit('messageError', { message: 'rideId is required' })
          return
        }

        logger.info('💾 [Socket] Fetching messages from database...')
        const messages = await getRideMessages(rideId)
        logger.info(
          `✅ [Socket] Messages fetched - count: ${messages?.length || 0}`
        )

        logger.info('🔄 [Socket] Formatting messages...')
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
            updatedAt: msg.updatedAt
          }

          if (index < 3) {
            logger.info(`   Message ${index + 1}:`, {
              id: formatted._id,
              sender: formatted.senderModel,
              receiver: formatted.receiverModel,
              message: formatted.message?.substring(0, 30)
            })
          }

          return formatted
        })

        logger.info(
          `✅ [Socket] Formatted ${formattedMessages.length} messages`
        )
        logger.info('📤 [Socket] Emitting rideMessages event...')
        socket.emit('rideMessages', formattedMessages)
        logger.info(
          `✅ [Socket] Ride messages sent - rideId: ${rideId}, count: ${
            formattedMessages?.length || 0
          }`
        )
        logger.info('========================================')
      } catch (err) {
        logger.error('❌ [Socket] getRideMessages error:', err)
        logger.error(`   Error message: ${err.message}`)
        logger.error(`   Error stack: ${err.stack}`)
        logger.error(`   Failed data:`, JSON.stringify(data))
        socket.emit('messageError', { message: err.message })
        logger.info('========================================')
      }
    })

    // ============================
    // NOTIFICATIONS
    // ============================
    socket.on('getNotifications', async data => {
      try {
        logger.info(
          `getNotifications event - userId: ${data?.userId}, userModel: ${data?.userModel}`
        )
        const { userId, userModel } = data || {}
        const notifications = await getUserNotifications(userId, userModel)
        socket.emit('notifications', notifications)
        logger.info(
          `Notifications retrieved - userId: ${userId}, count: ${
            notifications?.length || 0
          }`
        )
      } catch (err) {
        logger.error('getNotifications error:', err)
        socket.emit('notificationError', { message: err.message })
      }
    })

    socket.on('markNotificationRead', async data => {
      try {
        logger.info(
          `markNotificationRead event - notificationId: ${data?.notificationId}`
        )
        const { notificationId } = data || {}
        await markNotificationAsRead(notificationId)
        socket.emit('notificationMarkedRead', { success: true })
        logger.info(
          `Notification marked as read - notificationId: ${notificationId}`
        )
      } catch (err) {
        logger.error('markNotificationRead error:', err)
      }
    })

    // ============================
    // EMERGENCY / SOS
    // ============================
    socket.on('emergencyAlert', async data => {
      try {
        logger.warn(
          `🚨 EMERGENCY ALERT - rideId: ${data?.rideId}, triggeredBy: ${data?.triggeredBy} (${data?.triggeredByModel})`
        )
        const emergency = await createEmergencyAlert(data)
        logger.warn(
          `Emergency alert created - emergencyId: ${
            emergency._id
          }, location: ${JSON.stringify(data.location)}`
        )

        // Notify both rider and driver
        const ride = await Ride.findById(data.rideId).populate('rider driver')

        if (ride) {
          // Emit rideCancelled event since emergency cancels the ride
          // This ensures frontend clears ride state properly
          const cancellationReason = `Emergency: ${data.reason || 'Emergency alert triggered'}`
          
          if (ride.userSocketId) {
            io.to(ride.userSocketId).emit('rideCancelled', {
              ride: ride,
              reason: cancellationReason
            })
            io.to(ride.userSocketId).emit('emergencyAlert', emergency)
            logger.warn(
              `Ride cancelled and emergency alert sent to rider - rideId: ${data.rideId}`
            )
          }
          if (ride.driverSocketId) {
            io.to(ride.driverSocketId).emit('rideCancelled', {
              ride: ride,
              reason: cancellationReason
            })
            io.to(ride.driverSocketId).emit('emergencyAlert', emergency)
            logger.warn(
              `Ride cancelled and emergency alert sent to driver - rideId: ${data.rideId}`
            )
          }

          // Broadcast to admin/support (you can add admin sockets later)
          // io.emit('emergencyBroadcast', emergency)
          io.to('admin').emit('emergencyAlert', emergency)

          logger.warn(
            `Emergency broadcast sent to all admins - rideId: ${data.rideId}`
          )

          // Create notifications
          if (ride.rider) {
            await createNotification({
              recipientId: ride.rider._id,
              recipientModel: 'User',
              title: 'Emergency Alert',
              message: 'Emergency alert has been triggered',
              type: 'emergency',
              relatedRide: data.rideId
            })
          }

          if (ride.driver) {
            await createNotification({
              recipientId: ride.driver._id,
              recipientModel: 'Driver',
              title: 'Emergency Alert',
              message: 'Emergency alert has been triggered',
              type: 'emergency',
              relatedRide: data.rideId
            })
          }
        }

        socket.emit('emergencyAlertCreated', { success: true, emergency })
        logger.warn(
          `🚨 Emergency alert processing completed - emergencyId: ${emergency._id}`
        )
      } catch (err) {
        logger.error('emergencyAlert error:', err)
        socket.emit('emergencyError', { message: err.message })
      }
    })

    // ============================
    // RIDER DISCONNECT
    // ============================
    socket.on('riderDisconnect', async data => {
      try {
        logger.info(
          `riderDisconnect event - userId: ${data?.userId}, socketId: ${socket.id}`
        )
        await clearUserSocket(data.userId, socket.id)
        socketToUser.delete(socket.id)
        // io.emit('riderDisconnect', data)
        logger.info(`Rider disconnected successfully - userId: ${data?.userId}`)
      } catch (err) {
        logger.error('riderDisconnect error:', err)
      }
    })

    // ============================
    // SOCKET DISCONNECT
    // ============================
    socket.on('disconnect', async () => {
      try {
        logger.info(`Socket disconnecting - socketId: ${socket.id}`)
        const userId = socketToUser.get(socket.id)
        const driverId = socketToDriver.get(socket.id)

        if (userId) {
          await clearUserSocket(userId, socket.id)
          socketToUser.delete(socket.id)
          // io.emit('riderDisconnect', { userId })
          // logger.info(
          //   `Rider socket cleanup completed - userId: ${userId}, socketId: ${socket.id}`
          // )
        }

        if (driverId) {
          await clearDriverSocket(driverId, socket.id)
          // Do not toggle `isActive` on socket disconnect; driver should use toggle event to change availability.
          socketToDriver.delete(socket.id)
          // io.emit('driverDisconnect', { driverId })
          logger.info(
            `Driver socket cleanup completed - driverId: ${driverId}, socketId: ${socket.id}`
          )
        }

        logger.info(`Socket disconnected - socketId: ${socket.id}`)
      } catch (err) {
        logger.error('disconnect cleanup error:', err)
      }
    })
  })
}

// Function to get the Socket.IO instance
function getSocketIO () {
  if (!io) {
    throw new Error(
      'Socket.IO is not initialized. Call initializeSocket first.'
    )
  }
  return io
}

// Store ride earnings for admin analytics (non-blocking)
async function storeRideEarnings (ride, retryCount = 0) {
  const maxRetries = 3
  const retryDelay = 1000 // 1 second

  try {
    // Validate ride data
    if (!ride) {
      logger.warn('storeRideEarnings: Ride object is null or undefined')
      return
    }

    if (!ride._id) {
      logger.warn('storeRideEarnings: Ride ID is missing', { ride: JSON.stringify(ride) })
      return
    }

    const rideId = ride._id.toString()
    logger.info(`storeRideEarnings: Processing rideId: ${rideId}`)

    // Validate driver
    let driverId = null
    if (ride.driver) {
      driverId = ride.driver._id ? ride.driver._id.toString() : ride.driver.toString()
    } else {
      logger.warn(`storeRideEarnings: Driver missing for rideId: ${rideId}`)
      // Try to fetch ride with populated driver
      const Ride = require('../Models/Driver/ride.model')
      const populatedRide = await Ride.findById(rideId).populate('driver', '_id')
      if (populatedRide && populatedRide.driver) {
        driverId = populatedRide.driver._id.toString()
        ride.driver = populatedRide.driver
        logger.info(`storeRideEarnings: Fetched driver for rideId: ${rideId}, driverId: ${driverId}`)
      } else {
        logger.error(`storeRideEarnings: Cannot find driver for rideId: ${rideId}`)
        return
      }
    }

    // Validate rider
    let riderId = null
    if (ride.rider) {
      riderId = ride.rider._id ? ride.rider._id.toString() : ride.rider.toString()
    } else {
      logger.warn(`storeRideEarnings: Rider missing for rideId: ${rideId}`)
      // Try to fetch ride with populated rider
      const Ride = require('../Models/Driver/ride.model')
      const populatedRide = await Ride.findById(rideId).populate('rider', '_id')
      if (populatedRide && populatedRide.rider) {
        riderId = populatedRide.rider._id.toString()
        ride.rider = populatedRide.rider
        logger.info(`storeRideEarnings: Fetched rider for rideId: ${rideId}, riderId: ${riderId}`)
      } else {
        logger.error(`storeRideEarnings: Cannot find rider for rideId: ${rideId}`)
        return
      }
    }

    // Check if earnings already stored (prevent duplicates)
    const existing = await AdminEarnings.findOne({ rideId: rideId })
    if (existing) {
      logger.info(`storeRideEarnings: Earnings already stored for rideId: ${rideId}`)
      return
    }

    // Get settings for commission calculation
    const settings = await Settings.findOne()
    if (!settings) {
      logger.error(
        `storeRideEarnings: Settings not found, skipping earnings storage for rideId: ${rideId}`
      )
      return
    }

    if (!settings.pricingConfigurations) {
      logger.error(
        `storeRideEarnings: pricingConfigurations missing in settings for rideId: ${rideId}`
      )
      return
    }

    const { platformFees, driverCommissions } = settings.pricingConfigurations
    const grossFare = ride.fare || 0

    logger.info(
      `[Fare Tracking] storeRideEarnings - rideId: ${rideId}, grossFare: ₹${grossFare}, platformFees: ${platformFees}%, driverCommissions: ${driverCommissions}%`
    )

    if (grossFare <= 0) {
      logger.warn(`storeRideEarnings: Invalid fare amount (${grossFare}) for rideId: ${rideId}`)
      return
    }

    // Calculate platform fee and driver earning
    const platformFee = platformFees ? grossFare * (platformFees / 100) : 0
    const driverEarning = driverCommissions
      ? grossFare * (driverCommissions / 100)
      : grossFare - platformFee

    logger.info(
      `[Fare Tracking] Earnings calculation - rideId: ${rideId}, grossFare: ₹${grossFare}, platformFee: ₹${platformFee}, driverEarning: ₹${driverEarning}`
    )

    // Create earnings record
    // Always set paymentStatus to 'pending' for new earnings - admin will mark as 'completed' after processing payment
    const earnings = await AdminEarnings.create({
      rideId: rideId,
      driverId: driverId,
      riderId: riderId,
      grossFare: grossFare,
      platformFee: Math.round(platformFee * 100) / 100, // Round to 2 decimal places
      driverEarning: Math.round(driverEarning * 100) / 100, // Round to 2 decimal places
      rideDate: ride.actualEndTime || ride.updatedAt || new Date(),
      paymentStatus: 'pending' // Always pending by default - admin controls completion
    })

    logger.info(
      `storeRideEarnings: Earnings stored successfully - rideId: ${rideId}, driverId: ${driverId}, grossFare: ₹${grossFare}, platformFee: ₹${earnings.platformFee}, driverEarning: ₹${earnings.driverEarning}`
    )

    try {
      const socket = getSocketIO()
      socket.to(`driver_${driverId}`).emit('driverEarningAdded', {
        driverId,
        rideId,
        driverEarning: earnings.driverEarning,
        grossFare: earnings.grossFare,
        platformFee: earnings.platformFee
      })
      logger.info(`storeRideEarnings: Emitted driverEarningAdded for driverId: ${driverId}`)
    } catch (emitError) {
      logger.warn('storeRideEarnings: Failed to emit driverEarningAdded', {
        driverId,
        rideId,
        error: emitError?.message
      })
    }
  } catch (error) {
    logger.error(`storeRideEarnings: Error storing ride earnings for rideId: ${ride?._id || 'unknown'}`, {
      error: error.message,
      stack: error.stack,
      retryCount
    })

    // Retry logic for transient failures (network, database connection issues)
    if (retryCount < maxRetries && (
      error.message.includes('timeout') ||
      error.message.includes('connection') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('network')
    )) {
      logger.info(`storeRideEarnings: Retrying (${retryCount + 1}/${maxRetries}) after ${retryDelay}ms`)
      await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)))
      return storeRideEarnings(ride, retryCount + 1)
    }

    // Don't throw - this is a background operation
    logger.error(`storeRideEarnings: Failed to store earnings after ${retryCount} retries`)
  }
}

// Process referral reward if this is user's first completed ride
async function processReferralRewardIfFirstRide (userId, rideId) {
  try {
    const Referral = require('../Models/User/referral.model')
    const User = require('../Models/User/user.model')
    const WalletTransaction = require('../Models/User/walletTransaction.model')

    // Check if user has a pending referral
    const referral = await Referral.findOne({
      referee: userId,
      status: 'PENDING'
    }).populate('referrer', 'fullName walletBalance')

    if (!referral) {
      return // No referral to process
    }

    // Check if this is user's first completed ride
    const Ride = require('../Models/Driver/ride.model')
    const completedRides = await Ride.countDocuments({
      rider: userId,
      status: 'completed'
    })

    if (completedRides > 1) {
      return // Not the first ride
    }

    // Get referral reward settings
    const referrerReward = 100 // ₹100 for referrer
    const refereeReward = 50 // ₹50 for referee

    // Update referral status
    referral.status = 'COMPLETED'
    referral.firstRideCompletedAt = new Date()
    referral.reward = {
      referrerReward,
      refereeReward,
      rewardType: 'WALLET_CREDIT'
    }
    await referral.save()

    // Credit referrer's wallet
    const referrer = await User.findById(referral.referrer)
    if (referrer) {
      const balanceBefore = referrer.walletBalance || 0
      const balanceAfter = balanceBefore + referrerReward

      referrer.walletBalance = balanceAfter
      referrer.referralRewardsEarned =
        (referrer.referralRewardsEarned || 0) + referrerReward
      await referrer.save()

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
          refereeId: userId
        }
      })
    }

    // Credit referee's wallet
    const referee = await User.findById(userId)
    if (referee) {
      const balanceBefore = referee.walletBalance || 0
      const balanceAfter = balanceBefore + refereeReward

      referee.walletBalance = balanceAfter
      await referee.save()

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
          referrerId: referral.referrer
        }
      })
    }

    // Mark referral as rewarded
    referral.status = 'REWARDED'
    referral.rewardedAt = new Date()
    await referral.save()

    logger.info(
      `Referral reward processed automatically: Referrer ${referral.referrer} got ₹${referrerReward}, Referee ${userId} got ₹${refereeReward}`
    )
  } catch (error) {
    logger.error('Error processing referral reward automatically:', error)
    // Don't throw - this is a background operation
  }
}

module.exports = { initializeSocket, getSocketIO }
