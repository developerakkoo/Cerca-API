const { Server } = require("socket.io");
const logger = require("./logger");
const Driver = require("../Models/Driver/driver.model");
const Ride = require("../Models/Driver/ride.model");
const {
  updateDriverStatus,
  updateDriverLocation,
  clearDriverSocket,
  clearUserSocket,
  assignDriverToRide,
  cancelRide,
  startRide,
  completeRide,
  createRide,
  setUserSocket,
  setDriverSocket,
  toLngLat,
  searchNearbyDrivers,
} = require("./ride_booking_functions"); // Import ride booking logic
let io; // Declare a variable to hold the Socket.IO instance
let riders = [];
let drivers = [];
let socketToUser = new Map(); // Maps socket ID to user ID
let socketToDriver = new Map(); // Maps socket ID to driver ID
// Function to initialize Socket.IO
function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    },
  });
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    //All Code For Rider and Driver Connection

         // ---------------------------
    // Rider connects
    // ---------------------------
    socket.on('riderConnect', async (data) => {
        try {
          const { userId } = data || {};
          if (!userId) return;
  
          await setUserSocket(userId, socket.id);
            socketToUser.set(socket.id, String(userId));
          socket.join('rider'); // optional global room for riders
  
          console.log('Rider online:', userId, socket.id);
          io.emit('riderConnect', { userId });
        } catch (err) {
          console.error('riderConnect error', err);
          socket.emit('errorEvent', { message: 'Failed to register rider socket' });
        }
      });
  
      // ---------------------------
      // Driver connects
      // ---------------------------
      socket.on('driverConnect', async (data) => {
        try {
          const { driverId } = data || {};
          if (!driverId) return;
  
          const driver = await setDriverSocket(driverId, socket.id);
          socketToDriver.set(socket.id, String(driverId)); // Store the socket ID to driver ID mapping
          socket.join('driver'); // global room for drivers
  
          console.log('Driver online:', driverId, socket.id);
          if (driver) io.emit('driverConnected', driver);
          io.emit('driverConnect', { driverId });
        } catch (err) {
          console.error('driverConnect error', err);
          socket.emit('errorEvent', { message: 'Failed to register driver socket' });
        }
      });
  
      // ---------------------------
      // Driver explicitly disconnects (optional)
      // ---------------------------
      socket.on('driverDisconnect', async (data) => {
        try {
          const { driverId } = data || {};
          if (!driverId) return;
  
          await clearDriverSocket(driverId, socket.id);     // pass socket.id to avoid race wiping a newer session
          await updateDriverStatus(driverId, false, '');    // clear isActive/socketId if you track those
          io.emit('driverDisconnect', { driverId });
        } catch (err) {
          console.error('driverDisconnect error', err);
        }
      });

        socket.on('driverLocationUpdate', (data) => {
            // console.log('Driver location update:', data);
            // Update the driver's location in the database
            updateDriverLocation(data.driverId, data.location) // Update driver status to active
                .then((updatedDriver) => {
                    console.log('Driver location updated:');
                    // Broadcast the updated location to all connected riders
                    io.emit('driverLocationUpdate', data);
                })
                .catch((error) => {
                    console.error('Error updating driver location:', error);
                });
        }   );


        // ---------------------------
    // Create new ride
    // ---------------------------
    socket.on('newRideRequest', async (data) => {
        try {
            logger.info('newRideRequest received:', data);
          // Expect: { riderId, userSocketId, pickupLocation:{longitude,latitude}, dropoffLocation:{longitude,latitude}, fare?, distanceInKm?, rideType? }
          const ride = await createRide(data);
  // Populate rider before returning
  const populatedRide = await Ride.findById(ride._id)
  .populate('rider', 'name phone email') // select only the needed fields
  .exec();
          // Notify all drivers (or add a nearby-driver filter later)
          io.to('driver').emit('newRideRequest', populatedRide);
  
          // Ack to the rider who requested
          if (populatedRide.userSocketId) io.to(populatedRide.userSocketId).emit('rideRequested', populatedRide);
        } catch (err) {
          console.error('newRideRequest error', err);
          socket.emit('rideError', { message: 'Failed to create ride' });
        }
      });


        // ---------------------------
    // Driver accepts a ride
    // ---------------------------
    socket.on('rideAccepted', async (data) => {
      try {
        logger.info('rideAccepted received:', data);
        const { rideId, driverId } = data || {};
        if (!rideId || !driverId) return;

        // also store the accepting driver's socketId on the ride for targeted emits
        const assignedRide = await assignDriverToRide(rideId, driverId, socket.id);

        // Notify only the parties
        if (assignedRide.userSocketId) io.to(assignedRide.userSocketId).emit('rideAccepted', assignedRide);
        if (assignedRide.driverSocketId) io.to(assignedRide.driverSocketId).emit('rideAssigned', assignedRide);

        // Optional: broadcast for dashboards/ops
        io.emit('rideAccepted', assignedRide);
      } catch (err) {
        console.error('rideAccepted error', err);
        socket.emit('rideError', { message: 'Failed to accept ride' });
      }
    });

    // ---------------------------
    // Start ride (verify OTP first on your side)
    // ---------------------------
    socket.on('rideStarted', async (data) => {
      try {
        const { rideId /* , providedOtp */ } = data || {};
        if (!rideId) return;

        // TODO: verify OTP here if you want (fetch ride, compare startOtp)
        const startedRide = await startRide(rideId);

        logger.info('Ride started:', startedRide._id);
        if (startedRide.userSocketId) io.to(startedRide.userSocketId).emit('rideStarted', startedRide);
        if (startedRide.driverSocketId) io.to(startedRide.driverSocketId).emit('rideStarted', startedRide);
        io.emit('rideStarted', startedRide); // optional
      } catch (err) {
        console.error('rideStarted error', err);
        socket.emit('rideError', { message: 'Failed to start ride' });
      }
    });

    // ---------------------------
    // Live ride updates (optional persistence)
    // ---------------------------
    socket.on('rideInProgress', (data) => {
      try {
        io.emit('rideInProgress', data);
      } catch (err) {
        console.error('rideInProgress error', err);
      }
    });

    socket.on('rideLocationUpdate', (data) => {
      try {
        io.emit('rideLocationUpdate', data);
      } catch (err) {
        console.error('rideLocationUpdate error', err);
      }
    });

    // ---------------------------
    // Complete ride
    // ---------------------------
    socket.on('rideCompleted', async (data) => {
      try {
        // Expect: { rideId, fare }
        const { rideId, fare } = data || {};
        if (!rideId) return;

        const completedRide = await completeRide(rideId, fare);
        logger.info('Ride completed:', completedRide._id);
        if (completedRide.userSocketId) io.to(completedRide.userSocketId).emit('rideCompleted', completedRide);
        if (completedRide.driverSocketId) io.to(completedRide.driverSocketId).emit('rideCompleted', completedRide);
        io.emit('rideCompleted', completedRide); // optional
      } catch (err) {
        console.error('rideCompleted error', err);
        socket.emit('rideError', { message: 'Failed to complete ride' });
      }
    });

    // ---------------------------
    // Cancel ride (by rider or driver)
    // ---------------------------
    socket.on('rideCancelled', async (data) => {
      try {
        // Expect: { rideId, cancelledBy: 'rider' | 'driver' }
        const { rideId, cancelledBy } = data || {};
        if (!rideId) return;

        const cancelledRide = await cancelRide(rideId, cancelledBy);
        if (cancelledRide.userSocketId) io.to(cancelledRide.userSocketId).emit('rideCancelled', cancelledRide);
        if (cancelledRide.driverSocketId) io.to(cancelledRide.driverSocketId).emit('rideCancelled', cancelledRide);
        io.emit('rideCancelled', cancelledRide); // optional
      } catch (err) {
        console.error('rideCancelled error', err);
        socket.emit('rideError', { message: 'Failed to cancel ride' });
      }
    });

    // ---------------------------
    // Ratings (stub)
    // ---------------------------
    socket.on('rideRating', (data) => {
      try {
        io.emit('rideRating', data);
      } catch (err) {
        console.error('rideRating error', err);
      }
    });

    
        socket.on('riderDisconnect', async (data) => {
            console.log('Rider disconnected:', data);
            // Remove the rider from the list of connected riders
            // Remove the rider's socket ID from the map
            await clearUserSocket(data.userId, socket.id); // pass socket.id to
            socketToUser.delete(socket.id); // corrected to use socket.id

            // Clear the rider's socket ID in the database
            let user = await clearUserSocket(data.userId, socket.id); // pass socket.id to
            // Broadcast the message to all connected clients
            io.emit('riderDisconnect', data);
        });

       

        socket.on('disconnect', async () => {
            try {
                const userId = socketToUser.get(socket.id);
                const driverId = socketToDriver.get(socket.id);
        
                if (userId) {
                  await clearUserSocket(userId, socket.id);   // only clear if same socket
                socketToUser.delete(socket.id);
                  io.emit('riderDisconnect', { userId });
                }
        
                if (driverId) {
                  await clearDriverSocket(driverId, socket.id); // only clear if same socket
                  await updateDriverStatus(driverId, false, '');
                  socketToDriver.delete(socket.id);
                  io.emit('driverDisconnect', { driverId });
                }
              } catch (err) {
                console.error('disconnect cleanup error', err);
              }
        
              console.log('Disconnected:', socket.id);
        });
    });
}

// Function to get the Socket.IO instance
function getSocketIO() {
  if (!io) {
    throw new Error(
      "Socket.IO is not initialized. Call initializeSocket first."
    );
  }
  return io;
}

module.exports = { initializeSocket, getSocketIO };
