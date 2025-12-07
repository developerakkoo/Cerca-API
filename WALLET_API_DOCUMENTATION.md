# Wallet API Documentation

Complete API documentation for the User Wallet System in Cerca Taxi Booking Platform.

## Table of Contents

1. [Overview](#overview)
2. [Base URL](#base-url)
3. [Authentication](#authentication)
4. [Endpoints](#endpoints)
   - [Get Wallet Balance](#1-get-wallet-balance)
   - [Get Transaction History](#2-get-transaction-history)
   - [Get Transaction by ID](#3-get-transaction-by-id)
   - [Get Wallet Statistics](#4-get-wallet-statistics)
   - [Top-Up Wallet](#5-top-up-wallet)
   - [Deduct from Wallet](#6-deduct-from-wallet)
   - [Refund to Wallet](#7-refund-to-wallet)
   - [Request Withdrawal](#8-request-withdrawal)
5. [Transaction Types](#transaction-types)
6. [Error Responses](#error-responses)
7. [Code Examples](#code-examples)

---

## Overview

The Wallet API provides comprehensive wallet management functionality including:
- View wallet balance
- Transaction history with filtering
- Top-up wallet via payment gateway
- Deduct money for ride payments
- Process refunds
- Request withdrawals
- View statistics and analytics

---

## Base URL

```
http://localhost:3000/api/users
```

---

## Authentication

All endpoints require user authentication. Include the user ID in the URL path.

**Note:** In production, implement JWT authentication middleware.

---

## Endpoints

### 1. Get Wallet Balance

Get the current wallet balance for a user.

**Endpoint:** `GET /api/users/:userId/wallet`

**URL Parameters:**
- `userId` (string, required) - User ID

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "walletBalance": 1500.50,
    "currency": "INR",
    "user": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+1234567890"
    }
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "User not found"
}
```

---

### 2. Get Transaction History

Get paginated transaction history with filtering options.

**Endpoint:** `GET /api/users/:userId/wallet/transactions`

**URL Parameters:**
- `userId` (string, required) - User ID

**Query Parameters:**
- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 20, max: 100)
- `transactionType` (string, optional) - Filter by transaction type
- `status` (string, optional) - Filter by status (PENDING, COMPLETED, FAILED, CANCELLED, REFUNDED)
- `startDate` (string, optional) - Start date (ISO 8601 format)
- `endDate` (string, optional) - End date (ISO 8601 format)

**Example Request:**
```
GET /api/users/507f1f77bcf86cd799439011/wallet/transactions?page=1&limit=20&transactionType=TOP_UP&status=COMPLETED
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "user": "507f1f77bcf86cd799439011",
        "transactionType": "TOP_UP",
        "amount": 1000,
        "balanceBefore": 500.50,
        "balanceAfter": 1500.50,
        "relatedRide": null,
        "paymentMethod": "RAZORPAY",
        "status": "COMPLETED",
        "description": "Wallet top-up of ₹1000",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalTransactions": 100,
      "limit": 20
    },
    "summary": {
      "totalCredits": 5000,
      "totalDebits": 3500
    },
    "currentBalance": 1500.50
  }
}
```

---

### 3. Get Transaction by ID

Get details of a specific transaction.

**Endpoint:** `GET /api/users/:userId/wallet/transactions/:transactionId`

**URL Parameters:**
- `userId` (string, required) - User ID
- `transactionId` (string, required) - Transaction ID

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "_id": "507f1f77bcf86cd799439012",
      "user": "507f1f77bcf86cd799439011",
      "transactionType": "RIDE_PAYMENT",
      "amount": 250,
      "balanceBefore": 1500.50,
      "balanceAfter": 1250.50,
      "relatedRide": {
        "_id": "507f1f77bcf86cd799439013",
        "pickupAddress": "123 Main St",
        "dropoffAddress": "456 Oak Ave",
        "fare": 250,
        "status": "completed"
      },
      "paymentMethod": "WALLET",
      "status": "COMPLETED",
      "description": "Ride payment of ₹250",
      "createdAt": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

---

### 4. Get Wallet Statistics

Get comprehensive wallet statistics and analytics.

**Endpoint:** `GET /api/users/:userId/wallet/statistics`

**URL Parameters:**
- `userId` (string, required) - User ID

**Query Parameters:**
- `startDate` (string, optional) - Start date for statistics (ISO 8601 format)
- `endDate` (string, optional) - End date for statistics (ISO 8601 format)

**Response:**
```json
{
  "success": true,
  "data": {
    "currentBalance": 1500.50,
    "statistics": {
      "totalTopUps": 5000,
      "totalRidePayments": 3000,
      "totalRefunds": 200,
      "totalBonuses": 100,
      "totalWithdrawals": 500,
      "transactionCount": 50
    },
    "transactionsByType": [
      {
        "_id": "TOP_UP",
        "count": 10,
        "totalAmount": 5000
      },
      {
        "_id": "RIDE_PAYMENT",
        "count": 30,
        "totalAmount": 3000
      }
    ],
    "monthlyBreakdown": [
      {
        "_id": {
          "year": 2024,
          "month": 1
        },
        "credits": 5000,
        "debits": 3500
      }
    ]
  }
}
```

---

### 5. Top-Up Wallet

Add money to user's wallet (typically after payment gateway transaction).

**Endpoint:** `POST /api/users/:userId/wallet/top-up`

**URL Parameters:**
- `userId` (string, required) - User ID

**Request Body:**
```json
{
  "amount": 1000,
  "paymentMethod": "RAZORPAY",
  "paymentGatewayTransactionId": "pay_abc123xyz",
  "description": "Wallet top-up via Razorpay"
}
```

**Request Body Fields:**
- `amount` (number, required) - Amount to add (min: 10, max: 50000)
- `paymentMethod` (string, optional) - Payment method (CARD, UPI, NETBANKING, RAZORPAY, STRIPE)
- `paymentGatewayTransactionId` (string, optional) - Payment gateway transaction ID
- `description` (string, optional) - Transaction description

**Response:**
```json
{
  "success": true,
  "message": "Wallet topped up successfully",
  "data": {
    "transaction": {
      "_id": "507f1f77bcf86cd799439012",
      "transactionType": "TOP_UP",
      "amount": 1000,
      "balanceBefore": 500.50,
      "balanceAfter": 1500.50,
      "status": "COMPLETED"
    },
    "newBalance": 1500.50,
    "previousBalance": 500.50
  }
}
```

**Error Responses:**
```json
{
  "success": false,
  "message": "Invalid amount. Amount must be greater than 0"
}
```

```json
{
  "success": false,
  "message": "Minimum top-up amount is ₹10"
}
```

```json
{
  "success": false,
  "message": "Maximum top-up amount is ₹50,000"
}
```

---

### 6. Deduct from Wallet

Deduct money from wallet for ride payment.

**Endpoint:** `POST /api/users/:userId/wallet/deduct`

**URL Parameters:**
- `userId` (string, required) - User ID

**Request Body:**
```json
{
  "amount": 250,
  "rideId": "507f1f77bcf86cd799439013",
  "description": "Ride payment for trip to airport"
}
```

**Request Body Fields:**
- `amount` (number, required) - Amount to deduct
- `rideId` (string, optional) - Related ride ID
- `description` (string, optional) - Transaction description

**Response:**
```json
{
  "success": true,
  "message": "Amount deducted successfully",
  "data": {
    "transaction": {
      "_id": "507f1f77bcf86cd799439012",
      "transactionType": "RIDE_PAYMENT",
      "amount": 250,
      "balanceBefore": 1500.50,
      "balanceAfter": 1250.50,
      "status": "COMPLETED"
    },
    "newBalance": 1250.50,
    "previousBalance": 1500.50
  }
}
```

**Error Response (Insufficient Balance):**
```json
{
  "success": false,
  "message": "Insufficient wallet balance",
  "data": {
    "required": 250,
    "available": 100,
    "shortfall": 150
  }
}
```

---

### 7. Refund to Wallet

Refund money to user's wallet (e.g., for cancelled rides).

**Endpoint:** `POST /api/users/:userId/wallet/refund`

**URL Parameters:**
- `userId` (string, required) - User ID

**Request Body:**
```json
{
  "amount": 250,
  "rideId": "507f1f77bcf86cd799439013",
  "reason": "Ride cancelled by driver",
  "description": "Refund for cancelled ride"
}
```

**Request Body Fields:**
- `amount` (number, required) - Refund amount
- `rideId` (string, optional) - Related ride ID
- `reason` (string, optional) - Refund reason
- `description` (string, optional) - Transaction description

**Response:**
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "data": {
    "transaction": {
      "_id": "507f1f77bcf86cd799439012",
      "transactionType": "REFUND",
      "amount": 250,
      "balanceBefore": 1250.50,
      "balanceAfter": 1500.50,
      "status": "COMPLETED"
    },
    "newBalance": 1500.50,
    "previousBalance": 1250.50
  }
}
```

---

### 8. Request Withdrawal

Request withdrawal of money from wallet to bank account.

**Endpoint:** `POST /api/users/:userId/wallet/withdraw`

**URL Parameters:**
- `userId` (string, required) - User ID

**Request Body:**
```json
{
  "amount": 1000,
  "bankAccountNumber": "1234567890",
  "ifscCode": "SBIN0001234",
  "accountHolderName": "John Doe",
  "bankName": "State Bank of India",
  "description": "Withdrawal request"
}
```

**Request Body Fields:**
- `amount` (number, required) - Withdrawal amount (min: 100)
- `bankAccountNumber` (string, required) - Bank account number
- `ifscCode` (string, required) - IFSC code
- `accountHolderName` (string, required) - Account holder name
- `bankName` (string, required) - Bank name
- `description` (string, optional) - Transaction description

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal request submitted successfully. It will be processed within 3-5 business days.",
  "data": {
    "transaction": {
      "_id": "507f1f77bcf86cd799439012",
      "transactionType": "WITHDRAWAL",
      "amount": 1000,
      "balanceBefore": 1500.50,
      "balanceAfter": 500.50,
      "status": "PENDING",
      "withdrawalRequest": {
        "bankAccountNumber": "1234567890",
        "ifscCode": "SBIN0001234",
        "accountHolderName": "John Doe",
        "bankName": "State Bank of India",
        "requestedAt": "2024-01-15T12:00:00.000Z"
      }
    },
    "newBalance": 500.50,
    "previousBalance": 1500.50
  }
}
```

**Error Responses:**
```json
{
  "success": false,
  "message": "Minimum withdrawal amount is ₹100"
}
```

```json
{
  "success": false,
  "message": "Bank account details are required"
}
```

```json
{
  "success": false,
  "message": "Insufficient wallet balance"
}
```

---

## Transaction Types

The wallet system supports the following transaction types:

| Type | Description | Direction |
|------|-------------|-----------|
| `TOP_UP` | User added money to wallet | Credit |
| `RIDE_PAYMENT` | Payment for a ride | Debit |
| `REFUND` | Refund for cancelled ride | Credit |
| `BONUS` | Bonus/reward credited | Credit |
| `REFERRAL_REWARD` | Referral reward | Credit |
| `PROMO_CREDIT` | Promo code credit | Credit |
| `WITHDRAWAL` | Withdrawal request | Debit |
| `ADMIN_ADJUSTMENT` | Admin manual adjustment | Credit/Debit |
| `CANCELLATION_FEE` | Cancellation fee deduction | Debit |

---

## Transaction Status

| Status | Description |
|--------|-------------|
| `PENDING` | Transaction is pending processing |
| `COMPLETED` | Transaction completed successfully |
| `FAILED` | Transaction failed |
| `CANCELLED` | Transaction was cancelled |
| `REFUNDED` | Transaction was refunded |

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "message": "Error message describing what went wrong",
  "error": "Detailed error message (in development)"
}
```

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation errors, invalid input)
- `404` - Not Found (user, transaction not found)
- `500` - Internal Server Error

---

## Code Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api/users';

// Get wallet balance
async function getWalletBalance(userId) {
  try {
    const response = await axios.get(`${API_BASE_URL}/${userId}/wallet`);
    console.log('Wallet Balance:', response.data.data.walletBalance);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Get transaction history
async function getTransactions(userId, page = 1, limit = 20) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/${userId}/wallet/transactions`,
      {
        params: { page, limit }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Top-up wallet
async function topUpWallet(userId, amount, paymentGatewayTransactionId) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/${userId}/wallet/top-up`,
      {
        amount,
        paymentMethod: 'RAZORPAY',
        paymentGatewayTransactionId,
        description: `Wallet top-up of ₹${amount}`
      }
    );
    console.log('Top-up successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Deduct from wallet
async function deductFromWallet(userId, amount, rideId) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/${userId}/wallet/deduct`,
      {
        amount,
        rideId,
        description: `Ride payment of ₹${amount}`
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Request withdrawal
async function requestWithdrawal(userId, amount, bankDetails) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/${userId}/wallet/withdraw`,
      {
        amount,
        ...bankDetails
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Get wallet statistics
async function getWalletStatistics(userId, startDate, endDate) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/${userId}/wallet/statistics`,
      {
        params: { startDate, endDate }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}
```

### cURL Examples

```bash
# Get wallet balance
curl -X GET http://localhost:3000/api/users/USER_ID/wallet

# Get transaction history
curl -X GET "http://localhost:3000/api/users/USER_ID/wallet/transactions?page=1&limit=20"

# Top-up wallet
curl -X POST http://localhost:3000/api/users/USER_ID/wallet/top-up \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "paymentMethod": "RAZORPAY",
    "paymentGatewayTransactionId": "pay_abc123"
  }'

# Deduct from wallet
curl -X POST http://localhost:3000/api/users/USER_ID/wallet/deduct \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 250,
    "rideId": "RIDE_ID",
    "description": "Ride payment"
  }'

# Request withdrawal
curl -X POST http://localhost:3000/api/users/USER_ID/wallet/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "bankAccountNumber": "1234567890",
    "ifscCode": "SBIN0001234",
    "accountHolderName": "John Doe",
    "bankName": "State Bank of India"
  }'
```

### React Native Example

```javascript
import axios from 'axios';

const API_BASE_URL = 'http://your-api-url.com/api/users';

export const WalletService = {
  // Get wallet balance
  getBalance: async (userId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/${userId}/wallet`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get transactions
  getTransactions: async (userId, filters = {}) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/${userId}/wallet/transactions`,
        { params: filters }
      );
      return response.data.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Top-up
  topUp: async (userId, amount, paymentGatewayTransactionId) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/${userId}/wallet/top-up`,
        {
          amount,
          paymentMethod: 'RAZORPAY',
          paymentGatewayTransactionId,
        }
      );
      return response.data.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },
};
```

---

## Integration with Payment Gateway

### Typical Flow for Top-Up:

1. **Frontend:** User initiates top-up, calls payment gateway (Razorpay/Stripe)
2. **Payment Gateway:** Processes payment, returns transaction ID
3. **Backend:** Call `/wallet/top-up` endpoint with transaction ID
4. **Backend:** Verify transaction with payment gateway
5. **Backend:** Create wallet transaction and update balance
6. **Response:** Return updated balance to frontend

### Example Integration:

```javascript
// After successful Razorpay payment
const razorpayResponse = await razorpay.payments.capture(
  paymentId,
  amount * 100, // Amount in paise
  currency
);

// Update wallet
const walletResponse = await axios.post(
  `${API_BASE_URL}/${userId}/wallet/top-up`,
  {
    amount: amount,
    paymentMethod: 'RAZORPAY',
    paymentGatewayTransactionId: razorpayResponse.id,
    description: `Wallet top-up via Razorpay`
  }
);
```

---

## Notes

1. **Minimum/Maximum Limits:**
   - Minimum top-up: ₹10
   - Maximum top-up: ₹50,000
   - Minimum withdrawal: ₹100

2. **Transaction Status:**
   - Withdrawals are set to `PENDING` status and need admin approval
   - Other transactions are typically `COMPLETED` immediately

3. **Balance Updates:**
   - All transactions update the user's wallet balance atomically
   - Balance is stored in the User model and also tracked in transactions

4. **Security:**
   - In production, implement JWT authentication
   - Validate payment gateway transactions before crediting wallet
   - Implement rate limiting for wallet operations

5. **Withdrawal Processing:**
   - Withdrawals require admin approval
   - Admin can process withdrawals via admin panel (to be implemented)
   - Withdrawal status can be updated to COMPLETED or FAILED

---

## Support

For issues or questions, contact the development team or refer to the main API documentation.

---

**Last Updated:** January 2024  
**API Version:** 1.0.0

