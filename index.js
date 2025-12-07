const express = require('express');
const cors = require('cors');
const http = require('http');
const { initializeSocket } = require('./utils/socket'); // Import socket module
const logger = require('./utils/logger'); // Import logger
const multer = require('multer');
const path = require('path');
const connectDB = require('./db'); // Import MongoDB connection
const app = express();
const port = 3000;

// Connect to MongoDB
connectDB();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server);

// Middleware
app.use(express.json());

app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
}));
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.static('public')); // Serve static files from 'public' directory
// Serve static files from the uploads directory
app.use('/uploads', express.static('uploads'));
app.use('/images', express.static('uploads/images'));

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Unique file name
    },
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png/; // Allowed file types
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimeType = fileTypes.test(file.mimetype);

        if (extname && mimeType) {
            cb(null, true);
        } else {
            cb(new Error('Only images (jpeg, jpg, png) are allowed!'));
        }
    },
});


//Routes
const userRoutes = require('./Routes/User/user.routes.js');
const walletRoutes = require('./Routes/User/wallet.routes.js');
const referralRoutes = require('./Routes/User/referral.routes.js');
const addressRoutes = require('./Routes/User/address.route.js');
const driverRoutes = require('./Routes/Driver/driver.routes.js');
const earningsRoutes = require('./Routes/Driver/earnings.routes.js');
const payoutRoutes = require('./Routes/Driver/payout.routes.js');
const adminRoutes = require('./Routes/admin.routes.js');
const settingsRoutes = require('./Routes/admin.routes.js');
const couponRoutes = require('./Routes/coupon.routes.js');
const rideRoutes = require('./Routes/ride.routes.js');
const messageRoutes = require('./Routes/Driver/message.routes.js');
const ratingRoutes = require('./Routes/Driver/rating.routes.js');
const notificationRoutes = require('./Routes/User/notification.routes.js');
const emergencyRoutes = require('./Routes/User/emergency.routes.js');

app.use('/users', userRoutes);
app.use('/users', walletRoutes);
app.use('/users', referralRoutes);
app.use('/drivers',driverRoutes);
app.use('/drivers', earningsRoutes);
app.use('/drivers', payoutRoutes);
app.use('/admin', adminRoutes);
app.use('/settings', settingsRoutes);
app.use('/coupons', couponRoutes);
app.use('/address', addressRoutes);
app.use('/rides', rideRoutes);
app.use('/messages', messageRoutes);
app.use('/ratings', ratingRoutes);
app.use('/notifications', notificationRoutes);
app.use('/emergencies', emergencyRoutes);
app.get('/', (req, res) => {
    logger.info('GET / - Welcome route accessed');
    res.send('Welcome to Cerca API!');
});

// Route for image upload
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        logger.warn('POST /upload - No file uploaded');
        return res.status(400).send('No file uploaded.');
    }
    logger.info(`POST /upload - File uploaded: ${req.file.filename}`);
    res.status(200).send({
        message: 'File uploaded successfully!',
        file: req.file,
    });
});

// Start server
server.listen(port, () => {
    logger.info(`Server is running on http://localhost:${port}`);

});