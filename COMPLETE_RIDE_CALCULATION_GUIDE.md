# Complete Ride Booking Calculation Guide

## Table of Contents
1. [Overview](#overview)
2. [Base Fare Calculation](#base-fare-calculation)
3. [Promo Code/Discount Calculation](#promo-codediscount-calculation)
4. [Final Fare Calculation](#final-fare-calculation)
5. [Platform Fee & Driver Commission](#platform-fee--driver-commission)
6. [Cancellation Fee Calculation](#cancellation-fee-calculation)
7. [Refund Calculation](#refund-calculation)
8. [Special Booking Types](#special-booking-types)
9. [Complete Examples](#complete-examples)
10. [Admin Settings Reference](#admin-settings-reference)

---

## Overview

This document provides a complete guide to all calculations involved in ride booking, from initial fare calculation to platform fees, driver commissions, cancellations, and refunds.

### Calculation Flow Diagram

```
1. Base Fare = Service Price + (Distance × Per Km Rate)
2. Apply Minimum Fare = MAX(Base Fare, Minimum Fare)
3. Apply Promo Code Discount (if applicable)
4. Final Fare = Fare After Discount
5. Platform Fee = Final Fare × (Platform Fee % / 100)
6. Driver Earning = Final Fare × (Driver Commission % / 100)
```

---

## Base Fare Calculation

### Formula

```
Base Fare = Service Base Price + (Distance in Km × Per Km Rate)
Final Base Fare = MAX(Base Fare, Minimum Fare)
```

### Step-by-Step

1. **Get Admin Settings:**
   - `perKmRate`: Rate per kilometer (e.g., ₹15/km)
   - `minimumFare`: Minimum fare guarantee (e.g., ₹50)
   - `service.price`: Base price for selected service (e.g., ₹299 for "Cerca Small")

2. **Calculate Distance:**
   - Distance calculated using Haversine formula between pickup and dropoff coordinates
   - Distance in kilometers (km)

3. **Calculate Base Fare:**
   ```javascript
   baseFare = service.price + (distanceInKm × perKmRate)
   ```

4. **Apply Minimum Fare:**
   ```javascript
   finalBaseFare = Math.max(baseFare, minimumFare)
   ```

5. **Round to 2 Decimal Places:**
   ```javascript
   finalBaseFare = Math.round(finalBaseFare * 100) / 100
   ```

### Example

**Settings:**
- Service: "Cerca Small"
- Service Price: ₹299
- Per Km Rate: ₹15/km
- Minimum Fare: ₹50

**Ride Details:**
- Distance: 10 km

**Calculation:**
```
Step 1: Base Fare = ₹299 + (10 km × ₹15/km) = ₹299 + ₹150 = ₹449
Step 2: Final Base Fare = MAX(₹449, ₹50) = ₹449
Step 3: Rounded = ₹449.00
```

**Short Distance Example (2 km):**
```
Step 1: Base Fare = ₹299 + (2 km × ₹15/km) = ₹299 + ₹30 = ₹329
Step 2: Final Base Fare = MAX(₹329, ₹50) = ₹329
Step 3: Rounded = ₹329.00
```

**Very Short Distance Example (0.5 km):**
```
Step 1: Base Fare = ₹299 + (0.5 km × ₹15/km) = ₹299 + ₹7.5 = ₹306.5
Step 2: Final Base Fare = MAX(₹306.5, ₹50) = ₹306.5
Step 3: Rounded = ₹306.50
```

---

## Promo Code/Discount Calculation

### Discount Types

1. **Fixed Discount**: Direct amount deduction (e.g., ₹50 off)
2. **Percentage Discount**: Percentage of fare (e.g., 10% off, with optional max cap)
3. **New User Discount**: Special discount for new users (fixed amount)

### Formula

```
IF promoCode provided AND valid:
  IF type === 'fixed':
    discount = MIN(discountValue, fare)
  ELSE IF type === 'percentage':
    discount = (fare × discountValue) / 100
    IF maxDiscountAmount exists:
      discount = MIN(discount, maxDiscountAmount)
    discount = MIN(discount, fare) // Can't discount more than fare
  ELSE IF type === 'new_user':
    discount = MIN(discountValue, fare)
  
  discount = ROUND(discount, 2)
  finalFare = MAX(0, fare - discount)
ELSE:
  finalFare = fare
```

### Validation Rules

1. **Minimum Order Amount:**
   - If `fare < minOrderAmount`, discount = 0

2. **Coupon Validity:**
   - Coupon must be active (`isActive === true`)
   - Current date must be between `startDate` and `validUntil`
   - Usage count must be less than `maxUsage` (if set)
   - User usage count must be less than `maxUsagePerUser`

3. **Service Applicability:**
   - If `applicableServices` is set, service must be in the list
   - If `applicableRideTypes` is set, ride type must be in the list

### Example 1: Fixed Discount

**Coupon:**
- Type: `fixed`
- Discount Value: ₹50
- Min Order Amount: ₹100

**Ride Fare:** ₹449

**Calculation:**
```
Step 1: Check min order: ₹449 >= ₹100 ✓
Step 2: Discount = MIN(₹50, ₹449) = ₹50
Step 3: Final Fare = MAX(0, ₹449 - ₹50) = ₹399
```

### Example 2: Percentage Discount (No Cap)

**Coupon:**
- Type: `percentage`
- Discount Value: 10%
- Min Order Amount: ₹100

**Ride Fare:** ₹449

**Calculation:**
```
Step 1: Check min order: ₹449 >= ₹100 ✓
Step 2: Discount = (₹449 × 10) / 100 = ₹44.9
Step 3: Discount = MIN(₹44.9, ₹449) = ₹44.9
Step 4: Rounded = ₹44.90
Step 5: Final Fare = MAX(0, ₹449 - ₹44.90) = ₹404.10
```

### Example 3: Percentage Discount (With Max Cap)

**Coupon:**
- Type: `percentage`
- Discount Value: 20%
- Max Discount Amount: ₹100
- Min Order Amount: ₹100

**Ride Fare:** ₹800

**Calculation:**
```
Step 1: Check min order: ₹800 >= ₹100 ✓
Step 2: Discount = (₹800 × 20) / 100 = ₹160
Step 3: Discount = MIN(₹160, ₹100) = ₹100 (capped at max)
Step 4: Discount = MIN(₹100, ₹800) = ₹100
Step 5: Rounded = ₹100.00
Step 6: Final Fare = MAX(0, ₹800 - ₹100) = ₹700
```

### Example 4: Discount Exceeds Fare

**Coupon:**
- Type: `fixed`
- Discount Value: ₹500

**Ride Fare:** ₹449

**Calculation:**
```
Step 1: Discount = MIN(₹500, ₹449) = ₹449 (can't exceed fare)
Step 2: Final Fare = MAX(0, ₹449 - ₹449) = ₹0
```

---

## Final Fare Calculation

### Complete Formula

```
1. Base Fare = Service Price + (Distance × Per Km Rate)
2. Base Fare = MAX(Base Fare, Minimum Fare)
3. IF Promo Code Valid:
     Apply Discount
   Final Fare = Base Fare - Discount
4. Final Fare = MAX(0, Final Fare)
5. Final Fare = ROUND(Final Fare, 2)
```

### Example: Complete Calculation

**Settings:**
- Service: "Cerca Small" (₹299)
- Per Km Rate: ₹15/km
- Minimum Fare: ₹50

**Ride Details:**
- Distance: 10 km
- Promo Code: "SAVE50" (₹50 fixed discount, min ₹100)

**Calculation:**
```
Step 1: Base Fare = ₹299 + (10 × ₹15) = ₹299 + ₹150 = ₹449
Step 2: Apply Minimum = MAX(₹449, ₹50) = ₹449
Step 3: Check Promo = ₹449 >= ₹100 ✓
Step 4: Discount = MIN(₹50, ₹449) = ₹50
Step 5: Final Fare = MAX(0, ₹449 - ₹50) = ₹399
Step 6: Rounded = ₹399.00
```

---

## Platform Fee & Driver Commission

### Formula

```
Gross Fare = Final Ride Fare (what rider pays)

Platform Fee = Gross Fare × (platformFees / 100)
Driver Earning = Gross Fare × (driverCommissions / 100)

Platform Fee = ROUND(Platform Fee, 2)
Driver Earning = ROUND(Driver Earning, 2)
```

### Important Notes

- Both `platformFees` and `driverCommissions` are percentages (0-100)
- Platform fee and driver commission are calculated from the **final fare** (after discounts)
- Earnings are only calculated for rides with `status: 'completed'`
- Each completed ride creates an `AdminEarnings` record

### Example

**Settings:**
- Platform Fees: 20%
- Driver Commission: 80%

**Ride Details:**
- Final Fare: ₹399 (after ₹50 discount)

**Calculation:**
```
Step 1: Gross Fare = ₹399
Step 2: Platform Fee = ₹399 × (20/100) = ₹399 × 0.20 = ₹79.8
Step 3: Driver Earning = ₹399 × (80/100) = ₹399 × 0.80 = ₹319.2
Step 4: Platform Fee Rounded = ₹79.80
Step 5: Driver Earning Rounded = ₹319.20

Verification: ₹79.80 + ₹319.20 = ₹399 ✓
```

### Multiple Rides Example

**10 Completed Rides @ ₹399 each:**

```
Total Gross Earnings = 10 × ₹399 = ₹3,990

Total Platform Fees = ₹3,990 × 20% = ₹798
Total Driver Earnings = ₹3,990 × 80% = ₹3,192

Average Gross Per Ride = ₹3,990 / 10 = ₹399
Average Net Per Ride = ₹3,192 / 10 = ₹319.20
```

---

## Cancellation Fee Calculation

### When Cancellation Fee Applies

Cancellation fee applies when:
- Ride status was `accepted` or `in_progress` (driver already assigned)
- Cancelled by rider (not driver or system)
- Payment method is `WALLET` (for refund calculation)

### Formula

```
Cancellation Fee = settings.pricingConfigurations.cancellationFees
Default: ₹50 (if not configured)
```

### Example

**Settings:**
- Cancellation Fees: ₹50

**Ride Details:**
- Final Fare: ₹399
- Status: `accepted` (driver assigned)
- Cancelled By: `rider`

**Calculation:**
```
Cancellation Fee = ₹50
```

---

## Refund Calculation

### When Refunds Are Processed

Refunds are **only processed for WALLET payments** that were deducted before cancellation.

**Important:** Since WALLET payments are deducted at ride completion, most cancelled rides won't have deductions to refund.

### Formula

```
IF paymentMethod === 'WALLET' AND paymentStatus === 'completed':
  refundAmount = MAX(0, fare - cancellationFee)
ELSE:
  refundAmount = 0 (no refund)
```

### Refund Scenarios

| Scenario | Ride Status | Cancelled By | Cancellation Fee | Refund Amount |
|----------|------------|--------------|------------------|---------------|
| Before Driver Assignment | `requested` | Rider | ₹0 | Full fare (if paid) |
| After Driver Assignment | `accepted` | Rider | ₹50 | Fare - ₹50 |
| After Driver Assignment | `accepted` | Driver | ₹0 | Full fare (if paid) |
| After Driver Assignment | `accepted` | System | ₹0 | Full fare (if paid) |
| Ride Started | `in_progress` | Rider | ₹50 | Fare - ₹50 |
| Ride Started | `in_progress` | Driver | ₹0 | Full fare (if paid) |

### Example 1: Rider Cancels After Driver Assignment

**Ride Details:**
- Final Fare: ₹399
- Status: `accepted`
- Payment Method: `WALLET`
- Payment Status: `completed` (deducted)
- Cancelled By: `rider`
- Cancellation Fee: ₹50

**Calculation:**
```
Step 1: Check refund eligibility = WALLET + completed ✓
Step 2: Cancellation Fee = ₹50
Step 3: Refund Amount = MAX(0, ₹399 - ₹50) = ₹349
```

**Result:**
- User receives ₹349 refund
- ₹50 cancellation fee retained by platform

### Example 2: Driver Cancels After Assignment

**Ride Details:**
- Final Fare: ₹399
- Status: `accepted`
- Payment Method: `WALLET`
- Payment Status: `completed` (deducted)
- Cancelled By: `driver`
- Cancellation Fee: ₹0 (driver cancellation)

**Calculation:**
```
Step 1: Check refund eligibility = WALLET + completed ✓
Step 2: Cancellation Fee = ₹0 (driver cancelled)
Step 3: Refund Amount = MAX(0, ₹399 - ₹0) = ₹399
```

**Result:**
- User receives full ₹399 refund
- No cancellation fee

### Example 3: Cancellation Fee Exceeds Fare

**Ride Details:**
- Final Fare: ₹30
- Status: `accepted`
- Payment Method: `WALLET`
- Payment Status: `completed`
- Cancelled By: `rider`
- Cancellation Fee: ₹50

**Calculation:**
```
Step 1: Check refund eligibility = WALLET + completed ✓
Step 2: Cancellation Fee = ₹50
Step 3: Refund Amount = MAX(0, ₹30 - ₹50) = ₹0
```

**Result:**
- No refund (cancellation fee exceeds fare)
- ₹30 retained by platform

---

## Special Booking Types

### FULL_DAY Booking

**Formula:**
```
finalFare = 1500 (fixed price)
```

**Requirements:**
- `bookingMeta.startTime` required
- `bookingMeta.endTime` required

**Example:**
```
Booking Type: FULL_DAY
Start Time: 2024-01-15 09:00:00
End Time: 2024-01-15 18:00:00

Final Fare = ₹1,500 (fixed)
```

### RENTAL Booking

**Formula:**
```
finalFare = bookingMeta.days × 700
```

**Requirements:**
- `bookingMeta.days` required
- `bookingMeta.startTime` required

**Example:**
```
Booking Type: RENTAL
Days: 3
Start Time: 2024-01-15 09:00:00

Final Fare = 3 × ₹700 = ₹2,100
```

### DATE_WISE Booking

**Formula:**
```
finalFare = bookingMeta.dates.length × 500
```

**Requirements:**
- `bookingMeta.dates[]` array required (non-empty)

**Example:**
```
Booking Type: DATE_WISE
Dates: [2024-01-15, 2024-01-16, 2024-01-17]

Final Fare = 3 × ₹500 = ₹1,500
```

**Note:** These are example formulas. Actual pricing should be configured based on business requirements.

---

## Complete Examples

### Example 1: Standard Ride with Promo Code

**Settings:**
- Service: "Cerca Small" (₹299)
- Per Km Rate: ₹15/km
- Minimum Fare: ₹50
- Platform Fees: 20%
- Driver Commission: 80%

**Ride Details:**
- Distance: 12 km
- Promo Code: "SAVE20" (20% discount, max ₹100, min ₹100)

**Complete Calculation:**
```
=== BASE FARE CALCULATION ===
Base Fare = ₹299 + (12 × ₹15) = ₹299 + ₹180 = ₹479
Apply Minimum = MAX(₹479, ₹50) = ₹479

=== PROMO CODE CALCULATION ===
Check Min Order: ₹479 >= ₹100 ✓
Discount = (₹479 × 20) / 100 = ₹95.8
Apply Max Cap: MIN(₹95.8, ₹100) = ₹95.8
Discount = MIN(₹95.8, ₹479) = ₹95.8
Rounded = ₹95.80
Final Fare = MAX(0, ₹479 - ₹95.80) = ₹383.20

=== EARNINGS CALCULATION (After Completion) ===
Gross Fare = ₹383.20
Platform Fee = ₹383.20 × 20% = ₹76.64
Driver Earning = ₹383.20 × 80% = ₹306.56

=== SUMMARY ===
Rider Pays: ₹383.20
Discount Saved: ₹95.80
Platform Gets: ₹76.64
Driver Gets: ₹306.56
```

### Example 2: Short Distance Ride (Minimum Fare Applied)

**Settings:**
- Service: "Cerca Small" (₹299)
- Per Km Rate: ₹15/km
- Minimum Fare: ₹50

**Ride Details:**
- Distance: 0.3 km

**Complete Calculation:**
```
=== BASE FARE CALCULATION ===
Base Fare = ₹299 + (0.3 × ₹15) = ₹299 + ₹4.5 = ₹303.5
Apply Minimum = MAX(₹303.5, ₹50) = ₹303.5
Final Fare = ₹303.50

=== EARNINGS CALCULATION (After Completion) ===
Gross Fare = ₹303.50
Platform Fee = ₹303.50 × 20% = ₹60.70
Driver Earning = ₹303.50 × 80% = ₹242.80
```

### Example 3: Cancelled Ride with Refund

**Settings:**
- Cancellation Fee: ₹50

**Ride Details:**
- Final Fare: ₹399
- Status: `accepted` (driver assigned)
- Payment Method: `WALLET`
- Payment Status: `completed` (deducted)
- Cancelled By: `rider`

**Complete Calculation:**
```
=== REFUND CALCULATION ===
Cancellation Fee = ₹50
Refund Amount = MAX(0, ₹399 - ₹50) = ₹349

=== RESULT ===
User Receives Refund: ₹349
Platform Retains: ₹50 (cancellation fee)
```

### Example 4: Multiple Rides - Driver Earnings Summary

**Settings:**
- Platform Fees: 20%
- Driver Commission: 80%

**Completed Rides:**
1. Ride 1: ₹399
2. Ride 2: ₹520
3. Ride 3: ₹280
4. Ride 4: ₹450
5. Ride 5: ₹380

**Complete Calculation:**
```
=== PER RIDE BREAKDOWN ===
Ride 1: ₹399 → Platform: ₹79.80, Driver: ₹319.20
Ride 2: ₹520 → Platform: ₹104.00, Driver: ₹416.00
Ride 3: ₹280 → Platform: ₹56.00, Driver: ₹224.00
Ride 4: ₹450 → Platform: ₹90.00, Driver: ₹360.00
Ride 5: ₹380 → Platform: ₹76.00, Driver: ₹304.00

=== TOTALS ===
Total Gross Earnings = ₹2,029
Total Platform Fees = ₹405.80
Total Driver Earnings = ₹1,623.20

=== AVERAGES ===
Average Gross Per Ride = ₹405.80
Average Net Per Ride = ₹324.64
```

---

## Admin Settings Reference

### Required Settings Structure

```javascript
{
  pricingConfigurations: {
    baseFare: 40,              // Base fare (may not be used)
    perKmRate: 15,             // Rate per kilometer
    minimumFare: 50,           // Minimum fare guarantee
    cancellationFees: 50,      // Cancellation fee amount
    platformFees: 20,          // Platform commission percentage
    driverCommissions: 80      // Driver commission percentage
  },
  services: [
    {
      name: "Cerca Small",
      price: 299
    },
    {
      name: "Cerca Medium",
      price: 499
    },
    {
      name: "Cerca Large",
      price: 699
    }
  ]
}
```

### Settings Impact on Calculations

| Setting | Used In | Impact |
|---------|---------|--------|
| `perKmRate` | Base Fare | Higher rate = higher fare for longer distances |
| `minimumFare` | Base Fare | Ensures minimum revenue per ride |
| `service.price` | Base Fare | Base price for each service type |
| `platformFees` | Earnings | Platform's share of revenue |
| `driverCommissions` | Earnings | Driver's share of revenue |
| `cancellationFees` | Refunds | Amount deducted on cancellation |

---

## Calculation Order Summary

### For Ride Creation

1. Calculate distance (Haversine formula)
2. Calculate base fare: `service.price + (distance × perKmRate)`
3. Apply minimum fare: `MAX(baseFare, minimumFare)`
4. Validate and apply promo code (if provided)
5. Calculate final fare: `fare - discount`
6. Round to 2 decimal places

### For Ride Completion

1. Use final fare from ride document
2. Calculate platform fee: `fare × (platformFees / 100)`
3. Calculate driver earning: `fare × (driverCommissions / 100)`
4. Round both to 2 decimal places
5. Store in `AdminEarnings` collection

### For Cancellation & Refund

1. Check payment method and status
2. Determine cancellation fee (if applicable)
3. Calculate refund: `MAX(0, fare - cancellationFee)`
4. Process refund transaction (if WALLET payment)
5. Update ride with refund details

---

## Code References

### Key Files

1. **Base Fare Calculation:**
   - `Cerca-API/Controllers/User/ride.controller.js` (lines 63-65)
   - `Cerca-API/utils/ride_booking_functions.js` (lines 313-314)

2. **Promo Code Calculation:**
   - `Cerca-API/utils/ride_booking_functions.js` (lines 325-366)
   - `Cerca-API/Models/Admin/coupon.modal.js` (lines 254-280)

3. **Platform Fee & Driver Commission:**
   - `Cerca-API/utils/socket.js` (lines 2813-2816)
   - `Cerca-API/Controllers/Driver/earnings.controller.js` (lines 480-486)

4. **Cancellation & Refund:**
   - `Cerca-API/utils/ride_booking_functions.js` (lines 720-840)

---

## Validation Rules

### Fare Validation

- Fare must be >= minimum fare
- Fare must be >= 0
- Distance must be > 0
- Service must exist in settings

### Promo Code Validation

- Coupon must be active
- Current date must be within validity period
- Usage limits must not be exceeded
- Minimum order amount must be met
- Service/ride type must be applicable

### Refund Validation

- Only WALLET payments can be automatically refunded
- Payment must have been deducted (`paymentStatus === 'completed'`)
- Refund amount cannot be negative
- Refund transaction must not already exist

---

## Common Issues & Solutions

### Issue 1: Fare Below Minimum

**Problem:** Calculated fare is less than minimum fare

**Solution:** System automatically applies minimum fare
```
Base Fare = ₹299 + (0.1 × ₹15) = ₹300.5
But if minimum is ₹50, final = MAX(₹300.5, ₹50) = ₹300.5 ✓
```

### Issue 2: Discount Exceeds Fare

**Problem:** Promo code discount is greater than fare

**Solution:** Discount is capped at fare amount
```
Fare = ₹100
Discount = ₹150 (fixed)
Applied Discount = MIN(₹150, ₹100) = ₹100
Final Fare = MAX(0, ₹100 - ₹100) = ₹0
```

### Issue 3: Platform Fee + Driver Commission ≠ 100%

**Problem:** Percentages don't add up to 100%

**Solution:** System calculates independently, but should be configured to total 100%
```
Platform: 20%
Driver: 80%
Total: 100% ✓

Platform: 25%
Driver: 70%
Total: 95% (not recommended)
```

---

## Best Practices

1. **Always validate admin settings exist** before calculations
2. **Round all monetary values** to 2 decimal places
3. **Store original fare** before applying discounts for audit
4. **Log all calculations** for debugging and audit trails
5. **Validate promo codes** before applying discounts
6. **Check refund eligibility** before processing refunds
7. **Ensure platform fee + driver commission = 100%** in settings

---

**Last Updated:** January 2024  
**Version:** 1.0.0  
**Status:** Complete Calculation Guide

