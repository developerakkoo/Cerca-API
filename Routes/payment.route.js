const express = require('express');
const router = express.Router();


const { initiatePayment } = require('../Controllers/payment.controller');

router.post('/initiate', initiatePayment);

module.exports = router;