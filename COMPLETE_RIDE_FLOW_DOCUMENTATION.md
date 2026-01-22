# Complete Ride Flow Documentation

## Table of Contents
1. [Overview](#overview)
2. [Ride Status Lifecycle](#ride-status-lifecycle)
3. [Complete Ride Flow: Start to End](#complete-ride-flow-start-to-end)
4. [Payment Flow](#payment-flow)
5. [Cancellation Scenarios](#cancellation-scenarios)
6. [Refund Processing](#refund-processing)
7. [Socket Events Reference](#socket-events-reference)
8. [Driver Matching & Discovery](#driver-matching--discovery)
9. [Edge Cases & Error Handling](#edge-cases--error-handling)
10. [Missing Features & Recommendations](#missing-features--recommendations)

---

## Overview

This document provides a comprehensive guide to the complete ride flow in the Cerca ride-sharing platform, from ride creation to completion, including all cancellation scenarios and refund processing.

### Key Components
- **Rider App**: Requests rides, tracks driver, completes payment
- **Driver App**: Receives requests, accepts rides, navigates, completes rides
- **Backend**: Manages ride state, driver matching, real-time updates, payment processing
- **Workers**: Auto-cancellation worker, ride booking worker

---

## Ride Status Lifecycle

### Status Flow Diagram

```
requested → accepted → arrived → in_progress → completed
     ↓           ↓         ↓           ↓
  cancelled  cancelled  cancelled  cancelled
```

### Status Definitions

| Status | Description | Who Can See | Next Possible Statuses | Payment Status |
|--------|-------------|-------------|------------------------|----------------|
| `requested` | Ride created, searching for drivers | Rider, Available Drivers | `accepted`, `cancelled` | `pending` |
| `accepted` | Driver accepted the ride | Rider, Assigned Driver | `arrived`, `cancelled` | `pending` |
| `arrived` | Driver arrived at pickup location | Rider, Assigned Driver | `in_progress`, `cancelled` | `pending` |
| `in_progress` | Ride has started, en route | Rider, Assigned Driver | `completed`, `cancelled` | `pending` |
| `completed` | Ride finished successfully | Rider, Assigned Driver | (final state) | `completed`/`failed` |
| `cancelled` | Ride cancelled by rider/driver/system | Rider, Driver (if assigned) | (final state) | `pending`/`refunded` |

### Status Transition Rules

- **requested → accepted**: Driver accepts ride (atomic operation)
- **accepted → arrived**: Driver marks as arrived at pickup
- **arrived → in_progress**: Start OTP verified, ride starts
- **in_progress → completed**: Stop OTP verified, ride ends, payment processed
- **Any → cancelled**: Cancellation by rider/driver/system

---

## Complete Ride Flow: Start to End

### Phase 1: Ride Request (Rider App)

#### Step 1.1: User Selects Pickup & Dropoff
- User selects pickup location on map
- User selects dropoff location
- System calculates distance using Haversine formula
- System calculates fare: `basePrice + (distance * perKmRate)`, minimum fare applied
- User selects vehicle type (sedan/suv/auto)
- User selects payment method (CASH/RAZORPAY/WALLET)
- Optional: User applies promo code

#### Step 1.2: Payment Processing (Pre-Ride)

**CASH Payment:**
- No payment processing before ride
- Payment happens after ride completion

**RAZORPAY Payment:**
- Frontend processes payment via Razorpay SDK
- Payment verified on backend before ride creation
- Payment ID stored in ride document

**WALLET Payment:**
- Frontend validates balance is sufficient (no deduction yet)
- Balance must be >= ride fare
- Actual deduction happens at ride completion

**Hybrid Payment (RAZORPAY + WALLET):**
- Wallet portion deducted immediately during ride creation
- Razorpay portion processed before ride creation
- Both transactions linked to ride

#### Step 1.3: Emit Ride Request

**Socket Event:** `newRideRequest`

```javascript
{
  rider: userId,
  riderId: userId,
  userSocketId: socket.id,
  pickupLocation: {
    type: 'Point',
    coordinates: [longitude, latitude]
  },
  dropoffLocation: {
    type: 'Point',
    coordinates: [longitude, latitude]
  },
  pickupAddress: 'Full address string',
  dropoffAddress: 'Full address string',
  service: 'sedan' | 'suv' | 'auto',
  fare: calculatedFare,
  distanceInKm: calculatedDistance,
  paymentMethod: 'CASH' | 'RAZORPAY' | 'WALLET',
  razorpayPaymentId: paymentId, // if RAZORPAY
  walletAmountUsed: amount, // if hybrid
  razorpayAmountPaid: amount, // if hybrid
  promoCode: 'PROMO123', // optional
  bookingType: 'INSTANT' | 'FULL_DAY' | 'RENTAL' | 'DATE_WISE',
  bookingMeta: { /* optional */ }
}
```

#### Step 1.4: Backend Processing

1. **Validation:**
   - Check for duplicate active rides
   - Validate locations
   - Verify payment (if RAZORPAY)
   - Validate service type

2. **Ride Creation:**
   - Create ride document with status `requested`
   - Generate start OTP and stop OTP (4-digit codes)
   - Apply promo code discount if valid
   - Store payment method and details

3. **Queue for Driver Discovery:**
   - Add ride to booking queue
   - Worker processes ride asynchronously

4. **Response:**
   - Emit `rideRequested` to rider with ride details

### Phase 2: Driver Discovery

#### Step 2.1: Driver Search (Worker Process)

**Worker:** `rideBooking.worker.js` → `processRideJob()`

1. **Progressive Radius Search:**
   - Start with 3km radius
   - Expand to 6km, 9km, 12km, 15km, 20km if no drivers found
   - Filter drivers by:
     - `isActive: true`
     - `isBusy: false` (for INSTANT rides)
     - `isOnline: true`
     - `socketId` exists (connected)

2. **Driver Notification:**
   - Emit `newRideRequest` to each available driver
   - Track notified drivers in `notifiedDrivers` array
   - Create notifications for drivers

#### Step 2.2: Driver Response

**Driver Accepts:**
- Socket Event: `rideAccepted`
- Atomic assignment: Only one driver can accept
- Status changes: `requested` → `accepted`
- Driver marked as busy (for INSTANT rides)
- Emit `rideAccepted` to rider and driver
- Other notified drivers receive `rideNoLongerAvailable`

**Driver Rejects:**
- Socket Event: `rideRejected`
- Driver added to `rejectedDrivers` array
- Driver marked as available
- If all notified drivers reject:
  - Retry search with larger radius (15km, 20km, 25km)
  - If still no drivers: Cancel ride

**No Drivers Found:**
- Worker cancels ride immediately
- Reason: `NO_DRIVERS_FOUND`
- Emit `noDriverFound` and `rideCancelled` to rider

### Phase 3: Driver En Route

#### Step 3.1: Driver Location Updates

**Socket Event:** `driverLocationUpdate`

- Driver sends location updates periodically
- Broadcasted to rider via `ride_${rideId}` room
- Rider app displays driver location on map
- Calculates ETA to pickup

#### Step 3.2: Driver Arrives

**Socket Event:** `driverArrived`

- Driver marks arrival at pickup location
- Status changes: `accepted` → `arrived`
- Rider receives `driverArrived` event
- Rider app displays START OTP
- Notification sent to rider

### Phase 4: Ride Start

#### Step 4.1: OTP Verification

**Socket Event:** `verifyStartOtp` or `rideStarted` (with OTP)

- Driver enters START OTP
- Backend verifies OTP matches ride's `startOtp`
- OTP must be verified when status is `accepted` or `arrived`

#### Step 4.2: Ride Begins

**Socket Event:** `rideStarted`

- Status changes: `arrived` → `in_progress`
- `actualStartTime` recorded
- Driver marked as busy
- Emit `rideStarted` to rider and driver
- Rider app displays STOP OTP

### Phase 5: Ride in Progress

#### Step 5.1: Location Tracking

**Socket Event:** `rideLocationUpdate`

- Driver sends location updates during ride
- Rider tracks ride progress on map
- Distance and ETA to dropoff calculated

#### Step 5.2: Ride Completion

**Socket Event:** `rideCompleted` (with OTP)

1. **OTP Verification:**
   - Driver enters STOP OTP
   - Backend verifies OTP matches ride's `stopOtp`

2. **Complete Ride:**
   - Status changes: `in_progress` → `completed`
   - `actualEndTime` recorded
   - `actualDuration` calculated
   - Driver marked as available

3. **Payment Processing:**
   - **CASH:** Payment status remains `pending` (handled offline)
   - **RAZORPAY:** Already processed, mark as `completed`
   - **WALLET:** Deduct from wallet, create transaction, mark as `completed`
   - **Hybrid:** Wallet already deducted, Razorpay already processed

4. **Post-Completion:**
   - Store driver earnings
   - Assign gifts (first ride, loyalty rewards)
   - Process referral rewards
   - Emit `rideCompleted` to rider and driver
   - Create notifications

5. **Rating:**
   - Rider and driver can rate each other
   - Ratings stored and average calculated

---

## Payment Flow

### Payment Methods

#### 1. CASH Payment

**Flow:**
- No payment processing before or during ride
- Payment happens offline after ride completion
- Payment status: `pending` → manually updated by admin

**When Payment Happens:**
- After ride completion
- Driver collects cash from rider
- Admin marks payment as `completed` (optional)

#### 2. RAZORPAY Payment

**Flow:**
1. **Before Ride Creation:**
   - Frontend processes payment via Razorpay SDK
   - Payment ID received
   - Payment verified on backend before ride creation
   - Payment status: `completed`

2. **If Ride Cancelled:**
   - Payment already processed
   - Refund handled by Razorpay (manual process)
   - No automatic refund in system

#### 3. WALLET Payment

**Flow:**
1. **Before Ride Creation:**
   - Frontend validates balance >= fare
   - No deduction yet
   - Ride created with `paymentMethod: 'WALLET'`

2. **At Ride Completion:**
   - Check wallet balance
   - If sufficient: Deduct fare, create `RIDE_PAYMENT` transaction
   - If insufficient: Mark payment as `failed`
   - Update ride `paymentStatus`

3. **If Ride Cancelled:**
   - No deduction happened (payment at completion)
   - No refund needed

#### 4. Hybrid Payment (RAZORPAY + WALLET)

**Flow:**
1. **Before Ride Creation:**
   - Wallet portion deducted immediately
   - Razorpay portion processed
   - Both transactions linked to ride

2. **At Ride Completion:**
   - Payment already complete
   - Mark as `completed`

3. **If Ride Cancelled:**
   - Wallet portion: Refund processed (if applicable)
   - Razorpay portion: Manual refund via Razorpay

### Payment Status Values

- `pending`: Payment not yet processed (CASH, or WALLET before completion)
- `completed`: Payment successfully processed
- `failed`: Payment failed (insufficient balance, etc.)
- `refunded`: Payment refunded (for cancelled rides)

---

## Cancellation Scenarios

### Scenario 1: User Cancels Before Driver Accepts

**Trigger:** Rider cancels ride while status is `requested`

**Process:**
1. Socket Event: `rideCancelled` with `cancelledBy: 'rider'`
2. Status changes: `requested` → `cancelled`
3. `cancellationReason` stored
4. No driver assigned, no cleanup needed
5. Emit `rideCancelled` to rider

**Payment Impact:**
- **CASH:** No payment, no refund
- **RAZORPAY:** Payment already processed, manual refund needed
- **WALLET:** No deduction yet, no refund needed
- **Hybrid:** Wallet portion refunded (if deducted), Razorpay manual refund

**Cancellation Fee:** ₹0 (no driver assigned)

### Scenario 2: User Cancels After Driver Accepts

**Trigger:** Rider cancels ride while status is `accepted` or `arrived`

**Process:**
1. Socket Event: `rideCancelled` with `cancelledBy: 'rider'`
2. Status changes: `accepted`/`arrived` → `cancelled`
3. Driver freed up (`isBusy: false`)
4. Emit `rideCancelled` to rider and driver
5. Notifications sent

**Payment Impact:**
- **CASH:** No payment, no refund
- **RAZORPAY:** Payment already processed, manual refund needed
- **WALLET:** No deduction yet, no refund needed
- **Hybrid:** Wallet portion refunded (if deducted), Razorpay manual refund

**Cancellation Fee:** ₹50 (default, configurable) - Only for WALLET payments that were deducted

### Scenario 3: No Driver Found

**Trigger:** Worker finds no drivers within search radius

**Process:**
1. Worker cancels ride immediately
2. Status changes: `requested` → `cancelled`
3. `cancelledBy: 'system'`
4. `cancellationReason: 'NO_DRIVERS_FOUND'`
5. Emit `noDriverFound` and `rideCancelled` to rider
6. Notification sent

**Payment Impact:**
- **CASH:** No payment, no refund
- **RAZORPAY:** Payment already processed, manual refund needed
- **WALLET:** No deduction yet, no refund needed
- **Hybrid:** Wallet portion refunded (if deducted), Razorpay manual refund

**Cancellation Fee:** ₹0 (system cancellation)

### Scenario 4: All Drivers Reject

**Trigger:** All notified drivers reject the ride

**Process:**
1. Worker retries search with larger radius (15km, 20km, 25km)
2. If still no drivers: Cancel ride
3. Status changes: `requested` → `cancelled`
4. `cancelledBy: 'system'`
5. `cancellationReason: 'ALL_DRIVERS_REJECTED'`
6. Emit `noDriverFound` and `rideCancelled` to rider
7. Notification sent

**Payment Impact:**
- Same as Scenario 3

**Cancellation Fee:** ₹0 (system cancellation)

### Scenario 5: Auto-Cancellation Timeout

**Trigger:** Ride in `requested` status for > 5 minutes (configurable)

**Process:**
1. Auto-cancellation worker checks every 2 minutes
2. Finds rides older than timeout threshold
3. Cancels ride via `cancelRide()`
4. Status changes: `requested` → `cancelled`
5. `cancelledBy: 'system'`
6. `cancellationReason: 'NO_DRIVER_ACCEPTED_TIMEOUT'`
7. Emit `noDriverFound`, `rideError`, and `rideCancelled` to rider
8. Notification sent

**Payment Impact:**
- Same as Scenario 3

**Cancellation Fee:** ₹0 (system cancellation)

### Scenario 6: Driver Cancels (if allowed)

**Note:** Currently not implemented in codebase

**If Implemented:**
- Driver cancels after accepting
- Status changes: `accepted`/`arrived` → `cancelled`
- `cancelledBy: 'driver'`
- Driver freed up
- Rider notified

**Payment Impact:**
- Same as Scenario 2, but no cancellation fee (driver's fault)

**Cancellation Fee:** ₹0 (driver's fault)

---

## Refund Processing

### When Refunds Are Processed

Refunds are **only processed for WALLET payments** that were deducted before cancellation.

**Current Implementation:**
- WALLET payments are deducted at ride completion (not before)
- Therefore, cancelled rides don't need refunds (no deduction happened)
- Refund logic exists as safety net for edge cases

### Refund Logic (`processWalletRefund`)

**Triggered By:**
- `cancelRide()` function calls `processWalletRefund()` automatically
- Only processes if `paymentMethod === 'WALLET'`

**Process:**

1. **Check Payment Method:**
   - Skip if not WALLET payment

2. **Check Already Refunded:**
   - Skip if `paymentStatus === 'refunded'`
   - Skip if refund transaction already exists

3. **Find Payment Transaction:**
   - Look for `RIDE_PAYMENT` transaction with `relatedRide: rideId`
   - If not found, skip (payment wasn't deducted)

4. **Calculate Cancellation Fee:**
   - **No Fee Scenarios:**
     - Ride status was `requested` (no driver assigned)
     - Cancelled by system
     - Cancellation reason: `NO_DRIVER_FOUND`, `NO_DRIVER_ACCEPTED_TIMEOUT`, `ALL_DRIVERS_REJECTED`
   - **Fee Applies:**
     - Ride status was `accepted` or `arrived` (driver assigned)
     - Cancelled by rider
     - Not a system cancellation reason
   - Default fee: ₹50 (configurable in admin settings)

5. **Calculate Refund Amount:**
   - `refundAmount = Math.max(0, fare - cancellationFee)`
   - If refundAmount = 0, skip transaction creation but update ride

6. **Create Refund Transaction:**
   - Transaction type: `REFUND`
   - Amount: refundAmount
   - Linked to ride
   - Status: `COMPLETED`

7. **Update Wallet Balance:**
   - Add refundAmount to user's wallet balance

8. **Update Ride:**
   - `refundAmount`: refund amount
   - `cancellationFee`: fee deducted
   - `paymentStatus`: `refunded`

### Refund Scenarios Summary

| Scenario | Ride Status | Cancelled By | Cancellation Fee | Refund Amount |
|----------|-------------|--------------|------------------|---------------|
| User cancels before driver accepts | `requested` | `rider` | ₹0 | Full fare (if deducted) |
| User cancels after driver accepts | `accepted`/`arrived` | `rider` | ₹50 | Fare - ₹50 (if deducted) |
| No driver found | `requested` | `system` | ₹0 | Full fare (if deducted) |
| All drivers reject | `requested` | `system` | ₹0 | Full fare (if deducted) |
| Auto-cancellation timeout | `requested` | `system` | ₹0 | Full fare (if deducted) |
| Driver cancels | `accepted`/`arrived` | `driver` | ₹0 | Full fare (if deducted) |

**Note:** Since WALLET payments are now deducted at completion, most cancelled rides won't have deductions to refund.

---

## Socket Events Reference

### Rider Events (Client → Server)

| Event | Data | Description |
|-------|------|-------------|
| `riderConnect` | `{ userId }` | Rider connects to socket |
| `newRideRequest` | `{ rideData }` | Request a new ride |
| `rideCancelled` | `{ rideId, cancelledBy, reason }` | Cancel a ride |
| `verifyStartOtp` | `{ rideId, otp }` | Verify start OTP (optional) |
| `submitRating` | `{ rideId, rating, review, ... }` | Submit rating after ride |

### Rider Events (Server → Client)

| Event | Data | Description |
|-------|------|-------------|
| `rideRequested` | `Ride object` | Ride created successfully |
| `rideAccepted` | `Ride object` | Driver accepted ride |
| `driverArrived` | `Ride object` | Driver arrived at pickup |
| `rideStarted` | `Ride object` | Ride started |
| `rideLocationUpdate` | `{ location, ... }` | Driver location update |
| `rideCompleted` | `Ride object` | Ride completed |
| `rideCancelled` | `Ride object` | Ride cancelled |
| `noDriverFound` | `{ rideId, message }` | No drivers available |
| `rideError` | `{ message, code }` | Error occurred |

### Driver Events (Client → Server)

| Event | Data | Description |
|-------|------|-------------|
| `driverConnect` | `{ driverId }` | Driver connects to socket |
| `driverToggleStatus` | `{ driverId, isActive }` | Toggle online/offline |
| `driverLocationUpdate` | `{ location, rideId? }` | Update driver location |
| `rideAccepted` | `{ rideId, driverId }` | Accept a ride |
| `rideRejected` | `{ rideId, driverId }` | Reject a ride |
| `driverArrived` | `{ rideId }` | Mark as arrived |
| `rideStarted` | `{ rideId, otp? }` | Start ride |
| `rideLocationUpdate` | `{ rideId, location }` | Update location during ride |
| `rideCompleted` | `{ rideId, fare, otp? }` | Complete ride |

### Driver Events (Server → Client)

| Event | Data | Description |
|-------|------|-------------|
| `newRideRequest` | `Ride object` | New ride available |
| `rideAssigned` | `Ride object` | Ride assigned to driver |
| `rideNoLongerAvailable` | `{ rideId }` | Ride taken by another driver |
| `driverArrived` | `Ride object` | Arrival confirmed |
| `rideStarted` | `Ride object` | Ride start confirmed |
| `rideCompleted` | `Ride object` | Ride completion confirmed |
| `rideCancelled` | `{ ride, reason }` | Ride cancelled |
| `rideError` | `{ message, code }` | Error occurred |

---

## Driver Matching & Discovery

### Search Algorithm

**Progressive Radius Expansion:**
1. Start with 3km radius
2. If no drivers: Expand to 6km
3. Continue: 9km, 12km, 15km, 20km
4. Stop when drivers found or max radius reached

**Driver Filters:**
- `isActive: true` (driver is active)
- `isBusy: false` (for INSTANT rides)
- `isOnline: true` (driver is online)
- `socketId` exists (driver connected)

**Special Cases:**
- **FULL_DAY/RENTAL bookings:** Can include busy drivers if `busyUntil` is in future
- **DATE_WISE bookings:** Check for date conflicts

### Retry Logic

**When All Drivers Reject:**
1. Retry search with larger radius (15km, 20km, 25km)
2. Exclude already rejected drivers
3. If still no drivers: Cancel ride

### Atomic Operations

**Driver Acceptance:**
- Uses `findOneAndUpdate` with conditions
- Ensures only one driver can accept
- Prevents race conditions

**Status Checks:**
- Multiple atomic checks before operations
- Prevents processing cancelled/accepted rides

---

## Edge Cases & Error Handling

### Duplicate Ride Prevention

**Checks:**
- Before ride creation: Check for active rides
- Before driver notification: Verify ride status
- Before cancellation: Verify ride exists and status

### Socket Reconnection

**Rider Reconnection:**
- Auto-join active ride rooms
- Update socketId in database
- Clear old socketId

**Driver Reconnection:**
- Auto-join active ride rooms
- Validate driver status
- Update socketId

### Payment Edge Cases

**Insufficient Wallet Balance at Completion:**
- Mark payment as `failed`
- Allow ride to complete
- Admin can handle payment separately

**Payment Verification Failure:**
- Reject ride creation
- Emit error to rider

**Hybrid Payment Partial Failure:**
- Wallet portion succeeds, Razorpay fails: Ride created, payment status `partial`
- Wallet portion fails, Razorpay succeeds: Ride created, payment status `partial`

### Driver Status Edge Cases

**Driver Busy State:**
- Validated on connection
- Fixed if inconsistent
- Reset on ride completion/cancellation

**Multiple Rides:**
- Driver can have multiple scheduled rides (FULL_DAY/RENTAL)
- `isBusy` only true for INSTANT rides

---

## Missing Features & Recommendations

### Currently Missing

1. **Driver Cancellation:**
   - No driver-initiated cancellation flow
   - Should allow drivers to cancel with valid reasons
   - Should notify rider and handle refunds

2. **Razorpay Refund Integration:**
   - No automatic Razorpay refunds
   - Manual process required
   - Should integrate Razorpay refund API

3. **Payment Retry Logic:**
   - No retry for failed wallet payments
   - Should allow retry or alternative payment

4. **Ride Modification:**
   - No ability to modify ride after creation
   - Should allow pickup/dropoff changes before driver accepts

5. **Scheduled Rides:**
   - Booking types exist but scheduling logic incomplete
   - Should have worker to start scheduled rides

6. **Driver Rating Impact:**
   - No impact on driver matching based on ratings
   - Should prioritize higher-rated drivers

7. **Surge Pricing:**
   - No dynamic pricing based on demand
   - Should implement surge pricing logic

8. **Ride History:**
   - No comprehensive ride history API
   - Should provide detailed history with filters

### Recommendations

1. **Implement Driver Cancellation:**
   ```javascript
   // Add to socket.js
   socket.on('driverCancelsRide', async (data) => {
     // Cancel ride with cancelledBy: 'driver'
     // No cancellation fee
     // Notify rider
     // Free up driver
   })
   ```

2. **Add Razorpay Refund API:**
   ```javascript
   // Create refund controller
   async function processRazorpayRefund(rideId, amount) {
     // Call Razorpay refund API
     // Update ride payment status
     // Create refund transaction
   }
   ```

3. **Add Payment Retry:**
   ```javascript
   // Allow retry for failed wallet payments
   socket.on('retryWalletPayment', async (data) => {
     // Check balance
     // Deduct if sufficient
     // Update payment status
   })
   ```

4. **Add Ride Modification:**
   ```javascript
   // Allow modification before driver accepts
   socket.on('modifyRide', async (data) => {
     // Check ride status
     // Update locations/fare
     // Recalculate if needed
   })
   ```

5. **Complete Scheduled Rides:**
   - Add worker to check scheduled rides
   - Auto-start rides at scheduled time
   - Notify driver and rider

6. **Add Rating-Based Matching:**
   - Sort drivers by rating
   - Prioritize higher-rated drivers
   - Consider driver's recent performance

7. **Implement Surge Pricing:**
   - Calculate demand in area
   - Apply multiplier to fare
   - Show surge indicator to users

8. **Add Comprehensive History:**
   - Create ride history endpoint
   - Filter by date, status, payment method
   - Include statistics and analytics

---

## Conclusion

This document provides a complete overview of the ride flow in the Cerca platform. The system handles ride creation, driver matching, ride execution, payment processing, and cancellation scenarios comprehensively. The main areas for improvement are driver cancellation, Razorpay refund integration, and scheduled ride completion.

For questions or clarifications, refer to the codebase or contact the development team.

