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
        maintenanceMessage: { type: String, required: false },
    },
    appVersions: {
        driverAppVersion: { type: String, required: false },
        userAppVersion: { type: String, required: false },
    },
    payoutConfigurations: {
        minPayoutThreshold: { type: Number, default: 500 },
        payoutSchedule: {
            type: String,
            enum: ['DAILY', 'WEEKLY', 'MONTHLY'],
            default: 'WEEKLY',
        },
        processingDays: { type: Number, default: 3 }, // Business days
    },
    vehicleServices: {
        cercaSmall: {
            name: { type: String, default: 'Cerca Small' },
            price: { type: Number, required: true, default: 299 },
            perMinuteRate: { type: Number, required: true, default: 2 },
            seats: { type: Number, default: 4 },
            enabled: { type: Boolean, default: true },
            imagePath: { type: String, default: 'assets/cars/cerca-small.png' }
        },
        cercaMedium: {
            name: { type: String, default: 'Cerca Medium' },
            price: { type: Number, required: true, default: 499 },
            perMinuteRate: { type: Number, required: true, default: 3 },
            seats: { type: Number, default: 6 },
            enabled: { type: Boolean, default: true },
            imagePath: { type: String, default: 'assets/cars/Cerca-medium.png' }
        },
        cercaLarge: {
            name: { type: String, default: 'Cerca Large' },
            price: { type: Number, required: true, default: 699 },
            perMinuteRate: { type: Number, required: true, default: 4 },
            seats: { type: Number, default: 8 },
            enabled: { type: Boolean, default: true },
            imagePath: { type: String, default: 'assets/cars/cerca-large.png' }
        }
    },
}, { timestamps: true });

module.exports = mongoose.model('Settings', SettingsSchema);