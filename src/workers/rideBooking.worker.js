console.log('🔥 rideBooking.worker.js file loaded')

const { Worker } = require('bullmq')
const redis = require('../../config/redis')
const logger = require('../../utils/logger')

// Log immediately when module is loaded
console.log('🔥 rideBooking.worker.js - Module loaded, Redis:', !!redis)

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
    console.log('🚀 Initializing Ride Booking Worker... (console.log)')
    
    // Verify Redis connection
    if (!redis) {
      logger.error('❌ Redis connection not available for worker')
      console.error('❌ Redis connection not available for worker')
      throw new Error('Redis connection required for worker')
    }
    logger.info('✅ Redis connection verified for worker')
    console.log('✅ Redis connection verified for worker')

    // Get socket.io instance safely
    const io = getSocketIO()
    if (!io) {
      logger.error('❌ Socket.IO instance not available for worker')
      throw new Error('Socket.IO instance required for worker')
    }
    logger.info('✅ Socket.IO instance verified for worker')

    // Create BullMQ Worker
    const worker = new Worker(
    'ride-booking', // ✅ MUST match Queue name
    async job => {
      try {
        logger.info(`🔥 Worker picked job: ${job.id} | name: ${job.name} | data: ${JSON.stringify(job.data)}`)
        console.log(`🔥 Worker picked job: ${job.id} | name: ${job.name} | data: ${JSON.stringify(job.data)}`)

        const { rideId } = job.data
        if (!rideId) {
          logger.error('❌ Job missing rideId')
          return
        }

        logger.info(`📋 Processing job for rideId: ${rideId}`)

        // Fetch ride
        const ride = await Ride.findById(rideId).populate('rider', 'fullName name phone email')

        if (!ride) {
          logger.error(`❌ Ride not found: ${rideId}`)
          return
        }

        logger.info(`🔍 Processing ride ${ride._id} | status: ${ride.status} | pickup: [${ride.pickupLocation.coordinates[0]}, ${ride.pickupLocation.coordinates[1]}]`)

        // Only process requested rides
        if (ride.status !== 'requested') {
          logger.warn(`⚠️ Ride ${ride._id} skipped (status: ${ride.status})`)
          return
        }

        // Search drivers progressively (3km → 6km → 9km → 12km → 15km → 20km)
        logger.info(`🔎 Searching for drivers near pickup location: [${ride.pickupLocation.coordinates[0]}, ${ride.pickupLocation.coordinates[1]}]`)
        const { drivers, radiusUsed } =
          await searchDriversWithProgressiveRadius(
            ride.pickupLocation,
            [3000, 6000, 9000, 12000, 15000, 20000]
          )

        logger.info(
          `📍 Found ${drivers.length} drivers within ${radiusUsed}m for ride ${ride._id}`
        )

        // Log driver details if found
        if (drivers.length > 0) {
          drivers.forEach((driver, index) => {
            logger.info(`   Driver ${index + 1}: ${driver._id} | socketId: ${driver.socketId} | location: [${driver.location?.coordinates?.[0] || 'N/A'}, ${driver.location?.coordinates?.[1] || 'N/A'}]`)
          })
        }

        // No drivers found
        if (!drivers.length) {
          logger.warn(`❌ No drivers found for ride ${ride._id} within ${radiusUsed}m radius`)

          if (ride.userSocketId) {
            io.to(ride.userSocketId).emit('noDriverFound', {
              rideId: ride._id,
              message: `No drivers available within ${Math.round(radiusUsed / 1000)}km`
            })
            logger.info(`📤 Sent noDriverFound event to rider: ${ride.userSocketId}`)
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
            const lockKey = `driver_lock:${driver._id}`
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

    // Worker event handlers
    worker.on('completed', (job) => {
      logger.info(`✅ Worker job completed: ${job.id} | rideId: ${job.data.rideId}`)
    })

    worker.on('failed', (job, err) => {
      logger.error(`❌ Worker job failed: ${job?.id || 'unknown'} | error: ${err.message}`)
      logger.error(`   Stack: ${err.stack}`)
      logger.error(`   Job data: ${JSON.stringify(job?.data || {})}`)
    })

    worker.on('error', (err) => {
      logger.error(`❌ Worker error: ${err.message}`)
      logger.error(`   Stack: ${err.stack}`)
    })

    logger.info('🚀 Ride booking worker started successfully')
    logger.info('   Queue name: ride-booking')
    logger.info('   Concurrency: 5')
    logger.info('   Redis connection: active')
    logger.info('   Socket.IO: active')
    console.log('🚀 Ride booking worker started successfully')
    console.log('   Queue name: ride-booking')
    console.log('   Concurrency: 5')
    console.log('   Redis connection: active')
    console.log('   Socket.IO: active')
    
    return worker
  } catch (error) {
    logger.error(`❌ Failed to initialize Ride Booking Worker: ${error.message}`)
    logger.error(`   Stack: ${error.stack}`)
    throw error
  }
}

module.exports = initRideWorker
