const redis = require('../../config/redis')
const logger = require('../../utils/logger')
const cron = require('node-cron')

const Ride = require('../../Models/Driver/ride.model')
const { getSocketIO } = require('../../utils/socket')
const {
  startRide,
  updateRideStartTime,
  createNotification,
  getScheduledRidesToStart
} = require('../../utils/ride_booking_functions')

/**
 * Initialize Scheduled Ride Worker
 * Runs every 5 minutes to check for scheduled rides that need to start
 */
function initScheduledRideWorker() {
  console.log('🔥 initScheduledRideWorker() called')

  try {
    logger.info('🚀 Initializing Scheduled Ride Worker...')

    if (!redis) {
      throw new Error('Redis connection required for scheduled worker')
    }

    const io = getSocketIO()
    if (!io) {
      throw new Error('Socket.IO instance required for scheduled worker')
    }

    // Schedule cron job to run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        logger.info('⏰ Scheduled ride check triggered (every 5 minutes)')
        await checkAndStartScheduledRides(io)
      } catch (error) {
        logger.error('❌ Error in scheduled ride check:', error)
      }
    })

    logger.info('✅ Scheduled Ride Worker initialized - running every 5 minutes')
    console.log('✅ Scheduled Ride Worker initialized')

    // Run immediately on startup (optional - for testing)
    // setTimeout(() => checkAndStartScheduledRides(io), 10000)

    return { success: true }
  } catch (error) {
    logger.error(`❌ Failed to initialize Scheduled Ride Worker: ${error.message}`)
    logger.error(`   Stack: ${error.stack}`)
    throw error
  }
}

/**
 * Check for scheduled rides that need to start and auto-start them
 */
async function checkAndStartScheduledRides(io) {
  try {
    const now = new Date()

    logger.info(`🔍 Checking for scheduled rides to start...`)
    logger.info(`   Current time: ${now.toISOString()}`)

    // Use helper function to get scheduled rides
    const scheduledRides = await getScheduledRidesToStart()

    if (scheduledRides.length === 0) {
      logger.info('✅ No scheduled rides to start at this time')
      return
    }

    logger.info(`📋 Found ${scheduledRides.length} scheduled ride(s) to start`)

    for (const ride of scheduledRides) {
      try {
        await autoStartScheduledRide(ride, io)
      } catch (error) {
        logger.error(`❌ Error auto-starting ride ${ride._id}:`, error)
        // Continue with other rides even if one fails
      }
    }

    logger.info(`✅ Completed scheduled ride check - processed ${scheduledRides.length} ride(s)`)
  } catch (error) {
    logger.error('❌ Error checking scheduled rides:', error)
    throw error
  }
}

/**
 * Auto-start a scheduled ride
 */
async function autoStartScheduledRide(ride, io) {
  try {
    logger.info(`🚀 Auto-starting scheduled ride ${ride._id}`)
    logger.info(`   Booking type: ${ride.bookingType}`)
    logger.info(`   Start time: ${ride.bookingMeta?.startTime}`)
    logger.info(`   Driver: ${ride.driver?._id}`)
    logger.info(`   Rider: ${ride.rider?._id}`)

    // Update ride status to 'in_progress'
    const startedRide = await startRide(ride._id.toString())
    
    // Update actual start time
    await updateRideStartTime(ride._id.toString())

    logger.info(`✅ Ride ${ride._id} auto-started successfully`)

    // Send socket notifications
    if (startedRide.userSocketId) {
      io.to(startedRide.userSocketId).emit('rideStarted', startedRide)
      logger.info(`📤 Ride start notification sent to rider via socket ${startedRide.userSocketId}`)
    }

    if (startedRide.driverSocketId) {
      io.to(startedRide.driverSocketId).emit('rideStarted', startedRide)
      logger.info(`📤 Ride start notification sent to driver via socket ${startedRide.driverSocketId}`)
    }

    // Create database notifications
    await createNotification({
      recipientId: startedRide.rider._id,
      recipientModel: 'User',
      title: 'Ride Started',
      message: 'Your scheduled ride has started',
      type: 'ride_started',
      relatedRide: ride._id.toString()
    })

    await createNotification({
      recipientId: startedRide.driver._id,
      recipientModel: 'Driver',
      title: 'Scheduled Booking Started',
      message: 'Your scheduled booking has started. Please proceed to pickup location.',
      type: 'ride_started',
      relatedRide: ride._id.toString()
    })

    logger.info(`✅ Notifications created for ride ${ride._id}`)

    // Also check for upcoming bookings and send reminder notifications
    await checkAndSendReminderNotifications(io)

  } catch (error) {
    logger.error(`❌ Error auto-starting scheduled ride ${ride._id}:`, error)
    throw error
  }
}

/**
 * Check for upcoming bookings and send reminder notifications
 */
async function checkAndSendReminderNotifications(io) {
  try {
    const now = new Date()
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000)
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

    // Find rides starting in next hour
    const upcomingRides = await Ride.find({
      bookingType: { $ne: 'INSTANT' },
      status: 'accepted',
      'bookingMeta.startTime': {
        $gte: now,
        $lte: oneHourFromNow
      }
    }).populate('driver rider')

    for (const ride of upcomingRides) {
      const startTime = new Date(ride.bookingMeta.startTime)
      const minutesUntilStart = Math.floor((startTime - now) / (60 * 1000))

      // Send 1 hour reminder
      if (minutesUntilStart <= 60 && minutesUntilStart > 55) {
        await sendReminderNotification(ride, '1 hour', io)
      }
      // Send 30 minute reminder
      else if (minutesUntilStart <= 30 && minutesUntilStart > 25) {
        await sendReminderNotification(ride, '30 minutes', io)
      }
      // Send 5 minute reminder
      else if (minutesUntilStart <= 5 && minutesUntilStart > 0) {
        await sendReminderNotification(ride, '5 minutes', io)
      }
    }
  } catch (error) {
    logger.error('❌ Error checking reminder notifications:', error)
  }
}

/**
 * Send reminder notification for upcoming booking
 */
async function sendReminderNotification(ride, timeUntil, io) {
  try {
    const startTime = new Date(ride.bookingMeta.startTime)
    const formattedTime = startTime.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })

    // Notify driver
    if (ride.driverSocketId) {
      io.to(ride.driverSocketId).emit('bookingReminder', {
        rideId: ride._id,
        message: `You have a booking starting in ${timeUntil}`,
        startTime: formattedTime
      })
    }

    await createNotification({
      recipientId: ride.driver._id,
      recipientModel: 'Driver',
      title: 'Upcoming Booking Reminder',
      message: `You have a ${ride.bookingType} booking starting in ${timeUntil} at ${formattedTime}`,
      type: 'system',
      relatedRide: ride._id.toString()
    })

    logger.info(`📢 Reminder sent to driver ${ride.driver._id} - booking starts in ${timeUntil}`)
  } catch (error) {
    logger.error(`❌ Error sending reminder notification:`, error)
  }
}

module.exports = initScheduledRideWorker

