const { Queue } = require("bullmq");
const redis = require("../../config/redis");

const rideBookingQueue = new Queue("ride-booking", {
  connection: redis,
});

module.exports = rideBookingQueue;
