const mongoose = require('mongoose');
const logger = require('./utils/logger');


//68rttbD6B7hNXCrL techlapsebusiness
const connectDB = async () => {
    try {
        await mongoose.connect("mongodb+srv://techlapsebusiness:68rttbD6B7hNXCrL@cerca-cluster0.uo0vjhs.mongodb.net/cerca", {
           useUnifiedTopology: true,
            serverSelectionTimeoutMS:20000
        });
        logger.info('MongoDB connected successfully');
    } catch (error) {
        logger.error('Error connecting to MongoDB:', error);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;