# Cerca API - Complete Driver App Development Guide

## Table of Contents
1. [Overview](#overview)
2. [Base Configuration](#base-configuration)
3. [Authentication & Profile Management](#authentication--profile-management)
4. [Ride Management](#ride-management)
5. [Real-time Communication (Socket.IO)](#real-time-communication-socketio)
6. [Location & Status Management](#location--status-management)
7. [Messaging System](#messaging-system)
8. [Rating System](#rating-system)
9. [Earnings & Statistics](#earnings--statistics)
10. [Notifications](#notifications)
11. [Emergency Alerts](#emergency-alerts)
12. [Data Models](#data-models)
13. [Error Handling](#error-handling)

---

## Overview

This guide provides complete documentation for developing the Cerca Driver App using Flutter. It includes all REST API endpoints, Socket.IO events, request/response formats, and data models.

**Base URL**: `http://your-server-url.com`  
**Socket URL**: `ws://your-server-url.com`

---

## Base Configuration

### Required Dependencies (Flutter)
```yaml
dependencies:
  socket_io_client: ^2.0.0
  http: ^1.0.0
  geolocator: ^10.0.0
  provider: ^6.0.0
```

### Headers for REST API
```dart
Map<String, String> headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $token', // After login
};
```

---

## Authentication & Profile Management

### 1. Driver Registration
**Endpoint**: `POST /drivers`

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "password": "securePassword123",
  "location": {
    "coordinates": [longitude, latitude]
  }
}
```

**Response** (201):
```json
{
  "id": {
    "_id": "driverId123",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "location": {
      "type": "Point",
      "coordinates": [longitude, latitude]
    },
    "isVerified": false,
    "isActive": false,
    "isBusy": false,
    "isOnline": false,
    "rating": 0,
    "totalRatings": 0,
    "totalEarnings": 0,
    "documents": []
  },
  "message": "Driver added successfully"
}
```

**Error Response** (400):
```json
{
  "message": "Driver with this phone number already exists"
}
```

---

### 2. Driver Login
**Endpoint**: `POST /drivers/login`

**Request Body**:
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response** (200):
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "id": "driverId123"
}
```

**Error Responses**:
- 404: `{"message": "Driver not found"}`
- 401: `{"message": "Invalid credentials"}`

**Note**: Store the token securely and use it in Authorization header for authenticated requests.

---

### 3. Get Driver Profile
**Endpoint**: `GET /drivers/:id`

**Response** (200):
```json
{
  "_id": "driverId123",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "socketId": "socket123",
  "location": {
    "type": "Point",
    "coordinates": [77.5946, 12.9716]
  },
  "isVerified": true,
  "isActive": true,
  "isBusy": false,
  "isOnline": true,
  "rating": 4.8,
  "totalRatings": 150,
  "totalEarnings": 25000,
  "vehicleInfo": {
    "make": "Toyota",
    "model": "Camry",
    "year": 2020,
    "color": "White",
    "licensePlate": "KA01AB1234",
    "vehicleType": "sedan"
  },
  "lastSeen": "2025-10-11T10:30:00.000Z",
  "documents": ["url1", "url2"],
  "rides": [],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-10-11T10:30:00.000Z"
}
```

---

### 4. Update Driver Profile
**Endpoint**: `PUT /drivers/:id`

**Request Body** (all fields optional):
```json
{
  "name": "John Updated",
  "email": "newemail@example.com",
  "phone": "+1234567891"
}
```

**Response** (200): Returns updated driver object

---

### 5. Upload/Add Documents
**Endpoint**: `POST /drivers/:id/documents`

**Content-Type**: `multipart/form-data`

**Form Data**:
- `documents`: File[] (multiple files, max 10)

**Response** (200):
```json
{
  "message": "Documents added successfully",
  "documents": [
    "http://server.com/uploads/driverDocuments/timestamp-file1.png",
    "http://server.com/uploads/driverDocuments/timestamp-file2.png"
  ]
}
```

---

### 6. Update Vehicle Information
**Endpoint**: `PATCH /drivers/:id/vehicle`

**Request Body**:
```json
{
  "make": "Toyota",
  "model": "Camry",
  "year": 2020,
  "color": "White",
  "licensePlate": "KA01AB1234",
  "vehicleType": "sedan"
}
```

**Vehicle Types**: `sedan`, `suv`, `hatchback`, `auto`

**Response** (200):
```json
{
  "message": "Driver vehicle information updated successfully",
  "vehicleInfo": {
    "make": "Toyota",
    "model": "Camry",
    "year": 2020,
    "color": "White",
    "licensePlate": "KA01AB1234",
    "vehicleType": "sedan"
  }
}
```

---

## Ride Management

### 7. Get All Rides of Driver
**Endpoint**: `GET /drivers/:id/rides`

**Response** (200):
```json
{
  "rides": [
    {
      "rideId": {
        "_id": "rideId123",
        "rider": "userId123",
        "pickupAddress": "123 Main St",
        "dropoffAddress": "456 Oak Ave",
        "pickupLocation": {
          "type": "Point",
          "coordinates": [77.5946, 12.9716]
        },
        "dropoffLocation": {
          "type": "Point",
          "coordinates": [77.6046, 12.9816]
        },
        "fare": 250,
        "distanceInKm": 5.2,
        "status": "completed",
        "rideType": "normal",
        "paymentMethod": "CASH",
        "actualStartTime": "2025-10-11T10:00:00.000Z",
        "actualEndTime": "2025-10-11T10:25:00.000Z",
        "actualDuration": 25,
        "driverRating": 5,
        "riderRating": 4,
        "createdAt": "2025-10-11T09:55:00.000Z"
      },
      "status": "completed"
    }
  ]
}
```

---

### 8. Get Ride by ID
**Endpoint**: `GET /rides/:id`

**Response** (200):
```json
{
  "_id": "rideId123",
  "rider": {
    "_id": "userId123",
    "fullName": "Jane Smith",
    "phone": "+1234567890",
    "email": "jane@example.com"
  },
  "driver": {
    "_id": "driverId123",
    "name": "John Doe",
    "phone": "+9876543210",
    "rating": 4.8
  },
  "pickupAddress": "123 Main St",
  "dropoffAddress": "456 Oak Ave",
  "pickupLocation": {
    "type": "Point",
    "coordinates": [77.5946, 12.9716]
  },
  "dropoffLocation": {
    "type": "Point",
    "coordinates": [77.6046, 12.9816]
  },
  "fare": 250,
  "distanceInKm": 5.2,
  "status": "in_progress",
  "rideType": "normal",
  "startOtp": "1234",
  "stopOtp": "5678",
  "paymentMethod": "CASH",
  "paymentStatus": "pending",
  "driverSocketId": "socket123",
  "userSocketId": "socket456",
  "estimatedDuration": 20,
  "estimatedArrivalTime": "2025-10-11T10:20:00.000Z",
  "driverArrivedAt": "2025-10-11T10:00:00.000Z",
  "actualStartTime": "2025-10-11T10:02:00.000Z",
  "createdAt": "2025-10-11T09:55:00.000Z",
  "updatedAt": "2025-10-11T10:02:00.000Z"
}
```

**Ride Statuses**: `requested`, `accepted`, `in_progress`, `completed`, `cancelled`

---

## Real-time Communication (Socket.IO)

### Socket Connection Setup (Flutter)

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket socket = IO.io('http://your-server-url.com', 
  IO.OptionBuilder()
    .setTransports(['websocket'])
    .disableAutoConnect()
    .build()
);

socket.connect();

socket.onConnect((_) {
  print('Connected to socket server');
  // Register as driver
  socket.emit('driverConnect', {'driverId': 'driverId123'});
});

socket.onDisconnect((_) => print('Disconnected'));
```

---

### Socket Events - Driver Side

#### 1. Driver Connect
**Emit**: `driverConnect`
```dart
socket.emit('driverConnect', {
  'driverId': 'driverId123'
});
```

**Listen**: `driverConnect` (acknowledgment)
```dart
socket.on('driverConnect', (data) {
  print('Driver connected: ${data['driverId']}');
});
```

**Effect**: 
- Sets driver as online (`isOnline: true`)
- Updates driver's socket ID in database
- Driver joins 'driver' room for broadcasts

---

#### 2. Update Driver Location
**Emit**: `driverLocationUpdate`
```dart
socket.emit('driverLocationUpdate', {
  'driverId': 'driverId123',
  'location': {
    'coordinates': [longitude, latitude]
  },
  'rideId': 'rideId123' // Optional, if driver is on a ride
});
```

**Listen**: `driverLocationUpdate` (broadcast to riders)
```dart
// No need to listen on driver side unless needed
```

**Frequency**: Emit every 5-10 seconds when driver is online or on a ride

---

#### 3. Receive New Ride Request
**Listen**: `newRideRequest`
```dart
socket.on('newRideRequest', (data) {
  // Show ride request notification
  var ride = data; // Complete ride object
  print('New ride from: ${ride['pickupAddress']}');
  print('Fare: ${ride['fare']}');
  print('Distance: ${ride['distanceInKm']} km');
  
  // Show in UI with Accept/Reject options or this is the event we listen when we are in background and show the modal to accept/reject ride just as we impleted it currently
});
```

**Data Received**:
```json
{
  "_id": "rideId123",
  "rider": {
    "_id": "userId123",
    "fullName": "Jane Smith",
    "phone": "+1234567890"
  },
  "pickupAddress": "123 Main St",
  "dropoffAddress": "456 Oak Ave",
  "pickupLocation": {
    "type": "Point",
    "coordinates": [77.5946, 12.9716]
  },
  "dropoffLocation": {
    "type": "Point",
    "coordinates": [77.6046, 12.9816]
  },
  "fare": 250,
  "distanceInKm": 5.2,
  "status": "requested",
  "startOtp": "1234",
  "paymentMethod": "CASH",
  "createdAt": "2025-10-11T09:55:00.000Z"
}
```

---

#### 4. Accept Ride Request
**Emit**: `rideAccepted`
```dart
socket.emit('rideAccepted', {
  'rideId': 'rideId123',
  'driverId': 'driverId123'
});
```

**Listen**: `rideAssigned` (confirmation)
```dart
socket.on('rideAssigned', (data) {
  // Ride successfully assigned to you
  var ride = data;
  print('Ride assigned: ${ride['_id']}');
  // Navigate to active ride screen
  // Show rider details and navigation to pickup location
});
```

**Listen**: `rideError` (if assignment fails)
```dart
socket.on('rideError', (data) {
  print('Error: ${data['message']}');
  // Example: "Ride already assigned to another driver"
});
```

---

#### 5. Driver Arrived at Pickup
**Emit**: `driverArrived`
```dart
socket.emit('driverArrived', {
  'rideId': 'rideId123'
});
```

**Effect**: 
- Updates ride status
- Notifies rider that driver has arrived
- Records `driverArrivedAt` timestamp

---

#### 6. Start Ride (with OTP verification)
**Emit**: `verifyStartOtp` (first verify OTP)
```dart
socket.emit('verifyStartOtp', {
  'rideId': 'rideId123',
  'otp': '1234' // Get from rider
});
```

**Listen**: `otpVerified` or `otpVerificationFailed`
```dart
socket.on('otpVerified', (data) {
  if (data['success']) {
    // OTP is correct, now start the ride
    socket.emit('rideStarted', {
      'rideId': 'rideId123',
      'otp': '1234'
    });
  }
});

socket.on('otpVerificationFailed', (data) {
  print('Invalid OTP: ${data['message']}');
  // Show error to driver
});
```

**Listen**: `rideStarted` (confirmation)
```dart
socket.on('rideStarted', (data) {
  var ride = data;
  print('Ride started: ${ride['_id']}');
  // Update UI to show ride in progress
  // Start navigation to dropoff location
  // Start timer for ride duration
});
```

**Effect**:
- Sets ride status to `in_progress`
- Records `actualStartTime`
- Notifies rider

---

#### 7. Complete Ride (with OTP verification)
**Emit**: `verifyStopOtp` (first verify OTP)
```dart
socket.emit('verifyStopOtp', {
  'rideId': 'rideId123',
  'otp': '5678' // Get from rider
});
```

**Listen**: `otpVerified` or `otpVerificationFailed`
```dart
socket.on('otpVerified', (data) {
  if (data['success']) {
    // OTP is correct, now complete the ride
    socket.emit('rideCompleted', {
      'rideId': 'rideId123',
      'fare': 250, // Final fare (can be adjusted)
      'otp': '5678'
    });
  }
});
```

**Listen**: `rideCompleted` (confirmation)
```dart
socket.on('rideCompleted', (data) {
  var ride = data;
  print('Ride completed: ${ride['_id']}');
  print('Fare: ${ride['fare']}');
  // Show ride summary screen
  // Show payment collection UI
  // Request rating from rider
});
```

**Effect**:
- Sets ride status to `completed`
- Records `actualEndTime` and `actualDuration`
- Updates driver earnings
- Sets driver `isBusy: false`
- Notifies rider

---

#### 8. Cancel Ride
**Emit**: `rideCancelled`
```dart
socket.emit('rideCancelled', {
  'rideId': 'rideId123',
  'cancelledBy': 'driver',
  'reason': 'Emergency' // Optional
});
```

**Listen**: `rideCancelled` (confirmation)
```dart
socket.on('rideCancelled', (data) {
  var ride = data;
  print('Ride cancelled: ${ride['_id']}');
  // Return to available rides screen
  // Set driver as available
});
```

**Effect**:
- Sets ride status to `cancelled`
- Records `cancelledBy` and `cancellationReason`
- Notifies rider
- May apply cancellation fee based on settings

---

#### 9. Driver Disconnect
**Emit**: `driverDisconnect`
```dart
socket.emit('driverDisconnect', {
  'driverId': 'driverId123'
});

// Or on app close/logout
socket.disconnect();
```

**Effect**:
- Sets driver `isOnline: false`
- Clears socket ID
- Updates `lastSeen` timestamp

---

### Socket Events - Listening for Updates

#### 10. Receive Messages
**Listen**: `receiveMessage`
```dart
socket.on('receiveMessage', (data) {
  var message = data;
  print('New message from rider: ${message['message']}');
  // Show notification or update chat UI
});
```

**Message Object**:
```json
{
  "_id": "messageId123",
  "ride": "rideId123",
  "sender": "userId123",
  "senderModel": "User",
  "receiver": "driverId123",
  "receiverModel": "Driver",
  "message": "I'm wearing a blue jacket",
  "messageType": "text",
  "isRead": false,
  "createdAt": "2025-10-11T10:05:00.000Z"
}
```

---

#### 11. Send Message to Rider
**Emit**: `sendMessage`
```dart
socket.emit('sendMessage', {
  'rideId': 'rideId123',
  'senderId': 'driverId123',
  'senderModel': 'Driver',
  'receiverId': 'userId123',
  'receiverModel': 'User',
  'message': 'I have arrived at the pickup location',
  'messageType': 'text' // or 'location', 'audio'
});
```

**Listen**: `messageSent` (confirmation)
```dart
socket.on('messageSent', (data) {
  if (data['success']) {
    var message = data['message'];
    // Add message to chat UI
  }
});
```

---

#### 12. Receive Rating
**Listen**: `ratingReceived`
```dart
socket.on('ratingReceived', (data) {
  var rating = data;
  print('New rating: ${rating['rating']} stars');
  print('Review: ${rating['review']}');
  // Show notification or update profile
});
```

---

#### 13. Submit Rating for Rider
**Emit**: `submitRating`
```dart
socket.emit('submitRating', {
  'rideId': 'rideId123',
  'ratedBy': 'driverId123',
  'ratedByModel': 'Driver',
  'ratedTo': 'userId123',
  'ratedToModel': 'User',
  'rating': 5,
  'review': 'Great rider, very polite',
  'tags': ['polite', 'professional']
});
```

**Listen**: `ratingSubmitted`
```dart
socket.on('ratingSubmitted', (data) {
  if (data['success']) {
    print('Rating submitted successfully');
  }
});
```

---

#### 14. Emergency Alert
**Listen**: `emergencyAlert`
```dart
socket.on('emergencyAlert', (data) {
  var emergency = data;
  print('EMERGENCY ALERT!');
  print('Ride: ${emergency['rideId']}');
  print('Location: ${emergency['location']}');
  // Show emergency alert UI
  // Call emergency services if needed
});
```

**Emit**: `emergencyAlert` (driver can also trigger)
```dart
socket.emit('emergencyAlert', {
  'rideId': 'rideId123',
  'triggeredBy': 'driverId123',
  'triggeredByModel': 'Driver',
  'location': {
    'coordinates': [longitude, latitude]
  },
  'notes': 'Medical emergency'
});
```

---

## Location & Status Management

### 9. Update Driver Location (REST API)
**Endpoint**: `PATCH /drivers/:id/location`

**Request Body**:
```json
{
  "coordinates": [77.5946, 12.9716]
}
```

**Response** (200):
```json
{
  "message": "Driver location updated successfully",
  "location": {
    "type": "Point",
    "coordinates": [77.5946, 12.9716]
  }
}
```

**Note**: Use Socket.IO `driverLocationUpdate` event for real-time updates during rides.

---

### 10. Update Online Status
**Endpoint**: `PATCH /drivers/:id/online-status`

**Request Body**:
```json
{
  "isOnline": true
}
```

**Response** (200):
```json
{
  "message": "Driver online status updated successfully",
  "driver": {
    "_id": "driverId123",
    "isOnline": true,
    "lastSeen": "2025-10-11T10:30:00.000Z"
  }
}
```

**Use Cases**:
- Driver goes online: `isOnline: true`
- Driver goes offline: `isOnline: false`

---

### 11. Update Busy Status
**Endpoint**: `PATCH /drivers/:id/busy-status`

**Request Body**:
```json
{
  "isBusy": true
}
```

**Response** (200):
```json
{
  "message": "Driver busy status updated successfully",
  "driver": {
    "_id": "driverId123",
    "isBusy": true
  }
}
```

**Use Cases**:
- Ride accepted: `isBusy: true` (automatically set)
- Ride completed/cancelled: `isBusy: false` (automatically set)

---

## Messaging System

### 12. Send Message (REST API)
**Endpoint**: `POST /messages`

**Request Body**:
```json
{
  "rideId": "rideId123",
  "senderId": "driverId123",
  "senderModel": "Driver",
  "receiverId": "userId123",
  "receiverModel": "User",
  "message": "I'm 2 minutes away",
  "messageType": "text"
}
```

**Message Types**: `text`, `location`, `audio`

**Response** (201):
```json
{
  "message": "Message sent successfully",
  "data": {
    "_id": "messageId123",
    "ride": "rideId123",
    "sender": {
      "_id": "driverId123",
      "name": "John Doe"
    },
    "receiver": {
      "_id": "userId123",
      "fullName": "Jane Smith"
    },
    "message": "I'm 2 minutes away",
    "messageType": "text",
    "isRead": false,
    "createdAt": "2025-10-11T10:05:00.000Z"
  }
}
```

---

### 13. Get Ride Messages
**Endpoint**: `GET /messages/ride/:rideId`

**Query Parameters**:
- `limit`: Number (default: 100)

**Response** (200):
```json
{
  "messages": [
    {
      "_id": "messageId123",
      "sender": {
        "_id": "userId123",
        "fullName": "Jane Smith"
      },
      "receiver": {
        "_id": "driverId123",
        "name": "John Doe"
      },
      "message": "I'm wearing a blue jacket",
      "messageType": "text",
      "isRead": true,
      "createdAt": "2025-10-11T10:03:00.000Z"
    },
    {
      "_id": "messageId124",
      "sender": {
        "_id": "driverId123",
        "name": "John Doe"
      },
      "receiver": {
        "_id": "userId123",
        "fullName": "Jane Smith"
      },
      "message": "I can see you, coming to you",
      "messageType": "text",
      "isRead": false,
      "createdAt": "2025-10-11T10:04:00.000Z"
    }
  ],
  "count": 2
}
```

---

### 14. Get Unread Messages
**Endpoint**: `GET /messages/unread/:receiverId`

**Query Parameters**:
- `receiverModel`: "Driver" (required)

**Example**: `GET /messages/unread/driverId123?receiverModel=Driver`

**Response** (200):
```json
{
  "messages": [
    {
      "_id": "messageId125",
      "sender": {
        "_id": "userId123",
        "fullName": "Jane Smith"
      },
      "ride": {
        "_id": "rideId123",
        "pickupAddress": "123 Main St",
        "dropoffAddress": "456 Oak Ave"
      },
      "message": "Where are you?",
      "messageType": "text",
      "isRead": false,
      "createdAt": "2025-10-11T10:10:00.000Z"
    }
  ],
  "count": 1
}
```

---

### 15. Mark Message as Read
**Endpoint**: `PATCH /messages/:id/read`

**Response** (200):
```json
{
  "message": "Message marked as read",
  "data": {
    "_id": "messageId123",
    "isRead": true
  }
}
```

---

## Rating System

### 16. Submit Rating (REST API)
**Endpoint**: `POST /ratings`

**Request Body**:
```json
{
  "rideId": "rideId123",
  "ratedBy": "driverId123",
  "ratedByModel": "Driver",
  "ratedTo": "userId123",
  "ratedToModel": "User",
  "rating": 5,
  "review": "Excellent rider, very polite and punctual",
  "tags": ["polite", "professional"]
}
```

**Rating Tags**: `polite`, `professional`, `clean_vehicle`, `safe_driving`, `rude`, `late`, `unsafe`

**Response** (201):
```json
{
  "message": "Rating submitted successfully",
  "rating": {
    "_id": "ratingId123",
    "ride": "rideId123",
    "ratedBy": "driverId123",
    "ratedByModel": "Driver",
    "ratedTo": "userId123",
    "ratedToModel": "User",
    "rating": 5,
    "review": "Excellent rider, very polite and punctual",
    "tags": ["polite", "professional"],
    "createdAt": "2025-10-11T10:30:00.000Z"
  }
}
```

---

### 17. Get Driver Ratings
**Endpoint**: `GET /ratings/Driver/:driverId`

**Query Parameters**:
- `limit`: Number (default: 20)
- `skip`: Number (default: 0)

**Response** (200):
```json
{
  "ratings": [
    {
      "_id": "ratingId123",
      "ratedBy": {
        "_id": "userId123",
        "fullName": "Jane Smith"
      },
      "ride": {
        "_id": "rideId123",
        "pickupAddress": "123 Main St",
        "dropoffAddress": "456 Oak Ave",
        "createdAt": "2025-10-11T09:55:00.000Z"
      },
      "rating": 5,
      "review": "Great driver!",
      "tags": ["safe_driving", "professional"],
      "createdAt": "2025-10-11T10:30:00.000Z"
    }
  ],
  "total": 150,
  "count": 1
}
```

---

### 18. Get Rating Statistics
**Endpoint**: `GET /ratings/Driver/:driverId/stats`

**Response** (200):
```json
{
  "averageRating": 4.8,
  "totalRatings": 150,
  "ratingDistribution": {
    "1": 2,
    "2": 3,
    "3": 10,
    "4": 35,
    "5": 100
  }
}
```

---

## Earnings & Statistics

### 19. Get Driver Earnings
**Endpoint**: `GET /drivers/:id/earnings`

**Response** (200):
```json
{
  "totalGrossEarnings": 50000,
  "totalPlatformFees": 10000,
  "totalDriverEarnings": 40000,
  "platformFeePercentage": 20,
  "driverCommissionPercentage": 80,
  "totalRides": 200,
  "averageGrossPerRide": "250.00",
  "averageNetPerRide": "200.00",
  "recentRides": [
    {
      "_id": "rideId123",
      "fare": 250,
      "platformFee": "50.00",
      "driverEarning": "200.00",
      "distanceInKm": 5.2,
      "actualDuration": 25,
      "pickupAddress": "123 Main St",
      "dropoffAddress": "456 Oak Ave",
      "createdAt": "2025-10-11T09:55:00.000Z",
      "completedAt": "2025-10-11T10:20:00.000Z"
    }
  ]
}
```

**Notes**:
- `totalGrossEarnings`: Total fare collected from all rides
- `totalPlatformFees`: Amount deducted by platform
- `totalDriverEarnings`: Net amount driver receives (Gross - Platform Fee)
- `platformFeePercentage`: Percentage taken by platform (e.g., 20%)
- `driverCommissionPercentage`: Percentage driver keeps (e.g., 80%)

---

### 20. Get Driver Statistics
**Endpoint**: `GET /drivers/:id/stats`

**Response** (200):
```json
{
  "stats": {
    "totalRides": 200,
    "completedRides": 180,
    "cancelledRides": 15,
    "inProgressRides": 1,
    "rating": 4.8,
    "totalRatings": 150,
    "totalEarnings": 40000,
    "isOnline": true,
    "isActive": true,
    "isBusy": false,
    "lastSeen": "2025-10-11T10:30:00.000Z"
  }
}
```

---

## Notifications

### 21. Get Driver Notifications (Socket)
**Emit**: `getNotifications`
```dart
socket.emit('getNotifications', {
  'userId': 'driverId123',
  'userModel': 'Driver'
});
```

**Listen**: `notifications`
```dart
socket.on('notifications', (data) {
  var notifications = data;
  // Display notifications in UI
});
```

---

### 22. Mark Notification as Read (Socket)
**Emit**: `markNotificationRead`
```dart
socket.emit('markNotificationRead', {
  'notificationId': 'notificationId123'
});
```

**Listen**: `notificationMarkedRead`
```dart
socket.on('notificationMarkedRead', (data) {
  if (data['success']) {
    // Update UI
  }
});
```

---

## Emergency Alerts

### 23. Trigger Emergency Alert (Socket)
**Emit**: `emergencyAlert`
```dart
socket.emit('emergencyAlert', {
  'rideId': 'rideId123',
  'triggeredBy': 'driverId123',
  'triggeredByModel': 'Driver',
  'location': {
    'coordinates': [77.5946, 12.9716]
  },
  'notes': 'Rider behaving aggressively'
});
```

**Listen**: `emergencyAlertCreated`
```dart
socket.on('emergencyAlertCreated', (data) {
  if (data['success']) {
    print('Emergency alert sent');
    // Show confirmation to driver
    // Emergency services and admin have been notified
  }
});
```

**Listen**: `emergencyAlert` (if rider triggers emergency)
```dart
socket.on('emergencyAlert', (data) {
  var emergency = data;
  print('EMERGENCY from rider!');
  print('Location: ${emergency['location']}');
  // Show alert to driver
  // Consider stopping ride if needed
});
```

---

## Data Models

### Driver Model
```dart
class Driver {
  String id;
  String name;
  String email;
  String phone;
  String? socketId;
  Location location;
  bool isVerified;
  bool isActive;
  bool isBusy;
  bool isOnline;
  double rating;
  int totalRatings;
  double totalEarnings;
  VehicleInfo? vehicleInfo;
  DateTime? lastSeen;
  List<String> documents;
  List<RideReference> rides;
  DateTime createdAt;
  DateTime updatedAt;
}

class Location {
  String type; // "Point"
  List<double> coordinates; // [longitude, latitude]
}

class VehicleInfo {
  String? make;
  String? model;
  int? year;
  String? color;
  String? licensePlate;
  String vehicleType; // sedan, suv, hatchback, auto
}

class RideReference {
  String rideId;
  String status; // accepted, rejected, completed, cancelled
}
```

---

### Ride Model
```dart
class Ride {
  String id;
  String riderId;
  String? driverId;
  String pickupAddress;
  String dropoffAddress;
  Location pickupLocation;
  Location dropoffLocation;
  double fare;
  double distanceInKm;
  String status; // requested, accepted, in_progress, completed, cancelled
  String rideType; // normal, whole_day, custom
  String? cancelledBy; // rider, driver, system
  String startOtp;
  String stopOtp;
  String paymentMethod; // CASH, RAZORPAY, WALLET
  String paymentStatus; // pending, completed, failed, refunded
  String? driverSocketId;
  String? userSocketId;
  
  DateTime? actualStartTime;
  DateTime? actualEndTime;
  int? estimatedDuration; // in minutes
  int? actualDuration; // in minutes
  DateTime? estimatedArrivalTime;
  DateTime? driverArrivedAt;
  
  double? riderRating;
  double? driverRating;
  double tips;
  double discount;
  String? promoCode;
  String? cancellationReason;
  double cancellationFee;
  String? transactionId;
  
  CustomSchedule? customSchedule;
  DateTime createdAt;
  DateTime updatedAt;
}

class CustomSchedule {
  DateTime? startDate;
  DateTime? endDate;
  String? startTime; // "08:00 AM"
  String? endTime; // "06:00 PM"
}
```

---

### Message Model
```dart
class Message {
  String id;
  String rideId;
  String senderId;
  String senderModel; // User or Driver
  String receiverId;
  String receiverModel; // User or Driver
  String message;
  String messageType; // text, location, audio
  bool isRead;
  DateTime createdAt;
}
```

---

### Rating Model
```dart
class Rating {
  String id;
  String rideId;
  String ratedById;
  String ratedByModel; // User or Driver
  String ratedToId;
  String ratedToModel; // User or Driver
  int rating; // 1-5
  String? review;
  List<String> tags; // polite, professional, clean_vehicle, etc.
  DateTime createdAt;
}
```

---

### Notification Model
```dart
class Notification {
  String id;
  String recipientId;
  String recipientModel; // User or Driver
  String title;
  String message;
  String type; // ride_request, ride_accepted, ride_started, etc.
  String? relatedRideId;
  bool isRead;
  Map<String, dynamic>? data;
  DateTime createdAt;
}
```

---

## Error Handling

### Common Error Responses

**400 Bad Request**:
```json
{
  "message": "Invalid request data",
  "error": "Details about what went wrong"
}
```

**401 Unauthorized**:
```json
{
  "message": "Invalid credentials"
}
```

**404 Not Found**:
```json
{
  "message": "Driver not found"
}
```

**500 Internal Server Error**:
```json
{
  "message": "An error occurred",
  "error": "Error details"
}
```

---

### Socket Error Handling

**Listen**: `errorEvent`
```dart
socket.on('errorEvent', (data) {
  print('Socket error: ${data['message']}');
  // Show error to user
});
```

**Listen**: `rideError`
```dart
socket.on('rideError', (data) {
  print('Ride error: ${data['message']}');
  // Handle ride-specific errors
});
```

**Listen**: `messageError`
```dart
socket.on('messageError', (data) {
  print('Message error: ${data['message']}');
  // Handle messaging errors
});
```

---

## Implementation Checklist

### Phase 1: Authentication & Profile
- [ ] Implement driver registration
- [ ] Implement driver login with token storage
- [ ] Create profile screen showing driver details
- [ ] Implement profile update functionality
- [ ] Add document upload feature
- [ ] Implement vehicle information management

### Phase 2: Real-time Connection
- [ ] Setup Socket.IO connection
- [ ] Implement driver connect/disconnect
- [ ] Add real-time location tracking
- [ ] Implement location update broadcasting
- [ ] Add online/offline status toggle
- [ ] Handle connection errors and reconnection

### Phase 3: Ride Management
- [ ] Create ride request notification UI
- [ ] Implement ride acceptance flow
- [ ] Add navigation to pickup location
- [ ] Implement "Driver Arrived" feature
- [ ] Add OTP verification for ride start
- [ ] Create active ride screen with live tracking
- [ ] Add navigation to dropoff location
- [ ] Implement OTP verification for ride completion
- [ ] Create ride summary screen
- [ ] Handle ride cancellation

### Phase 4: Communication
- [ ] Implement in-ride chat UI
- [ ] Add real-time message sending/receiving
- [ ] Show unread message badges
- [ ] Add message read receipts
- [ ] Implement quick message templates

### Phase 5: Ratings & Reviews
- [ ] Create rating submission UI
- [ ] Display received ratings
- [ ] Show rating statistics
- [ ] Add review filtering

### Phase 6: Earnings & Analytics
- [ ] Create earnings dashboard
- [ ] Show daily/weekly/monthly earnings
- [ ] Display ride history
- [ ] Add earnings breakdown (gross vs net)
- [ ] Show statistics (total rides, completion rate, etc.)

### Phase 7: Additional Features
- [ ] Implement emergency alert system
- [ ] Add notification management
- [ ] Create settings screen
- [ ] Add app theme/preferences
- [ ] Implement offline mode handling
- [ ] Add analytics tracking

---

## Best Practices

### 1. Location Updates
- Update driver location every 5-10 seconds when online
- Use higher frequency (3-5 seconds) during active rides
- Implement background location updates
- Handle location permissions properly

### 2. Socket Connection
- Reconnect automatically on disconnection
- Emit `driverConnect` after every reconnection
- Handle socket errors gracefully
- Keep connection alive with heartbeat

### 3. Battery Optimization
- Adjust location update frequency based on battery level
- Use efficient location tracking methods
- Pause updates when driver is offline
- Implement battery saver mode

### 4. Security
- Store JWT token securely (encrypted storage)
- Validate OTPs before ride actions
- Never expose sensitive data in logs
- Implement SSL pinning for API calls

### 5. User Experience
- Show loading indicators for all async operations
- Implement retry mechanisms for failed operations
- Cache essential data for offline access
- Provide clear error messages
- Add haptic feedback for important actions

### 6. Testing
- Test all ride flow scenarios
- Test socket reconnection handling
- Test OTP verification edge cases
- Test with poor network conditions
- Test emergency alert functionality

---

## Support & Troubleshooting

### Common Issues

**Issue**: Driver not receiving ride requests
- **Check**: Driver `isOnline`, `isActive`, and `isBusy` status
- **Check**: Socket connection is active
- **Check**: Location is being updated regularly

**Issue**: OTP verification failing
- **Solution**: Ensure OTP is sent as string, not number
- **Solution**: Verify ride ID is correct

**Issue**: Location not updating
- **Check**: Location permissions granted
- **Check**: GPS is enabled
- **Check**: Socket connection is active

**Issue**: Messages not delivering
- **Check**: Socket connection is active
- **Check**: Receiver's socket ID is set
- **Check**: Ride is active

---

## Version History

**v1.0.0** - Initial driver app guide
- Complete REST API documentation
- Complete Socket.IO events documentation
- All data models
- Implementation checklist

---

## Contact & Resources

For additional support or questions:
- API Base URL: `http://your-server-url.com`
- Socket URL: `ws://your-server-url.com`

---

**End of Driver App Development Guide**

