import User from '../../Models/User/user.model.js';
import jwt from 'jsonwebtoken';
import logger from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';


/**
 * @desc    Get a single user by ID
 * @route   GET /users/:id
 */
export const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(user);
    } catch (error) {
        logger.error('Error fetching user:', error);
        res.status(500).json({ message: 'Error fetching user', error });
    }
};

/**
 * @desc    Create a new user with optional profile picture
 * @route   POST /users
 */
export const createUser = async (req, res) => {
    try {
        // Extract user data from the request body
        const userData = req.body;

        // Check if a file (profile picture) is uploaded
        if (req.file) {
            // Generate the URL for the uploaded profile picture
            const profilePicUrl = `${req.protocol}://${req.get('host')}/uploads/profilePics/${req.file.filename}`;
            userData.profilePic = profilePicUrl; // Save the URL in the user data
        }

        // Create a new user
        const user = new User(userData);
        await user.save();

        logger.info(`User created successfully: ${user.email}`);

        // Assign new user gift automatically
        try {
            const { checkAndAssignNewUserGift } = require('../../utils/giftAssignment');
            const giftResult = await checkAndAssignNewUserGift(user._id.toString());
            if (giftResult.assigned) {
                logger.info(`New user gift assigned to ${user.email}: ${giftResult.couponCode}`);
            }
        } catch (giftError) {
            logger.error(`Error assigning new user gift to ${user.email}:`, giftError);
            // Don't fail user creation if gift assignment fails
        }

        res.status(201).json(user);
    } catch (error) {
        logger.error('Error creating user:', error);
        res.status(400).json({ message: 'Error creating user', error });
    }
};

/**
 * @desc    Update a user by ID
 * @route   PUT /users/:id
 */
export const updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if a new profile picture is uploaded
        if (req.file) {
            // Generate the URL for the new profile picture
            const profilePicUrl = `${req.protocol}://${req.get('host')}/uploads/profilePics/${req.file.filename}`;

            // Delete the previous profile picture if it exists
            if (user.profilePic) {
                const previousPicPath = path.join(
                    'uploads/profilePics',
                    path.basename(user.profilePic)
                );
                fs.unlink(previousPicPath, (err) => {
                    if (err) {
                        logger.warn(`Failed to delete previous profile picture: ${previousPicPath}`);
                    } else {
                        logger.info(`Deleted previous profile picture: ${previousPicPath}`);
                    }
                });
            }

            // Update the profile picture URL in the request body
            req.body.profilePic = profilePicUrl;
        }

        // Update the user with the new data
        const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });

        res.status(200).json(updatedUser);
    } catch (error) {
        logger.error('Error updating user:', error);
        res.status(400).json({ message: 'Error updating user', error });
    }
};

/**
 * @desc    Delete a user by ID
 * @route   DELETE /users/:id
 */
export const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete the profile picture if it exists
        if (user.profilePic) {
            const profilePicPath = path.join(
                'uploads/profilePics',
                path.basename(user.profilePic)
            );
            fs.unlink(profilePicPath, (err) => {
                if (err) {
                    logger.warn(`Failed to delete profile picture: ${profilePicPath}`);
                } else {
                    logger.info(`Deleted profile picture: ${profilePicPath}`);
                }
            });
        }

        // Delete the user
        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        logger.error('Error deleting user:', error);
        res.status(500).json({ message: 'Error deleting user', error });
    }
};

/**
 * @desc    Get user by email
 * @route   GET /users/email/:email
 */
export const getUserByEmail = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(user);
    } catch (error) {
        logger.error('Error fetching user by email:', error);
        res.status(500).json({ message: 'Error fetching user by email', error });
    }
};

/**
 * @desc    Login user by mobile number
 * @route   POST /users/login
 */
export const loginUserByMobile = async (req, res) => {
    const { phoneNumber } = req.body;

    try {
        // Check if the phone number exists in the database
        const user = await User.findOne({ phoneNumber });

        if (user) {
            // Check if user is blocked
            if (user.isActive === false) {
                logger.warn(`Blocked user attempted login: ${user.phoneNumber}`);
                return res.status(403).json({
                    message: 'Your account has been blocked',
                    isBlocked: true,
                });
            }

            // Generate a JWT token
            const token = jwt.sign(
                { id: user._id, phoneNumber: user.phoneNumber },
                "@#@!#@dasd4234jkdh3874#$@#$#$@#$#$dkjashdlk$#442343%#$%f34234T$vtwefcEC$%", // Ensure you have a JWT_SECRET in your environment variables
                { expiresIn: '7d' } // Token expiration time
            );

            logger.info(`User logged in: ${user.phoneNumber}`);
            return res.status(200).json({
                message: 'Login successful',
                token,
                userId: user._id,
                phoneNumber: user.phoneNumber,
                isNewUser: false,
            });
        } else {
            // Auto-create user if not found
            try {
                logger.info(`Auto-creating new user with phone number: ${phoneNumber}`);
                
                // Create new user with minimal data
                // Using placeholder values for required fields that will be updated in profile-details
                const newUser = new User({
                    phoneNumber: phoneNumber,
                    fullName: 'Pending', // Placeholder - will be updated in profile-details
                    email: `temp_${phoneNumber}@cerca.temp`, // Temporary email, will be updated
                    isActive: true,
                    lastLogin: new Date(),
                    isVerified: false,
                });

                await newUser.save();
                logger.info(`New user created successfully: ${newUser._id}`);

                // Generate JWT token for the newly created user
                const token = jwt.sign(
                    { id: newUser._id, phoneNumber: newUser.phoneNumber },
                    "@#@!#@dasd4234jkdh3874#$@#$#$@#$#$dkjashdlk$#442343%#$%f34234T$vtwefcEC$%",
                    { expiresIn: '7d' }
                );

                logger.info(`New user logged in: ${newUser.phoneNumber}`);
                return res.status(200).json({
                    message: 'Login successful',
                    token,
                    userId: newUser._id,
                    phoneNumber: newUser.phoneNumber,
                    isNewUser: true, // true for newly created users
                });
            } catch (createError) {
                logger.error('Error auto-creating user:', createError);
                // If user creation fails (e.g., duplicate phone number), return error
                return res.status(500).json({
                    message: 'An error occurred during user creation',
                    error: createError.message,
                });
            }
        }
    } catch (error) {
        logger.error('Error during login:', error);
        return res.status(500).json({
            message: 'An error occurred during login',
            error: error.message,
        });
    }
};

// Add wallet-related controller functions

/**
 * @desc    Get the wallet balance of a user by ID
 * @route   GET /users/:id/wallet
 */
export const getUserWallet = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ walletBalance: user.walletBalance });
    } catch (error) {
        logger.error('Error fetching wallet balance:', error);
        res.status(500).json({ message: 'Error fetching wallet balance', error });
    }
};

/**
 * @desc    Update the wallet balance of a user by ID and type add or deduct
 * @route   PUT /users/:id/wallet
 */
export const updateUserWallet = async (req, res) => {
    try {
        const { amount, type } = req.body; // type = 'add' or 'deduct'

        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ message: 'Invalid wallet amount' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (type === 'deduct') {
            if (user.walletBalance < amount) {
                return res.status(400).json({ message: 'Insufficient wallet balance' });
            }
            user.walletBalance -= amount;
        } else if (type === 'add') {
            user.walletBalance += amount;
        } else {
            return res.status(400).json({ message: 'Invalid transaction type' });
        }

        await user.save();

        res.status(200).json({
            message: `Wallet ${type === 'add' ? 'credited' : 'debited'} successfully`,
            walletBalance: user.walletBalance,
        });
    } catch (error) {
        logger.error('Error updating wallet balance:', error);
        res.status(500).json({ message: 'Error updating wallet balance', error });
    }
};
