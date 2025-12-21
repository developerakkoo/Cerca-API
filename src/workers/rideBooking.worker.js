console.log("🔥 rideBooking.worker.js file loaded");

const { Worker } = require("bullmq");
const redis = require("../../config/redis");

const Ride = require("../../Models/Driver/ride.model");
const Driver = require("../../Models/Driver/driver.model");

const { getSocketIO } = require("../../utils/socket");
const {
  searchDriversWithProgressiveRadius,
  createNotification,
} = require("../../utils/ride_booking_functions");

/**
 * Initialize Ride Booking Worker
 */
function initRideWorker() {
  // Get socket.io instance safely
  const io = getSocketIO();

  // Create BullMQ Worker
  new Worker(
    "ride-booking", // ✅ MUST match Queue name
    async (job) => {
      try {
        console.log("🔥 Worker picked job:", job.id, job.name, job.data);

        const { rideId } = job.data;
        if (!rideId) {
          console.log("❌ Job missing rideId");
          return;
        }

        // Fetch ride
        const ride = await Ride.findById(rideId);

        if (!ride) {
          console.log("❌ Ride not found:", rideId);
          return;
        }

        console.log(
          `🔍 Processing ride ${ride._id} | status: ${ride.status}`
        );

        // Only process requested rides
        if (ride.status !== "requested") {
          console.log(
            `⚠️ Ride ${ride._id} skipped (status: ${ride.status})`
          );
          return;
        }

        // Search drivers progressively (3km → 6km → 9km → 12km)
        const { drivers, radiusUsed } =
          await searchDriversWithProgressiveRadius(
            ride.pickupLocation,
            [3000, 6000, 9000, 12000]
          );

        console.log(
          `📍 Found ${drivers.length} drivers within ${radiusUsed}m for ride ${ride._id}`
        );

        // No drivers found
        if (!drivers.length) {
          console.log(`❌ No drivers found for ride ${ride._id}`);

          if (ride.userSocketId) {
            io.to(ride.userSocketId).emit("noDriverFound", {
              rideId: ride._id,
              message: "No drivers available within 12km",
            });
          }

          return;
        }

        // Notify drivers
        for (const driver of drivers) {
          if (!driver.socketId) {
            console.log(
              `⚠️ Driver ${driver._id} skipped (no socketId)`
            );
            continue;
          }

          const socketConn = io.sockets.sockets.get(driver.socketId);

          if (!socketConn || !socketConn.connected) {
            console.log(
              `⚠️ Driver ${driver._id} socket not connected`
            );
            continue;
          }

          console.log(
            `📡 Sending ride ${ride._id} to driver ${driver._id}`
          );

          // Emit socket event
          io.to(driver.socketId).emit("newRideRequest", ride);

          // Save notification
          await createNotification({
            recipientId: driver._id,
            recipientModel: "Driver",
            title: "New Ride Request",
            message: "Ride available near you",
            type: "ride_request",
            relatedRide: ride._id,
          });
        }

        console.log(`✅ Ride ${ride._id} processed successfully`);
      } catch (error) {
        console.error("❌ Error processing ride job:", error);
      }
    },
    {
      connection: redis,
      concurrency: 5, // ✅ Handles multiple rides safely
    }
  );

  console.log("🚀 Ride booking worker started");
}

module.exports = initRideWorker;
