console.log("🔥 Redis config file loaded");

const IORedis = require("ioredis");

if (!process.env.REDIS_HOST) {
  console.warn("⚠️ REDIS_HOST not set. Redis will not connect.");
}

const redis = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT || 6379,
  tls: {}, // AWS ElastiCache TLS
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on("connect", () => {
  console.log("✅ Redis connected (ElastiCache TLS)");
});

redis.on("ready", () => {
  console.log("🚀 Redis is ready to use");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

module.exports = redis;
