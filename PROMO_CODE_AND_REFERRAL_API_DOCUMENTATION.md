# Promo Code & Referral System API Documentation

Complete API documentation for the Promo Code (Coupon) and Referral systems in Cerca Taxi Booking Platform.

## Table of Contents

1. [Overview](#overview)
2. [Promo Code System](#promo-code-system)
   - [Admin Endpoints](#admin-endpoints)
   - [User Endpoints](#user-endpoints)
   - [Discount Calculation](#discount-calculation)
3. [Referral System](#referral-system)
   - [User Endpoints](#user-endpoints-1)
4. [Integration Examples](#integration-examples)

---

## Overview

The Promo Code and Referral systems provide:
- **Promo Codes**: Discount coupons with usage limits, expiry tracking, and service-specific applicability
- **Referral System**: User referral program with automatic reward distribution

---

## Promo Code System

### Base URL
```
/api/coupons
```

### Discount Calculation

The discount is calculated based on your app's ride fare calculation:

**Ride Fare Formula:**
```
fare = service.price + (distance * perKmRate)
fare = max(fare, minimumFare)
```

**Discount Application:**
- **Fixed Discount**: Direct amount deduction (e.g., ₹50 off)
- **Percentage Discount**: Percentage of fare (e.g., 10% off, with optional max cap)
- **New User Discount**: Special discount for new users

**Final Fare:**
```
finalFare = max(0, fare - discount)
```

---

## Admin Endpoints

### 1. Create Coupon

Create a new promo code/coupon.

**Endpoint:** `POST /api/coupons`

**Request Body:**
```json
{
  "couponCode": "SAVE50",
  "type": "fixed",
  "description": "Save ₹50 on your ride",
  "discountValue": 50,
  "maxDiscountAmount": null,
  "minOrderAmount": 100,
  "startDate": "2024-01-01",
  "validUntil": "2024-12-31",
  "maxUsage": 1000,
  "maxUsagePerUser": 1,
  "isActive": true,
  "applicableServices": ["sedan", "suv"],
  "applicableRideTypes": ["normal"]
}
```

**Request Body Fields:**
- `couponCode` (string, optional) - Auto-generated if not provided
- `type` (string, required) - `fixed`, `percentage`, or `new_user`
- `description` (string, required) - Coupon description
- `discountValue` (number, required) - Discount amount or percentage
- `maxDiscountAmount` (number, optional) - Max discount cap for percentage type
- `minOrderAmount` (number, required) - Minimum ride fare to apply coupon
- `startDate` (date, required) - Coupon start date (YYYY-MM-DD)
- `validUntil` (date, required) - Coupon expiry date (YYYY-MM-DD)
- `maxUsage` (number, optional) - Total usage limit (null = unlimited)
- `maxUsagePerUser` (number, optional) - Usage limit per user (default: 1)
- `isActive` (boolean, optional) - Active status (default: true)
- `applicableServices` (array, optional) - Service types this coupon applies to
- `applicableRideTypes` (array, optional) - Ride types this coupon applies to

**Response:**
```json
{
  "success": true,
  "message": "Coupon added successfully",
  "data": {
    "coupon": {
      "_id": "507f1f77bcf86cd799439011",
      "couponCode": "SAVE50",
      "type": "fixed",
      "discountValue": 50,
      "minOrderAmount": 100,
      "validUntil": "2024-12-31T00:00:00.000Z",
      "usageCount": 0
    }
  }
}
```

---

### 2. Get All Coupons

Get all coupons with optional filtering.

**Endpoint:** `GET /api/coupons`

**Query Parameters:**
- `isActive` (boolean, optional) - Filter by active status
- `expired` (string, optional) - `true` for expired, `false` for active

**Response:**
```json
{
  "success": true,
  "data": {
    "coupons": [...],
    "count": 10
  }
}
```

---

### 3. Get Coupon by ID

**Endpoint:** `GET /api/coupons/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "coupon": {...}
  }
}
```

---

### 4. Get Coupon by Code

**Endpoint:** `GET /api/coupons/code/:code`

**Example:** `GET /api/coupons/code/SAVE50`

---

### 5. Get Coupon Statistics

**Endpoint:** `GET /api/coupons/:id/statistics`

**Response:**
```json
{
  "success": true,
  "data": {
    "statistics": {
      "totalUsage": 50,
      "maxUsage": 1000,
      "usageLimitReached": false,
      "uniqueUsers": 45,
      "usageHistory": [...],
      "isActive": true,
      "isExpired": false
    }
  }
}
```

---

### 6. Update Coupon

**Endpoint:** `PUT /api/coupons/:id`

---

### 7. Delete Coupon

**Endpoint:** `DELETE /api/coupons/:id`

---

## User Endpoints

### 1. Validate Coupon

Validate a coupon before applying it to a ride.

**Endpoint:** `POST /api/coupons/validate`

**Request Body:**
```json
{
  "couponCode": "SAVE50",
  "userId": "507f1f77bcf86cd799439011",
  "rideFare": 250,
  "service": "sedan",
  "rideType": "normal"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Coupon is valid",
  "data": {
    "coupon": {
      "code": "SAVE50",
      "type": "fixed",
      "description": "Save ₹50 on your ride"
    },
    "originalFare": 250,
    "discountAmount": 50,
    "finalFare": 200,
    "canApply": true
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Invalid coupon code"
}
```

---

### 2. Apply Coupon

Apply a coupon to a ride (typically called after ride creation).

**Endpoint:** `POST /api/coupons/apply`

**Request Body:**
```json
{
  "couponCode": "SAVE50",
  "userId": "507f1f77bcf86cd799439011",
  "rideId": "507f1f77bcf86cd799439012",
  "rideFare": 250
}
```

**Response:**
```json
{
  "success": true,
  "message": "Coupon applied successfully",
  "data": {
    "coupon": {
      "code": "SAVE50",
      "type": "fixed"
    },
    "originalFare": 250,
    "discountAmount": 50,
    "finalFare": 200
  }
}
```

**Note:** Coupons can also be applied automatically during ride creation by including `promoCode` in the ride request.

---

## Referral System

### Base URL
```
/api/users/:userId/referral
```

---

## User Endpoints

### 1. Get Referral Code

Get user's referral code and statistics.

**Endpoint:** `GET /api/users/:userId/referral`

**Response:**
```json
{
  "success": true,
  "data": {
    "referralCode": "ABC123XY",
    "totalReferrals": 5,
    "completedReferrals": 3,
    "referralRewardsEarned": 300
  }
}
```

---

### 2. Generate Referral Code

Generate a referral code for user (if doesn't exist).

**Endpoint:** `POST /api/users/:userId/referral/generate`

**Response:**
```json
{
  "success": true,
  "message": "Referral code generated successfully",
  "data": {
    "referralCode": "ABC123XY"
  }
}
```

---

### 3. Apply Referral Code

Apply a referral code when a new user signs up.

**Endpoint:** `POST /api/users/:userId/referral/apply`

**Request Body:**
```json
{
  "referralCode": "ABC123XY"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Referral code applied successfully. Complete your first ride to earn rewards!",
  "data": {
    "referral": {
      "id": "507f1f77bcf86cd799439011",
      "referrerName": "John Doe",
      "status": "PENDING"
    }
  }
}
```

**Error Responses:**
```json
{
  "success": false,
  "message": "Invalid referral code"
}
```

```json
{
  "success": false,
  "message": "You cannot use your own referral code"
}
```

---

### 4. Process Referral Reward

Process referral reward when referee completes first ride.

**Endpoint:** `POST /api/users/:userId/referral/process-reward`

**Request Body:**
```json
{
  "rideId": "507f1f77bcf86cd799439012"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Referral rewards processed successfully",
  "data": {
    "referrerReward": 100,
    "refereeReward": 50,
    "referralId": "507f1f77bcf86cd799439011"
  }
}
```

**Note:** This should be called automatically when a user completes their first ride after using a referral code.

---

### 5. Get Referral History

Get referral history for a user.

**Endpoint:** `GET /api/users/:userId/referral/history`

**Query Parameters:**
- `status` (string, optional) - Filter by status (PENDING, COMPLETED, REWARDED, CANCELLED)

**Response:**
```json
{
  "success": true,
  "data": {
    "referrals": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "referee": {
          "fullName": "Jane Doe",
          "email": "jane@example.com"
        },
        "status": "REWARDED",
        "reward": {
          "referrerReward": 100,
          "refereeReward": 50
        },
        "referredAt": "2024-01-15T10:00:00.000Z"
      }
    ],
    "statistics": {
      "total": 5,
      "pending": 1,
      "completed": 1,
      "rewarded": 3
    }
  }
}
```

---

## Integration Examples

### Apply Promo Code During Ride Creation

```javascript
// When creating a ride
const rideData = {
  riderId: userId,
  pickupLocation: { longitude: 77.2090, latitude: 28.6139 },
  dropoffLocation: { longitude: 77.1025, latitude: 28.5355 },
  service: 'sedan',
  promoCode: 'SAVE50', // Include promo code
  paymentMethod: 'WALLET',
  // ... other ride data
};

// The system will:
// 1. Calculate base fare
// 2. Validate and apply promo code
// 3. Calculate discount
// 4. Update final fare
// 5. Record coupon usage
```

### Validate Coupon Before Ride Creation

```javascript
// Validate coupon before creating ride
const validateResponse = await axios.post('/api/coupons/validate', {
  couponCode: 'SAVE50',
  userId: userId,
  rideFare: estimatedFare,
  service: 'sedan',
  rideType: 'normal'
});

if (validateResponse.data.success) {
  const { discountAmount, finalFare } = validateResponse.data.data;
  // Show discount to user
  // Proceed with ride creation
}
```

### Referral Flow

```javascript
// 1. New user signs up
const newUser = await createUser(userData);

// 2. User applies referral code
await axios.post(`/api/users/${newUser._id}/referral/apply`, {
  referralCode: 'ABC123XY'
});

// 3. User completes first ride
const ride = await createRide(rideData);
await completeRide(ride._id);

// 4. Process referral reward
await axios.post(`/api/users/${newUser._id}/referral/process-reward`, {
  rideId: ride._id
});

// Rewards are automatically credited to both referrer and referee wallets
```

### Get User's Referral Code

```javascript
// Get referral code to share
const response = await axios.get(`/api/users/${userId}/referral`);
const { referralCode } = response.data.data;

// Share referralCode with friends
console.log(`Use my referral code: ${referralCode}`);
```

---

## Discount Calculation Examples

### Example 1: Fixed Discount

**Coupon:** ₹50 off  
**Ride Fare:** ₹250  
**Calculation:**
```
discount = min(50, 250) = 50
finalFare = 250 - 50 = ₹200
```

### Example 2: Percentage Discount

**Coupon:** 10% off, max ₹30  
**Ride Fare:** ₹250  
**Calculation:**
```
discount = (250 * 10) / 100 = 25
discount = min(25, 30) = 25
finalFare = 250 - 25 = ₹225
```

### Example 3: Percentage with Max Cap

**Coupon:** 20% off, max ₹50  
**Ride Fare:** ₹400  
**Calculation:**
```
discount = (400 * 20) / 100 = 80
discount = min(80, 50) = 50 (capped at max)
finalFare = 400 - 50 = ₹350
```

### Example 4: Minimum Order Amount

**Coupon:** ₹50 off, min order ₹200  
**Ride Fare:** ₹150  
**Result:** Coupon cannot be applied (fare < min order)

---

## Reward System

### Referral Rewards

- **Referrer Reward:** ₹100 (credited when referee completes first ride)
- **Referee Reward:** ₹50 (credited when they complete first ride)

Rewards are automatically credited to wallet and tracked in wallet transactions.

---

## Error Handling

All endpoints follow consistent error response format:

```json
{
  "success": false,
  "message": "Error message describing what went wrong",
  "error": "Detailed error message (in development)"
}
```

### Common Error Messages

**Promo Codes:**
- "Invalid coupon code"
- "Coupon has expired"
- "Coupon usage limit reached"
- "You have reached the usage limit for this coupon"
- "Minimum order amount of ₹X required"
- "This coupon is not applicable for [service/ride type]"

**Referrals:**
- "Invalid referral code"
- "You cannot use your own referral code"
- "Referral code already applied"
- "No pending referral found"
- "Ride must be completed to process referral reward"

---

## Notes

1. **Promo Code Application:**
   - Promo codes can be applied during ride creation or after
   - Discount is calculated based on the calculated ride fare
   - Minimum order amount must be met
   - Service and ride type restrictions are checked

2. **Referral System:**
   - Referral codes are auto-generated (8 characters)
   - Rewards are processed automatically when referee completes first ride
   - Both referrer and referee receive wallet credits
   - Referral status tracks: PENDING → COMPLETED → REWARDED

3. **Integration:**
   - Promo codes are integrated into ride creation flow
   - Referral rewards are integrated with wallet system
   - All transactions are logged in wallet transaction history

---

**Last Updated:** January 2024  
**API Version:** 1.0.0

