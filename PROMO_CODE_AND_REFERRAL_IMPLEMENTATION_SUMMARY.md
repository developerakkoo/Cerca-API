# Promo Code & Referral System Implementation Summary

## Overview

A comprehensive Promo Code (Coupon) and Referral system has been implemented for the Cerca Taxi Booking Platform, integrated with the ride booking system and wallet.

## Implementation Date
January 2024

## Files Created

### 1. Models
- **`Models/Admin/coupon.modal.js`** (Enhanced)
  - Complete coupon model with usage tracking
  - Per-user usage limits
  - Expiry tracking
  - Service and ride type applicability
  - Usage history
  - Methods for validation and discount calculation

- **`Models/User/referral.model.js`** (New)
  - Referral tracking model
  - Referrer and referee relationships
  - Reward tracking
  - Status management (PENDING, COMPLETED, REWARDED)

### 2. Controllers
- **`Controllers/Coupons/coupon.controller.js`** (Enhanced)
  - 9 controller functions:
    - `addCoupon` - Create new coupon
    - `getAllCoupons` - Get all coupons with filtering
    - `getCouponById` - Get coupon by ID
    - `getCouponByCode` - Get coupon by code
    - `validateCoupon` - Validate coupon before applying
    - `applyCoupon` - Apply coupon to ride
    - `updateCoupon` - Update coupon
    - `deleteCoupon` - Delete coupon
    - `getCouponStatistics` - Get coupon usage statistics

- **`Controllers/User/referral.controller.js`** (New)
  - 5 controller functions:
    - `generateReferralCode` - Generate referral code for user
    - `getUserReferralCode` - Get user's referral code and stats
    - `applyReferralCode` - Apply referral code (new user signup)
    - `processReferralReward` - Process referral reward
    - `getReferralHistory` - Get referral history

### 3. Routes
- **`Routes/coupon.routes.js`** (Updated)
  - 9 RESTful API endpoints
  - Admin and user routes

- **`Routes/User/referral.routes.js`** (New)
  - 5 RESTful API endpoints

### 4. Documentation
- **`PROMO_CODE_AND_REFERRAL_API_DOCUMENTATION.md`**
  - Complete API documentation
  - Request/response examples
  - Integration guides
  - Discount calculation examples

## Features Implemented

### ✅ Promo Code System

1. **Coupon Management**
   - Create coupons with fixed or percentage discounts
   - Auto-generate coupon codes
   - Set usage limits (total and per-user)
   - Expiry date tracking
   - Active/inactive status

2. **Discount Calculation**
   - Integrated with ride fare calculation
   - Formula: `fare = service.price + (distance * perKmRate)`
   - Fixed discount: Direct amount deduction
   - Percentage discount: With optional max cap
   - Minimum order amount validation

3. **Validation & Application**
   - Validate coupon before applying
   - Check expiry dates
   - Check usage limits
   - Check service/ride type applicability
   - Per-user usage tracking

4. **Usage Tracking**
   - Track total usage count
   - Track per-user usage
   - Usage history with ride details
   - Statistics and analytics

### ✅ Referral System

1. **Referral Code Generation**
   - Auto-generate unique 8-character codes
   - One code per user
   - Code stored in user profile

2. **Referral Application**
   - New users can apply referral codes
   - Prevent self-referral
   - Track referral relationships
   - Status: PENDING → COMPLETED → REWARDED

3. **Automatic Reward Processing**
   - Rewards processed when referee completes first ride
   - Integrated with ride completion flow
   - Automatic wallet credit
   - Both referrer and referee get rewards

4. **Reward System**
   - Referrer: ₹100 (when referee completes first ride)
   - Referee: ₹50 (welcome bonus)
   - Rewards credited to wallet
   - Tracked in wallet transactions

## Integration Points

### Ride Creation Integration
- Promo codes can be included in ride creation request
- Discount calculated automatically
- Final fare updated with discount
- Coupon usage recorded

### Ride Completion Integration
- Referral rewards processed automatically
- Checks if user's first completed ride
- Credits both referrer and referee wallets
- Updates referral status

### Wallet Integration
- Referral rewards credited to wallet
- Wallet transactions created for rewards
- Balance updated automatically

## API Endpoints

### Promo Code Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/coupons` | Create coupon (Admin) |
| GET | `/api/coupons` | Get all coupons |
| GET | `/api/coupons/:id` | Get coupon by ID |
| GET | `/api/coupons/code/:code` | Get coupon by code |
| GET | `/api/coupons/:id/statistics` | Get coupon statistics |
| PUT | `/api/coupons/:id` | Update coupon |
| DELETE | `/api/coupons/:id` | Delete coupon |
| POST | `/api/coupons/validate` | Validate coupon |
| POST | `/api/coupons/apply` | Apply coupon to ride |

### Referral Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:userId/referral` | Get referral code |
| POST | `/api/users/:userId/referral/generate` | Generate referral code |
| POST | `/api/users/:userId/referral/apply` | Apply referral code |
| POST | `/api/users/:userId/referral/process-reward` | Process referral reward |
| GET | `/api/users/:userId/referral/history` | Get referral history |

## Discount Calculation

The discount calculation is based on your app's ride fare calculation:

**Base Fare Calculation:**
```
fare = service.price + (distance * perKmRate)
fare = max(fare, minimumFare)
```

**Discount Application:**
- **Fixed**: `discount = min(discountValue, fare)`
- **Percentage**: `discount = (fare * discountValue) / 100`, capped at `maxDiscountAmount`
- **Final Fare**: `finalFare = max(0, fare - discount)`

## Database Schema Updates

### User Model
Added fields:
- `referralCode` - User's unique referral code
- `referredBy` - User who referred this user
- `referralCodeUsed` - Referral code used by this user
- `totalReferrals` - Total referrals made
- `referralRewardsEarned` - Total rewards earned

### Coupon Model
Enhanced with:
- Usage tracking (total and per-user)
- Usage history
- Service/ride type applicability
- Validation methods
- Discount calculation methods

## Usage Examples

### Apply Promo Code During Ride Creation

```javascript
const rideData = {
  riderId: userId,
  pickupLocation: { longitude: 77.2090, latitude: 28.6139 },
  dropoffLocation: { longitude: 77.1025, latitude: 28.5355 },
  service: 'sedan',
  promoCode: 'SAVE50', // Include promo code
  paymentMethod: 'WALLET',
};

const ride = await createRide(rideData);
// Discount automatically applied, final fare calculated
```

### Referral Flow

```javascript
// 1. New user signs up
const newUser = await createUser(userData);

// 2. Apply referral code
await applyReferralCode(newUser._id, 'ABC123XY');

// 3. User completes first ride
const ride = await createRide(rideData);
await completeRide(ride._id);

// 4. Rewards automatically processed
// Referrer gets ₹100, Referee gets ₹50
```

## Testing Checklist

### Promo Code System
- [ ] Create coupon with fixed discount
- [ ] Create coupon with percentage discount
- [ ] Validate coupon before applying
- [ ] Apply coupon to ride
- [ ] Check usage limits
- [ ] Check expiry dates
- [ ] Check service/ride type restrictions
- [ ] Check minimum order amount
- [ ] Track usage history
- [ ] Get coupon statistics

### Referral System
- [ ] Generate referral code
- [ ] Get referral code
- [ ] Apply referral code (new user)
- [ ] Prevent self-referral
- [ ] Process referral reward (first ride)
- [ ] Check wallet credits
- [ ] Get referral history
- [ ] Track referral statistics

## Configuration

### Referral Rewards
Currently hardcoded in:
- `Controllers/User/referral.controller.js`
- `utils/socket.js`

**Default Values:**
- Referrer Reward: ₹100
- Referee Reward: ₹50

**Recommendation:** Move to Settings model for easy configuration.

## Next Steps

1. **Move Referral Rewards to Settings**
   - Add referral reward configuration to Settings model
   - Make rewards configurable by admin

2. **Enhanced Analytics**
   - Coupon performance analytics
   - Referral conversion rates
   - Reward distribution reports

3. **Notification Integration**
   - Notify users when referral code is used
   - Notify when rewards are credited
   - Promo code expiry reminders

4. **Admin Dashboard**
   - Coupon management UI
   - Referral statistics dashboard
   - Reward distribution management

## Files Modified

- **`Models/User/user.model.js`** - Added referral fields
- **`utils/ride_booking_functions.js`** - Integrated promo code application
- **`utils/socket.js`** - Added automatic referral reward processing
- **`index.js`** - Added referral routes

## Notes

1. **Promo Code Application:**
   - Can be applied during ride creation or after
   - Discount calculated based on calculated fare
   - Minimum order amount must be met
   - Service and ride type restrictions checked

2. **Referral System:**
   - Automatic reward processing on first ride completion
   - Rewards credited to wallet automatically
   - Both referrer and referee tracked
   - Status progression: PENDING → COMPLETED → REWARDED

3. **Integration:**
   - Fully integrated with ride booking system
   - Integrated with wallet system
   - All transactions logged

---

**Status:** ✅ Complete and Ready for Testing  
**Version:** 1.0.0  
**Last Updated:** January 2024

