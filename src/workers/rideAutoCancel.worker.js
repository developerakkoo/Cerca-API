const logger = require('../../utils/logger')
const cron = require('node-cron')

const Ride = require('../../Models/Driver/ride.model')
const User = require('../../Models/User/user.model')
const socketUtils = require('../../utils/socket')

const {
  cancelRide,
  createNotification
} = require('../../utils/ride_booking_functions')

/**
 * Initialize Ride Auto-Cancellation Worker
 * Runs every 1-2 minutes to check for rides that have been in "requested" status too long
 * (Single Server, No Redis)
 */
function initRideAutoCancelWorker () {
  console.log('🔥 initRideAutoCancelWorker() called')

  try {
    logger.info('🚀 Initializing Ride Auto-Cancellation Worker (single-server mode)...')

    const io = socketUtils.getSocketIO()
    if (!io) {
      throw new Error('Socket.IO instance required for auto-cancellation worker')
    }

    // Get configuration from environment variables
    const timeoutMinutes = parseInt(process.env.RIDE_AUTO_CANCEL_TIMEOUT_MINUTES || '5', 10)
    const checkIntervalMinutes = parseInt(process.env.RIDE_AUTO_CANCEL_CHECK_INTERVAL_MINUTES || '2', 10)

    logger.info(`⏰ Auto-cancellation configured - Timeout: ${timeoutMinutes} minutes, Check Interval: ${checkIntervalMinutes} minutes`)

    // Run every N minutes (configurable, default 2 minutes)
    const cronExpression = `*/${checkIntervalMinutes} * * * *`
    cron.schedule(cronExpression, async () => {
      try {
        logger.info(`⏰ Auto-cancellation check triggered (every ${checkIntervalMinutes} minutes)`)
        await checkAndCancelExpiredRides(io, timeoutMinutes)
      } catch (error) {
        logger.error('❌ Error in auto-cancellation check:', error)
      }
    })

    logger.info(`✅ Ride Auto-Cancellation Worker initialized - running every ${checkIntervalMinutes} minutes, timeout: ${timeoutMinutes} minutes`)
    console.log('✅ Ride Auto-Cancellation Worker initialized')

    return { success: true }
  } catch (error) {
    logger.error(
      `❌ Failed to initialize Ride Auto-Cancellation Worker: ${error.message}`
    )
    logger.error(`   Stack: ${error.stack}`)
    throw error
  }
}

/**
 * Check for rides that have been in "requested" status too long and cancel them
 */
async function checkAndCancelExpiredRides (io, timeoutMinutes) {
  try {
    const now = new Date()
    const timeoutThreshold = new Date(now.getTime() - timeoutMinutes * 60 * 1000)

    logger.info('🔍 Checking for expired rides to auto-cancel...')
    logger.info(`   Current time: ${now.toISOString()}`)
    logger.info(`   Timeout threshold: ${timeoutThreshold.toISOString()} (rides created before this will be cancelled)`)

    // Query for rides that are still in "requested" status and older than timeout
    const expiredRides = await Ride.find({
      status: 'requested',
      createdAt: { $lt: timeoutThreshold }
    })
      .populate('rider', 'fullName name phone email')
      .select('+userSocketId')
      .limit(100) // Process max 100 rides per check to avoid performance issues

    if (!expiredRides || expiredRides.length === 0) {
      logger.info('✅ No expired rides to cancel at this time')
      return
    }

    logger.info(
      `📋 Found ${expiredRides.length} expired ride(s) to auto-cancel`
    )

    let cancelledCount = 0
    let skippedCount = 0

    for (const ride of expiredRides) {
      try {
        // Atomic check: Verify ride status is still "requested" before cancelling
        // This prevents race conditions where ride was just accepted/cancelled
        const currentRide = await Ride.findById(ride._id).select('status')
        
        if (!currentRide) {
          logger.warn(`⚠️ Ride ${ride._id} not found during auto-cancellation check, skipping`)
          skippedCount++
          continue
        }

        if (currentRide.status !== 'requested') {
          logger.info(
            `⏭️ Ride ${ride._id} status changed to '${currentRide.status}' before auto-cancellation, skipping`
          )
          skippedCount++
          continue
        }

        // Calculate how long the ride has been waiting
        const waitTimeMinutes = Math.floor(
          (now.getTime() - ride.createdAt.getTime()) / (60 * 1000)
        )

        // Cancel the ride
        await autoCancelExpiredRide(ride, io, waitTimeMinutes)
        cancelledCount++
      } catch (error) {
        logger.error(
          `❌ Error auto-cancelling expired ride ${ride._id}:`,
          error
        )
        skippedCount++
      }
    }

    logger.info(
      `✅ Completed auto-cancellation check - Cancelled: ${cancelledCount}, Skipped: ${skippedCount}`
    )
  } catch (error) {
    logger.error('❌ Error checking expired rides:', error)
    throw error
  }
}

/**
 * Auto-cancel an expired ride
 */
async function autoCancelExpiredRide (ride, io, waitTimeMinutes) {
  try {
    logger.info(`⏰ Auto-cancelling expired ride ${ride._id}`)
    logger.info(`   Wait time: ${waitTimeMinutes} minutes`)
    logger.info(`   Rider: ${ride.rider._id || ride.rider}`)
    logger.info(`   Created at: ${ride.createdAt.toISOString()}`)

    // Get notified drivers count for logging
    const notifiedCount = ride.notifiedDrivers ? ride.notifiedDrivers.length : 0

    // Cancel the ride using existing cancelRide function
    const cancellationReason = `No driver accepted within ${waitTimeMinutes} minutes`
    const cancelledRide = await cancelRide(
      ride._id.toString(),
      'system',
      cancellationReason
    )

    logger.info(`✅ Ride ${ride._id} auto-cancelled successfully`)

    // Get current socket ID from User model (may be different from ride.userSocketId if user reconnected)
    const riderId = ride.rider._id || ride.rider
    const currentUser = await User.findById(riderId).select('socketId').lean()
    const currentSocketId = currentUser?.socketId || ride.userSocketId

    // Prepare event data
    const noDriverFoundData = {
      rideId: ride._id,
      message: `No driver accepted within ${waitTimeMinutes} minutes. Please try again later.`
    }

    const rideErrorData = {
      message: `No driver accepted within ${waitTimeMinutes} minutes. Please try again later.`,
      code: 'NO_DRIVER_ACCEPTED_TIMEOUT',
      rideId: ride._id
    }

    const rideCancelledData = {
      ride: cancelledRide,
      reason: cancellationReason,
      cancelledBy: 'system'
    }

    // Send socket events to rider using multiple methods for reliability
    if (currentSocketId) {
      // Method 1: Send to current socket ID (most reliable)
      io.to(currentSocketId).emit('noDriverFound', noDriverFoundData)
      io.to(currentSocketId).emit('rideError', rideErrorData)
      io.to(currentSocketId).emit('rideCancelled', rideCancelledData)
      logger.info(`📢 Auto-cancellation events sent to rider socket ${currentSocketId}`)
    }

    // Method 2: Also send to user room as fallback (works even if socket ID changed)
    io.to(`user_${riderId}`).emit('noDriverFound', noDriverFoundData)
    io.to(`user_${riderId}`).emit('rideError', rideErrorData)
    io.to(`user_${riderId}`).emit('rideCancelled', rideCancelledData)
    logger.info(`📢 Auto-cancellation events also sent to user room user_${riderId}`)

    // Method 3: If ride has old userSocketId and it's different, send there too (for backward compatibility)
    if (ride.userSocketId && ride.userSocketId !== currentSocketId) {
      io.to(ride.userSocketId).emit('noDriverFound', noDriverFoundData)
      io.to(ride.userSocketId).emit('rideError', rideErrorData)
      io.to(ride.userSocketId).emit('rideCancelled', rideCancelledData)
      logger.info(`📢 Auto-cancellation events also sent to old rider socket ${ride.userSocketId} (backward compatibility)`)
    }

    if (!currentSocketId && !ride.userSocketId) {
      logger.warn(`⚠️ Cannot send auto-cancellation events: no socket ID found for rider ${riderId}`)
    }

    // Create notification for rider
    await createNotification({
      recipientId: ride.rider._id || ride.rider,
      recipientModel: 'User',
      title: 'Ride Cancelled',
      message: `No driver accepted your ride within ${waitTimeMinutes} minutes. Please try booking again.`,
      type: 'ride_cancelled',
      relatedRide: ride._id.toString()
    })

    logger.info(`✅ Notification created for auto-cancelled ride ${ride._id}`)
    logger.info(`📊 Ride ${ride._id} auto-cancelled - Wait time: ${waitTimeMinutes} min, Notified drivers: ${notifiedCount}`)
  } catch (error) {
    logger.error(
      `❌ Error auto-cancelling expired ride ${ride._id}:`,
      error
    )
    throw error
  }
}

module.exports = initRideAutoCancelWorker

