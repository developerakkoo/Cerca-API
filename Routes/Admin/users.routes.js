const express = require('express');
const {
  listUsers,
  getUserDetails,
  blockUser,
  verifyUser,
  adjustWallet,
} = require('../../Controllers/Admin/users.controller');
const { authenticateAdmin } = require('../../utils/adminAuth');

const router = express.Router();

router.use(authenticateAdmin);
router.get('/users', listUsers);
router.get('/users/:id', getUserDetails);
router.patch('/users/:id/block', blockUser);
router.patch('/users/:id/verify', verifyUser);
router.patch('/users/:id/wallet', adjustWallet);

module.exports = router;

