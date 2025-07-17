const Driver = require('../Models/Driver/driver.model');
const Ride = require('../Models/Driver/ride.model');
// const { sendNotification } = require('./notification_functions');
const User = require('../Models/User/user.model');


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

module.exports = {
    updateDriverStatus,
    updateDriverLocation, // Add other ride booking related functions here
}