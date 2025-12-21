const IORedis = require("ioredis");

const redis = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,   // 🔥 REQUIRED for BullMQ
});


redis.on("connect", () => {
  console.log("✅ Redis connected");
});

module.exports = redis;
