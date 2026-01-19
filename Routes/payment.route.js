const express = require('express');
const router = express.Router();

const { initiatePayment, handleRazorpayWebhook } = require('../Controllers/payment.controller');

router.post('/initiate', initiatePayment);
// Webhook route - express.json() middleware is applied globally in index.js
// For signature verification, we'll parse the body manually if needed
router.post('/webhook', express.json(), handleRazorpayWebhook);

module.exports = router;