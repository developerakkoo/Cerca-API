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

          // ===================================
          // OPTION A: SEQUENTIAL DRIVER OFFER
          // ===================================

          // drivers already sorted by distance
          const driversQueue = [...drivers]

          // pick first driver only
          const firstDriver = driversQueue.shift()

          if (!firstDriver || !firstDriver.socketId) {
            if (ride.userSocketId) {
              io.to(ride.userSocketId).emit('noDriverFound', {
                rideId: ride._id
              })
            }
            return
          }

          // 3️⃣ Create Redis lock (30s)
          const lockKey = `driver_lock:${firstDriver._id}:${ride._id}`

          await redis.set(
            lockKey,
            ride._id.toString(),
            'EX',
            30
          )

          logger.info('🔐 Driver lock created', {
            driverId: firstDriver._id,
            rideId: ride._id
          })

          // 4️⃣ Store remaining drivers queue
          await redis.set(
            `ride_driver_queue:${ride._id}`,
            JSON.stringify(driversQueue.map(d => d._id)),
            'EX',
            300
          )

          // 5️⃣ Send ride request to FIRST driver only
          io.to(firstDriver.socketId).emit('newRideRequest', ride)

          logger.info(
            `📡 Ride ${ride._id} sent to driver ${firstDriver._id}`
          )

          // 6️⃣ Save notification
          await createNotification({
            recipientId: firstDriver._id,
            recipientModel: 'Driver',
            title: 'New Ride Request',
            message: 'Ride available near you',
            type: 'ride_request',
            relatedRide: ride._id
          })
        } catch (error) {
          logger.error(`❌ Worker error: ${error.message}`)
          throw error
        }
      },
      {
        connection: redis,
        concurrency: 5
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
