const Driver = require('../Models/Driver/driver.model');
const Ride = require('../Models/Driver/ride.model');
// const { sendNotification } = require('./notification_functions');
const User = require('../Models/User/user.model');

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
            { new: true }
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
    clearDriverSocket
};
