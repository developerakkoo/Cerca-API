// index.js
require("dotenv").config(); // 🔥 MUST BE FIRST

const express = require("express");
const cors = require("cors");
const http = require("http");
const multer = require("multer");
const path = require("path");

const logger = require("./utils/logger");
const { initializeSocket } = require("./utils/socket");
const connectDB = require("./db");

// 🔥 IMPORTANT: Initialize Redis at app startup
require("./config/redis");

// Workers
const initRideWorker = require("./src/workers/rideBooking.worker");
const initScheduledRideWorker = require("./src/workers/scheduledRide.worker");

const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server);
logger.info('✅ Socket.IO initialized');

// Start Ride Booking Worker (Redis required here)
// Worker must be initialized AFTER socket.io to access getSocketIO()
console.log('🔥 About to initialize Ride Booking Worker...')
try {
  const worker = initRideWorker();
  logger.info('✅ Ride Booking Worker initialization completed');
  console.log('✅ Ride Booking Worker initialization completed (console.log)');
  if (worker) {
    console.log('✅ Worker instance returned:', !!worker);
  } else {
    console.warn('⚠️ Worker instance is null/undefined');
  }
} catch (error) {
  logger.error(`❌ Failed to start Ride Booking Worker: ${error.message}`);
  logger.error(`   Stack: ${error.stack}`);
  console.error(`❌ Failed to start Ride Booking Worker: ${error.message}`);
  console.error(`   Stack: ${error.stack}`);
  // Don't crash the server, but log the error
}

// Start Scheduled Ride Worker (runs every 5 minutes)
console.log('🔥 About to initialize Scheduled Ride Worker...')
try {
  initScheduledRideWorker();
  logger.info('✅ Scheduled Ride Worker initialization completed');
  console.log('✅ Scheduled Ride Worker initialization completed');
} catch (error) {
  logger.error(`❌ Failed to start Scheduled Ride Worker: ${error.message}`);
  logger.error(`   Stack: ${error.stack}`);
  console.error(`❌ Failed to start Scheduled Ride Worker: ${error.message}`);
  // Don't crash the server, but log the error
}

/* =======================
   MIDDLEWARES
======================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));
app.use("/images", express.static("uploads/images"));

/* =======================
   MULTER CONFIG
======================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimeType = fileTypes.test(file.mimetype);

    if (extname && mimeType) cb(null, true);
    else cb(new Error("Only images (jpeg, jpg, png) are allowed"));
  },
});

/* =======================
   ROUTES
======================= */

app.use("/users", require("./Routes/User/user.routes"));
app.use("/users", require("./Routes/User/wallet.routes"));
app.use("/users", require("./Routes/User/referral.routes"));
app.use("/drivers", require("./Routes/Driver/driver.routes"));
app.use("/drivers", require("./Routes/Driver/earnings.routes"));
app.use("/drivers", require("./Routes/Driver/payout.routes"));
app.use("/admin", require("./Routes/admin.routes"));
app.use("/admin", require("./Routes/Admin/dashboard.routes"));
app.use("/admin", require("./Routes/Admin/users.routes"));
app.use("/admin", require("./Routes/Admin/drivers.routes"));
app.use("/admin", require("./Routes/Admin/rides.routes"));
app.use("/admin", require("./Routes/Admin/payments.routes"));
app.use("/settings", require("./Routes/admin.routes"));
app.use("/coupons", require("./Routes/coupon.routes"));
app.use("/address", require("./Routes/User/address.route"));
app.use("/rides", require("./Routes/ride.routes"));
app.use("/messages", require("./Routes/Driver/message.routes"));
app.use("/ratings", require("./Routes/Driver/rating.routes"));
app.use("/notifications", require("./Routes/User/notification.routes"));
app.use("/emergencies", require("./Routes/User/emergency.routes"));
app.use("/api/v1/payment", require("./Routes/payment.route"));
app.use("/api/google-maps", require("./Routes/googleMaps.routes"));

/* =======================
   HEALTH & UPLOAD
======================= */

app.get("/", (req, res) => {
  logger.info("GET / - Welcome route accessed");
  res.send("Welcome to Cerca API!");
});
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});


app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    logger.warn("POST /upload - No file uploaded");
    return res.status(400).send("No file uploaded.");
  }

  logger.info(`POST /upload - File uploaded: ${req.file.filename}`);
  res.status(200).json({
    message: "File uploaded successfully",
    file: req.file,
  });
});

/* =======================
   START SERVER
======================= */

server.listen(port, () => {
  logger.info(`🚀 Server running on http://localhost:${port}`);
});
