// index.js
require('dotenv').config() // MUST BE FIRST

const express = require('express')
const cors = require('cors')
const http = require('http')
const multer = require('multer')
const path = require('path')

const logger = require('./utils/logger')
const { initializeSocket } = require('./utils/socket')
const connectDB = require('./db')

// Workers (Redis-free)
const { initRideWorker } = require('./src/workers/rideBooking.worker')
const initScheduledRideWorker = require('./src/workers/scheduledRide.worker')
const initRideAutoCancelWorker = require('./src/workers/rideAutoCancel.worker')

const app = express()
const port = process.env.PORT || 3000

/* =======================
   DATABASE
======================= */
connectDB()

/* =======================
   SERVER & SOCKET
======================= */
const server = http.createServer(app)

// Initialize Socket.IO FIRST
initializeSocket(server)
logger.info('✅ Socket.IO initialized')

/* =======================
   WORKERS (IN-PROCESS)
======================= */
try {
  initRideWorker()
  logger.info('✅ Ride Booking Worker initialized (in-process)')
} catch (error) {
  logger.error(`❌ Ride Booking Worker failed: ${error.message}`)
  logger.error(error.stack)
}

try {
  initScheduledRideWorker()
  logger.info('✅ Scheduled Ride Worker initialized')
} catch (error) {
  logger.error(`❌ Scheduled Ride Worker failed: ${error.message}`)
  logger.error(error.stack)
}

try {
  initRideAutoCancelWorker()
  logger.info('✅ Ride Auto-Cancellation Worker initialized')
} catch (error) {
  logger.error(`❌ Ride Auto-Cancellation Worker failed: ${error.message}`)
  logger.error(error.stack)
}

/* =======================
   MIDDLEWARES
======================= */
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

app.use(express.static('public'))
app.use('/uploads', express.static('uploads'))
app.use('/images', express.static('uploads/images'))

/* =======================
   MULTER CONFIG
======================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname}`)
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png/
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    )
    const mimeType = fileTypes.test(file.mimetype)

    if (extname && mimeType) cb(null, true)
    else cb(new Error('Only images (jpeg, jpg, png) are allowed'))
  }
})

/* =======================
   ROUTES
======================= */
app.use('/users', require('./Routes/User/user.routes'))
app.use('/users', require('./Routes/User/wallet.routes'))
app.use('/users', require('./Routes/User/referral.routes'))

app.use('/drivers', require('./Routes/Driver/driver.routes'))
app.use('/drivers', require('./Routes/Driver/earnings.routes'))
app.use('/drivers', require('./Routes/Driver/payout.routes'))

app.use('/admin', require('./Routes/admin.routes'))
app.use('/admin', require('./Routes/Admin/dashboard.routes'))
app.use('/admin', require('./Routes/Admin/users.routes'))
app.use('/admin', require('./Routes/Admin/drivers.routes'))
app.use('/admin', require('./Routes/Admin/rides.routes'))
app.use('/admin', require('./Routes/Admin/payments.routes'))

app.use('/settings', require('./Routes/admin.routes'))
app.use('/coupons', require('./Routes/coupon.routes'))
app.use('/address', require('./Routes/User/address.route'))

// Load ES module route asynchronously (ride.routes.js is ES module)
// Wrap in async IIFE to load route before server starts
;(async () => {
  try {
    const rideRoutes = await import('./Routes/ride.routes.js')
    app.use('/rides', rideRoutes.default)
    
    // Register remaining routes after ride routes are loaded
    app.use('/messages', require('./Routes/Driver/message.routes'))
    app.use('/ratings', require('./Routes/Driver/rating.routes'))
    app.use('/notifications', require('./Routes/User/notification.routes'))
    app.use('/emergencies', require('./Routes/User/emergency.routes'))
    app.use('/api/v1/payment', require('./Routes/payment.route'))
    app.use('/api/google-maps', require('./Routes/googleMaps.routes'))
    app.use('/api/offers', require('./Routes/User/offer.routes'))
    
    // Start server after all routes are loaded
    server.listen(port, () => {
      logger.info(`🚀 Server running on http://localhost:${port}`)
    })
  } catch (error) {
    logger.error('Failed to load routes:', error)
    process.exit(1)
  }
})()

/* =======================
   HEALTH & UPLOAD
======================= */
app.get('/', (req, res) => {
  res.send('Welcome to Cerca API!')
})

app.get('/health', (req, res) => {
  res.status(200).send('OK')
})

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.')
  }

  res.status(200).json({
    message: 'File uploaded successfully',
    file: req.file
  })
})

/* =======================
   START SERVER
   (Server startup moved to routes section to support async route loading)
======================= */
