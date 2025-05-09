const Admin = require('../Models/User/admin.model.js');
const logger = require('../utils/logger.js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

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
        const admin = await Admin.findOne({ email });

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
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


module.exports = {
  
    createSubAdmin,
    getAllSubAdmins,
    deleteSubAdmin,
    adminLogin,

};