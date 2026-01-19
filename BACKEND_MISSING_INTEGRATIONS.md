# Backend Missing Integrations - Complete Documentation

## Overview

This document lists all missing backend functionality required for complete integration with the User App and Driver App. These are the gaps that need to be filled to complete the Cerca ride-sharing platform.

---

## 1. WALLET PAYMENT DEDUCTION ON RIDE COMPLETION

### Current State
- ✅ Wallet deduction API exists: `POST /api/users/:userId/wallet/deduct`
- ✅ Hybrid payment (Wallet + Razorpay) handled during ride creation
- ❌ **MISSING**: Pure WALLET payment deduction when ride is completed

### Problem
In `Cerca-API/utils/socket.js`, the `rideCompleted` event handler (line 990-1060) does NOT check if `paymentMethod === 'WALLET'` and deduct from wallet. Currently:
- Hybrid payments are processed during `newRideRequest` (line 313-370)
- Pure WALLET payments are NOT deducted on ride completion
- Only CASH and RAZORPAY payments are handled

### Required Implementation

**File:** `Cerca-API/utils/socket.js`  
**Location:** Inside `rideCompleted` event handler (after line 1011)

**Code to Add:**
```javascript
// After: const completedRide = await completeRide(rideId, fare);
// After: await updateRideEndTime(rideId);

// Check if payment method is WALLET and deduct from wallet
if (completedRide.paymentMethod === 'WALLET') {
  try {
    const User = require('../Models/User/user.model');
    const WalletTransaction = require('../Models/User/walletTransaction.model');
    const riderId = completedRide.rider._id || completedRide.rider;
    const fareAmount = completedRide.fare || fare;

    // Get user
    const user = await User.findById(riderId);
    if (user) {
      const balanceBefore = user.walletBalance || 0;

      // Check sufficient balance
      if (balanceBefore >= fareAmount) {
        const balanceAfter = balanceBefore - fareAmount;

        // Create wallet transaction
        await WalletTransaction.create({
          user: riderId,
          transactionType: 'RIDE_PAYMENT',
          amount: fareAmount,
          balanceBefore,
          balanceAfter,
          relatedRide: rideId,
          paymentMethod: 'WALLET',
          status: 'COMPLETED',
          description: `Ride payment of ₹${fareAmount}`,
        });

        // Update user wallet balance
        user.walletBalance = balanceAfter;
        await user.save();

        // Update ride payment status
        completedRide.paymentStatus = 'completed';
        await completedRide.save();

        logger.info(`Wallet payment deducted - Ride: ${rideId}, Amount: ₹${fareAmount}, New Balance: ₹${balanceAfter}`);
      } else {
        logger.warn(`Insufficient wallet balance - Ride: ${rideId}, Required: ₹${fareAmount}, Available: ₹${balanceBefore}`);
        // Handle insufficient balance - maybe mark payment as failed
        completedRide.paymentStatus = 'failed';
        await completedRide.save();
      }
    }
  } catch (walletError) {
    logger.error(`Error processing wallet payment for ride ${rideId}:`, walletError);
    // Don't fail ride completion if wallet deduction fails
    // But mark payment status appropriately
  }
}
```

### Impact
- **User App**: Wallet payments will not be deducted automatically
- **Driver App**: Payment status may remain pending
- **Wallet Balance**: User wallet balance won't update on ride completion

---

## 2. RAZORPAY WEBHOOK HANDLER

### Current State
- ✅ Razorpay payment initiation exists: `POST /api/v1/payment/initiate`
- ✅ Razorpay SDK installed
- ❌ **MISSING**: Webhook endpoint to verify payments and update wallet/ride status

### Problem
No webhook endpoint exists to:
- Verify Razorpay payment signatures
- Update wallet balance after successful payment
- Update ride payment status
- Handle payment failures

### Required Implementation

**File:** `Cerca-API/Routes/payment.route.js`  
**Add webhook route:**

```javascript
const express = require('express');
const router = express.Router();
const { initiatePayment, handleRazorpayWebhook } = require('../Controllers/payment.controller');

router.post('/initiate', initiatePayment);
router.post('/webhook', handleRazorpayWebhook); // NEW

module.exports = router;
```

**File:** `Cerca-API/Controllers/payment.controller.js`  
**Add webhook handler:**

```javascript
const crypto = require('crypto');
const WalletTransaction = require('../Models/User/walletTransaction.model');
const User = require('../Models/User/user.model');
const Ride = require('../Models/Driver/ride.model');

const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret';
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn('Invalid Razorpay webhook signature');
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const event = req.body.event;
    const payment = req.body.payload.payment.entity;

    logger.info(`Razorpay webhook received - Event: ${event}, Payment ID: ${payment.id}`);

    // Handle payment.paid event
    if (event === 'payment.captured' || event === 'payment.authorized') {
      const paymentId = payment.id;
      const amount = payment.amount / 100; // Convert from paise to rupees
      const userId = payment.notes?.userId;
      const rideId = payment.notes?.rideId;
      const isWalletTopUp = payment.notes?.type === 'wallet_topup';

      if (isWalletTopUp && userId) {
        // Handle wallet top-up
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
        // Handle ride payment
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
        const ride = await Ride.findById(rideId);
        if (ride) {
          ride.paymentStatus = 'failed';
          await ride.save();

          logger.warn(`Ride payment failed - Ride: ${rideId}, Payment ID: ${paymentId}`);
        }
      }
    }

    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    logger.error('Razorpay webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};

module.exports = { initiatePayment, handleRazorpayWebhook };
```

**File:** `Cerca-API/index.js`  
**Ensure route is mounted:**
```javascript
app.use("/api/v1/payment", require("./Routes/payment.route"));
```

### Impact
- **User App**: Razorpay payments won't be verified automatically
- **Wallet Top-up**: Won't update wallet balance after Razorpay payment
- **Ride Payment**: Payment status won't update automatically
- **Security**: No payment verification from Razorpay

---

## 3. GOOGLE MAPS DISTANCE MATRIX API ENDPOINT

### Current State
- ✅ Google Maps Places API exists: `/api/google-maps/places/autocomplete`
- ✅ Google Maps Place Details exists: `/api/google-maps/places/details`
- ❌ **MISSING**: Distance Matrix API endpoint for fare calculation

### Problem
No endpoint exists to:
- Calculate distance between pickup and dropoff locations
- Calculate estimated fare before ride creation
- Get estimated duration before booking

### Required Implementation

**File:** `Cerca-API/Controllers/googleMaps.controller.js`  
**Add distance matrix function:**

```javascript
const DISTANCE_MATRIX_API_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';

/**
 * Calculate distance and fare between two points
 * GET /api/google-maps/distance-matrix?origin=lat,lng&destination=lat,lng&service=sedan
 */
const calculateDistanceAndFare = async (req, res) => {
  try {
    const { origin, destination, service = 'sedan' } = req.query;

    // Validate required parameters
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        message: 'Origin and destination are required',
        error: 'VALIDATION_ERROR'
      });
    }

    // Build Google Distance Matrix API URL
    const url = `${DISTANCE_MATRIX_API_URL}?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_API_KEY}&units=metric`;

    logger.info(`Calculating distance - Origin: ${origin}, Destination: ${destination}`);

    // Call Google Distance Matrix API
    const data = await httpsGet(url);

    // Handle Google API errors
    if (data.status !== 'OK') {
      logger.error(`Google Distance Matrix API error: ${data.status}`);
      return res.status(500).json({
        success: false,
        message: `Google Distance Matrix API error: ${data.status}`,
        error: data.error_message || 'GOOGLE_API_ERROR'
      });
    }

    // Extract distance and duration
    const element = data.rows[0]?.elements[0];
    if (!element || element.status !== 'OK') {
      return res.status(400).json({
        success: false,
        message: 'Could not calculate distance',
        error: 'DISTANCE_CALCULATION_FAILED'
      });
    }

    const distanceInKm = element.distance.value / 1000; // Convert meters to km
    const durationInMinutes = Math.ceil(element.duration.value / 60); // Convert seconds to minutes

    // Fetch admin settings for fare calculation
    const Settings = require('../Models/Admin/settings.modal.js');
    const settings = await Settings.findOne();

    if (!settings) {
      return res.status(500).json({
        success: false,
        message: 'Admin settings not found',
        error: 'SETTINGS_NOT_FOUND'
      });
    }

    const { perKmRate, minimumFare } = settings.pricingConfigurations;
    const selectedService = settings.services.find(s => s.name === service);

    if (!selectedService) {
      return res.status(400).json({
        success: false,
        message: `Invalid service: ${service}`,
        error: 'INVALID_SERVICE'
      });
    }

    // Calculate fare: base price + (distance * per km rate)
    let fare = selectedService.price + (distanceInKm * perKmRate);
    fare = Math.max(fare, minimumFare); // Ensure minimum fare
    fare = Math.round(fare * 100) / 100; // Round to 2 decimal places

    logger.info(`Distance calculated - Distance: ${distanceInKm}km, Duration: ${durationInMinutes}min, Fare: ₹${fare}`);

    res.status(200).json({
      success: true,
      data: {
        distance: {
          value: distanceInKm,
          unit: 'km',
          text: element.distance.text
        },
        duration: {
          value: durationInMinutes,
          unit: 'minutes',
          text: element.duration.text
        },
        fare: {
          baseFare: selectedService.price,
          distanceFare: distanceInKm * perKmRate,
          totalFare: fare,
          minimumFare: minimumFare,
          service: service
        }
      }
    });

  } catch (error) {
    logger.error('Error calculating distance and fare:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate distance and fare',
      error: error.message || 'INTERNAL_SERVER_ERROR'
    });
  }
};

module.exports = {
  getPlacePredictions,
  getPlaceDetails,
  calculateDistanceAndFare // NEW
};
```

**File:** `Cerca-API/Routes/googleMaps.routes.js`  
**Add route:**

```javascript
const { getPlacePredictions, getPlaceDetails, calculateDistanceAndFare } = require('../Controllers/googleMaps.controller');

router.get('/places/autocomplete', getPlacePredictions);
router.get('/places/details', getPlaceDetails);
router.get('/distance-matrix', calculateDistanceAndFare); // NEW

module.exports = router;
```

### Impact
- **User App**: Cannot calculate fare before ride creation
- **User Experience**: Users don't know fare before booking
- **Payment Page**: Cannot show accurate fare estimate

---

## 4. RIDE CANCELLATION REFUND LOGIC

### Current State
- ✅ Ride cancellation exists: `rideCancelled` Socket.IO event
- ✅ Wallet refund API exists: `POST /api/users/:userId/wallet/refund`
- ❌ **MISSING**: Automatic refund processing when ride is cancelled

### Problem
When a ride is cancelled:
- No automatic refund is processed
- Wallet payments are not refunded
- Razorpay payments are not refunded
- No cancellation fee calculation

### Required Implementation

**File:** `Cerca-API/utils/socket.js`  
**Location:** Inside `rideCancelled` event handler (after line 1082)

**Code to Add:**
```javascript
// After: const cancelledRide = await cancelRide(rideId, cancelledBy, cancellationReason);

// Process refund if payment was made
if (cancelledRide.paymentMethod === 'WALLET' || cancelledRide.paymentMethod === 'RAZORPAY') {
  try {
    const WalletTransaction = require('../Models/User/walletTransaction.model');
    const User = require('../Models/User/user.model');
    const riderId = cancelledRide.rider._id || cancelledRide.rider;
    
    // Calculate refund amount (may have cancellation fee)
    const Settings = require('../Models/Admin/settings.modal');
    const settings = await Settings.findOne();
    const cancellationFee = settings?.pricingConfigurations?.cancellationFee || 0;
    const refundAmount = Math.max(0, cancelledRide.fare - cancellationFee);

    if (refundAmount > 0) {
      // Get user
      const user = await User.findById(riderId);
      if (user) {
        const balanceBefore = user.walletBalance || 0;
        const balanceAfter = balanceBefore + refundAmount;

        // Create refund transaction
        await WalletTransaction.create({
          user: riderId,
          transactionType: 'REFUND',
          amount: refundAmount,
          balanceBefore,
          balanceAfter,
          relatedRide: rideId,
          paymentMethod: cancelledRide.paymentMethod,
          status: 'COMPLETED',
          description: `Refund for cancelled ride${cancellationFee > 0 ? ` (Cancellation fee: ₹${cancellationFee})` : ''}`,
          metadata: {
            cancellationFee: cancellationFee,
            originalFare: cancelledRide.fare,
            refundAmount: refundAmount,
          },
        });

        // Update user wallet balance
        user.walletBalance = balanceAfter;
        await user.save();

        // Update ride with refund details
        cancelledRide.refundAmount = refundAmount;
        cancelledRide.cancellationFee = cancellationFee;
        cancelledRide.paymentStatus = 'refunded';
        await cancelledRide.save();

        logger.info(`Refund processed - Ride: ${rideId}, Refund: ₹${refundAmount}, Cancellation Fee: ₹${cancellationFee}`);
      }
    } else {
      logger.info(`No refund due - Ride: ${rideId}, Cancellation fee equals fare`);
    }
  } catch (refundError) {
    logger.error(`Error processing refund for ride ${rideId}:`, refundError);
    // Don't fail cancellation if refund processing fails
  }
}
```

### Impact
- **User App**: Users won't get refunds for cancelled rides
- **Wallet Balance**: Won't update after cancellation
- **Payment Status**: Remains as 'completed' instead of 'refunded'

---

## 5. RAZORPAY PAYMENT VERIFICATION ON RIDE CREATION

### Current State
- ✅ Razorpay payment ID stored in ride document
- ❌ **MISSING**: Verification that Razorpay payment was actually successful before creating ride

### Problem
Currently, ride is created with `razorpayPaymentId` but:
- No verification that payment was actually captured
- Payment could be failed but ride still created
- No check if payment amount matches ride fare

### Required Implementation

**File:** `Cerca-API/utils/socket.js`  
**Location:** Inside `newRideRequest` event handler (before ride creation, around line 309)

**Code to Add:**
```javascript
// Before: const ride = await createRide(data);

// Verify Razorpay payment if payment method is RAZORPAY
if (data.paymentMethod === 'RAZORPAY' && data.razorpayPaymentId) {
  try {
    const razorpay = require('razorpay');
    const instance = new razorpay({
      key_id: process.env.RAZORPAY_ID,
      key_secret: process.env.RAZORPAY_SECRET,
    });

    // Fetch payment details from Razorpay
    const payment = await instance.payments.fetch(data.razorpayPaymentId);

    // Verify payment status
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      logger.warn(`Razorpay payment not captured - Payment ID: ${data.razorpayPaymentId}, Status: ${payment.status}`);
      socket.emit('rideError', { 
        message: 'Payment not verified. Please complete payment first.' 
      });
      return;
    }

    // Verify payment amount matches ride fare
    const paymentAmount = payment.amount / 100; // Convert from paise to rupees
    const expectedAmount = data.fare || data.razorpayAmountPaid || 0;

    if (Math.abs(paymentAmount - expectedAmount) > 0.01) { // Allow 1 paise difference
      logger.warn(`Payment amount mismatch - Payment: ₹${paymentAmount}, Expected: ₹${expectedAmount}`);
      socket.emit('rideError', { 
        message: 'Payment amount mismatch. Please try again.' 
      });
      return;
    }

    logger.info(`Razorpay payment verified - Payment ID: ${data.razorpayPaymentId}, Amount: ₹${paymentAmount}`);
  } catch (paymentError) {
    logger.error(`Error verifying Razorpay payment:`, paymentError);
    socket.emit('rideError', { 
      message: 'Payment verification failed. Please try again.' 
    });
    return;
  }
}
```

### Impact
- **Security**: Rides could be created with failed payments
- **Payment Integrity**: No verification of payment success
- **User Experience**: Users might get rides without paying

---

## 6. FARE CALCULATION REST API ENDPOINT

### Current State
- ✅ Fare calculation happens during ride creation (Socket.IO)
- ❌ **MISSING**: Standalone REST API endpoint to calculate fare before ride creation

### Problem
User App needs to:
- Show fare estimate before payment
- Validate fare before proceeding
- Calculate fare without creating ride

### Required Implementation

**File:** `Cerca-API/Routes/ride.routes.js`  
**Add route:**

```javascript
const { calculateFare } = require('../Controllers/User/ride.controller');

router.post('/calculate-fare', calculateFare); // NEW
```

**File:** `Cerca-API/Controllers/User/ride.controller.js`  
**Add controller:**

```javascript
const calculateFare = async (req, res) => {
  try {
    const { pickupLocation, dropoffLocation, service = 'sedan', promoCode } = req.body;

    // Validate required fields
    if (!pickupLocation || !dropoffLocation) {
      return res.status(400).json({
        success: false,
        message: 'Pickup and dropoff locations are required'
      });
    }

    // Calculate distance using Haversine formula
    const { calculateHaversineDistance } = require('../../utils/ride_booking_functions');
    const distance = calculateHaversineDistance(
      pickupLocation.latitude,
      pickupLocation.longitude,
      dropoffLocation.latitude,
      dropoffLocation.longitude
    );

    // Fetch admin settings
    const Settings = require('../../Models/Admin/settings.modal.js');
    const settings = await Settings.findOne();

    if (!settings) {
      return res.status(500).json({
        success: false,
        message: 'Admin settings not found'
      });
    }

    const { perKmRate, minimumFare } = settings.pricingConfigurations;
    const selectedService = settings.services.find(s => s.name === service);

    if (!selectedService) {
      return res.status(400).json({
        success: false,
        message: `Invalid service: ${service}`
      });
    }

    // Calculate base fare
    let fare = selectedService.price + (distance * perKmRate);
    fare = Math.max(fare, minimumFare);
    fare = Math.round(fare * 100) / 100;

    // Apply promo code if provided
    let discount = 0;
    let finalFare = fare;
    if (promoCode) {
      const Coupon = require('../../Models/Admin/coupon.modal.js');
      const coupon = await Coupon.findOne({
        couponCode: promoCode.toUpperCase().trim()
      });

      if (coupon && coupon.isActive && new Date() < coupon.expiryDate) {
        const discountResult = coupon.calculateDiscount(fare);
        if (discountResult.discount > 0) {
          discount = discountResult.discount;
          finalFare = discountResult.finalFare;
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        distance: Math.round(distance * 100) / 100,
        baseFare: selectedService.price,
        distanceFare: distance * perKmRate,
        fare: fare,
        discount: discount,
        finalFare: finalFare,
        service: service,
        promoCode: promoCode || null
      }
    });
  } catch (error) {
    logger.error('Error calculating fare:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate fare',
      error: error.message
    });
  }
};

module.exports = {
  // ... existing exports
  calculateFare // NEW
};
```

### Impact
- **User App**: Cannot show fare estimate before payment
- **Payment Page**: Cannot validate fare before processing payment
- **User Experience**: Users don't know exact fare until ride is created

---

## 7. PUSH NOTIFICATION SERVICE (FCM)

### Current State
- ✅ Local notifications exist in apps
- ❌ **MISSING**: Firebase Cloud Messaging (FCM) integration in backend

### Problem
No backend service to:
- Send push notifications to users/drivers
- Notify users when app is closed
- Send notifications for ride events

### Required Implementation

**File:** `Cerca-API/utils/fcm.service.js` (NEW FILE)

```javascript
const admin = require('firebase-admin');
const logger = require('./logger');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = require('../config/firebase-service-account.json');
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

/**
 * Send push notification to user/driver
 * @param {string} fcmToken - FCM device token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  try {
    if (!fcmToken) {
      logger.warn('FCM token not provided');
      return { success: false, error: 'FCM token required' };
    }

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      token: fcmToken,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'cerca_ride_notifications',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    logger.info(`Push notification sent - Token: ${fcmToken.substring(0, 20)}..., Message ID: ${response}`);

    return { success: true, messageId: response };
  } catch (error) {
    logger.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to multiple devices
 */
const sendMulticastNotification = async (fcmTokens, title, body, data = {}) => {
  try {
    if (!fcmTokens || fcmTokens.length === 0) {
      return { success: false, error: 'FCM tokens required' };
    }

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      tokens: fcmTokens,
      android: {
        priority: 'high',
      },
    };

    const response = await admin.messaging().sendMulticast(message);
    logger.info(`Multicast notification sent - Success: ${response.successCount}, Failure: ${response.failureCount}`);

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    logger.error('Error sending multicast notification:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPushNotification,
  sendMulticastNotification,
};
```

**File:** `Cerca-API/utils/socket.js`  
**Integrate FCM in notification creation:**

```javascript
// After creating notification in database
const fcmService = require('./fcm.service');
const User = require('../Models/User/user.model');
const Driver = require('../Models/Driver/driver.model');

// Send push notification
if (notificationData.recipientModel === 'User') {
  const user = await User.findById(notificationData.recipientId);
  if (user && user.fcmToken) {
    await fcmService.sendPushNotification(
      user.fcmToken,
      notificationData.title,
      notificationData.message,
      { rideId: notificationData.relatedRide, type: notificationData.type }
    );
  }
} else {
  const driver = await Driver.findById(notificationData.recipientId);
  if (driver && driver.fcmToken) {
    await fcmService.sendPushNotification(
      driver.fcmToken,
      notificationData.title,
      notificationData.message,
      { rideId: notificationData.relatedRide, type: notificationData.type }
    );
  }
}
```

**Required:**
- Install Firebase Admin SDK: `npm install firebase-admin`
- Create Firebase service account JSON file
- Add `fcmToken` field to User and Driver models

### Impact
- **User App**: No push notifications when app is closed
- **Driver App**: No push notifications for ride requests when app is in background
- **User Experience**: Users miss important ride updates

---

## 8. RIDE HISTORY API ENHANCEMENT

### Current State
- ✅ Ride history endpoint exists: `GET /rides/rides/user/:userId`
- ⚠️ **PARTIAL**: May need pagination, filtering, and date grouping

### Problem
Current endpoint may not support:
- Pagination (limit/skip)
- Date-wise grouping
- Status filtering
- Sorting options

### Required Enhancement

**File:** `Cerca-API/Controllers/User/ride.controller.js`  
**Enhance getRideHistory function:**

```javascript
const getRideHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      status, 
      startDate, 
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Build query
    const query = { rider: userId };
    
    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Get rides with pagination
    const rides = await Ride.find(query)
      .populate('driver', 'name phone rating vehicleInfo')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Ride.countDocuments(query);

    // Group by date
    const groupedByDate = {};
    rides.forEach(ride => {
      const date = new Date(ride.createdAt).toISOString().split('T')[0];
      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }
      groupedByDate[date].push(ride);
    });

    res.status(200).json({
      success: true,
      data: {
        rides: rides,
        groupedByDate: groupedByDate,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching ride history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ride history',
      error: error.message
    });
  }
};
```

### Impact
- **User App**: Cannot paginate ride history
- **Performance**: Loading all rides at once is slow
- **User Experience**: No date-wise grouping

---

## 9. DRIVER STATISTICS API ENHANCEMENT

### Current State
- ✅ Driver stats endpoint exists: `GET /drivers/:id/stats`
- ⚠️ **PARTIAL**: May need additional statistics

### Problem
May be missing:
- Weekly/monthly earnings breakdown
- Ride completion rate
- Average rating trends
- Peak hours analysis

### Required Enhancement

**File:** `Cerca-API/Controllers/Driver/driver.controller.js`  
**Enhance getDriverStats function:**

```javascript
const getDriverStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { period = 'all' } = req.query; // 'all', 'week', 'month', 'year'

    // Build date filter
    let dateFilter = {};
    if (period !== 'all') {
      const now = new Date();
      let startDate;
      
      if (period === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === 'month') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (period === 'year') {
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      }
      
      if (startDate) {
        dateFilter.createdAt = { $gte: startDate };
      }
    }

    // Get driver
    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Get ride statistics
    const Ride = require('../../Models/Driver/ride.model');
    const totalRides = await Ride.countDocuments({ 
      driver: id,
      ...dateFilter
    });
    
    const completedRides = await Ride.countDocuments({ 
      driver: id, 
      status: 'completed',
      ...dateFilter
    });
    
    const cancelledRides = await Ride.countDocuments({ 
      driver: id, 
      status: 'cancelled',
      ...dateFilter
    });

    // Calculate completion rate
    const completionRate = totalRides > 0 
      ? ((completedRides / totalRides) * 100).toFixed(2)
      : 0;

    // Get earnings breakdown
    const AdminEarnings = require('../../Models/Admin/adminEarnings.model');
    const earningsData = await AdminEarnings.aggregate([
      { $match: { driverId: id, ...dateFilter } },
      {
        $group: {
          _id: null,
          totalGross: { $sum: '$grossFare' },
          totalPlatformFee: { $sum: '$platformFee' },
          totalDriverEarning: { $sum: '$driverEarning' },
          averagePerRide: { $avg: '$driverEarning' }
        }
      }
    ]);

    const earnings = earningsData[0] || {
      totalGross: 0,
      totalPlatformFee: 0,
      totalDriverEarning: 0,
      averagePerRide: 0
    };

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalRides,
          completedRides,
          cancelledRides,
          inProgressRides: await Ride.countDocuments({ 
            driver: id, 
            status: 'in_progress' 
          }),
          completionRate: parseFloat(completionRate),
          rating: driver.rating || 0,
          totalRatings: driver.totalRatings || 0,
          earnings: {
            totalGross: earnings.totalGross || 0,
            totalPlatformFee: earnings.totalPlatformFee || 0,
            totalDriverEarning: earnings.totalDriverEarning || 0,
            averagePerRide: Math.round((earnings.averagePerRide || 0) * 100) / 100
          },
          isOnline: driver.isOnline || false,
          isActive: driver.isActive || false,
          isBusy: driver.isBusy || false,
          lastSeen: driver.lastSeen || null
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching driver stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch driver statistics',
      error: error.message
    });
  }
};
```

### Impact
- **Driver App**: Cannot show detailed statistics
- **Analytics**: No earnings breakdown
- **Performance Metrics**: No completion rate tracking

---

## 10. ADDRESS MANAGEMENT MODEL ENHANCEMENT

### Current State
- ✅ Address routes exist: `/address/*`
- ⚠️ **VERIFY**: Check if address model supports all required fields

### Problem
May be missing:
- Address types (Home, Work, Other)
- Default address flag
- Address validation
- Recent addresses tracking

### Required Verification

**File:** `Cerca-API/Models/User/address.model.js`  
**Verify model includes:**

```javascript
{
  user: ObjectId (ref: User),
  addressType: String (enum: ['home', 'work', 'other']),
  label: String, // "Home", "Work", "Custom Label"
  address: String, // Full address string
  location: {
    type: 'Point',
    coordinates: [longitude, latitude]
  },
  isDefault: Boolean,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Impact
- **User App**: Cannot save favorite addresses
- **User Experience**: Users must re-enter addresses every time

---

## SUMMARY OF MISSING FUNCTIONALITY

| # | Feature | Priority | File(s) to Modify | Estimated Effort |
|---|---------|----------|-------------------|------------------|
| 1 | Wallet Deduction on Ride Completion | **CRITICAL** | `utils/socket.js` | 2 hours |
| 2 | Razorpay Webhook Handler | **CRITICAL** | `Routes/payment.route.js`, `Controllers/payment.controller.js` | 4 hours |
| 3 | Google Maps Distance Matrix API | **HIGH** | `Controllers/googleMaps.controller.js`, `Routes/googleMaps.routes.js` | 3 hours |
| 4 | Ride Cancellation Refund Logic | **HIGH** | `utils/socket.js` | 2 hours |
| 5 | Razorpay Payment Verification | **HIGH** | `utils/socket.js` | 2 hours |
| 6 | Fare Calculation REST API | **MEDIUM** | `Routes/ride.routes.js`, `Controllers/User/ride.controller.js` | 2 hours |
| 7 | Push Notification Service (FCM) | **MEDIUM** | `utils/fcm.service.js` (NEW), `utils/socket.js` | 6 hours |
| 8 | Ride History API Enhancement | **LOW** | `Controllers/User/ride.controller.js` | 2 hours |
| 9 | Driver Statistics Enhancement | **LOW** | `Controllers/Driver/driver.controller.js` | 2 hours |
| 10 | Address Model Verification | **LOW** | `Models/User/address.model.js` | 1 hour |

**Total Estimated Effort:** ~26 hours

---

## IMPLEMENTATION PRIORITY

### Phase 1: Critical (Must Have)
1. Wallet Deduction on Ride Completion
2. Razorpay Webhook Handler
3. Razorpay Payment Verification

### Phase 2: High Priority (Should Have)
4. Google Maps Distance Matrix API
5. Ride Cancellation Refund Logic

### Phase 3: Medium Priority (Nice to Have)
6. Fare Calculation REST API
7. Push Notification Service (FCM)

### Phase 4: Low Priority (Enhancements)
8. Ride History API Enhancement
9. Driver Statistics Enhancement
10. Address Model Verification

---

## TESTING REQUIREMENTS

After implementing each feature:

1. **Wallet Deduction**: Test with WALLET payment method ride completion
2. **Razorpay Webhook**: Test with Razorpay webhook simulator
3. **Distance Matrix**: Test with various origin/destination pairs
4. **Refund Logic**: Test cancellation with different payment methods
5. **Payment Verification**: Test with valid/invalid payment IDs
6. **Fare Calculation**: Test with different services and promo codes
7. **FCM**: Test push notifications on Android/iOS devices
8. **Ride History**: Test pagination and filtering
9. **Driver Stats**: Test with different time periods
10. **Address Model**: Verify all fields are present

---

## NOTES

1. **Environment Variables Required:**
   - `RAZORPAY_WEBHOOK_SECRET` - For webhook signature verification
   - `GOOGLE_MAPS_API_KEY` - Already exists
   - `FIREBASE_SERVICE_ACCOUNT` - Path to Firebase service account JSON

2. **Database Updates:**
   - Add `fcmToken` field to User model
   - Add `fcmToken` field to Driver model
   - Verify Address model has all required fields

3. **Dependencies to Install:**
   - `firebase-admin` - For FCM push notifications
   - `crypto` - Already available in Node.js

4. **Security Considerations:**
   - Webhook signature verification is critical
   - Payment verification prevents fraud
   - FCM tokens should be stored securely

---

**Last Updated:** January 2025  
**Status:** Ready for Implementation  
**Version:** 1.0.0

