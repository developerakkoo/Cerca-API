const razorpay = require("razorpay");
const logger = require('../utils/logger');

const key = process.env.RAZORPAY_ID || "rzp_test_Rp3ejYlVfY449V";
const secret = process.env.RAZORPAY_SECRET || "FORM4hrZrQO8JFIiYsQSC83N";

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

module.exports = { initiatePayment };