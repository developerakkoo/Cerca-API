const express = require('express');
const {
  createAddress,
  getUserAddresses,
  getAddressById,
  updateAddress,
  deleteAddress
   
} = require('../../Controllers/User/addressController.js');

const router = express.Router();

// Create a new address (user ID comes in req.body.id)
router.post('/', createAddress);

// Get all addresses for a specific user
router.get('/user/:id', getUserAddresses);

// Get a specific address by address ID and user ID
router.get('/:id/user/:userId', getAddressById);

// Update a specific address by address ID and user ID
router.put('/:id/user/:userId', updateAddress);

// Delete a specific address by address ID (userId not required)
router.delete('/:id', deleteAddress);

module.exports = router;
