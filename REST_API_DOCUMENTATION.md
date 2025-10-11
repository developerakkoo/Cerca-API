# 🚕 Cerca Taxi Booking - REST API Documentation

## 📋 Table of Contents
1. [Overview](#overview)
2. [Driver Routes](#driver-routes)
3. [Rating Routes](#rating-routes)
4. [Message Routes](#message-routes)
5. [Notification Routes](#notification-routes)
6. [Emergency Routes](#emergency-routes)
7. [Response Formats](#response-formats)
8. [Error Handling](#error-handling)

---

## 🌐 Overview

Base URL: `http://your-server-url:port/api`

All routes require proper authentication (implement JWT middleware as needed).

---

## 🚗 Driver Routes

Base URL: `/api/drivers`

### 1. Get All Drivers
```http
GET /api/drivers
```

**Response:**
```json
[
  {
    "_id": "driver_id",
    "name": "John Driver",
    "email": "john@example.com",
    "phone": "+91-9876543210",
    "rating": 4.5,
    "totalRatings": 100,
    "totalEarnings": 50000,
    "isOnline": true,
    "isActive": true,
    "isBusy": false,
    "vehicleInfo": {
      "make": "Toyota",
      "model": "Innova",
      "color": "White",
      "licensePlate": "KA-01-AB-1234",
      "vehicleType": "sedan"
    }
  }
]
```

---

### 2. Get Driver By ID
```http
GET /api/drivers/:id
```

---

### 3. Get Driver Statistics
```http
GET /api/drivers/:id/stats
```

**Response:**
```json
{
  "stats": {
    "totalRides": 150,
    "completedRides": 140,
    "cancelledRides": 5,
    "inProgressRides": 0,
    "rating": 4.5,
    "totalRatings": 100,
    "totalEarnings": 50000,
    "isOnline": true,
    "isActive": true,
    "isBusy": false,
    "lastSeen": "2024-01-15T10:30:00Z"
  }
}
```

---

### 4. Get Driver Earnings
```http
GET /api/drivers/:id/earnings
```

**Response:**
```json
{
  "totalEarnings": 50000,
  "totalRides": 140,
  "averageEarningPerRide": "357.14",
  "recentRides": [...]
}
```

---

### 5. Get Nearby Drivers
```http
GET /api/drivers/nearby?longitude=77.5946&latitude=12.9716&maxDistance=10000
```

**Query Parameters:**
- `longitude` (required): Longitude coordinate
- `latitude` (required): Latitude coordinate
- `maxDistance` (optional): Maximum distance in meters (default: 10000)

**Response:**
```json
{
  "drivers": [...],
  "count": 5
}
```

---

### 6. Update Driver Online Status
```http
PATCH /api/drivers/:id/online-status
```

**Request Body:**
```json
{
  "isOnline": true
}
```

---

### 7. Update Driver Busy Status
```http
PATCH /api/drivers/:id/busy-status
```

**Request Body:**
```json
{
  "isBusy": true
}
```

---

### 8. Update Driver Vehicle Info
```http
PATCH /api/drivers/:id/vehicle
```

**Request Body:**
```json
{
  "make": "Toyota",
  "model": "Innova",
  "year": 2020,
  "color": "White",
  "licensePlate": "KA-01-AB-1234",
  "vehicleType": "sedan"
}
```

---

### 9. Update Driver Location
```http
PATCH /api/drivers/:id/location
```

**Request Body:**
```json
{
  "coordinates": [77.5946, 12.9716]
}
```

---

### 10. Get All Rides of Driver
```http
GET /api/drivers/:id/rides
```

---

## ⭐ Rating Routes

Base URL: `/api/ratings`

### 1. Submit Rating
```http
POST /api/ratings
```

**Request Body:**
```json
{
  "rideId": "ride_id",
  "ratedBy": "user_id",
  "ratedByModel": "User",
  "ratedTo": "driver_id",
  "ratedToModel": "Driver",
  "rating": 5,
  "review": "Great driver, smooth ride!",
  "tags": ["polite", "professional", "clean_vehicle"]
}
```

**Response:**
```json
{
  "message": "Rating submitted successfully",
  "rating": {
    "_id": "rating_id",
    "rating": 5,
    "review": "Great driver, smooth ride!",
    "tags": ["polite", "professional", "clean_vehicle"],
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### 2. Get Ratings for Entity (Driver or User)
```http
GET /api/ratings/:entityModel/:entityId?limit=20&skip=0
```

**Examples:**
- `/api/ratings/Driver/DRIVER_ID` - Get all ratings for a driver
- `/api/ratings/User/USER_ID` - Get all ratings for a user/rider

**Query Parameters:**
- `limit` (optional): Number of ratings to return (default: 20)
- `skip` (optional): Number of ratings to skip (default: 0)

**Response:**
```json
{
  "ratings": [...],
  "total": 100,
  "count": 20
}
```

---

### 3. Get Rating Statistics
```http
GET /api/ratings/:entityModel/:entityId/stats
```

**Response:**
```json
{
  "averageRating": 4.5,
  "totalRatings": 100,
  "ratingDistribution": {
    "1": 2,
    "2": 5,
    "3": 10,
    "4": 30,
    "5": 53
  }
}
```

---

### 4. Get Ratings for a Ride
```http
GET /api/ratings/ride/:rideId
```

**Response:**
```json
{
  "ratings": [
    {
      "ratedBy": {...},
      "ratedTo": {...},
      "rating": 5,
      "review": "Great ride!"
    }
  ]
}
```

---

### 5. Delete Rating (Admin Only)
```http
DELETE /api/ratings/:id
```

---

## 💬 Message Routes

Base URL: `/api/messages`

### 1. Send Message
```http
POST /api/messages
```

**Request Body:**
```json
{
  "rideId": "ride_id",
  "senderId": "user_id",
  "senderModel": "User",
  "receiverId": "driver_id",
  "receiverModel": "Driver",
  "message": "I am wearing a blue shirt",
  "messageType": "text"
}
```

**Message Types:**
- `text` - Text message
- `location` - Location share
- `audio` - Audio message

**Response:**
```json
{
  "message": "Message sent successfully",
  "data": {
    "_id": "message_id",
    "message": "I am wearing a blue shirt",
    "sender": {
      "name": "John Doe"
    },
    "receiver": {
      "name": "Driver Name"
    },
    "isRead": false,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### 2. Get All Messages for a Ride
```http
GET /api/messages/ride/:rideId?limit=100
```

**Response:**
```json
{
  "messages": [...],
  "count": 25
}
```

---

### 3. Get Unread Messages
```http
GET /api/messages/unread/:receiverId?receiverModel=User
```

**Query Parameters:**
- `receiverModel` (required): "User" or "Driver"

**Response:**
```json
{
  "messages": [...],
  "count": 3
}
```

---

### 4. Get Conversation
```http
GET /api/messages/conversation/:rideId/:userId
```

Get all messages between two users for a specific ride.

---

### 5. Mark Message as Read
```http
PATCH /api/messages/:id/read
```

---

### 6. Mark All Messages as Read for a Ride
```http
PATCH /api/messages/ride/:rideId/read-all
```

**Request Body:**
```json
{
  "receiverId": "user_id"
}
```

---

### 7. Delete Message
```http
DELETE /api/messages/:id
```

---

## 🔔 Notification Routes

Base URL: `/api/notifications`

### 1. Create Notification
```http
POST /api/notifications
```

**Request Body:**
```json
{
  "recipientId": "user_id",
  "recipientModel": "User",
  "title": "Ride Accepted",
  "message": "Driver is on the way",
  "type": "ride_accepted",
  "relatedRide": "ride_id",
  "data": {
    "customField": "value"
  }
}
```

**Notification Types:**
- `ride_request`
- `ride_accepted`
- `ride_started`
- `ride_completed`
- `ride_cancelled`
- `driver_arrived`
- `rating_received`
- `emergency`
- `system`

---

### 2. Get User Notifications
```http
GET /api/notifications/:recipientId?recipientModel=User&limit=50&skip=0&unreadOnly=false
```

**Query Parameters:**
- `recipientModel` (required): "User" or "Driver"
- `limit` (optional): Number of notifications (default: 50)
- `skip` (optional): Skip count (default: 0)
- `unreadOnly` (optional): Only unread notifications (default: false)

**Response:**
```json
{
  "notifications": [...],
  "total": 150,
  "unreadCount": 5,
  "count": 50
}
```

---

### 3. Get Unread Count
```http
GET /api/notifications/:recipientId/unread-count?recipientModel=User
```

**Response:**
```json
{
  "unreadCount": 5
}
```

---

### 4. Mark Notification as Read
```http
PATCH /api/notifications/:id/read
```

---

### 5. Mark All Notifications as Read
```http
PATCH /api/notifications/read-all/:recipientId
```

**Request Body:**
```json
{
  "recipientModel": "User"
}
```

---

### 6. Delete Notification
```http
DELETE /api/notifications/:id
```

---

### 7. Delete All Notifications
```http
DELETE /api/notifications/all/:recipientId
```

**Request Body:**
```json
{
  "recipientModel": "User"
}
```

---

## 🆘 Emergency Routes

Base URL: `/api/emergencies`

### 1. Create Emergency Alert
```http
POST /api/emergencies
```

**Request Body:**
```json
{
  "rideId": "ride_id",
  "triggeredBy": "user_id",
  "triggeredByModel": "User",
  "location": {
    "longitude": 77.5946,
    "latitude": 12.9716
  },
  "reason": "unsafe_driving",
  "description": "Driver is driving rashly"
}
```

**Emergency Reasons:**
- `accident`
- `harassment`
- `unsafe_driving`
- `medical`
- `other`

**Response:**
```json
{
  "message": "Emergency alert created successfully",
  "emergency": {
    "_id": "emergency_id",
    "status": "active",
    "reason": "unsafe_driving",
    "location": {
      "type": "Point",
      "coordinates": [77.5946, 12.9716]
    },
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### 2. Get All Emergencies (Admin)
```http
GET /api/emergencies?status=active&limit=50&skip=0
```

**Query Parameters:**
- `status` (optional): Filter by status (active, resolved, dismissed)
- `limit` (optional): Number of emergencies (default: 50)
- `skip` (optional): Skip count (default: 0)

---

### 3. Get Active Emergencies
```http
GET /api/emergencies/active
```

Get all active emergencies (for admin dashboard).

---

### 4. Get Emergency by ID
```http
GET /api/emergencies/:id
```

---

### 5. Get Emergencies for a Ride
```http
GET /api/emergencies/ride/:rideId
```

---

### 6. Get Emergencies by User/Driver
```http
GET /api/emergencies/user/:userId?userModel=User
```

**Query Parameters:**
- `userModel` (required): "User" or "Driver"

---

### 7. Resolve Emergency
```http
PATCH /api/emergencies/:id/resolve
```

**Response:**
```json
{
  "message": "Emergency resolved successfully",
  "emergency": {
    "_id": "emergency_id",
    "status": "resolved",
    "resolvedAt": "2024-01-15T11:00:00Z"
  }
}
```

---

### 8. Dismiss Emergency
```http
PATCH /api/emergencies/:id/dismiss
```

---

### 9. Delete Emergency (Admin Only)
```http
DELETE /api/emergencies/:id
```

---

## 📊 Response Formats

### Success Response
```json
{
  "message": "Operation successful",
  "data": {...}
}
```

### Error Response
```json
{
  "message": "Error description",
  "error": "Detailed error message"
}
```

---

## ⚠️ Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 500 | Internal Server Error |

### Common Errors

**400 - Bad Request**
```json
{
  "message": "Missing required fields"
}
```

**404 - Not Found**
```json
{
  "message": "Driver not found"
}
```

**500 - Internal Server Error**
```json
{
  "message": "Error updating driver",
  "error": "Detailed error message"
}
```

---

## 🔒 Authentication

### JWT Token
All routes should include JWT token in Authorization header:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

### Implement Authentication Middleware
```javascript
const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Please authenticate' });
  }
};

// Use in routes:
router.get('/protected-route', authenticate, controller);
```

---

## 📝 Testing with Postman/curl

### Example: Submit Rating
```bash
curl -X POST http://localhost:3000/api/ratings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "rideId": "ride123",
    "ratedBy": "user123",
    "ratedByModel": "User",
    "ratedTo": "driver123",
    "ratedToModel": "Driver",
    "rating": 5,
    "review": "Great ride!"
  }'
```

### Example: Get Nearby Drivers
```bash
curl "http://localhost:3000/api/drivers/nearby?longitude=77.5946&latitude=12.9716&maxDistance=5000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🚀 Integration with index.js

Add these routes to your `index.js`:

```javascript
const ratingRoutes = require('./Routes/Driver/rating.routes');
const messageRoutes = require('./Routes/Driver/message.routes');
const notificationRoutes = require('./Routes/User/notification.routes');
const emergencyRoutes = require('./Routes/User/emergency.routes');
const driverRoutes = require('./Routes/Driver/driver.routes');

// Mount routes
app.use('/api/ratings', ratingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/emergencies', emergencyRoutes);
app.use('/api/drivers', driverRoutes);
```

---

## 📚 Complete API Flow Examples

### 1. Complete Ride Flow with REST API

```javascript
// 1. Create ride (use socket instead)
// 2. Driver accepts (use socket instead)
// 3. Driver updates location (REST or Socket)
PATCH /api/drivers/:id/location

// 4. Driver marks arrived (use socket)
// 5. Start ride (use socket)
// 6. Complete ride (use socket)

// 7. Submit rating (REST)
POST /api/ratings

// 8. Get driver stats (REST)
GET /api/drivers/:id/stats
```

### 2. Messaging Flow

```javascript
// 1. Send message
POST /api/messages

// 2. Get conversation
GET /api/messages/conversation/:rideId/:userId

// 3. Mark as read
PATCH /api/messages/:id/read
```

### 3. Emergency Flow

```javascript
// 1. Trigger emergency
POST /api/emergencies

// 2. Admin checks active emergencies
GET /api/emergencies/active

// 3. Resolve emergency
PATCH /api/emergencies/:id/resolve
```

---

## 🎯 Best Practices

1. **Use Socket.IO for real-time events** (ride updates, location tracking)
2. **Use REST API for**:
   - Data queries (stats, ratings, messages)
   - CRUD operations
   - Bulk operations
   - Admin operations

3. **Combine Both**:
   - Socket for real-time notifications
   - REST for fetching notification history

4. **Pagination**:
   - Always use `limit` and `skip` for large datasets
   - Default limit: 50

5. **Error Handling**:
   - Always return proper status codes
   - Include error details in development
   - Sanitize errors in production

---

**Last Updated:** January 2024  
**API Version:** 1.0.0  
**Maintained by:** Cerca Development Team

