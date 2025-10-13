# 🚖 Rider App Complete Integration Guide

## Overview
Complete API and Socket integration guide for Rider/User app with all request bodies, responses, and implementation examples.

---

## 📋 Table of Contents
1. [Setup & Authentication](#setup--authentication)
2. [Socket Events (Real-time)](#socket-events-real-time)
3. [REST API Endpoints](#rest-api-endpoints)
4. [Complete Integration Example](#complete-integration-example)
5. [Ride Details Page](#ride-details-page)
6. [Error Handling](#error-handling)

---

## 🔐 Setup & Authentication

### Base URL
```
http://your-server-url:port
WebSocket: ws://your-server-url:port
```

### Install Dependencies
```bash
npm install socket.io-client axios @react-native-async-storage/async-storage
```

---

## 🔌 Socket Events (Real-time)

### 1. Connect as Rider

**EMIT: `riderConnect`**
```javascript
socket.emit('riderConnect', {
  userId: 'USER_ID_HERE'
});
```

**LISTEN: `riderConnect` (Confirmation)**
```javascript
socket.on('riderConnect', (data) => {
  console.log('Connected as rider:', data);
  // Response: { userId: 'USER_ID_HERE' }
});
```

---

### 2. Request New Ride

**EMIT: `newRideRequest`**
```javascript
socket.emit('newRideRequest', {
  rider: 'USER_ID',
  riderId: 'USER_ID',
  userSocketId: socket.id,
  pickupLocation: {
    longitude: 77.5946,
    latitude: 12.9716
  },
  dropoffLocation: {
    longitude: 77.6,
    latitude: 12.98
  },
  pickupAddress: '123 Main St, Bangalore',
  dropoffAddress: '456 Park Ave, Bangalore',
  fare: 150,
  distanceInKm: 5.2,
  service: 'sedan', // 'sedan', 'suv', 'hatchback', 'auto'
  rideType: 'normal', // 'normal', 'whole_day', 'custom'
  paymentMethod: 'CASH' // 'CASH', 'RAZORPAY', 'WALLET'
});
```

**LISTEN: `rideRequested` (Confirmation)**
```javascript
socket.on('rideRequested', (ride) => {
  console.log('Ride requested:', ride);
  /*
  Response: {
    _id: 'RIDE_ID',
    rider: 'USER_ID',
    pickupLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
    dropoffLocation: { type: 'Point', coordinates: [77.6, 12.98] },
    pickupAddress: '123 Main St, Bangalore',
    dropoffAddress: '456 Park Ave, Bangalore',
    fare: 150,
    distanceInKm: 5.2,
    status: 'requested',
    service: 'sedan',
    rideType: 'normal',
    paymentMethod: 'CASH',
    startOtp: '1234',
    stopOtp: '5678',
    userSocketId: 'SOCKET_ID',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z'
  }
  */
});
```

---

### 3. Driver Accepted Ride

**LISTEN: `rideAccepted`**
```javascript
socket.on('rideAccepted', (ride) => {
  console.log('Driver accepted:', ride);
  /*
  Response: {
    _id: 'RIDE_ID',
    rider: { _id: 'USER_ID', fullName: 'John Doe', phone: '+91-XXXXXXXXXX' },
    driver: {
      _id: 'DRIVER_ID',
      name: 'Driver Name',
      phone: '+91-9876543210',
      email: 'driver@example.com',
      rating: 4.5,
      totalRatings: 150,
      vehicleInfo: {
        make: 'Toyota',
        model: 'Innova',
        color: 'White',
        licensePlate: 'KA-01-AB-1234',
        vehicleType: 'sedan'
      },
      profilePic: 'https://example.com/driver.jpg'
    },
    pickupLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
    dropoffLocation: { type: 'Point', coordinates: [77.6, 12.98] },
    pickupAddress: '123 Main St',
    dropoffAddress: '456 Park Ave',
    fare: 150,
    distanceInKm: 5.2,
    status: 'accepted',
    startOtp: '1234',
    stopOtp: '5678',
    driverSocketId: 'DRIVER_SOCKET_ID',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:05:00.000Z'
  }
  */
});
```

---

### 4. Track Driver Location

**LISTEN: `driverLocationUpdate`**
```javascript
socket.on('driverLocationUpdate', (data) => {
  console.log('Driver location:', data);
  /*
  Response: {
    driverId: 'DRIVER_ID',
    location: {
      longitude: 77.595,
      latitude: 12.972
    },
    rideId: 'RIDE_ID' // if ride is in progress
  }
  */
});
```

---

### 5. Driver Arrived at Pickup

**LISTEN: `driverArrived`**
```javascript
socket.on('driverArrived', (ride) => {
  console.log('Driver arrived:', ride);
  /*
  Response: {
    _id: 'RIDE_ID',
    status: 'accepted',
    driverArrivedAt: '2024-01-15T10:15:00.000Z',
    startOtp: '1234',
    // ... other ride fields
  }
  */
});
```

---

### 6. Ride Started

**LISTEN: `rideStarted`**
```javascript
socket.on('rideStarted', (ride) => {
  console.log('Ride started:', ride);
  /*
  Response: {
    _id: 'RIDE_ID',
    status: 'in_progress',
    actualStartTime: '2024-01-15T10:20:00.000Z',
    startOtp: '1234',
    stopOtp: '5678',
    // ... other ride fields
  }
  */
});
```

---

### 7. Track Ride Progress

**LISTEN: `rideLocationUpdate`**
```javascript
socket.on('rideLocationUpdate', (data) => {
  console.log('Ride location update:', data);
  /*
  Response: {
    rideId: 'RIDE_ID',
    driverId: 'DRIVER_ID',
    location: {
      longitude: 77.598,
      latitude: 12.975
    }
  }
  */
});
```

---

### 8. Ride Completed

**LISTEN: `rideCompleted`**
```javascript
socket.on('rideCompleted', (ride) => {
  console.log('Ride completed:', ride);
  /*
  Response: {
    _id: 'RIDE_ID',
    rider: { _id: 'USER_ID', fullName: 'John Doe' },
    driver: { _id: 'DRIVER_ID', name: 'Driver Name' },
    pickupAddress: '123 Main St',
    dropoffAddress: '456 Park Ave',
    fare: 150,
    distanceInKm: 5.2,
    status: 'completed',
    actualStartTime: '2024-01-15T10:20:00.000Z',
    actualEndTime: '2024-01-15T10:45:00.000Z',
    actualDuration: 25, // minutes
    paymentMethod: 'CASH',
    paymentStatus: 'pending',
    startOtp: '1234',
    stopOtp: '5678',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:45:00.000Z'
  }
  */
});
```

---

### 9. Cancel Ride

**EMIT: `rideCancelled`**
```javascript
socket.emit('rideCancelled', {
  rideId: 'RIDE_ID',
  cancelledBy: 'rider',
  reason: 'Changed my mind' // Optional
});
```

**LISTEN: `rideCancelled` (Confirmation)**
```javascript
socket.on('rideCancelled', (ride) => {
  console.log('Ride cancelled:', ride);
  /*
  Response: {
    _id: 'RIDE_ID',
    status: 'cancelled',
    cancelledBy: 'rider',
    cancellationReason: 'Changed my mind',
    // ... other ride fields
  }
  */
});
```

---

### 10. Submit Rating

**EMIT: `submitRating`**
```javascript
socket.emit('submitRating', {
  rideId: 'RIDE_ID',
  ratedBy: 'USER_ID',
  ratedByModel: 'User',
  ratedTo: 'DRIVER_ID',
  ratedToModel: 'Driver',
  rating: 4, // 1-5
  review: 'Great driver, smooth ride!',
  tags: ['polite', 'professional', 'clean_vehicle'] // Optional
});
```

**LISTEN: `ratingSubmitted` (Confirmation)**
```javascript
socket.on('ratingSubmitted', (data) => {
  console.log('Rating submitted:', data);
  /*
  Response: {
    success: true,
    rating: {
      _id: 'RATING_ID',
      ride: 'RIDE_ID',
      ratedBy: 'USER_ID',
      ratedByModel: 'User',
      ratedTo: 'DRIVER_ID',
      ratedToModel: 'Driver',
      rating: 4,
      review: 'Great driver, smooth ride!',
      tags: ['polite', 'professional', 'clean_vehicle'],
      createdAt: '2024-01-15T10:50:00.000Z'
    }
  }
  */
});
```

---

### 11. Send Message to Driver

**EMIT: `sendMessage`**
```javascript
socket.emit('sendMessage', {
  rideId: 'RIDE_ID',
  senderId: 'USER_ID',
  senderModel: 'User',
  receiverId: 'DRIVER_ID',
  receiverModel: 'Driver',
  message: 'I am wearing a blue shirt',
  messageType: 'text' // 'text', 'location', 'audio'
});
```

**LISTEN: `messageSent` (Confirmation)**
```javascript
socket.on('messageSent', (data) => {
  console.log('Message sent:', data);
  /*
  Response: {
    success: true,
    message: {
      _id: 'MESSAGE_ID',
      ride: 'RIDE_ID',
      sender: 'USER_ID',
      senderModel: 'User',
      receiver: 'DRIVER_ID',
      receiverModel: 'Driver',
      message: 'I am wearing a blue shirt',
      messageType: 'text',
      isRead: false,
      createdAt: '2024-01-15T10:18:00.000Z'
    }
  }
  */
});
```

**LISTEN: `receiveMessage` (Incoming Message)**
```javascript
socket.on('receiveMessage', (message) => {
  console.log('New message from driver:', message);
  /*
  Response: Same as messageSent response
  */
});
```

---

### 12. Get Ride Messages

**EMIT: `getRideMessages`**
```javascript
socket.emit('getRideMessages', {
  rideId: 'RIDE_ID'
});
```

**LISTEN: `rideMessages`**
```javascript
socket.on('rideMessages', (messages) => {
  console.log('All messages:', messages);
  /*
  Response: [
    {
      _id: 'MESSAGE_ID_1',
      ride: 'RIDE_ID',
      sender: 'USER_ID',
      senderModel: 'User',
      receiver: 'DRIVER_ID',
      receiverModel: 'Driver',
      message: 'I am wearing a blue shirt',
      messageType: 'text',
      isRead: true,
      createdAt: '2024-01-15T10:18:00.000Z'
    },
    {
      _id: 'MESSAGE_ID_2',
      ride: 'RIDE_ID',
      sender: 'DRIVER_ID',
      senderModel: 'Driver',
      receiver: 'USER_ID',
      receiverModel: 'User',
      message: 'I can see you, coming to pick you up',
      messageType: 'text',
      isRead: false,
      createdAt: '2024-01-15T10:19:00.000Z'
    }
  ]
  */
});
```

---

### 13. Emergency Alert (SOS)

**EMIT: `emergencyAlert`**
```javascript
socket.emit('emergencyAlert', {
  rideId: 'RIDE_ID',
  triggeredBy: 'USER_ID',
  triggeredByModel: 'User',
  location: {
    longitude: 77.5946,
    latitude: 12.9716
  },
  reason: 'unsafe_driving', // 'accident', 'harassment', 'unsafe_driving', 'medical', 'other'
  description: 'Driver is driving rashly' // Optional
});
```

**LISTEN: `emergencyAlertCreated` (Confirmation)**
```javascript
socket.on('emergencyAlertCreated', (data) => {
  console.log('Emergency alert sent:', data);
  /*
  Response: {
    success: true,
    emergency: {
      _id: 'EMERGENCY_ID',
      ride: 'RIDE_ID',
      triggeredBy: 'USER_ID',
      triggeredByModel: 'User',
      location: { type: 'Point', coordinates: [77.5946, 12.9716] },
      reason: 'unsafe_driving',
      description: 'Driver is driving rashly',
      status: 'active',
      createdAt: '2024-01-15T10:30:00.000Z'
    }
  }
  */
});
```

---

### 14. Get Notifications

**EMIT: `getNotifications`**
```javascript
socket.emit('getNotifications', {
  userId: 'USER_ID',
  userModel: 'User'
});
```

**LISTEN: `notifications`**
```javascript
socket.on('notifications', (notifications) => {
  console.log('All notifications:', notifications);
  /*
  Response: [
    {
      _id: 'NOTIFICATION_ID_1',
      recipient: 'USER_ID',
      recipientModel: 'User',
      title: 'Driver Accepted',
      message: 'Your driver is on the way',
      type: 'ride_accepted',
      relatedRide: 'RIDE_ID',
      isRead: false,
      createdAt: '2024-01-15T10:05:00.000Z'
    },
    {
      _id: 'NOTIFICATION_ID_2',
      recipient: 'USER_ID',
      recipientModel: 'User',
      title: 'Driver Arrived',
      message: 'Your driver has arrived',
      type: 'driver_arrived',
      relatedRide: 'RIDE_ID',
      isRead: false,
      createdAt: '2024-01-15T10:15:00.000Z'
    }
  ]
  */
});
```

---

### 15. Mark Notification as Read

**EMIT: `markNotificationRead`**
```javascript
socket.emit('markNotificationRead', {
  notificationId: 'NOTIFICATION_ID'
});
```

**LISTEN: `notificationMarkedRead` (Confirmation)**
```javascript
socket.on('notificationMarkedRead', (data) => {
  console.log('Notification marked as read:', data);
  /*
  Response: {
    success: true
  }
  */
});
```

---

### 16. Disconnect

**EMIT: `riderDisconnect`**
```javascript
socket.emit('riderDisconnect', {
  userId: 'USER_ID'
});
```

---

### 17. Error Events

**LISTEN: `rideError`**
```javascript
socket.on('rideError', (error) => {
  console.error('Ride error:', error);
  /*
  Response: {
    message: 'Error message here'
  }
  */
});
```

**LISTEN: `messageError`**
```javascript
socket.on('messageError', (error) => {
  console.error('Message error:', error);
  /*
  Response: {
    message: 'Error message here'
  }
  */
});
```

**LISTEN: `ratingError`**
```javascript
socket.on('ratingError', (error) => {
  console.error('Rating error:', error);
  /*
  Response: {
    message: 'Error message here'
  }
  */
});
```

**LISTEN: `emergencyError`**
```javascript
socket.on('emergencyError', (error) => {
  console.error('Emergency error:', error);
  /*
  Response: {
    message: 'Error message here'
  }
  */
});
```

**LISTEN: `errorEvent`**
```javascript
socket.on('errorEvent', (error) => {
  console.error('General error:', error);
  /*
  Response: {
    message: 'Error message here'
  }
  */
});
```

---

## 🌐 REST API Endpoints

### Base Configuration
```javascript
import axios from 'axios';

const API_URL = 'http://your-server-url:port';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

---

### 1. User Authentication

#### Login User
**POST** `/users/login`

**Request Body:**
```json
{
  "phone": "+91-9876543210"
}
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "id": "USER_ID_HERE"
}
```

**Implementation:**
```javascript
const loginUser = async (phone) => {
  try {
    const response = await api.post('/users/login', { phone });
    return response.data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};
```

---

### 2. Get User Profile

**GET** `/users/:id`

**Response (200 OK):**
```json
{
  "_id": "USER_ID",
  "fullName": "John Doe",
  "phone": "+91-9876543210",
  "email": "john@example.com",
  "profilePic": "https://example.com/profile.jpg",
  "location": {
    "type": "Point",
    "coordinates": [77.5946, 12.9716]
  },
  "rating": 4.8,
  "totalRatings": 50,
  "wallet": 1000,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z"
}
```

**Implementation:**
```javascript
const getUserProfile = async (userId) => {
  try {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Get user error:', error);
    throw error;
  }
};
```

---

### 3. Update User Profile

**PUT** `/users/:id`

**Request Body:**
```json
{
  "fullName": "John Doe Updated",
  "email": "newemail@example.com",
  "profilePic": "https://example.com/new-profile.jpg"
}
```

**Response (200 OK):**
```json
{
  "_id": "USER_ID",
  "fullName": "John Doe Updated",
  "email": "newemail@example.com",
  "profilePic": "https://example.com/new-profile.jpg",
  // ... other fields
}
```

**Implementation:**
```javascript
const updateUserProfile = async (userId, data) => {
  try {
    const response = await api.put(`/users/${userId}`, data);
    return response.data;
  } catch (error) {
    console.error('Update user error:', error);
    throw error;
  }
};
```

---

### 4. Get User Wallet

**GET** `/users/:id/wallet`

**Response (200 OK):**
```json
{
  "wallet": 1500.50
}
```

**Implementation:**
```javascript
const getUserWallet = async (userId) => {
  try {
    const response = await api.get(`/users/${userId}/wallet`);
    return response.data;
  } catch (error) {
    console.error('Get wallet error:', error);
    throw error;
  }
};
```

---

### 5. Update User Wallet

**PUT** `/users/:id/wallet`

**Request Body:**
```json
{
  "amount": 500,
  "operation": "add"
}
```
OR
```json
{
  "amount": 200,
  "operation": "subtract"
}
```

**Response (200 OK):**
```json
{
  "message": "Wallet updated successfully",
  "wallet": 2000.50
}
```

**Implementation:**
```javascript
const updateUserWallet = async (userId, amount, operation) => {
  try {
    const response = await api.put(`/users/${userId}/wallet`, { 
      amount, 
      operation 
    });
    return response.data;
  } catch (error) {
    console.error('Update wallet error:', error);
    throw error;
  }
};
```

---

### 6. Get All Rides by User

**GET** `/rides/user/:userId`

**Response (200 OK):**
```json
[
  {
    "_id": "RIDE_ID_1",
    "rider": "USER_ID",
    "driver": {
      "_id": "DRIVER_ID",
      "name": "Driver Name",
      "phone": "+91-9876543210",
      "rating": 4.5
    },
    "pickupAddress": "123 Main St, Bangalore",
    "dropoffAddress": "456 Park Ave, Bangalore",
    "fare": 150,
    "distanceInKm": 5.2,
    "status": "completed",
    "service": "sedan",
    "paymentMethod": "CASH",
    "actualStartTime": "2024-01-15T10:20:00.000Z",
    "actualEndTime": "2024-01-15T10:45:00.000Z",
    "actualDuration": 25,
    "createdAt": "2024-01-15T10:00:00.000Z"
  },
  {
    "_id": "RIDE_ID_2",
    "rider": "USER_ID",
    "driver": null,
    "pickupAddress": "789 Oak St, Bangalore",
    "dropoffAddress": "321 Pine St, Bangalore",
    "fare": 200,
    "distanceInKm": 8.5,
    "status": "requested",
    "service": "suv",
    "paymentMethod": "RAZORPAY",
    "createdAt": "2024-01-16T09:00:00.000Z"
  }
]
```

**Response (404 Not Found):**
```json
{
  "message": "No rides found for this user"
}
```

**Implementation:**
```javascript
const getUserRides = async (userId) => {
  try {
    const response = await api.get(`/rides/user/${userId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return []; // No rides found
    }
    console.error('Get user rides error:', error);
    throw error;
  }
};
```

---

### 7. Get Ride by ID (Ride Details)

**GET** `/rides/:id`

**Response (200 OK):**
```json
{
  "_id": "RIDE_ID",
  "rider": {
    "_id": "USER_ID",
    "fullName": "John Doe",
    "phone": "+91-9876543210",
    "email": "john@example.com",
    "profilePic": "https://example.com/profile.jpg",
    "rating": 4.8
  },
  "driver": {
    "_id": "DRIVER_ID",
    "name": "Driver Name",
    "phone": "+91-9876543211",
    "email": "driver@example.com",
    "rating": 4.5,
    "totalRatings": 150,
    "vehicleInfo": {
      "make": "Toyota",
      "model": "Innova",
      "color": "White",
      "licensePlate": "KA-01-AB-1234",
      "vehicleType": "sedan"
    }
  },
  "pickupLocation": {
    "type": "Point",
    "coordinates": [77.5946, 12.9716]
  },
  "dropoffLocation": {
    "type": "Point",
    "coordinates": [77.6, 12.98]
  },
  "pickupAddress": "123 Main St, Bangalore",
  "dropoffAddress": "456 Park Ave, Bangalore",
  "fare": 150,
  "distanceInKm": 5.2,
  "status": "completed",
  "service": "sedan",
  "rideType": "normal",
  "paymentMethod": "CASH",
  "paymentStatus": "completed",
  "startOtp": "1234",
  "stopOtp": "5678",
  "actualStartTime": "2024-01-15T10:20:00.000Z",
  "actualEndTime": "2024-01-15T10:45:00.000Z",
  "actualDuration": 25,
  "driverArrivedAt": "2024-01-15T10:15:00.000Z",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:45:00.000Z"
}
```

**Response (404 Not Found):**
```json
{
  "message": "Ride not found"
}
```

**Implementation:**
```javascript
const getRideById = async (rideId) => {
  try {
    const response = await api.get(`/rides/${rideId}`);
    return response.data;
  } catch (error) {
    console.error('Get ride details error:', error);
    throw error;
  }
};
```

---

### 8. Calculate Fare (Before Booking)

**POST** `/rides` (Create Ride - Returns fare calculation)

**Request Body:**
```json
{
  "rider": "USER_ID",
  "pickupLocation": {
    "type": "Point",
    "coordinates": [77.5946, 12.9716]
  },
  "dropoffLocation": {
    "type": "Point",
    "coordinates": [77.6, 12.98]
  },
  "pickupAddress": "123 Main St, Bangalore",
  "dropoffAddress": "456 Park Ave, Bangalore",
  "service": "sedan",
  "rideType": "normal",
  "paymentMethod": "CASH"
}
```

**Response (201 Created):**
```json
{
  "ride": {
    "_id": "RIDE_ID",
    "rider": "USER_ID",
    "pickupLocation": {
      "type": "Point",
      "coordinates": [77.5946, 12.9716]
    },
    "dropoffLocation": {
      "type": "Point",
      "coordinates": [77.6, 12.98]
    },
    "pickupAddress": "123 Main St, Bangalore",
    "dropoffAddress": "456 Park Ave, Bangalore",
    "fare": 150,
    "distanceInKm": 5.2,
    "status": "requested",
    "service": "sedan",
    "rideType": "normal",
    "paymentMethod": "CASH",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  },
  "startOtp": "1234",
  "stopOtp": "5678"
}
```

**Implementation:**
```javascript
const calculateFare = async (rideData) => {
  try {
    const response = await api.post('/rides', rideData);
    return response.data;
  } catch (error) {
    console.error('Calculate fare error:', error);
    throw error;
  }
};
```

---

### 9. Search Nearby Drivers

**POST** `/rides/search/:userId`

**Request Body:**
```json
{
  "pickupLocation": {
    "lat": 12.9716,
    "lon": 77.5946
  }
}
```

**Response (200 OK):**
```json
{
  "nearbyDrivers": [
    {
      "_id": "DRIVER_ID_1",
      "name": "Driver Name 1",
      "phone": "+91-9876543211",
      "rating": 4.5,
      "totalRatings": 150,
      "vehicleInfo": {
        "make": "Toyota",
        "model": "Innova",
        "color": "White",
        "licensePlate": "KA-01-AB-1234",
        "vehicleType": "sedan"
      },
      "location": {
        "type": "Point",
        "coordinates": [77.594, 12.971]
      },
      "isActive": true,
      "isOnline": true,
      "isBusy": false
    },
    {
      "_id": "DRIVER_ID_2",
      "name": "Driver Name 2",
      "phone": "+91-9876543212",
      "rating": 4.7,
      "totalRatings": 200,
      "vehicleInfo": {
        "make": "Honda",
        "model": "City",
        "color": "Silver",
        "licensePlate": "KA-02-CD-5678",
        "vehicleType": "sedan"
      },
      "location": {
        "type": "Point",
        "coordinates": [77.596, 12.973]
      },
      "isActive": true,
      "isOnline": true,
      "isBusy": false
    }
  ]
}
```

**Implementation:**
```javascript
const searchNearbyDrivers = async (userId, pickupLocation) => {
  try {
    const response = await api.post(`/rides/search/${userId}`, {
      pickupLocation: {
        lat: pickupLocation.latitude,
        lon: pickupLocation.longitude
      }
    });
    return response.data.nearbyDrivers;
  } catch (error) {
    console.error('Search drivers error:', error);
    throw error;
  }
};
```

---

## 📱 Complete Integration Example

### Socket Service

**`services/socket.js`**

```javascript
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOCKET_URL = 'ws://your-server-url:port';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', async () => {
      console.log('Socket connected:', this.socket.id);
      
      // Auto-register as rider
      const userId = await AsyncStorage.getItem('userId');
      if (userId) {
        this.emit('riderConnect', { userId });
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.error('Socket not connected');
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
      this.listeners.set(event, callback);
    }
  }

  off(event) {
    if (this.socket && this.listeners.has(event)) {
      this.socket.off(event, this.listeners.get(event));
      this.listeners.delete(event);
    }
  }

  removeAllListeners() {
    if (this.socket) {
      this.listeners.forEach((callback, event) => {
        this.socket.off(event, callback);
      });
      this.listeners.clear();
    }
  }
}

export default new SocketService();
```

---

### API Service

**`services/api.js`**

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://your-server-url:port';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// User APIs
export const userAPI = {
  login: (phone) => api.post('/users/login', { phone }),
  getProfile: (userId) => api.get(`/users/${userId}`),
  updateProfile: (userId, data) => api.put(`/users/${userId}`, data),
  getWallet: (userId) => api.get(`/users/${userId}/wallet`),
  updateWallet: (userId, amount, operation) => 
    api.put(`/users/${userId}/wallet`, { amount, operation }),
};

// Ride APIs
export const rideAPI = {
  getUserRides: (userId) => api.get(`/rides/user/${userId}`),
  getRideById: (rideId) => api.get(`/rides/${rideId}`),
  createRide: (rideData) => api.post('/rides', rideData),
  searchDrivers: (userId, pickupLocation) => 
    api.post(`/rides/search/${userId}`, { pickupLocation }),
};

export default api;
```

---

### Ride Manager Hook

**`hooks/useRideManager.js`**

```javascript
import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import socketService from '../services/socket';
import { rideAPI } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useRideManager = () => {
  const [currentRide, setCurrentRide] = useState(null);
  const [rideStatus, setRideStatus] = useState('idle');
  const [driverInfo, setDriverInfo] = useState(null);
  const [startOtp, setStartOtp] = useState('');
  const [stopOtp, setStopOtp] = useState('');

  useEffect(() => {
    setupSocketListeners();

    return () => {
      cleanupSocketListeners();
    };
  }, []);

  const setupSocketListeners = () => {
    // Ride requested confirmation
    socketService.on('rideRequested', handleRideRequested);
    
    // Driver accepted
    socketService.on('rideAccepted', handleRideAccepted);
    
    // Driver arrived
    socketService.on('driverArrived', handleDriverArrived);
    
    // Ride started
    socketService.on('rideStarted', handleRideStarted);
    
    // Ride completed
    socketService.on('rideCompleted', handleRideCompleted);
    
    // Ride cancelled
    socketService.on('rideCancelled', handleRideCancelled);
    
    // Errors
    socketService.on('rideError', handleRideError);
  };

  const cleanupSocketListeners = () => {
    socketService.off('rideRequested');
    socketService.off('rideAccepted');
    socketService.off('driverArrived');
    socketService.off('rideStarted');
    socketService.off('rideCompleted');
    socketService.off('rideCancelled');
    socketService.off('rideError');
  };

  const handleRideRequested = (ride) => {
    console.log('Ride requested:', ride);
    setCurrentRide(ride);
    setStartOtp(ride.startOtp);
    setStopOtp(ride.stopOtp);
    setRideStatus('searching');
  };

  const handleRideAccepted = (ride) => {
    console.log('Driver accepted:', ride);
    setCurrentRide(ride);
    setDriverInfo(ride.driver);
    setRideStatus('accepted');
    Alert.alert('Driver Found!', `${ride.driver.name} is coming to pick you up`);
  };

  const handleDriverArrived = (ride) => {
    console.log('Driver arrived:', ride);
    setRideStatus('arrived');
    Alert.alert(
      'Driver Arrived!',
      `Your driver is here. Share this OTP: ${startOtp}`,
      [{ text: 'OK' }]
    );
  };

  const handleRideStarted = (ride) => {
    console.log('Ride started:', ride);
    setRideStatus('in_progress');
    Alert.alert('Ride Started!', 'Have a safe journey');
  };

  const handleRideCompleted = (ride) => {
    console.log('Ride completed:', ride);
    setCurrentRide(ride);
    setRideStatus('completed');
  };

  const handleRideCancelled = (ride) => {
    console.log('Ride cancelled:', ride);
    Alert.alert('Ride Cancelled', 'Your ride has been cancelled');
    resetRideState();
  };

  const handleRideError = (error) => {
    console.error('Ride error:', error);
    Alert.alert('Error', error.message);
  };

  const requestRide = async (rideData) => {
    try {
      const userId = await AsyncStorage.getItem('userId');
      
      const rideRequest = {
        rider: userId,
        riderId: userId,
        userSocketId: socketService.socket.id,
        ...rideData,
      };

      socketService.emit('newRideRequest', rideRequest);
      setRideStatus('requesting');
    } catch (error) {
      console.error('Request ride error:', error);
      Alert.alert('Error', 'Failed to request ride');
    }
  };

  const cancelRide = (reason) => {
    if (currentRide) {
      socketService.emit('rideCancelled', {
        rideId: currentRide._id,
        cancelledBy: 'rider',
        reason: reason,
      });
    }
  };

  const rateDriver = (rating, review, tags) => {
    if (currentRide && driverInfo) {
      socketService.emit('submitRating', {
        rideId: currentRide._id,
        ratedBy: currentRide.rider._id || currentRide.rider,
        ratedByModel: 'User',
        ratedTo: driverInfo._id,
        ratedToModel: 'Driver',
        rating,
        review,
        tags,
      });
    }
  };

  const resetRideState = () => {
    setCurrentRide(null);
    setDriverInfo(null);
    setStartOtp('');
    setStopOtp('');
    setRideStatus('idle');
  };

  return {
    currentRide,
    rideStatus,
    driverInfo,
    startOtp,
    stopOtp,
    requestRide,
    cancelRide,
    rateDriver,
    resetRideState,
  };
};
```

---

## 📄 Ride Details Page

### Ride Details Screen

**`screens/RideDetailsScreen.js`**

```javascript
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { rideAPI } from '../services/api';

const RideDetailsScreen = ({ route, navigation }) => {
  const { rideId } = route.params;
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRideDetails();
  }, [rideId]);

  const fetchRideDetails = async () => {
    try {
      setLoading(true);
      const response = await rideAPI.getRideById(rideId);
      setRide(response.data);
    } catch (error) {
      console.error('Fetch ride details error:', error);
      Alert.alert('Error', 'Failed to load ride details');
    } finally {
      setLoading(false);
    }
  };

  const callDriver = () => {
    if (ride?.driver?.phone) {
      Linking.openURL(`tel:${ride.driver.phone}`);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#00B894';
      case 'in_progress':
        return '#0984E3';
      case 'accepted':
        return '#FDCB6E';
      case 'cancelled':
        return '#FF6B6B';
      default:
        return '#636E72';
    }
  };

  const getStatusText = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0984E3" />
        <Text style={styles.loadingText}>Loading ride details...</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Ride not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Map */}
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: ride.pickupLocation.coordinates[1],
          longitude: ride.pickupLocation.coordinates[0],
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Pickup Marker */}
        <Marker
          coordinate={{
            latitude: ride.pickupLocation.coordinates[1],
            longitude: ride.pickupLocation.coordinates[0],
          }}
          title="Pickup"
          pinColor="green"
        />

        {/* Dropoff Marker */}
        <Marker
          coordinate={{
            latitude: ride.dropoffLocation.coordinates[1],
            longitude: ride.dropoffLocation.coordinates[0],
          }}
          title="Drop-off"
          pinColor="red"
        />

        {/* Route Line */}
        <Polyline
          coordinates={[
            {
              latitude: ride.pickupLocation.coordinates[1],
              longitude: ride.pickupLocation.coordinates[0],
            },
            {
              latitude: ride.dropoffLocation.coordinates[1],
              longitude: ride.dropoffLocation.coordinates[0],
            },
          ]}
          strokeColor="#0984E3"
          strokeWidth={4}
        />
      </MapView>

      {/* Status Badge */}
      <View
        style={[
          styles.statusBadge,
          { backgroundColor: getStatusColor(ride.status) },
        ]}
      >
        <Text style={styles.statusText}>{getStatusText(ride.status)}</Text>
      </View>

      {/* Ride Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ride Information</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Ride ID</Text>
          <Text style={styles.value}>{ride._id}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.value}>{ride.pickupAddress}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Drop-off</Text>
          <Text style={styles.value}>{ride.dropoffAddress}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Distance</Text>
          <Text style={styles.value}>{ride.distanceInKm} km</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Fare</Text>
          <Text style={styles.fareValue}>₹{ride.fare}</Text>
        </View>

        {ride.actualDuration && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Duration</Text>
            <Text style={styles.value}>{ride.actualDuration} mins</Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.label}>Service</Text>
          <Text style={styles.value}>{ride.service}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Payment Method</Text>
          <Text style={styles.value}>{ride.paymentMethod}</Text>
        </View>

        {ride.paymentStatus && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Payment Status</Text>
            <Text style={styles.value}>{ride.paymentStatus}</Text>
          </View>
        )}
      </View>

      {/* Driver Info Card */}
      {ride.driver && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Driver Information</Text>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{ride.driver.name}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{ride.driver.phone}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Rating</Text>
            <Text style={styles.value}>
              ⭐ {ride.driver.rating || 'N/A'}
            </Text>
          </View>

          {ride.driver.vehicleInfo && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Vehicle</Text>
                <Text style={styles.value}>
                  {ride.driver.vehicleInfo.color}{' '}
                  {ride.driver.vehicleInfo.make}{' '}
                  {ride.driver.vehicleInfo.model}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.label}>License Plate</Text>
                <Text style={styles.licensePlate}>
                  {ride.driver.vehicleInfo.licensePlate}
                </Text>
              </View>
            </>
          )}

          {['accepted', 'in_progress'].includes(ride.status) && (
            <TouchableOpacity style={styles.callButton} onPress={callDriver}>
              <Text style={styles.callButtonText}>📞 Call Driver</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* OTP Info Card */}
      {['accepted', 'in_progress'].includes(ride.status) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>OTP Information</Text>

          {ride.status === 'accepted' && (
            <View style={styles.otpBox}>
              <Text style={styles.otpLabel}>START OTP</Text>
              <Text style={styles.otpValue}>{ride.startOtp}</Text>
              <Text style={styles.otpInstruction}>
                Share this with driver to start ride
              </Text>
            </View>
          )}

          {ride.status === 'in_progress' && (
            <View style={styles.otpBox}>
              <Text style={styles.otpLabel}>STOP OTP</Text>
              <Text style={styles.otpValue}>{ride.stopOtp}</Text>
              <Text style={styles.otpInstruction}>
                Share this with driver to end ride
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Timestamps Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Timeline</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Requested At</Text>
          <Text style={styles.value}>
            {new Date(ride.createdAt).toLocaleString()}
          </Text>
        </View>

        {ride.driverArrivedAt && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Driver Arrived At</Text>
            <Text style={styles.value}>
              {new Date(ride.driverArrivedAt).toLocaleString()}
            </Text>
          </View>
        )}

        {ride.actualStartTime && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Started At</Text>
            <Text style={styles.value}>
              {new Date(ride.actualStartTime).toLocaleString()}
            </Text>
          </View>
        )}

        {ride.actualEndTime && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Completed At</Text>
            <Text style={styles.value}>
              {new Date(ride.actualEndTime).toLocaleString()}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#636E72',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#636E72',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#0984E3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  map: {
    width: '100%',
    height: 250,
  },
  statusBadge: {
    position: 'absolute',
    top: 220,
    right: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#FFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2D3436',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  label: {
    fontSize: 14,
    color: '#636E72',
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: '#2D3436',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  fareValue: {
    fontSize: 16,
    color: '#00B894',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
  },
  licensePlate: {
    fontSize: 16,
    color: '#0984E3',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
  },
  callButton: {
    backgroundColor: '#00B894',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  callButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  otpBox: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  otpLabel: {
    fontSize: 12,
    color: '#636E72',
    marginBottom: 8,
  },
  otpValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0984E3',
    letterSpacing: 8,
    marginBottom: 8,
  },
  otpInstruction: {
    fontSize: 12,
    color: '#636E72',
    textAlign: 'center',
  },
});

export default RideDetailsScreen;
```

---

## 🚨 Error Handling

### Common Error Scenarios

```javascript
// Socket connection error
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  Alert.alert('Connection Error', 'Unable to connect to server. Please check your internet connection.');
});

// Ride error
socket.on('rideError', (error) => {
  console.error('Ride error:', error);
  
  const errorMessages = {
    'Failed to create ride': 'Unable to create ride request. Please try again.',
    'Ride already assigned': 'This ride has already been assigned to another driver.',
    'Ride not found': 'Unable to find ride details.',
  };
  
  const message = errorMessages[error.message] || error.message;
  Alert.alert('Ride Error', message);
});

// API error handling
const handleAPIError = (error) => {
  if (error.response) {
    // Server responded with error
    const status = error.response.status;
    const message = error.response.data.message || 'An error occurred';
    
    switch (status) {
      case 404:
        Alert.alert('Not Found', message);
        break;
      case 500:
        Alert.alert('Server Error', 'Something went wrong. Please try again later.');
        break;
      default:
        Alert.alert('Error', message);
    }
  } else if (error.request) {
    // No response received
    Alert.alert('Network Error', 'Unable to reach server. Please check your internet connection.');
  } else {
    // Other errors
    Alert.alert('Error', error.message);
  }
};
```

---

## ✅ Testing Checklist

### Socket Events
- [ ] Connect as rider (`riderConnect`)
- [ ] Request new ride (`newRideRequest`)
- [ ] Receive ride confirmation (`rideRequested`)
- [ ] Receive driver acceptance (`rideAccepted`)
- [ ] Track driver location (`driverLocationUpdate`)
- [ ] Receive driver arrived (`driverArrived`)
- [ ] Receive ride started (`rideStarted`)
- [ ] Track ride progress (`rideLocationUpdate`)
- [ ] Receive ride completed (`rideCompleted`)
- [ ] Cancel ride (`rideCancelled`)
- [ ] Submit rating (`submitRating`)
- [ ] Send/receive messages (`sendMessage`, `receiveMessage`)
- [ ] Emergency alert (`emergencyAlert`)

### REST APIs
- [ ] Login user
- [ ] Get user profile
- [ ] Update user profile
- [ ] Get wallet balance
- [ ] Update wallet
- [ ] Get all user rides
- [ ] Get ride by ID
- [ ] Calculate fare
- [ ] Search nearby drivers

---

## 📚 Quick Reference

### Socket Events Summary

| Event | Type | Purpose |
|-------|------|---------|
| `riderConnect` | EMIT | Connect as rider |
| `newRideRequest` | EMIT | Request new ride |
| `rideCancelled` | EMIT | Cancel ride |
| `submitRating` | EMIT | Rate driver |
| `sendMessage` | EMIT | Send message |
| `emergencyAlert` | EMIT | Trigger SOS |
| `rideRequested` | LISTEN | Ride confirmation |
| `rideAccepted` | LISTEN | Driver accepted |
| `driverLocationUpdate` | LISTEN | Driver location |
| `driverArrived` | LISTEN | Driver arrived |
| `rideStarted` | LISTEN | Ride started |
| `rideLocationUpdate` | LISTEN | Ride tracking |
| `rideCompleted` | LISTEN | Ride completed |
| `rideCancelled` | LISTEN | Ride cancelled |
| `ratingSubmitted` | LISTEN | Rating confirmed |
| `receiveMessage` | LISTEN | Incoming message |

### REST API Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/users/login` | POST | Login user |
| `/users/:id` | GET | Get user profile |
| `/users/:id` | PUT | Update profile |
| `/users/:id/wallet` | GET | Get wallet |
| `/users/:id/wallet` | PUT | Update wallet |
| `/rides/user/:userId` | GET | Get user rides |
| `/rides/:id` | GET | Get ride details |
| `/rides` | POST | Create/calculate ride |
| `/rides/search/:userId` | POST | Search drivers |

---

**This guide contains everything you need to integrate the rider app!** 🚀

All socket events, REST APIs, request bodies, responses, and complete implementation examples are included. You can copy and use the code directly in your React Native app.

