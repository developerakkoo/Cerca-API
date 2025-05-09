const express = require('express');
const { getAllUsers, getUserById, createUser, updateUser, deleteUser, loginUserByMobile } = require('../../Controllers/User/user.controller.js');

const router = express.Router();

router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.post('/login', loginUserByMobile);

module.exports = router;
