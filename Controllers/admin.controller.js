const Admin = require('../Models/User/admin.model.js');
const AdminEarnings = require('../Models/Admin/adminEarnings.model.js');
const Driver = require('../Models/Driver/driver.model.js');
const logger = require('../utils/logger.js');
const bcrypt = require("bcryptjs");
const jwt = require('jsonwebtoken');

/**
 * @desc    Create a new admin (main admin)
 * @route   POST /admins/create-admin
 * @access  Public (for initial setup) or ADMIN role required
 */
const createAdmin = async (req, res) => {
    try {
        const { fullName, email, phoneNumber, password } = req.body;

        // Validate required fields
        if (!fullName || !email || !password) {
            return res.status(400).json({ 
                message: 'Missing required fields',
                required: ['fullName', 'email', 'password']
            });
        }

        // Check if admin with this email already exists
        const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
        if (existingAdmin) {
            return res.status(409).json({ 
                message: 'Admin with this email already exists' 
            });
        }

        // Check if phone number is provided and unique
        if (phoneNumber) {
            const existingPhone = await Admin.findOne({ phoneNumber });
            if (existingPhone) {
                return res.status(409).json({ 
                    message: 'Admin with this phone number already exists' 
                });
            }
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new admin
        const admin = new Admin({
            fullName,
            email: email.toLowerCase(),
            phoneNumber: phoneNumber || undefined,
            password: hashedPassword,
            role: 'ADMIN',
            level: 0, // Main admin has level 0
            createdBy: req.adminId || null, // Set if created by another admin, null for initial setup
            isActive: true,
        });

        await admin.save();

        // Remove password from response
        const adminResponse = admin.toObject();
        delete adminResponse.password;

        logger.info(`Admin created successfully: ${admin.email}`);
        res.status(201).json({
            message: 'Admin created successfully',
            admin: adminResponse
        });
    } catch (error) {
        logger.error('Error creating admin:', error);
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                message: 'Validation error', 
                errors 
            });
        }

        // Handle duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({ 
                message: `${field} already exists` 
            });
        }

        res.status(500).json({ 
            message: 'Error creating admin', 
            error: error.message 
        });
    }
};

/**
 * @desc    Create a new sub-admin
 * @route   POST /admins
 */
const createSubAdmin = async (req, res) => {
    try {
        const { fullName, email, phoneNumber, password, level } = req.body;

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new sub-admin
        const subAdmin = new Admin({
            fullName,
            email,
            phoneNumber,
            password: hashedPassword,
            role: 'SUB_ADMIN',
            level,
            createdBy: req.adminId, // Assuming adminId is set in middleware
        });

        await subAdmin.save();

        logger.info(`Sub-admin created successfully: ${subAdmin.email}`);
        res.status(201).json(subAdmin);
    } catch (error) {
        logger.error('Error creating sub-admin:', error);
        res.status(400).json({ message: 'Error creating sub-admin', error });
    }
};

/**
 * @desc    Get all sub-admins
 * @route   GET /admins
 */
const getAllSubAdmins = async (req, res) => {
    try {
        const subAdmins = await Admin.find({ role: 'SUB_ADMIN' });
        res.status(200).json(subAdmins);
    } catch (error) {
        logger.error('Error fetching sub-admins:', error);
        res.status(500).json({ message: 'Error fetching sub-admins', error });
    }
};

/**
 * @desc    Delete a sub-admin by ID
 * @route   DELETE /admins/:id
 */
const deleteSubAdmin = async (req, res) => {
    try {
        const subAdmin = await Admin.findById(req.params.id);

        if (!subAdmin) {
            return res.status(404).json({ message: 'Sub-admin not found' });
        }

        await Admin.findByIdAndDelete(req.params.id);

        logger.info(`Sub-admin deleted successfully: ${subAdmin.email}`);
        res.status(200).json({ message: 'Sub-admin deleted successfully' });
    } catch (error) {
        logger.error('Error deleting sub-admin:', error);
        res.status(500).json({ message: 'Error deleting sub-admin', error });
    }
};

/**
 * @desc    Admin login
 * @route   POST /admins/login
 */
const adminLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Explicitly select password field since it has select: false in schema
        const admin = await Admin.findOne({ email }).select('+password');

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Check if password exists
        if (!admin.password) {
            return res.status(401).json({ message: 'Admin account has no password set. Please contact administrator.' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: admin._id, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        logger.info(`Admin logged in: ${admin.email}`);
        res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        logger.error('Error during admin login:', error);
        res.status(500).json({ message: 'An error occurred during login', error });
    }
};


/**
 * @desc    Get admin earnings analytics
 * @route   GET /admin/earnings
 */
const getAdminEarnings = async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;

        // Build date filter
        const dateFilter = {};
        if (startDate) {
            dateFilter.rideDate = { $gte: new Date(startDate) };
        }
        if (endDate) {
            dateFilter.rideDate = { 
                ...dateFilter.rideDate, 
                $lte: new Date(endDate) 
            };
        }

        // Get all earnings records
        const earnings = await AdminEarnings.find(dateFilter)
            .populate('driverId', 'name email phone')
            .populate('riderId', 'fullName email phoneNumber')
            .sort({ rideDate: -1 });

        // Calculate totals
        const totalPlatformEarnings = earnings.reduce((sum, e) => sum + (e.platformFee || 0), 0);
        const totalRides = earnings.length;
        const totalGrossFare = earnings.reduce((sum, e) => sum + (e.grossFare || 0), 0);
        const averageFarePerRide = totalRides > 0 ? (totalGrossFare / totalRides).toFixed(2) : 0;

        // Group earnings by period
        const earningsByPeriod = [];
        const periodMap = new Map();

        earnings.forEach(earning => {
            const date = new Date(earning.rideDate);
            let periodKey;

            switch (groupBy) {
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    weekStart.setHours(0, 0, 0, 0);
                    periodKey = weekStart.toISOString().split('T')[0];
                    break;
                case 'month':
                    periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    break;
                case 'day':
                default:
                    periodKey = date.toISOString().split('T')[0];
                    break;
            }

            if (!periodMap.has(periodKey)) {
                periodMap.set(periodKey, { period: periodKey, earnings: 0, rides: 0 });
            }
            const periodData = periodMap.get(periodKey);
            periodData.earnings += earning.platformFee || 0;
            periodData.rides += 1;
        });

        // Convert map to array and sort
        periodMap.forEach((value) => {
            earningsByPeriod.push({
                period: value.period,
                earnings: Math.round(value.earnings * 100) / 100,
                rides: value.rides,
            });
        });
        earningsByPeriod.sort((a, b) => a.period.localeCompare(b.period));

        // Calculate top earning drivers
        const driverEarningsMap = new Map();
        earnings.forEach(earning => {
            const driverId = earning.driverId._id || earning.driverId;
            if (!driverEarningsMap.has(driverId.toString())) {
                driverEarningsMap.set(driverId.toString(), {
                    driverId: driverId,
                    driverName: earning.driverId.name || 'Unknown',
                    earnings: 0,
                    rides: 0,
                });
            }
            const driverData = driverEarningsMap.get(driverId.toString());
            driverData.earnings += earning.driverEarning || 0;
            driverData.rides += 1;
        });

        // Convert to array, sort by earnings, and take top 10
        const topEarningDrivers = Array.from(driverEarningsMap.values())
            .map(d => ({
                driverId: d.driverId,
                driverName: d.driverName,
                earnings: Math.round(d.earnings * 100) / 100,
                rides: d.rides,
            }))
            .sort((a, b) => b.earnings - a.earnings)
            .slice(0, 10);

        res.status(200).json({
            totalPlatformEarnings: Math.round(totalPlatformEarnings * 100) / 100,
            totalRides,
            totalGrossFare: Math.round(totalGrossFare * 100) / 100,
            averageFarePerRide: parseFloat(averageFarePerRide),
            earningsByPeriod,
            topEarningDrivers,
        });
    } catch (error) {
        logger.error('Error fetching admin earnings:', error);
        res.status(500).json({ message: 'Error fetching admin earnings', error: error.message });
    }
};

module.exports = {
    createAdmin,
    createSubAdmin,
    getAllSubAdmins,
    deleteSubAdmin,
    adminLogin,
    getAdminEarnings,
};