const logger = require('../../utils/logger')
const { processRideJob } = require('../workers/rideBooking.worker')

module.exports = {
  async add (jobName, data) {
    if (jobName !== 'process-ride') return

    logger.info(`📥 Ride job added (in-process) | rideId: ${data.rideId}`)

    // Run async, non-blocking
    setImmediate(() => {
      processRideJob(data.rideId)
    })
  }
}
