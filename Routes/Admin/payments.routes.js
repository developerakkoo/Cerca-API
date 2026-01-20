const express = require('express');
const {
  listPayments,
  refundPayment,
  listPayouts,
  processPayout,
} = require('../../Controllers/Admin/payments.controller');
const { authenticateAdmin } = require('../../utils/adminAuth');

const router = express.Router();

router.use(authenticateAdmin);
router.get('/payments', listPayments);
router.post('/payments/refund', refundPayment);
router.get('/payments/payouts', listPayouts);
router.patch('/payments/payouts/:id/process', processPayout);

module.exports = router;

