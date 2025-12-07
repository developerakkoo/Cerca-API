# Driver Earnings & Payout API Documentation

Complete API documentation for the Driver Earnings Dashboard and Payout Management system in Cerca Taxi Booking Platform.

## Table of Contents

1. [Overview](#overview)
2. [Earnings Dashboard](#earnings-dashboard)
3. [Payout Management](#payout-management)
4. [Bank Account Management](#bank-account-management)
5. [Integration Examples](#integration-examples)

---

## Overview

The Driver Earnings & Payout system provides:
- **Earnings Dashboard**: Comprehensive earnings analytics with daily/weekly/monthly breakdowns
- **Payout Management**: Request payouts, track payout history, manage bank accounts
- **Payment History**: Detailed payment history with pagination

---

## Earnings Dashboard

### Base URL
```
/api/drivers/:driverId/earnings
```

---

### 1. Get Driver Earnings Dashboard

Get comprehensive earnings dashboard with analytics and breakdowns.

**Endpoint:** `GET /api/drivers/:driverId/earnings`

**URL Parameters:**
- `driverId` (string, required) - Driver ID

**Query Parameters:**
- `period` (string, optional) - Time period: `today`, `week`, `month`, `year`, `all` (default: `all`)
- `startDate` (string, optional) - Start date (ISO 8601 format)
- `endDate` (string, optional) - End date (ISO 8601 format)

**Example Request:**
```
GET /api/drivers/507f1f77bcf86cd799439011/earnings?period=month
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "type": "month",
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-31T23:59:59.999Z"
    },
    "summary": {
      "totalRides": 50,
      "totalGrossEarnings": 25000,
      "totalPlatformFees": 5000,
      "totalDriverEarnings": 20000,
      "totalTips": 500,
      "totalBonuses": 0,
      "netEarnings": 20500,
      "averageGrossPerRide": 500,
      "averageNetPerRide": 410
    },
    "commission": {
      "platformFeePercentage": 20,
      "driverCommissionPercentage": 80
    },
    "breakdown": {
      "daily": [
        {
          "date": "2024-01-15",
          "rides": 5,
          "grossEarnings": 2500,
          "driverEarnings": 2000,
          "tips": 50,
          "netEarnings": 2050
        }
      ],
      "weekly": [
        {
          "weekStart": "2024-01-08",
          "rides": 25,
          "grossEarnings": 12500,
          "driverEarnings": 10000,
          "tips": 250,
          "netEarnings": 10250
        }
      ],
      "monthly": [
        {
          "month": "2024-01",
          "rides": 50,
          "grossEarnings": 25000,
          "driverEarnings": 20000,
          "tips": 500,
          "netEarnings": 20500
        }
      ]
    },
    "recentRides": [
      {
        "rideId": "507f1f77bcf86cd799439012",
        "date": "2024-01-15T10:30:00.000Z",
        "grossFare": 500,
        "driverEarning": 400,
        "platformFee": 100,
        "tips": 10,
        "rider": {
          "name": "John Doe"
        },
        "pickupAddress": "123 Main St",
        "dropoffAddress": "456 Oak Ave"
      }
    ]
  }
}
```

---

### 2. Get Payment History

Get paginated payment history.

**Endpoint:** `GET /api/drivers/:driverId/earnings/payments`

**URL Parameters:**
- `driverId` (string, required) - Driver ID

**Query Parameters:**
- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": "507f1f77bcf86cd799439012",
        "rideId": "507f1f77bcf86cd799439013",
        "date": "2024-01-15T10:30:00.000Z",
        "grossFare": 500,
        "driverEarning": 400,
        "platformFee": 100,
        "tips": 10,
        "netAmount": 410,
        "rider": {
          "name": "John Doe"
        },
        "pickupAddress": "123 Main St",
        "dropoffAddress": "456 Oak Ave",
        "paymentStatus": "completed"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalPayments": 100,
      "limit": 20
    }
  }
}
```

---

## Payout Management

### Base URL
```
/api/drivers/:driverId/payout
```

---

### 1. Get Available Balance

Get available balance that can be requested for payout.

**Endpoint:** `GET /api/drivers/:driverId/payout/available-balance`

**Response:**
```json
{
  "success": true,
  "data": {
    "availableBalance": 15000,
    "totalTips": 500,
    "totalAvailable": 15500,
    "minPayoutThreshold": 500,
    "canRequestPayout": true,
    "unpaidRidesCount": 30
  }
}
```

---

### 2. Request Payout

Request a payout to bank account.

**Endpoint:** `POST /api/drivers/:driverId/payout/request`

**Request Body:**
```json
{
  "amount": 10000,
  "bankAccount": {
    "accountNumber": "1234567890",
    "ifscCode": "SBIN0001234",
    "accountHolderName": "John Driver",
    "bankName": "State Bank of India",
    "accountType": "SAVINGS"
  },
  "notes": "Monthly payout request"
}
```

**Request Body Fields:**
- `amount` (number, required) - Payout amount (must be >= minPayoutThreshold)
- `bankAccount` (object, required) - Bank account details
  - `accountNumber` (string, required)
  - `ifscCode` (string, required)
  - `accountHolderName` (string, required)
  - `bankName` (string, required)
  - `accountType` (string, optional) - `SAVINGS` or `CURRENT` (default: `SAVINGS`)
- `notes` (string, optional) - Additional notes

**Response:**
```json
{
  "success": true,
  "message": "Payout request submitted successfully. It will be processed within 1-3 business days.",
  "data": {
    "payout": {
      "id": "507f1f77bcf86cd799439011",
      "amount": 10000,
      "status": "PENDING",
      "transactionReference": "PAYOUT-1705312800000-439011",
      "requestedAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

**Error Responses:**
```json
{
  "success": false,
  "message": "Insufficient balance for payout",
  "data": {
    "requested": 20000,
    "available": 15500
  }
}
```

```json
{
  "success": false,
  "message": "Minimum payout amount is ₹500"
}
```

```json
{
  "success": false,
  "message": "You have a pending payout request. Please wait for it to be processed."
}
```

---

### 3. Get Payout History

Get payout history with pagination.

**Endpoint:** `GET /api/drivers/:driverId/payout/history`

**Query Parameters:**
- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 20)
- `status` (string, optional) - Filter by status: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`

**Response:**
```json
{
  "success": true,
  "data": {
    "payouts": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "driver": "507f1f77bcf86cd799439010",
        "amount": 10000,
        "bankAccount": {
          "accountNumber": "1234567890",
          "ifscCode": "SBIN0001234",
          "accountHolderName": "John Driver",
          "bankName": "State Bank of India",
          "accountType": "SAVINGS"
        },
        "status": "COMPLETED",
        "requestedAt": "2024-01-15T10:00:00.000Z",
        "processedAt": "2024-01-18T14:30:00.000Z",
        "transactionId": "TXN123456789",
        "transactionReference": "PAYOUT-1705312800000-439011"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalPayouts": 25,
      "limit": 20
    },
    "statistics": {
      "totalPayoutAmount": 50000,
      "totalPayouts": 5,
      "pendingAmount": 10000,
      "pendingCount": 1
    }
  }
}
```

---

### 4. Get Payout by ID

Get details of a specific payout.

**Endpoint:** `GET /api/drivers/:driverId/payout/:payoutId`

**Response:**
```json
{
  "success": true,
  "data": {
    "payout": {
      "_id": "507f1f77bcf86cd799439011",
      "amount": 10000,
      "status": "COMPLETED",
      "bankAccount": {...},
      "relatedEarnings": [...],
      "transactionId": "TXN123456789",
      "processedBy": {
        "fullName": "Admin User",
        "email": "admin@example.com"
      }
    }
  }
}
```

---

## Bank Account Management

### 1. Get Bank Account

Get driver's saved bank account details.

**Endpoint:** `GET /api/drivers/:driverId/payout/bank-account`

**Response:**
```json
{
  "success": true,
  "data": {
    "bankAccount": {
      "accountNumber": "1234567890",
      "ifscCode": "SBIN0001234",
      "accountHolderName": "John Driver",
      "bankName": "State Bank of India",
      "accountType": "SAVINGS"
    }
  }
}
```

---

### 2. Update Bank Account

Update driver's bank account details.

**Endpoint:** `PUT /api/drivers/:driverId/payout/bank-account`

**Request Body:**
```json
{
  "bankAccount": {
    "accountNumber": "1234567890",
    "ifscCode": "SBIN0001234",
    "accountHolderName": "John Driver",
    "bankName": "State Bank of India",
    "accountType": "SAVINGS"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bank account updated successfully",
  "data": {
    "bankAccount": {...}
  }
}
```

---

## Integration Examples

### Get Earnings Dashboard

```javascript
// Get monthly earnings
const response = await axios.get(
  `/api/drivers/${driverId}/earnings?period=month`
);

const { summary, breakdown, recentRides } = response.data.data;

console.log(`Total Earnings: ₹${summary.netEarnings}`);
console.log(`Total Rides: ${summary.totalRides}`);
console.log(`Average per Ride: ₹${summary.averageNetPerRide}`);
```

### Request Payout

```javascript
// Check available balance
const balanceResponse = await axios.get(
  `/api/drivers/${driverId}/payout/available-balance`
);

const { totalAvailable, canRequestPayout, minPayoutThreshold } = 
  balanceResponse.data.data;

if (canRequestPayout) {
  // Request payout
  const payoutResponse = await axios.post(
    `/api/drivers/${driverId}/payout/request`,
    {
      amount: totalAvailable,
      bankAccount: {
        accountNumber: "1234567890",
        ifscCode: "SBIN0001234",
        accountHolderName: "John Driver",
        bankName: "State Bank of India",
        accountType: "SAVINGS"
      }
    }
  );
  
  console.log(`Payout requested: ${payoutResponse.data.data.payout.transactionReference}`);
}
```

### Get Payment History

```javascript
// Get payment history with pagination
const response = await axios.get(
  `/api/drivers/${driverId}/earnings/payments?page=1&limit=20`
);

const { payments, pagination } = response.data.data;

payments.forEach(payment => {
  console.log(`Ride ${payment.rideId}: ₹${payment.netAmount}`);
});
```

---

## Payout Status

| Status | Description |
|--------|-------------|
| `PENDING` | Payout request submitted, awaiting processing |
| `PROCESSING` | Payout is being processed |
| `COMPLETED` | Payout completed successfully |
| `FAILED` | Payout failed (bank error, etc.) |
| `CANCELLED` | Payout was cancelled |

---

## Configuration

### Payout Settings

Configured in Settings model:
- `minPayoutThreshold`: Minimum amount for payout (default: ₹500)
- `payoutSchedule`: `DAILY`, `WEEKLY`, or `MONTHLY` (default: `WEEKLY`)
- `processingDays`: Business days for processing (default: 3)

---

## Notes

1. **Earnings Calculation:**
   - Gross Earnings = Sum of all ride fares
   - Platform Fees = Gross Earnings × platformFeePercentage
   - Driver Earnings = Gross Earnings × driverCommissionPercentage
   - Net Earnings = Driver Earnings + Tips + Bonuses

2. **Payout Process:**
   - Driver requests payout
   - System validates available balance
   - Admin processes payout
   - Status updated to COMPLETED
   - Transaction ID recorded

3. **Available Balance:**
   - Only unpaid earnings are available
   - Tips included in available balance
   - Minimum threshold must be met

4. **Bank Account:**
   - Saved in driver profile
   - Updated automatically on payout request
   - Can be updated separately

---

**Last Updated:** January 2024  
**API Version:** 1.0.0

