const User = require('../../Models/User/user.model');
const Ride = require('../../Models/Driver/ride.model');
const WalletTransaction = require('../../Models/User/walletTransaction.model');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const parseBoolean = (value) => {
  if (value === undefined) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

const listUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isActive, isVerified, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const query = {};

    const activeValue = parseBoolean(isActive);
    if (activeValue !== undefined) query.isActive = activeValue;

    const verifiedValue = parseBoolean(isVerified);
    if (verifiedValue !== undefined) query.isVerified = verifiedValue;

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [{ fullName: regex }, { email: regex }, { phoneNumber: regex }];
    }

    // Validate sortBy field
    const allowedSortFields = ['fullName', 'email', 'createdAt', 'walletBalance', 'lastLogin'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [users, total] = await Promise.all([
      User.find(query).sort({ [sortField]: sortDirection }).skip(skip).limit(parseInt(limit, 10)),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      users,
      pagination: {
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10)),
        total,
        limit: parseInt(limit, 10),
      },
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [rides, walletTransactions] = await Promise.all([
      Ride.find({ rider: id }).sort({ createdAt: -1 }).limit(20),
      WalletTransaction.find({ user: id }).sort({ createdAt: -1 }).limit(20),
    ]);

    res.status(200).json({
      user,
      rides,
      walletTransactions,
    });
  } catch (error) {
    logger.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Error fetching user details', error: error.message });
  }
};

const blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const activeValue = parseBoolean(isActive);
    if (activeValue === undefined) {
      return res.status(400).json({ message: 'isActive must be true or false' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { isActive: activeValue },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User status updated', user });
  } catch (error) {
    logger.error('Error updating user status:', error);
    res.status(500).json({ message: 'Error updating user status', error: error.message });
  }
};

const verifyUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const verifiedValue = parseBoolean(isVerified);
    if (verifiedValue === undefined) {
      return res.status(400).json({ message: 'isVerified must be true or false' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { isVerified: verifiedValue },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User verification updated', user });
  } catch (error) {
    logger.error('Error verifying user:', error);
    res.status(500).json({ message: 'Error verifying user', error: error.message });
  }
};

const adjustWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    if (!['add', 'deduct'].includes(type)) {
      return res.status(400).json({ message: 'Type must be add or deduct' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const balanceBefore = user.walletBalance || 0;
    const balanceAfter =
      type === 'add' ? balanceBefore + amount : balanceBefore - amount;

    if (balanceAfter < 0) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    user.walletBalance = balanceAfter;
    await user.save();

    await WalletTransaction.create({
      user: id,
      transactionType: 'ADMIN_ADJUSTMENT',
      amount,
      balanceBefore,
      balanceAfter,
      paymentMethod: 'ADMIN',
      status: 'COMPLETED',
      description: description || `Admin ${type} wallet balance`,
      adjustedBy: req.adminId,
    });

    res.status(200).json({
      message: 'Wallet updated',
      walletBalance: balanceAfter,
    });
  } catch (error) {
    logger.error('Error adjusting wallet:', error);
    res.status(500).json({ message: 'Error adjusting wallet', error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

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
    const updatedUser = await User.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    logger.info(`Admin ${req.adminId} updated user ${id}`);
    res.status(200).json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(400).json({ message: 'Error updating user', error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

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

    // Hard delete the user
    await User.findByIdAndDelete(id);

    logger.info(`Admin ${req.adminId} deleted user ${id}`);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

module.exports = {
  listUsers,
  getUserDetails,
  blockUser,
  verifyUser,
  adjustWallet,
  updateUser,
  deleteUser,
};

