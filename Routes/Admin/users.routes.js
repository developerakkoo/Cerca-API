const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  listUsers,
  getUserDetails,
  blockUser,
  verifyUser,
  adjustWallet,
  updateUser,
  deleteUser,
} = require('../../Controllers/Admin/users.controller');
const { authenticateAdmin } = require('../../utils/adminAuth');

const router = express.Router();

// Multer configuration for profile picture uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/profilePics/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const fileTypes = /jpeg|jpg|png/;
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeType = fileTypes.test(file.mimetype);

  if (extname && mimeType) {
    cb(null, true);
  } else {
    cb(new Error('Only images (jpeg, jpg, png) are allowed'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.use(authenticateAdmin);
router.get('/users', listUsers);
router.get('/users/:id', getUserDetails);
router.put('/users/:id', upload.single('profilePic'), updateUser);
router.delete('/users/:id', deleteUser);
router.patch('/users/:id/block', blockUser);
router.patch('/users/:id/verify', verifyUser);
router.patch('/users/:id/wallet', adjustWallet);

module.exports = router;

