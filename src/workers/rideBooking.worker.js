console.log('🔥 rideBooking.worker.js file loaded')

const { Worker } = require('bullmq')
const redis = require('../../config/redis')
const logger = require('../../utils/logger')

const Ride = require('../../Models/Driver/ride.model')
const Driver = require('../../Models/Driver/driver.model')

const { getSocketIO } = require('../../utils/socket')
const {
  searchDriversWithProgressiveRadius,
  createNotification
} = require('../../utils/ride_booking_functions')

/**
 * Initialize Ride Booking Worker
 */
function initRideWorker () {
  console.log('🔥 initRideWorker() called')

  try {
    logger.info('🚀 Initializing Ride Booking Worker...')

    if (!redis) {
      throw new Error('Redis connection required for worker')
    }

    const io = getSocketIO()
    if (!io) {
      throw new Error('Socket.IO instance required for worker')
    }

    const worker = new Worker(
      'ride-booking',
      async job => {
        try {
          logger.info(
            `🔥 Worker picked job: ${job.id} | data: ${JSON.stringify(job.data)}`
          )

          const { rideId } = job.data
          if (!rideId) return

          // 1️⃣ Fetch ride
          const ride = await Ride.findById(rideId).populate(
            'rider',
            'fullName name phone email'
          )

          if (!ride) return
          if (ride.status !== 'requested') return

          logger.info(`📋 Processing ride ${ride._id}`)

          // 2️⃣ Search drivers
          const { drivers, radiusUsed } =
            await searchDriversWithProgressiveRadius(
              ride.pickupLocation,
              [3000, 6000, 9000, 12000, 15000, 20000]
            )

          logger.info(
            `📍 Found ${drivers.length} drivers within ${radiusUsed}m`
          )

          // ❌ No drivers at all
          if (!drivers.length) {
            if (ride.userSocketId) {
              io.to(ride.userSocketId).emit('noDriverFound', {
                rideId: ride._id,
                message: `No drivers available within ${Math.round(radiusUsed / 1000)}km`
              })
            }
            return
          }

        // // Notify drivers
        // for (const driver of drivers) {
        //   if (!driver.socketId) {
        //     console.log(
        //       `⚠️ Driver ${driver._id} skipped (no socketId)`
        //     );
        //     continue;
        //   }

        //   const socketConn = io.sockets.sockets.get(driver.socketId);

        //   if (!socketConn || !socketConn.connected) {
        //     console.log(
        //       `⚠️ Driver ${driver._id} socket not connected`
        //     );
        //     continue;
        //   }

        //   console.log(
        //     `📡 Sending ride ${ride._id} to driver ${driver._id}`
        //   );

        //   // Emit socket event
        //   io.to(driver.socketId).emit("newRideRequest", ride);

        //   // Save notification
        //   await createNotification({
        //     recipientId: driver._id,
        //     recipientModel: "Driver",
        //     title: "New Ride Request",
        //     message: "Ride available near you",
        //     type: "ride_request",
        //     relatedRide: ride._id,
        //   });
        // }

        // Notify drivers (MULTI-SERVER SAFE)
        let notifiedCount = 0
        let skippedCount = 0
        
        for (const driver of drivers) {
          if (!driver.socketId) {
            logger.warn(`⚠️ Driver ${driver._id} skipped (no socketId)`)
            skippedCount++
            continue
          }

          try {
            // 🔒 STEP 1: Create Redis lock for driver to accept this ride
            // Lock key format: driver_lock:${driverId}:${rideId} (matches assignDriverToRide)
            const lockKey = `driver_lock:${driver._id}:${ride._id}`
            const lockTTL = 60 // 60 seconds - driver has 60 seconds to accept
            
            try {
              await redis.set(lockKey, ride._id.toString(), 'EX', lockTTL)
              logger.info(`🔒 Lock created for driver ${driver._id} | lockKey: ${lockKey} | rideId: ${ride._id} | TTL: ${lockTTL}s`)
            } catch (lockError) {
              logger.error(`❌ Failed to create lock for driver ${driver._id}: ${lockError.message}`)
              // Continue anyway - lock creation failure shouldn't prevent notification
            }

            logger.info(`📡 Sending ride ${ride._id} to driver ${driver._id} | socketId: ${driver.socketId}`)

            // ✅ Redis adapter will route this to the correct server
            io.to(driver.socketId).emit('newRideRequest', ride)
            notifiedCount++

            logger.info(`✅ Ride request sent to driver ${driver._id} via socket ${driver.socketId}`)

            // Save notification
            await createNotification({
              recipientId: driver._id,
              recipientModel: 'Driver',
              title: 'New Ride Request',
              message: 'Ride available near you',
              type: 'ride_request',
              relatedRide: ride._id
            })
            logger.info(`📝 Notification created for driver ${driver._id}`)
          } catch (notifyError) {
            logger.error(`❌ Error notifying driver ${driver._id}: ${notifyError.message}`)
            logger.error(`   Stack: ${notifyError.stack}`)
            skippedCount++
          }
        }

        logger.info(`✅ Ride ${ride._id} processed successfully | Notified: ${notifiedCount} drivers | Skipped: ${skippedCount} drivers`)
      } catch (error) {
        logger.error(`❌ Error processing ride job: ${error.message}`)
        logger.error(`   Stack: ${error.stack}`)
        logger.error(`   Job data: ${JSON.stringify(job.data)}`)
        throw error // Re-throw to mark job as failed
      }
    },
    {
      connection: redis,
      concurrency: 5 // ✅ Handles multiple rides safely
    }
    )

    worker.on('completed', job => {
      logger.info(`✅ Job completed: ${job.id}`)
    })

    worker.on('failed', (job, err) => {
      logger.error(`❌ Job failed: ${err.message}`)
    })

    return worker
  } catch (error) {
    logger.error(`❌ Worker init failed: ${error.message}`)
    throw error
  }
}

module.exports = initRideWorker
