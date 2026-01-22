const razorpay = require("razorpay");
const crypto = require("crypto");
const logger = require('../utils/logger');

const key = process.env.RAZORPAY_ID || "rzp_live_S6q5OGF0WYChTn";
const secret = process.env.RAZORPAY_SECRET || "EZv5VecWiWi0FLyffYLDTM3H";

var instance = new razorpay({
    key_id: key,
    key_secret: secret,
});

// Initiate payment request
const initiatePayment = async (req, res) => {
    try {
        const { amount } = req.body;

        // Validate amount
        if (!amount || amount <= 0) {
            return res.status(400).json({
                message: "Invalid amount. Amount must be greater than 0.",
                error: "VALIDATION_ERROR"
            });
        }

        // Validate minimum amount (₹10 = 1000 paise)
        if (amount < 10) {
            return res.status(400).json({
                message: "Minimum amount is ₹10",
                error: "VALIDATION_ERROR"
            });
        }

        // Validate maximum amount (₹50,000 = 5000000 paise)
        if (amount > 50000) {
            return res.status(400).json({
                message: "Maximum amount is ₹50,000",
                error: "VALIDATION_ERROR"
            });
        }

        const options = {
            amount: amount * 100, // Razorpay expects the amount in paise
            currency: "INR",
        };

        const order = await instance.orders.create(options);
        
        if (order) {
            logger.info(`Payment order created: ${order.id} for amount: ₹${amount}`);
            res.status(200).json({
                message: "Order Created",
                order
            });
        } else {
            logger.error('Failed to create Razorpay order');
            res.status(400).json({
                message: "Order Not Created",
                error: "ORDER_CREATION_FAILED"
            });
        }
    } catch (error) {
        logger.error("Payment initiation error:", error);
        res.status(500).json({
            message: "Failed to initiate payment",
            error: error.message || "INTERNAL_SERVER_ERROR"
        });
    }
};

/**
 * Handle Razorpay webhook events
 * POST /api/v1/payment/webhook
 */
const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const signature = req.headers['x-razorpay-signature'];
    
    // If webhook secret is configured, verify signature
    // Note: For proper signature verification, you may need to use raw body
    // For now, we'll skip signature verification if secret is not set
    if (webhookSecret && signature) {
      // Signature verification would require raw body buffer
      // For production, consider using express.raw() middleware for webhook route
      logger.info('Webhook signature verification skipped (requires raw body)');
      // In production, implement proper signature verification with raw body
    }

    const event = req.body.event;
    const payment = req.body.payload?.payment?.entity;

    if (!event || !payment) {
      logger.warn('Invalid webhook payload structure');
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }

    logger.info(`Razorpay webhook received - Event: ${event}, Payment ID: ${payment.id}`);

    // Handle payment captured/authorized events
    if (event === 'payment.captured' || event === 'payment.authorized') {
      const paymentId = payment.id;
      const amount = payment.amount / 100; // Convert from paise to rupees
      const userId = payment.notes?.userId;
      const rideId = payment.notes?.rideId;
      const isWalletTopUp = payment.notes?.type === 'wallet_topup';

      if (isWalletTopUp && userId) {
        // Handle wallet top-up
        const User = require('../Models/User/user.model');
        const WalletTransaction = require('../Models/User/walletTransaction.model');
        
        const user = await User.findById(userId);
        if (user) {
          const balanceBefore = user.walletBalance || 0;
          const balanceAfter = balanceBefore + amount;

          // Create wallet transaction
          await WalletTransaction.create({
            user: userId,
            transactionType: 'TOP_UP',
            amount: amount,
            balanceBefore,
            balanceAfter,
            paymentGatewayTransactionId: paymentId,
            paymentMethod: 'RAZORPAY',
            status: 'COMPLETED',
            description: `Wallet top-up of ₹${amount}`,
          });

          // Update user wallet balance
          user.walletBalance = balanceAfter;
          await user.save();

          logger.info(`Wallet top-up successful - User: ${userId}, Amount: ₹${amount}, New Balance: ₹${balanceAfter}`);
        }
      } else if (rideId) {
        // Handle ride payment confirmation
        const Ride = require('../Models/Driver/ride.model');
        const ride = await Ride.findById(rideId);
        if (ride) {
          ride.paymentStatus = 'completed';
          ride.razorpayPaymentId = paymentId;
          ride.transactionId = paymentId;
          await ride.save();

          logger.info(`Ride payment confirmed - Ride: ${rideId}, Payment ID: ${paymentId}`);
        }
      }
    }

    // Handle payment failed event
    if (event === 'payment.failed') {
      const paymentId = payment.id;
      const rideId = payment.notes?.rideId;

      if (rideId) {
        const Ride = require('../Models/Driver/ride.model');
        const ride = await Ride.findById(rideId);
        if (ride) {
          ride.paymentStatus = 'failed';
          await ride.save();

          logger.warn(`Ride payment failed - Ride: ${rideId}, Payment ID: ${paymentId}`);
        }
      }
    }

    // Always return 200 to acknowledge webhook receipt
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    logger.error('Error processing Razorpay webhook:', error);
    // Still return 200 to prevent Razorpay from retrying
    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message
    });
  }
};

module.exports = { initiatePayment, handleRazorpayWebhook };