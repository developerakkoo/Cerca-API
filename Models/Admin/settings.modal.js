const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
    gst: {
        enabled: { type: Boolean, default: false },
        percentage: { type: Number, default: 3 },
    },
    pricingConfigurations: {
        baseFare: { type: Number, required: true },
        perKmRate: { type: Number, required: true },
        minimumFare: { type: Number, required: true },
        cancellationFees: { type: Number, required: true },
        platformFees: { type: Number, required: true },
        driverCommissions: { type: Number, required: true },
    },
    services: [
        {
            name: { type: String, required: true },
            price: { type: Number, required: true },
        },
    ],
    systemSettings: {
        maintenanceMode: { type: Boolean, default: false },
        forceUpdate: { type: Boolean, default: false },
    },
    appVersions: {
        driverAppVersion: { type: String, required: false },
        userAppVersion: { type: String, required: false },
    },
}, { timestamps: true });

module.exports = mongoose.model('Settings', SettingsSchema);