const IORedis = require("ioredis");

const redis = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT || 6379,
  tls: {},                 // 🔥 REQUIRED (because transit encryption is enabled)
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("✅ Redis connected (ElastiCache TLS)");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

module.exports = redis;


// const IORedis = require("ioredis");
//  const redis = new IORedis({
//     host: process.env.REDIS_HOST || "127.0.0.1",
//     port: process.env.REDIS_PORT || 
//     6379, maxRetriesPerRequest: null, // 🔥 REQUIRED for BullMQ 
//     });
    
    
//     redis.on("connect", () => { 
//       console.log("✅ Redis connected");
//      });
     
     
//      module.exports = redis;
