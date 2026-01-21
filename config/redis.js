// Conditional Redis export: real ioredis client when USE_REDIS==='true',
// otherwise provide a minimal in-memory async stub with the same API used.
const useRedis = process.env.USE_REDIS === 'true'

if (!useRedis) {
  console.log('⚠️ USE_REDIS != true — exporting in-memory stub for redis')

  const store = new Map()

  const stub = {
    async get (key) {
      return store.has(key) ? store.get(key) : null
    },
    async set (key, value, ...rest) {
      // support set(key, value, 'EX', ttl) style — ignore TTL in stub
      store.set(key, value)
      return 'OK'
    },
    async del (key) {
      return store.delete(key)
    },
    duplicate () {
      return stub
    }
  }

  module.exports = stub
} else {
  console.log('🔥 Redis config: USE_REDIS=true — initializing ioredis')
  const IORedis = require('ioredis')

  if (!process.env.REDIS_HOST) {
    console.warn('⚠️ REDIS_HOST not set. Redis will not connect.')
  }

  const isAWS = process.env.REDIS_TLS === 'true'

  const redisOptions = {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  }

  if (isAWS) redisOptions.tls = {}

  const redis = new IORedis(redisOptions)

  redis.on('connect', () => {
    console.log(
      isAWS ? '✅ Redis connected (AWS ElastiCache TLS)' : '✅ Redis connected (Local Redis)'
    )
  })

  redis.on('ready', () => {
    console.log('🚀 Redis is ready to use')
  })

  redis.on('error', err => {
    console.error('❌ Redis error:', err)
  })

  module.exports = redis
}


// if (!useRedis) {
//   console.log('⚠️ USE_REDIS != true — exporting in-memory stub for redis')

//   // Simple in-memory async key-value store to replace redis APIs used in this project
//   const store = new Map()

//   const stub = {
//     async get (key) {
//       return store.has(key) ? store.get(key) : null
//     },
//     async set (key, value, /* optional args*/ ...rest) {
//       // support set(key, value, 'EX', ttl) style — ignore TTL in stub
//       store.set(key, value)
//       return 'OK'
//     },
//     async del (key) {
//       return store.delete(key)
//     },
//     duplicate () {
//       // return same stub for compatibility
//       return stub
//     }
//   }

//   module.exports = stub
// } else {
//   console.log('🔥 Redis config file loaded')
//   const IORedis = require('ioredis')

//   if (!process.env.REDIS_HOST) {
//     console.warn('⚠️ REDIS_HOST not set. Redis will not connect.')
//   }

//   const isAWS = process.env.REDIS_TLS === 'true'

//   const redisOptions = {
//     host: process.env.REDIS_HOST,
//     port: process.env.REDIS_PORT || 6379,
//     maxRetriesPerRequest: null,
//     enableReadyCheck: true
//   }

//   if (isAWS) redisOptions.tls = {}

//   const redis = new IORedis(redisOptions)

//   redis.on('connect', () => {
//     console.log(
//       isAWS ? '✅ Redis connected (AWS ElastiCache TLS)' : '✅ Redis connected (Local Redis)'
//     )
//   })

//   redis.on('ready', () => {
//     console.log('🚀 Redis is ready to use')
//   })

//   redis.on('error', err => {
//     console.error('❌ Redis error:', err)
//   })

//   module.exports = redis
// }
