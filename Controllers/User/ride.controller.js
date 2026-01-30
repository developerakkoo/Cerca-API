import Ride from '../../Models/Driver/ride.model.js'
import Settings from '../../Models/Admin/settings.modal.js'
import logger from '../../utils/logger.js'
import crypto from 'crypto'
import rideBookingQueue from '../../src/queues/rideBooking.queue.js'
import rideBookingFunctions from '../../utils/ride_booking_functions.js'
const { mapServiceToVehicleService, calculateFareWithTime, calculateHaversineDistance } = rideBookingFunctions

/**
 * @desc    Create a new ride
 * @route   POST /rides
 */
export const createRide = async (req, res) => {
  try {
    const rideData = req.body
    const riderId = rideData.rider || rideData.riderId

    // Check for existing active ride to prevent duplicates
    if (riderId) {
      const existingActiveRide = await Ride.findOne({
        rider: riderId,
        status: { $in: ['requested', 'accepted', 'in_progress'] }
      })

      if (existingActiveRide) {
        logger.warn(`Duplicate ride attempt prevented for rider ${riderId}. Active ride: ${existingActiveRide._id}`)
        return res.status(409).json({
          message: 'You already have an active ride. Please cancel it before booking a new one.',
          activeRideId: existingActiveRide._id
        })
      }
    }

    // Fetch admin settings
    const settings = await Settings.findOne()
    if (!settings) {
      return res.status(500).json({ message: 'Admin settings not found' })
    }

    const { perKmRate, minimumFare } = settings.pricingConfigurations

    // Calculate distance (in km) between pickup and dropoff locations
    const [pickupLng, pickupLat] = rideData.pickupLocation.coordinates
    const [dropoffLng, dropoffLat] = rideData.dropoffLocation.coordinates
    const distance = calculateDistance(
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng
    )

    // Add distance to the ride data
    rideData.distanceInKm = distance

    // Fetch the selected service from the ride data
    const selectedService = rideData.service?.toLowerCase();
    const service = settings.services.find(
      s => s.name.toLowerCase() === selectedService
    )

    if (!service) {
      return res.status(400).json({ message: 'Invalid service selected' })
    }

    // Calculate fare based on the service price
    let fare = service.price + distance * perKmRate
    fare = Math.max(fare, minimumFare) // Ensure fare is at least the minimum fare

    // Add fare and service to the ride data
    rideData.fare = fare
    rideData.service = service.name.toLowerCase();


    // Generate start and stop OTPs
    const startOtp = crypto.randomInt(1000, 9999).toString()
    const stopOtp = crypto.randomInt(1000, 9999).toString()

    // Add OTPs to the ride data
    rideData.startOtp = startOtp
    rideData.stopOtp = stopOtp

    // Create a new ride
    const ride = new Ride(rideData)
    await ride.save()

    logger.info(`Ride created successfully with ID: ${ride._id}`)

    // ============================
    // 🔥 PUSH RIDE TO REDIS QUEUE
    // ============================
    logger.info(`📥 Queuing ride ${ride._id} for driver discovery`)

    await rideBookingQueue.add('process-ride', {
      rideId: ride._id.toString()
    })

    logger.info(`✅ Ride ${ride._id} successfully added to Redis queue`)

    res.status(201).json({
      ride,
      startOtp,
      stopOtp
    })
  } catch (error) {
    logger.error('Error creating ride:', error)
    res.status(400).json({ message: 'Error creating ride', error })
  }
}

/**
 * Calculate the distance between two coordinates using the Haversine formula
 * @param {number} lat1 - Latitude of the first point
 * @param {number} lon1 - Longitude of the first point
 * @param {number} lat2 - Latitude of the second point
 * @param {number} lon2 - Longitude of the second point
 * @returns {number} - Distance in kilometers
 */
function calculateDistance (lat1, lon1, lat2, lon2) {
  const toRadians = degrees => (degrees * Math.PI) / 180
  const R = 6371 // Radius of the Earth in kilometers

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

/**
 * @desc    Get all rides
 * @route   GET /rides
 */
export const getAllRides = async (req, res) => {
  try {
    const rides = await Ride.find()
    res.status(200).json(rides)
  } catch (error) {
    logger.error('Error fetching rides:', error)
    res.status(500).json({ message: 'Error fetching rides', error })
  }
}

/**
 * @desc    Get a single ride by ID
 * @route   GET /rides/:id
 */
export const getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).populate('driver rider')
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' })
    }
    res.status(200).json(ride)
  } catch (error) {
    logger.error('Error fetching ride:', error)
    res.status(500).json({ message: 'Error fetching ride', error })
  }
}

/**
 * @desc    Update a ride by ID
 * @route   PUT /rides/:id
 */
export const updateRide = async (req, res) => {
  try {
    const ride = await Ride.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    })

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' })
    }

    logger.info(`Ride updated successfully: ${ride._id}`)
    res.status(200).json(ride)
  } catch (error) {
    logger.error('Error updating ride:', error)
    res.status(400).json({ message: 'Error updating ride', error })
  }
}

/**
 * @desc    Delete a ride by ID
 * @route   DELETE /rides/:id
 */
export const deleteRide = async (req, res) => {
  try {
    const ride = await Ride.findByIdAndDelete(req.params.id)

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' })
    }

    logger.info(`Ride deleted successfully: ${ride._id}`)
    res.status(200).json({ message: 'Ride deleted successfully' })
  } catch (error) {
    logger.error('Error deleting ride:', error)
    res.status(500).json({ message: 'Error deleting ride', error })
  }
}

/**
 * @desc    Get rides for a specific user by user ID
 * @route   GET /rides/user/:userId
 */
export const getRidesByUserId = async (req, res) => {
  try {
    const rides = await Ride.find({ rider: req.params.userId })
      .populate('driver', 'name phone rating totalTrips profilePic vehicleInfo')
      .populate('rider', 'name email phoneNumber')
      .sort({ updatedAt: -1 }) // Sort by most recent activity first
    // Return empty array instead of 404 when no rides found
    res.status(200).json(rides || [])
  } catch (error) {
    logger.error('Error fetching rides for user:', error)
    res.status(500).json({ message: 'Error fetching rides for user', error })
  }
}

/**
 * @desc    Get rides for a specific driver by driver ID
 * @route   GET /rides/driver/:driverId
 */
export const getRidesByDriverId = async (req, res) => {
  try {
    const rides = await Ride.find({ driver: req.params.driverId })
    if (!rides || rides.length === 0) {
      return res.status(404).json({ message: 'No rides found for this driver' })
    }
    res.status(200).json(rides)
  } catch (error) {
    logger.error('Error fetching rides for driver:', error)
    res.status(500).json({ message: 'Error fetching rides for driver', error })
  }
}

// Search for nearby drivers based on user location
export const searchRide = async (req, res) => {
  const { pickupLocation } = req.body // User's pickup location (lat, lon)
  const { lat, lon } = pickupLocation

  try {
    const nearbyDrivers = await Driver.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lon, lat] // MongoDB uses [longitude, latitude]
          },
          $maxDistance: 5000 // Example: 5 km radius
        }
      },
      isActive: true // Only active drivers
    })

    // Notify nearby drivers (via Socket.IO)
    // if (nearbyDrivers.length > 0) {
    //    getSocketIO().emit('newRideRequest', { userId: req.params.id, location: pickupLocation });
    // }

    res.status(200).json({ nearbyDrivers })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error fetching nearby drivers' })
  }
}

/**
 * @desc    Calculate fare with time component
 * @route   POST /rides/calculate-fare
 */
export const calculateFare = async (req, res) => {
  try {
    const { pickupLocation, dropoffLocation, vehicleType, promoCode, userId, estimatedDuration } = req.body

    // Validate required fields
    if (!pickupLocation || !dropoffLocation) {
      return res.status(400).json({
        success: false,
        message: 'Pickup and dropoff locations are required'
      })
    }

    // Extract coordinates
    let pickupLat, pickupLng, dropoffLat, dropoffLng
    
    if (pickupLocation.coordinates && Array.isArray(pickupLocation.coordinates)) {
      [pickupLng, pickupLat] = pickupLocation.coordinates
    } else if (pickupLocation.latitude && pickupLocation.longitude) {
      pickupLat = pickupLocation.latitude
      pickupLng = pickupLocation.longitude
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid pickup location format'
      })
    }

    if (dropoffLocation.coordinates && Array.isArray(dropoffLocation.coordinates)) {
      [dropoffLng, dropoffLat] = dropoffLocation.coordinates
    } else if (dropoffLocation.latitude && dropoffLocation.longitude) {
      dropoffLat = dropoffLocation.latitude
      dropoffLng = dropoffLocation.longitude
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid dropoff location format'
      })
    }

    // Calculate distance using Haversine formula
    const distance = calculateHaversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng)

    // Estimate duration if not provided (using average speed of 35 km/h for city driving)
    let duration = estimatedDuration
    if (!duration || duration <= 0) {
      const averageSpeedKmh = 35.0
      duration = Math.ceil((distance / averageSpeedKmh) * 60) // Convert to minutes
    }

    // Fetch admin settings
    const settings = await Settings.findOne()
    if (!settings) {
      return res.status(500).json({
        success: false,
        message: 'Admin settings not found'
      })
    }

    const { perKmRate, minimumFare } = settings.pricingConfigurations

    // Map vehicle type to service name
    const serviceNameMap = {
      'small': 'sedan',
      'medium': 'suv',
      'large': 'auto'
    }
    const serviceName = serviceNameMap[vehicleType] || vehicleType || 'sedan'

    // Find service
    const service = settings.services.find(
      s => s.name.toLowerCase() === serviceName.toLowerCase()
    )

    if (!service) {
      return res.status(400).json({
        success: false,
        message: `Invalid vehicle type: ${vehicleType}`
      })
    }

    // Map service to vehicleService to get perMinuteRate
    const vehicleServiceKey = mapServiceToVehicleService(service.name)
    const vehicleService = settings.vehicleServices?.[vehicleServiceKey]
    const perMinuteRate = vehicleService?.perMinuteRate || 0

    // Calculate fare breakdown
    const fareBreakdown = calculateFareWithTime(
      service.price,
      distance,
      duration,
      perKmRate,
      perMinuteRate,
      minimumFare
    )

    // Apply promo code if provided
    let discount = 0
    let finalFare = fareBreakdown.fareAfterMinimum
    let promoCodeApplied = null

    if (promoCode && userId) {
      const Coupon = (await import('../../Models/Admin/coupon.modal.js')).default
      const coupon = await Coupon.findOne({
        couponCode: promoCode.toUpperCase().trim()
      })

      if (coupon) {
        const canUse = coupon.canUserUse(userId)
        if (canUse.canUse) {
          const serviceApplicable =
            !coupon.applicableServices ||
            coupon.applicableServices.length === 0 ||
            coupon.applicableServices.includes(service.name)

          if (serviceApplicable) {
            const discountResult = coupon.calculateDiscount(fareBreakdown.fareAfterMinimum)
            if (discountResult.discount > 0) {
              discount = discountResult.discount
              finalFare = discountResult.finalFare
              promoCodeApplied = coupon.couponCode
            }
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        distance: Math.round(distance * 100) / 100,
        estimatedDuration: duration,
        fareBreakdown: {
          baseFare: fareBreakdown.baseFare,
          distanceFare: fareBreakdown.distanceFare,
          timeFare: fareBreakdown.timeFare,
          subtotal: fareBreakdown.subtotal,
          minimumFare: minimumFare,
          fareAfterMinimum: fareBreakdown.fareAfterMinimum,
          promoCode: promoCodeApplied,
          discount: Math.round(discount * 100) / 100,
          finalFare: Math.round(finalFare * 100) / 100
        },
        vehicleType: vehicleType || 'small'
      }
    })
  } catch (error) {
    logger.error('Error calculating fare:', error)
    res.status(500).json({
      success: false,
      message: 'Error calculating fare',
      error: error.message
    })
  }
}

// All functions are already exported individually above using ES module syntax
