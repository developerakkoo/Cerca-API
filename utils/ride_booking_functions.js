const Driver = require('../Models/Driver/driver.model');
const Ride = require('../Models/Driver/ride.model');
const User = require('../Models/User/user.model');
const Rating = require('../Models/Driver/rating.model');
const Message = require('../Models/Driver/message.model');
const Notification = require('../Models/User/notification.model');
const Emergency = require('../Models/User/emergency.model');
const logger = require('./logger');

//Helper Function
function toLngLat(input) {
    if (!input) throw new Error('Location required');
  
    // Case A: GeoJSON { type:'Point', coordinates:[lng,lat] }
    if (Array.isArray(input.coordinates) && input.coordinates.length === 2) {
      const [lng, lat] = input.coordinates;
      if (typeof lng === 'number' && typeof lat === 'number') return [lng, lat];
    }
  
    // Case B: plain { longitude, latitude }
    if (typeof input.longitude === 'number' && typeof input.latitude === 'number') {
      return [input.longitude, input.latitude];
    }
  
    throw new Error('Invalid location (need {longitude,latitude} or GeoJSON Point)');
  }

const updateDriverStatus = async (driverId, status,socketId) => {
    try {
        const driver = await Driver.findByIdAndUpdate(driverId, { isActive: status, socketId: socketId }, { new: true });
        if (!driver) {
            throw new Error('Driver not found');
        }
        return driver;
    } catch (error) {
        throw new Error(`Error updating driver status: ${error.message}`);
    }
}

const updateDriverLocation = async (driverId, location) => {
    try {
        // Extract coordinates - handle both formats
        let longitude, latitude;
        
        if (location.coordinates && Array.isArray(location.coordinates)) {
            [longitude, latitude] = location.coordinates;
        } else if (location.longitude !== undefined && location.latitude !== undefined) {
            longitude = location.longitude;
            latitude = location.latitude;
        } else {
            throw new Error('Invalid location format. Provide either coordinates array or longitude/latitude');
        }
        
        // Validate coordinates are valid numbers
        longitude = parseFloat(longitude);
        latitude = parseFloat(latitude);
        
        if (isNaN(longitude) || isNaN(latitude)) {
            throw new Error('Invalid coordinates. Longitude and latitude must be valid numbers');
        }
        
        // Validate range
        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
            throw new Error('Coordinates out of range. Longitude: -180 to 180, Latitude: -90 to 90');
        }
        
        const driver = await Driver.findByIdAndUpdate(
            driverId, 
            { 
                location: { 
                    type: 'Point', 
                    coordinates: [longitude, latitude] 
                } 
            }, 
            { new: true }
        );
        
        if (!driver) {
            throw new Error('Driver not found');
        }
        
        return driver;
    } catch (error) {
        throw new Error(`Error updating driver location: ${error.message}`);
    }
}

const searchNearbyDrivers = async(userId, location) =>{
    try{
        
        const drivers = await Driver.find({
            location: {
                $geoWithin: {
                    $centerSphere: [[location.longitude, location.latitude], 10 / 3963.1] // 10 miles radius
                }
            },
            isActive: true
        });
        return drivers;
    } catch (error) {
        throw new Error(`Error searching nearby drivers: ${error.message}`);
    }
}

const createRide = async (rideData) => {
    try {
        const riderId = rideData.riderId || rideData.rider;
        if (!riderId) throw new Error('riderId (or rider) is required');
    
        const pickupLngLat  = toLngLat(rideData.pickupLocation);
        const dropoffLngLat = toLngLat(rideData.dropoffLocation);
        
        // Calculate distance using Haversine formula
        const distance = calculateHaversineDistance(
            pickupLngLat[1], pickupLngLat[0],  // lat, lng
            dropoffLngLat[1], dropoffLngLat[0]
        );
        
        // Fetch admin settings for fare calculation
        const Settings = require('../Models/Admin/settings.modal.js');
        const settings = await Settings.findOne();
        
        if (!settings) {
            throw new Error('Admin settings not found. Please configure pricing.');
        }
        
        const { perKmRate, minimumFare } = settings.pricingConfigurations;
        
        // Find the service
        const selectedService = rideData.service;
        const service = settings.services.find(s => s.name === selectedService);
        
        if (!service) {
            throw new Error(`Invalid service: ${selectedService}. Available services: ${settings.services.map(s => s.name).join(', ')}`);
        }
        
        // Calculate fare: base price + (distance * per km rate)
        let fare = service.price + (distance * perKmRate);
        fare = Math.max(fare, minimumFare); // Ensure minimum fare
        fare = Math.round(fare * 100) / 100; // Round to 2 decimal places
        
        // Apply promo code if provided
        let discount = 0;
        let finalFare = fare;
        if (rideData.promoCode) {
            const Coupon = require('../Models/Admin/coupon.modal.js');
            const coupon = await Coupon.findOne({ 
                couponCode: rideData.promoCode.toUpperCase().trim() 
            });
            
            if (coupon) {
                // Check if user can use this coupon
                const canUse = coupon.canUserUse(riderId);
                if (canUse.canUse) {
                    // Check service applicability
                    const serviceApplicable = !coupon.applicableServices || 
                        coupon.applicableServices.length === 0 || 
                        coupon.applicableServices.includes(service.name);
                    
                    // Check ride type applicability
                    const rideTypeApplicable = !coupon.applicableRideTypes || 
                        coupon.applicableRideTypes.length === 0 || 
                        coupon.applicableRideTypes.includes(rideData.rideType || 'normal');
                    
                    if (serviceApplicable && rideTypeApplicable) {
                        const discountResult = coupon.calculateDiscount(fare);
                        if (discountResult.discount > 0) {
                            discount = discountResult.discount;
                            finalFare = discountResult.finalFare;
                            
                            // Record coupon usage (will be saved after ride is created)
                            rideData._couponToApply = {
                                coupon,
                                discount,
                                originalFare: fare,
                            };
                        }
                    }
                }
            }
        }
    
        const rideDoc: any = {
            rider: riderId,
            pickupLocation: { type: 'Point', coordinates: pickupLngLat },
            dropoffLocation: { type: 'Point', coordinates: dropoffLngLat },
            fare: finalFare,
            distanceInKm: Math.round(distance * 100) / 100, // Round to 2 decimal places
            rideType: rideData.rideType || 'normal',
            userSocketId: rideData.userSocketId,
            status: 'requested',
            paymentMethod: rideData.paymentMethod || 'CASH',
            pickupAddress: rideData.pickupAddress,
            dropoffAddress: rideData.dropoffAddress,
            service: service.name,
            promoCode: rideData.promoCode || null,
            discount: discount,
            // startOtp & stopOtp come from schema defaults
        };
        
        // Add hybrid payment fields if present
        if (rideData.razorpayPaymentId) {
            rideDoc.razorpayPaymentId = rideData.razorpayPaymentId;
        }
        if (rideData.walletAmountUsed !== undefined) {
            rideDoc.walletAmountUsed = rideData.walletAmountUsed;
        }
        if (rideData.razorpayAmountPaid !== undefined) {
            rideDoc.razorpayAmountPaid = rideData.razorpayAmountPaid;
        }
  
        // Single insert; returns the created document including generated OTPs
        const ride = await Ride.create(rideDoc);
        
        // Apply coupon if provided and valid
        if (rideData._couponToApply) {
            const { coupon, discount, originalFare } = rideData._couponToApply;
            try {
                await coupon.recordUsage(
                    riderId,
                    ride._id,
                    discount,
                    originalFare,
                    finalFare
                );
                logger.info(`Coupon ${coupon.couponCode} applied to ride ${ride._id}, discount: ₹${discount}`);
            } catch (error) {
                logger.error(`Error recording coupon usage for ride ${ride._id}:`, error);
                // Don't fail ride creation if coupon recording fails
            }
        }
        
        return ride;
    } catch (error) {
        throw new Error(`Error creating ride: ${error.message}`);
    }
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} - Distance in kilometers
 */
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const R = 6371; // Earth's radius in kilometers

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};
  

const assignDriverToRide = async (rideId, driverId, driverSocketId) => {
    try {
        // Enhanced atomic operation to prevent race conditions
        // Check both status and driver existence in a single atomic operation
        const ride = await Ride.findOneAndUpdate(
            { 
                _id: rideId, 
                status: 'requested',  // Must be in requested state
                driver: { $exists: false }  // Must not have a driver assigned
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
        ).populate('driver rider');
        
        if (!ride) {
            // Either already accepted by someone else or ride not in requested state
            const current = await Ride.findById(rideId).select('status driver');
            if (!current) {
                throw new Error('Ride not found');
            }
            const reason = current.driver ? 'already_assigned' : `bad_state_${current.status}`;
            throw new Error(`Ride cannot be accepted (${reason})`);
        }
        
        return ride;
    } catch (error) {
        throw new Error(`Error assigning driver: ${error.message}`);
    }
};

const startRide = async (rideId) => {
    try {
        const ride = await Ride.findByIdAndUpdate(
            rideId,
            { status: 'in_progress' },
            { new: true }
        ).populate('driver rider');
        if (!ride) throw new Error('Ride not found');
        return ride;
    } catch (error) {
        throw new Error(`Error starting ride: ${error.message}`);
    }
};

const completeRide = async (rideId, fare) => {
    try {
        const ride = await Ride.findByIdAndUpdate(
            rideId,
            { status: 'completed', fare },
            { new: true }
        ).populate('driver rider');
        if (!ride) throw new Error('Ride not found');
        return ride;
    } catch (error) {
        throw new Error(`Error completing ride: ${error.message}`);
    }
};

const cancelRide = async (rideId, cancelledBy, cancellationReason = null) => {
    try {
        const updateData = { 
            status: 'cancelled', 
            cancelledBy 
        };
        
        // Add cancellation reason if provided
        if (cancellationReason) {
            updateData.cancellationReason = cancellationReason;
        }
        
        const ride = await Ride.findByIdAndUpdate(
            rideId,
            updateData,
            { new: true }
        ).populate('driver rider');
        if (!ride) throw new Error('Ride not found');
        return ride;
    } catch (error) {
        throw new Error(`Error cancelling ride: ${error.message}`);
    }
};


// Socket management functions
async function setUserSocket(userId, socketId) {
    return User.findByIdAndUpdate(
      userId,
      { $set: { socketId, isOnline: true, lastSeen: new Date() } },
      { new: true }
    );
  }
  
  async function clearUserSocket(userId, socketId) {
    // Clear only if the stored socket matches (prevents clearing a newer connection)
    return User.updateOne(
      { _id: userId, socketId },
      { $set: { isOnline: false, lastSeen: new Date() }, $unset: { socketId: "" } }
    );
  }
  
  async function setDriverSocket(driverId, socketId) {
    return Driver.findByIdAndUpdate(
      driverId,
      { $set: { socketId, isOnline: true, lastSeen: new Date() } },
      { new: true }
    );
  }
  
  async function clearDriverSocket(driverId, socketId) {
    return Driver.updateOne(
      { _id: driverId, socketId },
      { $set: { isOnline: false, lastSeen: new Date() }, $unset: { socketId: "" } }
    );
  }
//end of socket management functions

// OTP Verification Functions
const verifyStartOtp = async (rideId, providedOtp) => {
    try {
        const ride = await Ride.findById(rideId);
        if (!ride) throw new Error('Ride not found');
        
        if (ride.status !== 'accepted') {
            throw new Error('Ride is not in accepted state');
        }
        
        if (ride.startOtp !== providedOtp) {
            throw new Error('Invalid OTP');
        }
        
        return { success: true, ride };
    } catch (error) {
        throw new Error(`Error verifying start OTP: ${error.message}`);
    }
};

const verifyStopOtp = async (rideId, providedOtp) => {
    try {
        const ride = await Ride.findById(rideId);
        if (!ride) throw new Error('Ride not found');
        
        if (ride.status !== 'in_progress') {
            throw new Error('Ride is not in progress');
        }
        
        if (ride.stopOtp !== providedOtp) {
            throw new Error('Invalid OTP');
        }
        
        return { success: true, ride };
    } catch (error) {
        throw new Error(`Error verifying stop OTP: ${error.message}`);
    }
};

// Driver arrived at pickup
const markDriverArrived = async (rideId) => {
    try {
        const ride = await Ride.findByIdAndUpdate(
            rideId,
            { 
                driverArrivedAt: new Date(),
            },
            { new: true }
        ).populate('driver rider');
        
        if (!ride) throw new Error('Ride not found');
        return ride;
    } catch (error) {
        throw new Error(`Error marking driver arrived: ${error.message}`);
    }
};

// Update ride with actual start time
const updateRideStartTime = async (rideId) => {
    try {
        const ride = await Ride.findByIdAndUpdate(
            rideId,
            { actualStartTime: new Date() },
            { new: true }
        ).populate('driver rider');
        
        // Update driver status to busy
        if (ride.driver) {
            await Driver.findByIdAndUpdate(ride.driver._id, { isBusy: true });
        }
        
        return ride;
    } catch (error) {
        throw new Error(`Error updating ride start time: ${error.message}`);
    }
};

// Update ride with actual end time and calculate duration
const updateRideEndTime = async (rideId) => {
    try {
        const ride = await Ride.findById(rideId);
        if (!ride) throw new Error('Ride not found');
        
        const endTime = new Date();
        const actualDuration = ride.actualStartTime 
            ? Math.round((endTime - ride.actualStartTime) / 60000) // in minutes
            : 0;
        
        const updatedRide = await Ride.findByIdAndUpdate(
            rideId,
            { 
                actualEndTime: endTime,
                actualDuration: actualDuration
            },
            { new: true }
        ).populate('driver rider');
        
        // Update driver status to not busy
        if (updatedRide.driver) {
            await Driver.findByIdAndUpdate(updatedRide.driver._id, { isBusy: false });
        }
        
        return updatedRide;
    } catch (error) {
        throw new Error(`Error updating ride end time: ${error.message}`);
    }
};

// Rating Functions
const submitRating = async (ratingData) => {
    try {
        const { rideId, ratedBy, ratedByModel, ratedTo, ratedToModel, rating, review, tags } = ratingData;
        
        // Check if rating already exists
        const existingRating = await Rating.findOne({ 
            ride: rideId, 
            ratedBy, 
            ratedByModel 
        });
        
        if (existingRating) {
            throw new Error('Rating already submitted for this ride');
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
            tags,
        });
        
        // Update ride with rating
        if (ratedByModel === 'User') {
            await Ride.findByIdAndUpdate(rideId, { driverRating: rating });
        } else {
            await Ride.findByIdAndUpdate(rideId, { riderRating: rating });
        }
        
        // Calculate and update average rating
        await updateAverageRating(ratedTo, ratedToModel);
        
        return newRating;
    } catch (error) {
        throw new Error(`Error submitting rating: ${error.message}`);
    }
};

const updateAverageRating = async (entityId, entityModel) => {
    try {
        const ratings = await Rating.find({ 
            ratedTo: entityId, 
            ratedToModel: entityModel 
        });
        
        if (ratings.length === 0) return;
        
        const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = (totalRating / ratings.length).toFixed(2);
        
        const Model = entityModel === 'Driver' ? Driver : User;
        await Model.findByIdAndUpdate(entityId, {
            rating: averageRating,
            totalRatings: ratings.length,
        });
    } catch (error) {
        throw new Error(`Error updating average rating: ${error.message}`);
    }
};

// Messaging Functions
const saveMessage = async (messageData) => {
    try {
        const { rideId, senderId, senderModel, receiverId, receiverModel, message, messageType } = messageData;
        
        const newMessage = await Message.create({
            ride: rideId,
            sender: senderId,
            senderModel,
            receiver: receiverId,
            receiverModel,
            message,
            messageType: messageType || 'text',
        });
        
        return newMessage;
    } catch (error) {
        throw new Error(`Error saving message: ${error.message}`);
    }
};

const markMessageAsRead = async (messageId) => {
    try {
        const message = await Message.findByIdAndUpdate(
            messageId,
            { isRead: true },
            { new: true }
        );
        return message;
    } catch (error) {
        throw new Error(`Error marking message as read: ${error.message}`);
    }
};

const getRideMessages = async (rideId) => {
    try {
        const messages = await Message.find({ ride: rideId })
            .sort({ createdAt: 1 })
            .populate('sender', 'name fullName')
            .populate('receiver', 'name fullName');
        return messages;
    } catch (error) {
        throw new Error(`Error fetching messages: ${error.message}`);
    }
};

// Notification Functions
const createNotification = async (notificationData) => {
    try {
        const { recipientId, recipientModel, title, message, type, relatedRide, data } = notificationData;
        
        const notification = await Notification.create({
            recipient: recipientId,
            recipientModel,
            title,
            message,
            type,
            relatedRide,
            data,
        });
        
        return notification;
    } catch (error) {
        throw new Error(`Error creating notification: ${error.message}`);
    }
};

const markNotificationAsRead = async (notificationId) => {
    try {
        const notification = await Notification.findByIdAndUpdate(
            notificationId,
            { isRead: true },
            { new: true }
        );
        return notification;
    } catch (error) {
        throw new Error(`Error marking notification as read: ${error.message}`);
    }
};

const getUserNotifications = async (userId, userModel) => {
    try {
        const notifications = await Notification.find({ 
            recipient: userId, 
            recipientModel: userModel 
        })
        .sort({ createdAt: -1 })
        .limit(50);
        return notifications;
    } catch (error) {
        throw new Error(`Error fetching notifications: ${error.message}`);
    }
};

// Emergency Functions
const createEmergencyAlert = async (emergencyData) => {
    try {
        const { rideId, triggeredBy, triggeredByModel, location, reason, description } = emergencyData;
        
        const emergency = await Emergency.create({
            ride: rideId,
            triggeredBy,
            triggeredByModel,
            location: {
                type: 'Point',
                coordinates: [location.longitude, location.latitude],
            },
            reason,
            description,
        });
        
        // Update ride status
        await Ride.findByIdAndUpdate(rideId, { 
            status: 'cancelled',
            cancelledBy: 'system',
            cancellationReason: `Emergency: ${reason}`,
        });
        
        return emergency;
    } catch (error) {
        throw new Error(`Error creating emergency alert: ${error.message}`);
    }
};

const resolveEmergency = async (emergencyId) => {
    try {
        const emergency = await Emergency.findByIdAndUpdate(
            emergencyId,
            { 
                status: 'resolved',
                resolvedAt: new Date(),
            },
            { new: true }
        );
        return emergency;
    } catch (error) {
        throw new Error(`Error resolving emergency: ${error.message}`);
    }
};

// Auto-assign driver to ride
const autoAssignDriver = async (rideId, pickupLocation, maxDistance = 5000) => {
    try {
        const drivers = await Driver.find({
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: pickupLocation.coordinates,
                    },
                    $maxDistance: maxDistance, // meters
                },
            },
            isActive: true,
            isBusy: false,
            isOnline: true,
        }).limit(5);
        
        return drivers;
    } catch (error) {
        throw new Error(`Error auto-assigning driver: ${error.message}`);
    }
};

// Search drivers with progressive radius expansion
const searchDriversWithProgressiveRadius = async (pickupLocation, radii = [3000, 6000, 9000, 12000]) => {
    try {
        // Ensure pickupLocation has coordinates array
        const coordinates = pickupLocation.coordinates || [pickupLocation.longitude, pickupLocation.latitude];
        
        // Validate coordinate format
        if (!Array.isArray(coordinates) || coordinates.length !== 2) {
            throw new Error(`Invalid coordinates format: expected [longitude, latitude], got ${JSON.stringify(coordinates)}`);
        }
        
        const [longitude, latitude] = coordinates;
        
        // Validate longitude range (-180 to 180)
        if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
            throw new Error(`Invalid longitude: ${longitude} (must be between -180 and 180)`);
        }
        
        // Validate latitude range (-90 to 90)
        if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
            throw new Error(`Invalid latitude: ${latitude} (must be between -90 and 90)`);
        }
        
        // Log coordinate format for debugging
        logger.info(`🔍 Starting driver search with progressive radius`);
        logger.info(`   Pickup location coordinates: [${longitude}, ${latitude}]`);
        logger.info(`   Coordinate format: [longitude, latitude] ✓`);
        logger.info(`   Longitude: ${longitude} (valid: ${longitude >= -180 && longitude <= 180 ? '✓' : '✗'})`);
        logger.info(`   Latitude: ${latitude} (valid: ${latitude >= -90 && latitude <= 90 ? '✓' : '✗'})`);
        logger.info(`   Radii to try: ${radii.join(', ')} meters`);
        
        // Try each radius sequentially
        for (const radius of radii) {
            logger.info(`   🔎 Searching within ${radius}m radius...`);
            
            // First, find all drivers within radius (no filters) for debugging
            const allDriversInRadius = await Driver.find({
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: coordinates,
                        },
                        $maxDistance: radius,
                    },
                },
            }).limit(50); // Get more for debugging
            
            logger.info(`   📊 Found ${allDriversInRadius.length} total drivers within ${radius}m radius (before filters)`);
            
            // Now apply filters - including socketId to ensure only connected drivers
            const drivers = await Driver.find({
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: coordinates,
                        },
                        $maxDistance: radius, // meters
                    },
                },
                isActive: true,
                isBusy: false,
                isOnline: true,
                socketId: { $exists: true, $ne: null, $ne: '' } // Only drivers with valid socketId (connected)
            }).select('socketId') // Explicitly select socketId field
            .limit(10); // Limit to 10 drivers per radius
            
            logger.info(`   ✅ Found ${drivers.length} drivers after applying filters (isActive: true, isBusy: false, isOnline: true, socketId exists)`);
            
            // Log how many drivers have socketId
            const driversWithSocketId = drivers.filter(d => d.socketId && d.socketId.trim() !== '').length;
            if (drivers.length > 0) {
                logger.info(`   📊 Drivers with valid socketId: ${driversWithSocketId} out of ${drivers.length}`);
            }
            
            // Log details about excluded drivers for debugging
            if (allDriversInRadius.length > 0 && drivers.length === 0) {
                logger.warn(`   ⚠️ All ${allDriversInRadius.length} drivers were excluded by filters. Details:`);
                
                // Count drivers excluded by each filter
                const excludedByIsActive = allDriversInRadius.filter(d => !d.isActive).length;
                const excludedByIsBusy = allDriversInRadius.filter(d => d.isBusy).length;
                const excludedByIsOnline = allDriversInRadius.filter(d => !d.isOnline).length;
                
                logger.warn(`      - Excluded by isActive=false: ${excludedByIsActive}`);
                logger.warn(`      - Excluded by isBusy=true: ${excludedByIsBusy}`);
                logger.warn(`      - Excluded by isOnline=false: ${excludedByIsOnline}`);
                
                // Show details of first few excluded drivers
                const excludedDrivers = allDriversInRadius.slice(0, 5);
                excludedDrivers.forEach((driver, index) => {
                    logger.warn(`      Driver ${index + 1} (${driver._id}):`);
                    logger.warn(`        - isActive: ${driver.isActive}`);
                    logger.warn(`        - isBusy: ${driver.isBusy}`);
                    logger.warn(`        - isOnline: ${driver.isOnline}`);
                    logger.warn(`        - Location: [${driver.location.coordinates[0]}, ${driver.location.coordinates[1]}]`);
                });
            }
            
            // If drivers found, return them immediately
            if (drivers.length > 0) {
                logger.info(`   ✅ Successfully found ${drivers.length} available drivers within ${radius}m radius`);
                return { drivers, radiusUsed: radius };
            }
        }
        
        // No drivers found in any radius
        logger.warn(`   ❌ No drivers found after searching all radii (up to ${radii[radii.length - 1]}m)`);
        return { drivers: [], radiusUsed: radii[radii.length - 1] };
    } catch (error) {
        logger.error(`❌ Error searching drivers with progressive radius: ${error.message}`);
        logger.error(`   Stack: ${error.stack}`);
        throw new Error(`Error searching drivers with progressive radius: ${error.message}`);
    }
};


  // Exporting functions for use in other modules
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
    searchDriversWithProgressiveRadius,
};
