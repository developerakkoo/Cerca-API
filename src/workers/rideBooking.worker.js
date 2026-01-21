console.log('🔥 rideBooking.worker.js file loaded')

const logger = require('../../utils/logger')
const Ride = require('../../Models/Driver/ride.model')
const Driver = require('../../Models/Driver/driver.model')
// Defer requiring socket utils until runtime to avoid circular require

const {
  searchDriversWithProgressiveRadius,
  createNotification,
  cancelRide
} = require('../../utils/ride_booking_functions')

/**
 * In-process Ride Booking Worker
 * (Single Server, No Redis, Same Logic)
 */
async function processRideJob (rideId) {
  try {
    logger.info(`🚀 Processing ride job | rideId: ${rideId}`)

    // Require socket utils at runtime to avoid circular require issues
    const socketUtils = require('../../utils/socket')
    let io
    try {
      io = socketUtils.getSocketIO()
    } catch (err) {
      // Socket.IO may not be initialized yet (cold start). Re-queue shortly.
      logger.warn(
        `Socket.IO not ready yet for ride ${rideId}, retrying in 500ms`
      )
      setTimeout(() => processRideJob(rideId), 500)
      return
    }

    // 1️⃣ Fetch ride
    const ride = await Ride.findById(rideId)
      .populate('rider', 'fullName name phone email')
      .select('+bookingType +bookingMeta')

    if (!ride) {
      logger.warn(`Ride not found | rideId: ${rideId}`)
      return
    }

    if (ride.status !== 'requested') {
      logger.info(`Ride ${rideId} already ${ride.status}, skipping`)
      return
    }

    logger.info(`📋 Processing ride ${ride._id}`)

    // 2️⃣ Search drivers
    const { drivers, radiusUsed } =
      await searchDriversWithProgressiveRadius(
        ride.pickupLocation,
        [3000, 6000, 9000, 12000, 15000, 20000],
        ride.bookingType || null
      )

    logger.info(`📍 Found ${drivers.length} drivers within ${radiusUsed}m`)

    // ❌ No drivers - Cancel the ride
    if (!drivers.length) {
      logger.warn(`❌ No drivers found for ride ${ride._id} within ${radiusUsed}m radius. Cancelling ride.`)
      
      try {
        // Cancel the ride
        const cancelledRide = await cancelRide(
          ride._id,
          'system',
          `No drivers found within ${Math.round(radiusUsed / 1000)}km radius`
        )
        
        logger.info(`✅ Ride ${ride._id} cancelled due to no drivers found`)
        
        // Emit events to notify the rider
        if (ride.userSocketId) {
          // Emit noDriverFound event (for backward compatibility)
          io.to(ride.userSocketId).emit('noDriverFound', {
            rideId: ride._id,
            message: `No drivers available within ${Math.round(radiusUsed / 1000)}km. Please try again later.`
          })
          
          // Emit rideError event
          io.to(ride.userSocketId).emit('rideError', {
            message: `No drivers found within ${Math.round(radiusUsed / 1000)}km radius. Please try again later.`,
            code: 'NO_DRIVERS_FOUND',
            rideId: ride._id
          })
          
          // Emit rideCancelled event to ensure frontend clears state
          io.to(ride.userSocketId).emit('rideCancelled', {
            ride: cancelledRide,
            reason: `No drivers found within ${Math.round(radiusUsed / 1000)}km radius`,
            cancelledBy: 'system'
          })
          
          logger.info(`📢 No driver found events sent to rider: ${ride.rider._id || ride.rider}`)
        } else {
          logger.warn(`⚠️ Cannot send no driver found events: userSocketId is missing for ride ${ride._id}`)
        }
        
        // Create notification for rider
        await createNotification({
          recipientId: ride.rider._id || ride.rider,
          recipientModel: 'User',
          title: 'Ride Cancelled',
          message: `No drivers found within ${Math.round(radiusUsed / 1000)}km radius. Please try again later.`,
          type: 'ride_cancelled',
          relatedRide: ride._id
        })
      } catch (cancelError) {
        logger.error(`❌ Error cancelling ride ${ride._id} due to no drivers: ${cancelError.message}`)
        // Still emit error event even if cancellation fails
        if (ride.userSocketId) {
          io.to(ride.userSocketId).emit('rideError', {
            message: `No drivers found within ${Math.round(radiusUsed / 1000)}km radius. Please try again later.`,
            code: 'NO_DRIVERS_FOUND',
            rideId: ride._id
          })
        }
      }
      
      return
    }

    let notifiedCount = 0
    let skippedCount = 0
    const notifiedDriverIds = []

    // 3️⃣ Notify drivers
    for (const driver of drivers) {
      if (!driver.socketId) {
        skippedCount++
        continue
      }

      try {
        logger.info(
          `📡 Sending ride ${ride._id} to driver ${driver._id} | socketId: ${driver.socketId}`
        )

        io.to(driver.socketId).emit('newRideRequest', ride)
        notifiedCount++
        notifiedDriverIds.push(driver._id)

        await createNotification({
          recipientId: driver._id,
          recipientModel: 'Driver',
          title: 'New Ride Request',
          message: 'Ride available near you',
          type: 'ride_request',
          relatedRide: ride._id
        })
      } catch (notifyError) {
        logger.error(
          `❌ Error notifying driver ${driver._id}: ${notifyError.message}`
        )
        skippedCount++
      }
    }

    // 4️⃣ Update ride with notified drivers for later use (when ride is accepted)
    if (notifiedDriverIds.length > 0) {
      try {
        await Ride.findByIdAndUpdate(ride._id, {
          $set: {
            notifiedDrivers: notifiedDriverIds
          }
        })
        logger.info(
          `📝 Tracked ${notifiedDriverIds.length} notified drivers for ride ${ride._id}`
        )
      } catch (updateError) {
        logger.error(
          `❌ Error updating notifiedDrivers for ride ${ride._id}: ${updateError.message}`
        )
      }
    }

    logger.info(
      `✅ Ride ${ride._id} processed | Notified: ${notifiedCount}, Skipped: ${skippedCount}`
    )
  } catch (error) {
    logger.error(`❌ processRideJob failed | rideId: ${rideId}`)
    logger.error(error)
  }
}

/**
 * Public API
 */
function initRideWorker () {
  logger.info('🚀 Ride Booking Worker initialized (in-process)')
  return { processRideJob }
}

module.exports = {
  initRideWorker,
  processRideJob
}
