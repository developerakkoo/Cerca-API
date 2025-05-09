require('dotenv').config();

export default config = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                 // limit each IP to 100 requests per window
  },
  // socketRedis: {
  //   host: process.env.REDIS_HOST,
  //   port: process.env.REDIS_PORT,
  // }
};
