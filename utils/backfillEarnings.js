/**
 * Backfill script to create AdminEarnings records for existing completed rides
 * 
 * Usage: node utils/backfillEarnings.js
 * 
 * This script:
 * 1. Finds all completed rides that don't have AdminEarnings records
 * 2. Creates AdminEarnings records for them using current settings
 * 3. Logs progress and results
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../db');
const logger = require('./logger');

const Ride = require('../Models/Driver/ride.model');
const AdminEarnings = require('../Models/Admin/adminEarnings.model');
const Settings = require('../Models/Admin/settings.modal');

async function backfillEarnings() {
  try {
    // Connect to database
    await connectDB();
    logger.info('✅ Connected to database');

    // Get settings for commission calculation
    const settings = await Settings.findOne();
    if (!settings) {
      logger.error('❌ Settings not found. Please create settings first.');
      process.exit(1);
    }

    if (!settings.pricingConfigurations) {
      logger.error('❌ pricingConfigurations missing in settings. Please configure pricing.');
      process.exit(1);
    }

    const { platformFees, driverCommissions } = settings.pricingConfigurations;
    logger.info(`📊 Using settings - platformFees: ${platformFees}%, driverCommissions: ${driverCommissions}%`);

    // Find all completed rides
    const completedRides = await Ride.find({ status: 'completed' })
      .populate('driver', '_id')
      .populate('rider', '_id')
      .sort({ createdAt: -1 });

    logger.info(`📦 Found ${completedRides.length} completed rides`);

    if (completedRides.length === 0) {
      logger.info('✅ No completed rides found. Nothing to backfill.');
      process.exit(0);
    }

    // Get existing AdminEarnings rideIds to avoid duplicates
    const existingEarnings = await AdminEarnings.find({}).select('rideId');
    const existingRideIds = new Set(existingEarnings.map(e => e.rideId.toString()));
    logger.info(`📋 Found ${existingRideIds.size} existing earnings records`);

    // Filter rides that don't have earnings records
    const ridesToProcess = completedRides.filter(ride => {
      const rideId = ride._id.toString();
      return !existingRideIds.has(rideId);
    });

    logger.info(`🔄 Processing ${ridesToProcess.length} rides without earnings records`);

    if (ridesToProcess.length === 0) {
      logger.info('✅ All completed rides already have earnings records. Nothing to backfill.');
      process.exit(0);
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process each ride
    for (const ride of ridesToProcess) {
      try {
        // Validate ride data
        if (!ride._id) {
          logger.warn(`⚠️ Skipping ride with missing ID`);
          errorCount++;
          continue;
        }

        const rideId = ride._id.toString();
        const driverId = ride.driver?._id || ride.driver;
        const riderId = ride.rider?._id || ride.rider;

        if (!driverId) {
          logger.warn(`⚠️ Skipping ride ${rideId} - missing driver`);
          errorCount++;
          errors.push({ rideId, error: 'Missing driver' });
          continue;
        }

        if (!riderId) {
          logger.warn(`⚠️ Skipping ride ${rideId} - missing rider`);
          errorCount++;
          errors.push({ rideId, error: 'Missing rider' });
          continue;
        }

        const grossFare = ride.fare || 0;

        if (grossFare <= 0) {
          logger.warn(`⚠️ Skipping ride ${rideId} - invalid fare: ₹${grossFare}`);
          errorCount++;
          errors.push({ rideId, error: `Invalid fare: ₹${grossFare}` });
          continue;
        }

        // Calculate platform fee and driver earning
        const platformFee = platformFees ? grossFare * (platformFees / 100) : 0;
        const driverEarning = driverCommissions
          ? grossFare * (driverCommissions / 100)
          : grossFare - platformFee;

        // Create earnings record
        await AdminEarnings.create({
          rideId: rideId,
          driverId: driverId.toString(),
          riderId: riderId.toString(),
          grossFare: grossFare,
          platformFee: Math.round(platformFee * 100) / 100,
          driverEarning: Math.round(driverEarning * 100) / 100,
          rideDate: ride.actualEndTime || ride.updatedAt || ride.createdAt || new Date(),
          paymentStatus: 'pending'
        });

        successCount++;
        
        if (successCount % 10 === 0) {
          logger.info(`📊 Progress: ${successCount}/${ridesToProcess.length} processed`);
        }
      } catch (error) {
        errorCount++;
        const rideId = ride._id?.toString() || 'unknown';
        logger.error(`❌ Error processing ride ${rideId}:`, error.message);
        errors.push({ rideId, error: error.message });
      }
    }

    // Summary
    logger.info('\n' + '='.repeat(60));
    logger.info('📊 BACKFILL SUMMARY');
    logger.info('='.repeat(60));
    logger.info(`✅ Successfully processed: ${successCount} rides`);
    logger.info(`❌ Errors: ${errorCount} rides`);
    logger.info(`📦 Total rides processed: ${ridesToProcess.length}`);
    
    if (errors.length > 0) {
      logger.info('\n❌ Errors encountered:');
      errors.slice(0, 10).forEach(({ rideId, error }) => {
        logger.info(`   - Ride ${rideId}: ${error}`);
      });
      if (errors.length > 10) {
        logger.info(`   ... and ${errors.length - 10} more errors`);
      }
    }

    logger.info('='.repeat(60));
    logger.info('✅ Backfill completed!');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Fatal error in backfill script:', error);
    process.exit(1);
  }
}

// Run the backfill
if (require.main === module) {
  backfillEarnings()
    .then(() => {
      logger.info('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { backfillEarnings };

