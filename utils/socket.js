const { Server } = require("socket.io");
const logger = require("./logger");
const Driver = require("../Models/Driver/driver.model");
const Ride = require("../Models/Driver/ride.model");
const {
  updateDriverStatus,
  updateDriverLocation,
} = require("./ride_booking_functions"); // Import ride booking logic
let io; // Declare a variable to hold the Socket.IO instance
let riders = [];
let drivers = [];
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

    // Handle events from the client
    socket.on("riderConnect", (data) => {
      console.log("Rider connected:", data);
      // Add the rider to the list of connected riders
      riders.push(data);
      // Broadcast the message to all connected clients
      io.emit("riderConnect", data);
    });

    //Handler for driver connection
    socket.on("driverConnect", (data) => {
      console.log("Driver connected:", data);
      // Add the driver to the list of connected drivers
      // drivers.push(data);
      updateDriverStatus(data.driverId, true, socket.id) // Update driver status to active
        .then((updatedDriver) => {
          console.log("Driver status updated:", updatedDriver);
          io.emit("driverConnected", updatedDriver); // Emit the updated driver status to all clients
        })
        .catch((error) => {
          console.error("Error updating driver status:", error);
        });

      // Broadcast the message to all connected clients
      io.emit("driverConnect", data);
    });

    socket.on("driverDisconnect", (data) => {
      console.log("Driver disconnected:", data);
      // Remove the driver from the list of connected drivers
      updateDriverStatus(data.driverId, false, "") // Update driver status to inactive
        .then((updatedDriver) => {
          console.log("Driver status updated:", updatedDriver);
        })
        .catch((error) => {
          console.error("Error updating driver status:", error);
        });
      // drivers = drivers.filter((driver) => driver.id !== data.id);
      // Broadcast the message to all connected clients
      io.emit("driverDisconnect", data);
    });

    socket.on("driverLocationUpdate", (data) => {
      console.log("Driver location update:", data);
      // Update the driver's location in the database
      updateDriverLocation(data.driverId, data.location) // Update driver status to active
        .then((updatedDriver) => {
          console.log("Driver location updated:", updatedDriver);
        })
        .catch((error) => {
          console.error("Error updating driver location:", error);
        });
      // Broadcast the updated location to all connected riders
      io.emit("driverLocationUpdate", data);
    });

    socket.on("newRideRequest", (data) => {
      const { userId, pickupLocation } = data;
    console.log("New ride request:", data['pickupLocation   ']);
    console.log("New ride request pickupLocation:", pickupLocation);
    console.log("New ride request userid:", userId);

    // Destructure the pickupLocation array directly
    const lat = pickupLocation[0];  // latitude
    const lon = pickupLocation[1];  // longitude

    console.log("Lat:- " + lat);  // Should print latitude
    console.log("Lon:- " + lon);  // Should print longitude

  
      // Find nearby drivers using MongoDB geospatial queries (example)
      Driver.find({
        // location: {
        //   $near: {
        //     $geometry: { type: "Point",coordinates: [lon, lat], },
        //     $maxDistance: 8000, // Example 8 km radius
        //   },
        // },
        isActive: true,
      })
        .then((nearbyDrivers) => {
            console.log("Nearby Drivers...");
            
            console.log(nearbyDrivers);
            
          // Notify all nearby drivers
          nearbyDrivers.forEach((driver) => {
            io.to(driver.socketId).emit("newRideRequest", data);
          });
        })
        .catch((err) => {
          console.error("Error finding nearby drivers:", err);
        });
    });
    socket.on("rideAccepted", (data) => {
      console.log("Ride accepted:", data);
      // Broadcast the ride acceptance to all connected riders
      io.to("driver").emit("rideAccepted", data);
    });
    socket.on("rideCompleted", (data) => {
      console.log("Ride completed:", data);
      // Broadcast the ride completion to all connected riders
      io.emit("rideCompleted", data);
    });
    socket.on("rideCancelled", (data) => {
      console.log("Ride cancelled:", data);
      // Broadcast the ride cancellation to all connected riders
      io.emit("rideCancelled", data);
    });
    socket.on("rideStarted", (data) => {
      console.log("Ride started:", data);
      // Broadcast the ride start to all connected riders
      io.emit("rideStarted", data);
    });
    socket.on("rideInProgress", (data) => {
      console.log("Ride in progress:", data);
      // Broadcast the ride in progress to all connected riders
      io.emit("rideInProgress", data);
    });
    socket.on("rideLocationUpdate", (data) => {
      console.log("Ride location update:", data);
      // Broadcast the ride location update to all connected riders
      io.emit("rideLocationUpdate", data);
    });
    socket.on("rideRating", (data) => {
      console.log("Ride rating:", data);
      // Broadcast the ride rating to all connected riders
      io.emit("rideRating", data);
    });
    socket.on("riderDisconnect", (data) => {
      console.log("Rider disconnected:", data);
      // Remove the rider from the list of connected riders
      riders = riders.filter((rider) => rider.id !== data.id);
      // Broadcast the message to all connected clients
      io.emit("riderDisconnect", data);
    });

    socket.on("disconnect", () => {
      console.log("A user disconnected:", socket.id);
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
