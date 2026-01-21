const Driver = require('../Models/Driver/driver.model')
const Ride = require('../Models/Driver/ride.model')
const User = require('../Models/User/user.model')
const Rating = require('../Models/Driver/rating.model')
const Message = require('../Models/Driver/message.model')
const Notification = require('../Models/User/notification.model')
const Emergency = require('../Models/User/emergency.model')
const logger = require('./logger')
const redis = require('../config/redis')


//Helper Function
function toLngLat (input) {
  if (!input) throw new Error('Location required')

  // Case A: GeoJSON { type:'Point', coordinates:[lng,lat] }
  if (Array.isArray(input.coordinates) && input.coordinates.length === 2) {
    const [lng, lat] = input.coordinates
    if (typeof lng === 'number' && typeof lat === 'number') return [lng, lat]
  }

  // Case B: plain { longitude, latitude }
  if (
    typeof input.longitude === 'number' &&
    typeof input.latitude === 'number'
  ) {
    return [input.longitude, input.latitude]
  }

  throw new Error(
    'Invalid location (need {longitude,latitude} or GeoJSON Point)'
  )
}

const updateDriverStatus = async (driverId, status, socketId) => {
  try {
    const driver = await Driver.findByIdAndUpdate(
      driverId,
      { isActive: status, socketId: socketId },
      { new: true }
    )
    if (!driver) {
      throw new Error('Driver not found')
    }
    return driver
  } catch (error) {
    throw new Error(`Error updating driver status: ${error.message}`)
  }
}

const updateDriverLocation = async (driverId, location) => {
  try {
    // Extract coordinates - handle both formats
    let longitude, latitude

    if (location.coordinates && Array.isArray(location.coordinates)) {
      ;[longitude, latitude] = location.coordinates
    } else if (
      location.longitude !== undefined &&
      location.latitude !== undefined
    ) {
      longitude = location.longitude
      latitude = location.latitude
    } else {
      throw new Error(
        'Invalid location format. Provide either coordinates array or longitude/latitude'
      )
    }

    // Validate coordinates are valid numbers
    longitude = parseFloat(longitude)
    latitude = parseFloat(latitude)

    if (isNaN(longitude) || isNaN(latitude)) {
      throw new Error(
        'Invalid coordinates. Longitude and latitude must be valid numbers'
      )
    }

    // Validate range
    if (
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error(
        'Coordinates out of range. Longitude: -180 to 180, Latitude: -90 to 90'
      )
    }

    // Log location update for debugging
    logger.info(
      `📍 Updating driver location - driverId: ${driverId}, coordinates: [${longitude}, ${latitude}]`
    )

    const driver = await Driver.findByIdAndUpdate(
      driverId,
      {
        location: {
          type: 'Point',
          coordinates: [longitude, latitude]
        }
      },
      { new: true }
    )

    if (!driver) {
      throw new Error('Driver not found')
    }

    logger.info(
      `✅ Driver location updated successfully - driverId: ${driverId}, saved location: [${driver.location.coordinates[0]}, ${driver.location.coordinates[1]}]`
    )

    return driver
  } catch (error) {
    logger.error(
      `❌ Error updating driver location - driverId: ${driverId}, error: ${error.message}`
    )
    throw new Error(`Error updating driver location: ${error.message}`)
  }
}

const searchNearbyDrivers = async (userId, location) => {
  try {
    const drivers = await Driver.find({
      location: {
        $geoWithin: {
          $centerSphere: [[location.longitude, location.latitude], 10 / 3963.1] // 10 miles radius
        }
      },
      isActive: true
    })
    return drivers
  } catch (error) {
    throw new Error(`Error searching nearby drivers: ${error.message}`)
  }
}

const createRide = async rideData => {
  try {
    const riderId = rideData.riderId || rideData.rider
    if (!riderId) throw new Error('riderId (or rider) is required')

    // Check for existing active ride to prevent duplicates
    const existingActiveRide = await Ride.findOne({
      rider: riderId,
      status: { $in: ['requested', 'accepted', 'in_progress'] }
    })

    if (existingActiveRide) {
      logger.warn(
        `Duplicate ride attempt prevented in createRide for rider ${riderId}. Active ride: ${existingActiveRide._id}`
      )
      throw new Error(
        'You already have an active ride. Please cancel it before booking a new one.'
      )
    }

    // Validate locations
    if (!rideData.pickupLocation) {
      throw new Error('pickupLocation is required')
    }
    if (!rideData.dropoffLocation) {
      throw new Error('dropoffLocation is required')
    }

    let pickupLngLat, dropoffLngLat
    try {
      pickupLngLat = toLngLat(rideData.pickupLocation)
    } catch (locError) {
      throw new Error(
        `Invalid pickupLocation: ${
          locError.message
        }. Received: ${JSON.stringify(rideData.pickupLocation)}`
      )
    }

    try {
      dropoffLngLat = toLngLat(rideData.dropoffLocation)
    } catch (locError) {
      throw new Error(
        `Invalid dropoffLocation: ${
          locError.message
        }. Received: ${JSON.stringify(rideData.dropoffLocation)}`
      )
    }

    // Calculate distance using Haversine formula
    const distance = calculateHaversineDistance(
      pickupLngLat[1],
      pickupLngLat[0], // lat, lng
      dropoffLngLat[1],
      dropoffLngLat[0]
    )

    // Fetch admin settings for fare calculation
    const Settings = require('../Models/Admin/settings.modal.js')
    const settings = await Settings.findOne()

    if (!settings) {
      throw new Error('Admin settings not found. Please configure pricing.')
    }

    const { perKmRate, minimumFare } = settings.pricingConfigurations

    // Find the service (case-insensitive lookup)
    const selectedService = rideData.service
    if (!selectedService) {
      throw new Error(
        'Service is required. Available services: ' +
          settings.services.map(s => s.name).join(', ')
      )
    }

    const service = settings.services.find(
      s => s.name.toLowerCase() === selectedService.toLowerCase()
    )

    if (!service) {
      const availableServices =
        settings.services.map(s => s.name).join(', ') || 'none'
      throw new Error(
        `Invalid service: "${selectedService}". Available services: ${availableServices}`
      )
    }

    // Calculate fare: base price + (distance * per km rate)
    let fare = service.price + distance * perKmRate
    fare = Math.max(fare, minimumFare) // Ensure minimum fare
    fare = Math.round(fare * 100) / 100 // Round to 2 decimal places

    // Apply promo code if provided
    let discount = 0
    let finalFare = fare
    if (rideData.promoCode) {
      const Coupon = require('../Models/Admin/coupon.modal.js')
      const coupon = await Coupon.findOne({
        couponCode: rideData.promoCode.toUpperCase().trim()
      })

      if (coupon) {
        // Check if user can use this coupon
        const canUse = coupon.canUserUse(riderId)
        if (canUse.canUse) {
          // Check service applicability
          const serviceApplicable =
            !coupon.applicableServices ||
            coupon.applicableServices.length === 0 ||
            coupon.applicableServices.includes(service.name)

          // Check ride type applicability
          const rideTypeApplicable =
            !coupon.applicableRideTypes ||
            coupon.applicableRideTypes.length === 0 ||
            coupon.applicableRideTypes.includes(rideData.rideType || 'normal')

          if (serviceApplicable && rideTypeApplicable) {
            const discountResult = coupon.calculateDiscount(fare)
            if (discountResult.discount > 0) {
              discount = discountResult.discount
              finalFare = discountResult.finalFare

              // Record coupon usage (will be saved after ride is created)
              rideData._couponToApply = {
                coupon,
                discount,
                originalFare: fare
              }
            }
          }
        }
      }
    }

    // ===============================
    // BOOKING TYPE LOGIC (CREATE RIDE)
    // ===============================
    const bookingType = rideData.bookingType || 'INSTANT'
    const bookingMeta = rideData.bookingMeta || {}

    if (bookingType === 'FULL_DAY') {
      if (!bookingMeta.startTime || !bookingMeta.endTime) {
        throw new Error('FULL_DAY booking requires startTime and endTime')
      }

      rideData.bookingType = 'FULL_DAY'
      rideData.bookingMeta = {
        startTime: new Date(bookingMeta.startTime),
        endTime: new Date(bookingMeta.endTime)
      }

      // optional fixed pricing
      finalFare = 1500
    }

    if (bookingType === 'RENTAL') {
      if (!bookingMeta.days || !bookingMeta.startTime) {
        throw new Error('RENTAL booking requires days and startTime')
      }

      const start = new Date(bookingMeta.startTime)
      const end = new Date(
        start.getTime() + bookingMeta.days * 24 * 60 * 60 * 1000
      )

      rideData.bookingType = 'RENTAL'
      rideData.bookingMeta = {
        days: bookingMeta.days,
        startTime: start,
        endTime: end
      }

      finalFare = bookingMeta.days * 700 // example
    }

    if (bookingType === 'DATE_WISE') {
      if (!Array.isArray(bookingMeta.dates) || bookingMeta.dates.length === 0) {
        throw new Error('DATE_WISE booking requires dates[]')
      }

      rideData.bookingType = 'DATE_WISE'
      rideData.bookingMeta = {
        dates: bookingMeta.dates.map(d => new Date(d))
      }

      finalFare = bookingMeta.dates.length * 500 // example
    }

    const rideDoc = {
      rider: riderId,
      pickupLocation: { type: 'Point', coordinates: pickupLngLat },
      dropoffLocation: { type: 'Point', coordinates: dropoffLngLat },
      fare: finalFare,
      distanceInKm: Math.round(distance * 100) / 100, // Round to 2 decimal places
      rideType: rideData.rideType || 'normal',
      bookingType: rideData.bookingType || 'INSTANT',
      bookingMeta: rideData.bookingMeta || {},
      userSocketId: rideData.userSocketId,
      status: 'requested',
      paymentMethod: rideData.paymentMethod || 'CASH',
      pickupAddress: rideData.pickupAddress,
      dropoffAddress: rideData.dropoffAddress,
      service: service.name,
      promoCode: rideData.promoCode || null,
      discount: discount
      // startOtp & stopOtp come from schema defaults
    }

    // Add hybrid payment fields if present
    if (rideData.razorpayPaymentId) {
      rideDoc.razorpayPaymentId = rideData.razorpayPaymentId
    }
    if (rideData.walletAmountUsed !== undefined) {
      rideDoc.walletAmountUsed = rideData.walletAmountUsed
    }
    if (rideData.razorpayAmountPaid !== undefined) {
      rideDoc.razorpayAmountPaid = rideData.razorpayAmountPaid
    }

    // Single insert; returns the created document including generated OTPs
    const ride = await Ride.create(rideDoc)

    // Apply coupon if provided and valid
    if (rideData._couponToApply) {
      const { coupon, discount, originalFare } = rideData._couponToApply
      try {
        await coupon.recordUsage(
          riderId,
          ride._id,
          discount,
          originalFare,
          finalFare
        )
        logger.info(
          `Coupon ${coupon.couponCode} applied to ride ${ride._id}, discount: ₹${discount}`
        )
      } catch (error) {
        logger.error(
          `Error recording coupon usage for ride ${ride._id}:`,
          error
        )
        // Don't fail ride creation if coupon recording fails
      }
    }

    return ride
  } catch (error) {
    throw new Error(`Error creating ride: ${error.message}`)
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} - Distance in kilometers
 */
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRadians = degrees => (degrees * Math.PI) / 180
  const R = 6371 // Earth's radius in kilometers

  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const assignDriverToRide = async (rideId, driverId, driverSocketId) => {
  try {
    logger.info(`🚗 Assigning driver ${driverId} to ride ${rideId}`)

    // 1️⃣ Ensure ride exists & is still available
    const rideForCheck = await Ride.findById(rideId)
    if (!rideForCheck) {
      throw new Error('Ride not found')
    }

    if (rideForCheck.status !== 'requested') {
      throw new Error(`Ride is no longer available (status: ${rideForCheck.status})`)
    }

    // 2️⃣ DATE_WISE conflict check
    if (rideForCheck.bookingType === 'DATE_WISE') {
      const conflict = await Ride.findOne({
        driver: driverId,
        bookingType: 'DATE_WISE',
        'bookingMeta.dates': { $in: rideForCheck.bookingMeta.dates },
        status: { $in: ['accepted', 'in_progress'] }
      })

      if (conflict) {
        throw new Error('Driver not available on selected dates')
      }
    }

    // 3️⃣ ATOMIC ASSIGN (THIS IS YOUR LOCK)
    // This query ensures only ONE driver can successfully accept:
    // - Ride must be in 'requested' status
    // - Ride must not have a driver assigned yet
    // MongoDB's findOneAndUpdate is atomic, preventing race conditions
    logger.info(
      `🔒 Attempting atomic assignment - rideId: ${rideId}, driverId: ${driverId}`
    )
    
    const ride = await Ride.findOneAndUpdate(
      {
        _id: rideId,
        status: 'requested',
        driver: { $exists: false }
      },
      {
        $set: {
          driver: driverId,
          driverSocketId,
          status: 'accepted'
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).populate('driver rider')

    if (!ride) {
      // Check why assignment failed for better error message
      const currentRide = await Ride.findById(rideId).select('status driver').lean()
      if (currentRide) {
        if (currentRide.status !== 'requested') {
          logger.warn(
            `⚠️ Atomic assignment failed - ride ${rideId} status is ${currentRide.status}, not 'requested'`
          )
          throw new Error(`Ride is no longer available (status: ${currentRide.status})`)
        }
        if (currentRide.driver) {
          logger.warn(
            `⚠️ Atomic assignment failed - ride ${rideId} already has driver: ${currentRide.driver}`
          )
          throw new Error('Ride already accepted by another driver')
        }
      }
      logger.warn(
        `⚠️ Atomic assignment failed - ride ${rideId} not found or conditions not met`
      )
      throw new Error('Ride already accepted by another driver')
    }
    
    logger.info(
      `✅ Atomic assignment successful - rideId: ${rideId}, driverId: ${driverId}`
    )

    logger.info(`✅ Driver ${driverId} assigned to ride ${rideId}`)

    // 4️⃣ DRIVER BUSY LOGIC
    if (ride.bookingType === 'INSTANT') {
      await Driver.findByIdAndUpdate(driverId, {
        isBusy: true,
        busyUntil: null
      })
    } else {
      // FULL_DAY / RENTAL
      await Driver.findByIdAndUpdate(driverId, {
        isBusy: false,
        busyUntil: ride.bookingMeta?.endTime || null
      })
    }

    return ride
  } catch (error) {
    throw new Error(`Error assigning driver: ${error.message}`)
  }
}


const startRide = async rideId => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      rideId,
      { status: 'in_progress' },
      { new: true }
    ).populate('driver rider')
    if (!ride) throw new Error('Ride not found')
    return ride
  } catch (error) {
    throw new Error(`Error starting ride: ${error.message}`)
  }
}

const completeRide = async (rideId, fare) => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      rideId,
      { status: 'completed', fare },
      { new: true }
    ).populate('driver rider')
    if (!ride) throw new Error('Ride not found')
    return ride
  } catch (error) {
    throw new Error(`Error completing ride: ${error.message}`)
  }
}

const cancelRide = async (rideId, cancelledBy, cancellationReason = null) => {
  try {
    const updateData = {
      status: 'cancelled',
      cancelledBy
    }

    // Add cancellation reason if provided
    if (cancellationReason) {
      updateData.cancellationReason = cancellationReason
    }

    const ride = await Ride.findByIdAndUpdate(rideId, updateData, {
      new: true
    }).populate('driver rider')
    if (!ride) throw new Error('Ride not found')
      // If a driver was assigned, free them up and remove any locks for this ride
      try {
        if (ride.driver) {
          const driverId = ride.driver._id || ride.driver
          
          // Ensure driver exists before updating
          const driverExists = await Driver.findById(driverId)
          if (!driverExists) {
            logger.warn(`cancelRide: Driver ${driverId} not found, skipping isBusy reset`)
          } else {
            // Reset isBusy for this cancelled ride
            await Driver.findByIdAndUpdate(driverId, {
              isBusy: false,
              busyUntil: null
            })
            
            logger.info(
              `✅ cancelRide: Driver ${driverId} isBusy reset to false after ride ${rideId} cancellation`
            )

            // Validate driver status to check for OTHER active rides
            // This ensures if driver has multiple rides, we only set isBusy=false if no other active rides exist
            const validationResult = await validateAndFixDriverStatus(driverId)
            if (validationResult.corrected) {
              logger.info(
                `✅ cancelRide: Driver ${driverId} status validated and corrected: ${validationResult.reason}`
              )
            }
          }

          // Clean any redis lock left for this driver+ride (multi-server safety)
          // try {
          //   await redis.del(`driver_lock:${ride.driver._id || ride.driver}:${ride._id}`)
          // } catch (redisErr) {
          //   logger.warn(`Failed to delete redis lock for cancelled ride ${ride._id}: ${redisErr.message}`)
          // }
        }
      } catch (err) {
        logger.error(`Error cleaning driver state after cancellation: ${err.message}`)
      }

      return ride
  } catch (error) {
    throw new Error(`Error cancelling ride: ${error.message}`)
  }
}

// Socket management functions
async function setUserSocket (userId, socketId) {
  return User.findByIdAndUpdate(
    userId,
    { $set: { socketId, isOnline: true, lastSeen: new Date() } },
    { new: true }
  )
}

async function clearUserSocket (userId, socketId) {
  // Clear only if the stored socket matches (prevents clearing a newer connection)
  return User.updateOne(
    { _id: userId, socketId },
    {
      $set: { isOnline: false, lastSeen: new Date() },
      $unset: { socketId: '' }
    }
  )
}

async function setDriverSocket (driverId, socketId) {
  return Driver.findByIdAndUpdate(
    driverId,
    { $set: { socketId, isOnline: true, lastSeen: new Date() } },
    { new: true }
  )
}

async function clearDriverSocket (driverId, socketId) {
  return Driver.updateOne(
    { _id: driverId, socketId },
    {
      $set: { isOnline: false, lastSeen: new Date() },
      $unset: { socketId: '' }
    }
  )
}
//end of socket management functions

// OTP Verification Functions
const verifyStartOtp = async (rideId, providedOtp) => {
  try {
    const ride = await Ride.findById(rideId)
    if (!ride) throw new Error('Ride not found')

    if (ride.status !== 'accepted') {
      throw new Error('Ride is not in accepted state')
    }

    if (ride.startOtp !== providedOtp) {
      throw new Error('Invalid OTP')
    }

    return { success: true, ride }
  } catch (error) {
    throw new Error(`Error verifying start OTP: ${error.message}`)
  }
}

const verifyStopOtp = async (rideId, providedOtp) => {
  try {
    const ride = await Ride.findById(rideId)
    if (!ride) throw new Error('Ride not found')

    if (ride.status !== 'in_progress') {
      throw new Error('Ride is not in progress')
    }

    if (ride.stopOtp !== providedOtp) {
      throw new Error('Invalid OTP')
    }

    return { success: true, ride }
  } catch (error) {
    throw new Error(`Error verifying stop OTP: ${error.message}`)
  }
}

// Driver arrived at pickup
const markDriverArrived = async rideId => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      rideId,
      {
        $set: {
          driverArrivedAt: new Date(),
          status: 'arrived' // Update status to 'arrived' so rider app UI updates
        }
      },
      { new: true }
    ).populate('driver rider')

    if (!ride) throw new Error('Ride not found')
    return ride
  } catch (error) {
    throw new Error(`Error marking driver arrived: ${error.message}`)
  }
}

// Update ride with actual start time
const updateRideStartTime = async rideId => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      rideId,
      { actualStartTime: new Date() },
      { new: true }
    ).populate('driver rider')

    // Update driver status to busy
    if (ride.driver) {
      await Driver.findByIdAndUpdate(ride.driver._id, { isBusy: true })
    }

    return ride
  } catch (error) {
    throw new Error(`Error updating ride start time: ${error.message}`)
  }
}

// Update ride with actual end time and calculate duration
const updateRideEndTime = async rideId => {
  try {
    const ride = await Ride.findById(rideId)
    if (!ride) throw new Error('Ride not found')

    const endTime = new Date()
    const actualDuration = ride.actualStartTime
      ? Math.round((endTime - ride.actualStartTime) / 60000) // in minutes
      : 0

    const updatedRide = await Ride.findByIdAndUpdate(
      rideId,
      {
        actualEndTime: endTime,
        actualDuration: actualDuration
      },
      { new: true }
    ).populate('driver rider')

    // Update driver status to not busy
    if (updatedRide.driver) {
      const driverId = updatedRide.driver._id || updatedRide.driver
      
      // Ensure driver exists before updating
      const driverExists = await Driver.findById(driverId)
      if (!driverExists) {
        logger.warn(`updateRideEndTime: Driver ${driverId} not found, skipping isBusy reset`)
      } else {
        // Reset isBusy for this completed ride
        await Driver.findByIdAndUpdate(driverId, {
          isBusy: false,
          busyUntil: null
        })
        
        logger.info(
          `✅ updateRideEndTime: Driver ${driverId} isBusy reset to false after ride ${rideId} completion`
        )

        // Validate driver status to check for OTHER active rides
        // This ensures if driver has multiple rides, we only set isBusy=false if no other active rides exist
        const validationResult = await validateAndFixDriverStatus(driverId)
        if (validationResult.corrected) {
          logger.info(
            `✅ updateRideEndTime: Driver ${driverId} status validated and corrected: ${validationResult.reason}`
          )
        }
      }
    }

    return updatedRide
  } catch (error) {
    throw new Error(`Error updating ride end time: ${error.message}`)
  }
}

// Driver Status Validation Function
/**
 * Validates and fixes driver isBusy status based on actual active rides
 * Rule: isBusy should ONLY be true if driver has active rides
 * Active ride statuses: requested, accepted, arrived, in_progress
 * @param {string} driverId - Driver ID to validate
 * @returns {Promise<Object>} Validation result with correction details
 */
const validateAndFixDriverStatus = async driverId => {
  try {
    if (!driverId) {
      throw new Error('Driver ID is required')
    }

    // Get current driver status
    const driver = await Driver.findById(driverId)
    if (!driver) {
      logger.warn(`validateAndFixDriverStatus: Driver not found - driverId: ${driverId}`)
      return { corrected: false, reason: 'Driver not found' }
    }

    // Query for active rides assigned to this driver
    const activeRides = await Ride.find({
      driver: driverId,
      status: { $in: ['requested', 'accepted', 'arrived', 'in_progress'] }
    }).select('_id status bookingType').lean()

    const hasActiveRides = activeRides.length > 0
    const currentIsBusy = driver.isBusy || false

    // Rule: isBusy should ONLY be true if driver has active rides
    if (!hasActiveRides && currentIsBusy) {
      // Driver is marked busy but has no active rides - reset to not busy
      await Driver.findByIdAndUpdate(driverId, {
        isBusy: false,
        busyUntil: null
      })

      logger.info(
        `✅ [Status Validation] Driver ${driverId} status corrected: isBusy ${currentIsBusy} → false (no active rides found)`
      )

      return {
        corrected: true,
        previousStatus: { isBusy: currentIsBusy },
        newStatus: { isBusy: false },
        reason: 'No active rides found but driver was marked as busy',
        activeRidesCount: 0
      }
    } else if (hasActiveRides && !currentIsBusy) {
      // Driver has active rides but is not marked busy - set to busy (for INSTANT rides)
      // Check if any active ride is INSTANT type
      const hasInstantRide = activeRides.some(
        ride => ride.bookingType === 'INSTANT'
      )

      if (hasInstantRide) {
        await Driver.findByIdAndUpdate(driverId, {
          isBusy: true
        })

        logger.info(
          `✅ [Status Validation] Driver ${driverId} status corrected: isBusy ${currentIsBusy} → true (has active INSTANT ride)`
        )

        return {
          corrected: true,
          previousStatus: { isBusy: currentIsBusy },
          newStatus: { isBusy: true },
          reason: 'Has active INSTANT ride but was not marked as busy',
          activeRidesCount: activeRides.length
        }
      } else {
        // FULL_DAY/RENTAL rides - driver might not need to be busy
        logger.info(
          `ℹ️ [Status Validation] Driver ${driverId} has active FULL_DAY/RENTAL rides but isBusy=false (expected behavior)`
        )

        return {
          corrected: false,
          reason: 'Has active FULL_DAY/RENTAL rides, isBusy=false is correct',
          activeRidesCount: activeRides.length
        }
      }
    } else {
      // Status is consistent
      logger.debug(
        `✓ [Status Validation] Driver ${driverId} status is consistent: isBusy=${currentIsBusy}, activeRides=${activeRides.length}`
      )

      return {
        corrected: false,
        reason: 'Status is consistent',
        activeRidesCount: activeRides.length,
        isBusy: currentIsBusy
      }
    }
  } catch (error) {
    logger.error(
      `❌ [Status Validation] Error validating driver status for ${driverId}: ${error.message}`
    )
    throw new Error(`Error validating driver status: ${error.message}`)
  }
}

// Rating Functions
const submitRating = async ratingData => {
  try {
    const {
      rideId,
      ratedBy,
      ratedByModel,
      ratedTo,
      ratedToModel,
      rating,
      review,
      tags
    } = ratingData

    // Check if rating already exists
    const existingRating = await Rating.findOne({
      ride: rideId,
      ratedBy,
      ratedByModel
    })

    if (existingRating) {
      throw new Error('Rating already submitted for this ride')
    }

    // Create rating
    const newRating = await Rating.create({
      ride: rideId,
      ratedBy,
      ratedByModel,
      ratedTo,
      ratedToModel,
      rating,
      review,
      tags
    })

    // Update ride with rating
    if (ratedByModel === 'User') {
      await Ride.findByIdAndUpdate(rideId, { driverRating: rating })
    } else {
      await Ride.findByIdAndUpdate(rideId, { riderRating: rating })
    }

    // Calculate and update average rating
    await updateAverageRating(ratedTo, ratedToModel)

    return newRating
  } catch (error) {
    throw new Error(`Error submitting rating: ${error.message}`)
  }
}

const updateAverageRating = async (entityId, entityModel) => {
  try {
    const ratings = await Rating.find({
      ratedTo: entityId,
      ratedToModel: entityModel
    })

    if (ratings.length === 0) return

    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0)
    const averageRating = (totalRating / ratings.length).toFixed(2)

    const Model = entityModel === 'Driver' ? Driver : User
    await Model.findByIdAndUpdate(entityId, {
      rating: averageRating,
      totalRatings: ratings.length
    })
  } catch (error) {
    throw new Error(`Error updating average rating: ${error.message}`)
  }
}

// Messaging Functions
const saveMessage = async messageData => {
  try {
    const {
      rideId,
      senderId,
      senderModel,
      receiverId,
      receiverModel,
      message,
      messageType
    } = messageData

    const newMessage = await Message.create({
      ride: rideId,
      sender: senderId,
      senderModel,
      receiver: receiverId,
      receiverModel,
      message,
      messageType: messageType || 'text'
    })

    return newMessage
  } catch (error) {
    throw new Error(`Error saving message: ${error.message}`)
  }
}

const markMessageAsRead = async messageId => {
  try {
    const message = await Message.findByIdAndUpdate(
      messageId,
      { isRead: true },
      { new: true }
    )
    return message
  } catch (error) {
    throw new Error(`Error marking message as read: ${error.message}`)
  }
}

const getRideMessages = async rideId => {
  try {
    const messages = await Message.find({ ride: rideId })
      .sort({ createdAt: 1 })
      .populate('sender', 'name fullName')
      .populate('receiver', 'name fullName')
    return messages
  } catch (error) {
    throw new Error(`Error fetching messages: ${error.message}`)
  }
}

// Notification Functions
const createNotification = async notificationData => {
  try {
    const {
      recipientId,
      recipientModel,
      title,
      message,
      type,
      relatedRide,
      data
    } = notificationData

    const notification = await Notification.create({
      recipient: recipientId,
      recipientModel,
      title,
      message,
      type,
      relatedRide,
      data
    })

    return notification
  } catch (error) {
    throw new Error(`Error creating notification: ${error.message}`)
  }
}

const markNotificationAsRead = async notificationId => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true }
    )
    return notification
  } catch (error) {
    throw new Error(`Error marking notification as read: ${error.message}`)
  }
}

const getUserNotifications = async (userId, userModel) => {
  try {
    const notifications = await Notification.find({
      recipient: userId,
      recipientModel: userModel
    })
      .sort({ createdAt: -1 })
      .limit(50)
    return notifications
  } catch (error) {
    throw new Error(`Error fetching notifications: ${error.message}`)
  }
}

// Emergency Functions
const createEmergencyAlert = async emergencyData => {
  try {
    const {
      rideId,
      triggeredBy,
      triggeredByModel,
      location,
      reason,
      description
    } = emergencyData

    const emergency = await Emergency.create({
      ride: rideId,
      triggeredBy,
      triggeredByModel,
      location: {
        type: 'Point',
        coordinates: [location.longitude, location.latitude]
      },
      reason,
      description
    })

    // Update ride status
    await Ride.findByIdAndUpdate(rideId, {
      status: 'cancelled',
      cancelledBy: 'system',
      cancellationReason: `Emergency: ${reason}`
    })

    return emergency
  } catch (error) {
    throw new Error(`Error creating emergency alert: ${error.message}`)
  }
}

const resolveEmergency = async emergencyId => {
  try {
    const emergency = await Emergency.findByIdAndUpdate(
      emergencyId,
      {
        status: 'resolved',
        resolvedAt: new Date()
      },
      { new: true }
    )
    return emergency
  } catch (error) {
    throw new Error(`Error resolving emergency: ${error.message}`)
  }
}

// Auto-assign driver to ride
const autoAssignDriver = async (rideId, pickupLocation, maxDistance = 5000) => {
  try {
    const drivers = await Driver.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: pickupLocation.coordinates
          },
          $maxDistance: maxDistance // meters
        }
      },
      isActive: true,
      isBusy: false,
      isOnline: true
    }).limit(5)

    return drivers
  } catch (error) {
    throw new Error(`Error auto-assigning driver: ${error.message}`)
  }
}

// Search drivers with progressive radius expansion
const searchDriversWithProgressiveRadius = async (
  pickupLocation,
  radii = [3000, 6000, 9000, 12000, 15000, 20000],
  bookingType = null // Optional: 'INSTANT', 'FULL_DAY', 'RENTAL', 'DATE_WISE'
) => {
  try {
    // Ensure pickupLocation has coordinates array
    const coordinates = pickupLocation.coordinates || [
      pickupLocation.longitude,
      pickupLocation.latitude
    ]

    // Validate coordinate format
    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      throw new Error(
        `Invalid coordinates format: expected [longitude, latitude], got ${JSON.stringify(
          coordinates
        )}`
      )
    }

    const [longitude, latitude] = coordinates

    // Validate longitude range (-180 to 180)
    if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
      throw new Error(
        `Invalid longitude: ${longitude} (must be between -180 and 180)`
      )
    }

    // Validate latitude range (-90 to 90)
    if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
      throw new Error(
        `Invalid latitude: ${latitude} (must be between -90 and 90)`
      )
    }

    // Log coordinate format for debugging
    logger.info(`🔍 Starting driver search with progressive radius`)
    logger.info(`   Pickup location coordinates: [${longitude}, ${latitude}]`)
    logger.info(`   Coordinate format: [longitude, latitude] ✓`)
    logger.info(
      `   Longitude: ${longitude} (valid: ${
        longitude >= -180 && longitude <= 180 ? '✓' : '✗'
      })`
    )
    logger.info(
      `   Latitude: ${latitude} (valid: ${
        latitude >= -90 && latitude <= 90 ? '✓' : '✗'
      })`
    )
    logger.info(`   Radii to try: ${radii.join(', ')} meters`)

    // Try each radius sequentially
    for (const radius of radii) {
      logger.info(`   🔎 Searching within ${radius}m radius...`)

      // First, find all drivers within radius (no filters) for debugging
      const allDriversInRadius = await Driver.find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: coordinates
            },
            $maxDistance: radius
          }
        }
      })
        .select('isActive isBusy isOnline socketId location') // Select fields needed for logging
        .limit(50) // Get more for debugging

      logger.info(
        `   📊 Found ${allDriversInRadius.length} total drivers within ${radius}m radius (before filters)`
      )

      // Build query - for Full Day/Rental bookings, also include drivers busy with future scheduled bookings
      const now = new Date()
      const driverQuery = {
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: coordinates
            },
            $maxDistance: radius // meters
          }
        },
        isActive: true,
        isOnline: true,
        socketId: { $exists: true, $ne: null, $ne: '' } // Only drivers with valid socketId (connected)
      }

      // For Full Day/Rental bookings, allow drivers who are busy but only have future scheduled bookings
      if (bookingType === 'FULL_DAY' || bookingType === 'RENTAL') {
        driverQuery.$or = [
          { isBusy: false }, // Not busy at all
          {
            // Busy but only with future scheduled bookings (busyUntil is in the future)
            isBusy: true,
            busyUntil: { $exists: true, $gt: now }
          }
        ]
      } else {
        // For instant rides, only include drivers who are not busy
        driverQuery.isBusy = false
      }

      // Now apply filters - including socketId to ensure only connected drivers
      const drivers = await Driver.find(driverQuery)
        .select('socketId') // Explicitly select socketId field
        .limit(10) // Limit to 10 drivers per radius

      const filterDescription = bookingType === 'FULL_DAY' || bookingType === 'RENTAL'
        ? 'isActive: true, isBusy: false OR (isBusy: true with future busyUntil), isOnline: true, socketId exists'
        : 'isActive: true, isBusy: false, isOnline: true, socketId exists'
      logger.info(
        `   ✅ Found ${drivers.length} drivers after applying filters (${filterDescription})`
      )

      // Log how many drivers have socketId
      const driversWithSocketId = drivers.filter(
        d => d.socketId && d.socketId.trim() !== ''
      ).length
      if (drivers.length > 0) {
        logger.info(
          `   📊 Drivers with valid socketId: ${driversWithSocketId} out of ${drivers.length}`
        )
      }

      // Log details about excluded drivers for debugging
      if (allDriversInRadius.length > 0 && drivers.length === 0) {
        logger.warn(
          `   ⚠️ All ${allDriversInRadius.length} drivers were excluded by filters. Details:`
        )

        // Count drivers excluded by each filter
        const excludedByIsActive = allDriversInRadius.filter(
          d => !d.isActive
        ).length
        const excludedByIsBusy = allDriversInRadius.filter(d => d.isBusy).length
        const excludedByIsOnline = allDriversInRadius.filter(
          d => !d.isOnline
        ).length
        const excludedBySocketId = allDriversInRadius.filter(
          d => !d.socketId || d.socketId.trim() === ''
        ).length

        logger.warn(`      - Excluded by isActive=false: ${excludedByIsActive}`)
        logger.warn(`      - Excluded by isBusy=true: ${excludedByIsBusy}`)
        logger.warn(`      - Excluded by isOnline=false: ${excludedByIsOnline}`)
        logger.warn(`      - Excluded by socketId missing/empty: ${excludedBySocketId}`)

        // Show details of first few excluded drivers
        const excludedDrivers = allDriversInRadius.slice(0, 5)
        excludedDrivers.forEach((driver, index) => {
          // Mask socketId for security (show first 8 chars and last 4 chars)
          const socketIdDisplay = driver.socketId
            ? `${driver.socketId.substring(0, 8)}...${driver.socketId.substring(driver.socketId.length - 4)}`
            : 'MISSING'

          // Determine which specific filter excluded this driver
          const exclusionReasons = []
          if (!driver.isActive) exclusionReasons.push('isActive=false')
          if (driver.isBusy) exclusionReasons.push('isBusy=true')
          if (!driver.isOnline) exclusionReasons.push('isOnline=false')
          if (!driver.socketId || driver.socketId.trim() === '') {
            exclusionReasons.push('socketId missing/empty')
          }

          logger.warn(`      Driver ${index + 1} (${driver._id}):`)
          logger.warn(`        - Excluded by: ${exclusionReasons.join(', ') || 'unknown'}`)
          logger.warn(`        - isActive: ${driver.isActive}`)
          logger.warn(`        - isBusy: ${driver.isBusy}`)
          logger.warn(`        - isOnline: ${driver.isOnline}`)
          logger.warn(`        - socketId: ${socketIdDisplay}`)
          logger.warn(
            `        - Location: [${driver.location.coordinates[0]}, ${driver.location.coordinates[1]}]`
          )
        })
      }

      // If drivers found, return them immediately
      if (drivers.length > 0) {
        logger.info(
          `   ✅ Successfully found ${drivers.length} available drivers within ${radius}m radius`
        )
        return { drivers, radiusUsed: radius }
      }
    }

    // No drivers found in any radius
    logger.warn(
      `   ❌ No drivers found after searching all radii (up to ${
        radii[radii.length - 1]
      }m)`
    )
    return { drivers: [], radiusUsed: radii[radii.length - 1] }
  } catch (error) {
    logger.error(
      `❌ Error searching drivers with progressive radius: ${error.message}`
    )
    logger.error(`   Stack: ${error.stack}`)
    throw new Error(
      `Error searching drivers with progressive radius: ${error.message}`
    )
  }
}

// Exporting functions for use in other modules
/**
 * Get upcoming scheduled bookings for a driver
 */
const getUpcomingBookingsForDriver = async driverId => {
  try {
    const now = new Date()
    const upcomingBookings = await Ride.find({
      driver: driverId,
      bookingType: { $ne: 'INSTANT' },
      status: 'accepted',
      'bookingMeta.startTime': { $gt: now }
    })
      .populate('rider', 'fullName name phone email')
      .sort({ 'bookingMeta.startTime': 1 })

    return upcomingBookings
  } catch (error) {
    logger.error('Error getting upcoming bookings:', error)
    throw new Error(`Error getting upcoming bookings: ${error.message}`)
  }
}

/**
 * Get scheduled rides that need to start
 */
const getScheduledRidesToStart = async () => {
  try {
    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

    const scheduledRides = await Ride.find({
      bookingType: { $ne: 'INSTANT' },
      status: 'accepted',
      'bookingMeta.startTime': {
        $lte: now,
        $gte: fiveMinutesAgo
      }
    }).populate('driver rider')

    return scheduledRides
  } catch (error) {
    logger.error('Error getting scheduled rides to start:', error)
    throw new Error(`Error getting scheduled rides: ${error.message}`)
  }
}

module.exports = {
  updateDriverStatus,
  updateDriverLocation,
  searchNearbyDrivers,
  createRide,
  assignDriverToRide,
  startRide,
  completeRide,
  cancelRide,
  setUserSocket,
  clearUserSocket,
  setDriverSocket,
  clearDriverSocket,
  toLngLat,
  verifyStartOtp,
  verifyStopOtp,
  markDriverArrived,
  updateRideStartTime,
  updateRideEndTime,
  submitRating,
  updateAverageRating,
  saveMessage,
  markMessageAsRead,
  getRideMessages,
  createNotification,
  markNotificationAsRead,
  getUserNotifications,
  createEmergencyAlert,
  resolveEmergency,
  autoAssignDriver,
  getUpcomingBookingsForDriver,
  getScheduledRidesToStart,
  searchDriversWithProgressiveRadius,
  validateAndFixDriverStatus
}
