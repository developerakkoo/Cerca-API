const razorpay = require("razorpay");
const key = process.env.RAZORPAY_ID;
const secret = process.env.RAZORPAY_SECRET;

var instance = new razorpay({
    key_id: "rzp_test_Rp3ejYlVfY449V",
    key_secret: "FORM4hrZrQO8JFIiYsQSC83N",
});


// Initiate payment request
const initiatePayment = async (req, res) => {
    const { amount } = req.body;

    const options = {
        amount: amount * 100, // Razorpay expects the amount in paise
        currency: "INR",
    };

    const order = await instance.orders.create(options);
   if(order){
    res.status(200).json({message: "Order Created", order});
   }else{
    res.status(400).json({message: "Order Not Created"});
   }
};

module.exports = { initiatePayment };