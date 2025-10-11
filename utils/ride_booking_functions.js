const Driver = require('../Models/Driver/driver.model');
const Ride = require('../Models/Driver/ride.model');
const User = require('../Models/User/user.model');
const Rating = require('../Models/Driver/rating.model');
const Message = require('../Models/Driver/message.model');
const Notification = require('../Models/User/notification.model');
const Emergency = require('../Models/User/emergency.model');

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
        const driver = await Driver.findByIdAndUpdate(driverId, { location: { type: 'Point', coordinates: [location.longitude, location.latitude] } }, { new: true });
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
    
  
      const rideDoc = {
        rider: rideData.riderId,
        pickupLocation: { type: 'Point', coordinates: pickupLngLat },
        dropoffLocation: { type: 'Point', coordinates: dropoffLngLat },
        fare: rideData.fare ?? 0,
        distanceInKm: rideData.distanceInKm ?? 0,
        rideType: rideData.rideType || 'normal',
        userSocketId: rideData.userSocketId,
        status: 'requested',
        paymentMethod: rideData.paymentMethod || 'CASH',
        pickupAddress: rideData.pickupAddress,
        dropoffAddress: rideData.dropoffAddress,
        // startOtp & stopOtp come from schema defaults
      };
  
      // Single insert; returns the created document including generated OTPs
      const ride = await Ride.create(rideDoc);
      return ride;
    } catch (error) {
      throw new Error(`Error creating ride: ${error.message}`);
    }
  };
  

const assignDriverToRide = async (rideId, driverId, driverSocketId) => {
    try {
        const ride = await Ride.findOneAndUpdate(
            { _id: rideId, status: 'requested', driver: { $exists: false } },
            { $set: { driver: driverId, driverSocketId, status: 'accepted' } },
          
          ).populate('driver rider');
          if (!ride) {
            // Either already accepted by someone else or ride not in requested state
            const current = await Ride.findById(rideId).select('status driver');
            const reason = current?.driver ? 'already_assigned' : `bad_state_${current?.status}`;
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

const cancelRide = async (rideId, cancelledBy) => {
    try {
        const ride = await Ride.findByIdAndUpdate(
            rideId,
            { status: 'cancelled', cancelledBy },
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
};
