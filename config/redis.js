console.log("🔥 Redis config file loaded");

const IORedis = require("ioredis");

if (!process.env.REDIS_HOST) {
  console.warn("⚠️ REDIS_HOST not set. Redis will not connect.");
}

const isAWS = process.env.REDIS_TLS === "true";

const redisOptions = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
};

// ✅ Enable TLS ONLY for AWS
if (isAWS) {
  redisOptions.tls = {};
}

const redis = new IORedis(redisOptions);

redis.on("connect", () => {
  console.log(
    isAWS
      ? "✅ Redis connected (AWS ElastiCache TLS)"
      : "✅ Redis connected (Local Redis)"
  );
});

redis.on("ready", () => {
  console.log("🚀 Redis is ready to use");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

module.exports = redis;
