# 🚕 Cerca Taxi Booking - Socket.IO API Documentation

## 📋 Table of Contents
1. [Overview](#overview)
2. [Connection Setup](#connection-setup)
3. [Rider App Events](#rider-app-events)
4. [Driver App Events](#driver-app-events)
5. [Common Events](#common-events)
6. [Data Models](#data-models)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

---

## 🌐 Overview

This document describes all Socket.IO events for the Cerca Taxi Booking System. The system uses real-time bidirectional communication between riders, drivers, and the server.

**Socket.IO URL:** `ws://your-server-url:port` or `wss://your-server-url:port` (for SSL)

---

## 🔌 Connection Setup

### For Rider App (User/Customer)
```javascript
import io from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Connect as rider
socket.emit('riderConnect', {
  userId: 'USER_ID_HERE'
});

// Listen for connection confirmation
socket.on('riderConnect', (data) => {
  console.log('Connected as rider:', data);
});
```

### For Driver App
```javascript
import io from 'socket.io-client';

const socket = io('YOUR_SERVER_URL', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Connect as driver
socket.emit('driverConnect', {
  driverId: 'DRIVER_ID_HERE'
});

// Listen for connection confirmation
socket.on('driverConnect', (data) => {
  console.log('Connected as driver:', data);
});
```

---

## 🧑 Rider App Events

### 1. Request a New Ride

**Event:** `newRideRequest`

**Emit (Send to Server):**
```javascript
socket.emit('newRideRequest', {
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
  rideType: 'normal', // 'normal', 'whole_day', 'custom'
  paymentMethod: 'CASH' // 'CASH', 'RAZORPAY', 'WALLET'
});
```

**Listen (Receive from Server):**
```javascript
// Confirmation that request was created
socket.on('rideRequested', (ride) => {
  console.log('Ride requested:', ride);
  // Display: "Looking for nearby drivers..."
  // ride contains: _id, startOtp, stopOtp, status, etc.
});

// Error handling
socket.on('rideError', (error) => {
  console.error('Ride error:', error.message);
});
```

---

### 2. Ride Accepted by Driver

**Listen:**
```javascript
socket.on('rideAccepted', (ride) => {
  console.log('Driver accepted:', ride);
  // Display driver info:
  // - Driver name: ride.driver.name
  // - Driver phone: ride.driver.phone
  // - Vehicle: ride.driver.vehicleInfo
  // - Rating: ride.driver.rating
  // Show: "Driver is on the way"
});
```

---

### 3. Driver Arrived at Pickup

**Listen:**
```javascript
socket.on('driverArrived', (ride) => {
  console.log('Driver arrived at pickup');
  // Show notification: "Driver has arrived!"
  // Display: Start OTP (ride.startOtp)
  // Instruction: "Share this OTP with driver to start ride"
});
```

---

### 4. Track Driver Location

**Listen:**
```javascript
socket.on('driverLocationUpdate', (data) => {
  console.log('Driver location:', data);
  // Update driver marker on map
  // data.location: { longitude, latitude }
  // data.rideId: current ride ID
});
```

---

### 5. Ride Started

**Listen:**
```javascript
socket.on('rideStarted', (ride) => {
  console.log('Ride started:', ride);
  // Display: "Ride in progress"
  // Show: Real-time location tracking
  // Display: Stop OTP (ride.stopOtp)
});
```

---

### 6. Ride Location Updates (Live Tracking)

**Listen:**
```javascript
socket.on('rideLocationUpdate', (data) => {
  console.log('Ride location update:', data);
  // Update route on map
  // data.location: current location
  // data.rideId: ride ID
});
```

---

### 7. Ride Completed

**Listen:**
```javascript
socket.on('rideCompleted', (ride) => {
  console.log('Ride completed:', ride);
  // Display:
  // - Final fare: ride.fare
  // - Distance: ride.distanceInKm
  // - Duration: ride.actualDuration (minutes)
  // Show: Rating screen
  // Payment summary
});
```

---

### 8. Submit Rating for Driver

**Emit:**
```javascript
socket.emit('submitRating', {
  rideId: 'RIDE_ID',
  ratedBy: 'USER_ID',
  ratedByModel: 'User',
  ratedTo: 'DRIVER_ID',
  ratedToModel: 'Driver',
  rating: 4, // 1-5
  review: 'Great driver, smooth ride!',
  tags: ['polite', 'professional', 'clean_vehicle'] // optional
});
```

**Listen:**
```javascript
socket.on('ratingSubmitted', (data) => {
  console.log('Rating submitted:', data);
  // Show: "Thank you for your feedback!"
});

socket.on('ratingError', (error) => {
  console.error('Rating error:', error.message);
});
```

---

### 9. Cancel Ride

**Emit:**
```javascript
socket.emit('rideCancelled', {
  rideId: 'RIDE_ID',
  cancelledBy: 'rider',
  reason: 'Changed plans' // optional
});
```

**Listen:**
```javascript
socket.on('rideCancelled', (ride) => {
  console.log('Ride cancelled:', ride);
  // Display: "Ride cancelled"
  // Show cancellation fee if applicable
});
```

---

### 10. Send Message to Driver

**Emit:**
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

**Listen:**
```javascript
socket.on('receiveMessage', (message) => {
  console.log('New message from driver:', message);
  // Display message in chat
  // message.message: content
  // message.createdAt: timestamp
});

socket.on('messageSent', (data) => {
  console.log('Message sent successfully');
});
```

---

### 11. Get Ride Messages

**Emit:**
```javascript
socket.emit('getRideMessages', {
  rideId: 'RIDE_ID'
});
```

**Listen:**
```javascript
socket.on('rideMessages', (messages) => {
  console.log('All messages:', messages);
  // Display chat history
});
```

---

### 12. Emergency Alert (SOS)

**Emit:**
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
  description: 'Driver is driving rashly' // optional
});
```

**Listen:**
```javascript
socket.on('emergencyAlertCreated', (data) => {
  console.log('Emergency alert sent:', data);
  // Show: "Emergency alert sent to support team"
  // Display: Emergency hotline number
});

socket.on('emergencyAlert', (emergency) => {
  console.log('Emergency in your ride:', emergency);
  // If driver triggered emergency
});
```

---

### 13. Get Notifications

**Emit:**
```javascript
socket.emit('getNotifications', {
  userId: 'USER_ID',
  userModel: 'User'
});
```

**Listen:**
```javascript
socket.on('notifications', (notifications) => {
  console.log('All notifications:', notifications);
  // Display notification list
  // notifications: array of notification objects
});
```

---

### 14. Mark Notification as Read

**Emit:**
```javascript
socket.emit('markNotificationRead', {
  notificationId: 'NOTIFICATION_ID'
});
```

---

### 15. Disconnect

**Emit:**
```javascript
socket.emit('riderDisconnect', {
  userId: 'USER_ID'
});
```

---

## 🚗 Driver App Events

### 1. Connect as Driver

**Emit:**
```javascript
socket.emit('driverConnect', {
  driverId: 'DRIVER_ID'
});
```

**Listen:**
```javascript
socket.on('driverConnected', (driver) => {
  console.log('Connected as driver:', driver);
  // Show: "You are online"
});
```

---

### 2. Toggle Driver Status (ON/OFF for Accepting Rides)

**Emit (when driver toggles status):**
```javascript
// When driver clicks toggle switch
socket.emit('driverToggleStatus', {
  driverId: 'DRIVER_ID',
  isActive: true // true = ON (accepting rides), false = OFF
});
```

**Listen (confirmation):**
```javascript
socket.on('driverStatusUpdate', (data) => {
  console.log('Status updated:', data);
  // data = {
  //   driverId: 'DRIVER_ID',
  //   isOnline: true,
  //   isActive: true,
  //   isBusy: false,
  //   message: 'You are now accepting ride requests'
  // }
  
  // Update UI
  setIsActive(data.isActive);
  showToast(data.message);
});
```

**Important Notes:**
- Driver will ONLY receive ride requests when `isActive = true`, `isOnline = true`, and `isBusy = false`
- Socket connection (`isOnline`) is separate from ride acceptance status (`isActive`)
- When toggle is OFF, driver will NOT receive any ride notifications (even in background)

---

### 3. Update Location (Continuous)

**Emit (every 5-10 seconds while online):**
```javascript
// Update location continuously
setInterval(() => {
  navigator.geolocation.getCurrentPosition((position) => {
    socket.emit('driverLocationUpdate', {
      driverId: 'DRIVER_ID',
      location: {
        longitude: position.coords.longitude,
        latitude: position.coords.latitude
      },
      rideId: 'CURRENT_RIDE_ID' // if ride in progress
    });
  });
}, 5000); // Every 5 seconds
```

---

### 4. Receive New Ride Requests

**Listen:**
```javascript
socket.on('newRideRequest', (ride) => {
  console.log('New ride request:', ride);
  // Display:
  // - Pickup: ride.pickupAddress
  // - Dropoff: ride.dropoffAddress
  // - Distance: ride.distanceInKm
  // - Fare: ride.fare
  // - Rider name: ride.rider.fullName
  // - Rider phone: ride.rider.phone
  // Show: "Accept" and "Reject" buttons
  // Play notification sound
});
```

---

### 5. Accept Ride

**Emit:**
```javascript
socket.emit('rideAccepted', {
  rideId: 'RIDE_ID',
  driverId: 'DRIVER_ID'
});
```

**Listen:**
```javascript
socket.on('rideAssigned', (ride) => {
  console.log('Ride assigned to you:', ride);
  // Display:
  // - Rider info: ride.rider
  // - Pickup location on map
  // - Navigation to pickup
  // Show: "Navigate to pickup" button
});

socket.on('rideError', (error) => {
  console.error('Accept error:', error.message);
  // If ride already taken by another driver
  // Show: "Ride already assigned"
});
```

---

### 6. Arrived at Pickup

**Emit:**
```javascript
socket.emit('driverArrived', {
  rideId: 'RIDE_ID'
});
```

**Confirm:**
- System notifies rider
- Display: "Waiting for rider"
- Show: "Get Start OTP from rider"

---

### 7. Verify Start OTP

**Emit:**
```javascript
socket.emit('verifyStartOtp', {
  rideId: 'RIDE_ID',
  otp: '1234' // 4-digit OTP from rider
});
```

**Listen:**
```javascript
socket.on('otpVerified', (data) => {
  console.log('OTP verified:', data);
  // Proceed to start ride
});

socket.on('otpVerificationFailed', (error) => {
  console.error('Invalid OTP:', error.message);
  // Show: "Invalid OTP, please try again"
});
```

---

### 8. Start Ride

**Emit:**
```javascript
socket.emit('rideStarted', {
  rideId: 'RIDE_ID',
  otp: '1234' // OTP from rider
});
```

**Listen:**
```javascript
socket.on('rideStarted', (ride) => {
  console.log('Ride started:', ride);
  // Display:
  // - "Navigate to destination"
  // - Real-time navigation
  // - Timer started
  // Show: "End Ride" button
});
```

---

### 9. Send Location Updates During Ride

**Emit (every 3-5 seconds):**
```javascript
socket.emit('rideLocationUpdate', {
  rideId: 'RIDE_ID',
  driverId: 'DRIVER_ID',
  userSocketId: 'RIDER_SOCKET_ID',
  location: {
    longitude: position.coords.longitude,
    latitude: position.coords.latitude
  }
});
```

---

### 10. Verify Stop OTP

**Emit:**
```javascript
socket.emit('verifyStopOtp', {
  rideId: 'RIDE_ID',
  otp: '5678' // 4-digit OTP from rider
});
```

**Listen:**
```javascript
socket.on('otpVerified', (data) => {
  console.log('Stop OTP verified:', data);
  // Proceed to complete ride
});

socket.on('otpVerificationFailed', (error) => {
  console.error('Invalid stop OTP:', error.message);
});
```

---

### 11. Complete Ride

**Emit:**
```javascript
socket.emit('rideCompleted', {
  rideId: 'RIDE_ID',
  fare: 150, // Final calculated fare
  otp: '5678' // Stop OTP from rider
});
```

**Listen:**
```javascript
socket.on('rideCompleted', (ride) => {
  console.log('Ride completed:', ride);
  // Display:
  // - Ride summary
  // - Earnings: ride.fare
  // - Duration: ride.actualDuration
  // Show: Rating screen
  // Show: "Ready for next ride"
});
```

---

### 12. Submit Rating for Rider

**Emit:**
```javascript
socket.emit('submitRating', {
  rideId: 'RIDE_ID',
  ratedBy: 'DRIVER_ID',
  ratedByModel: 'Driver',
  ratedTo: 'USER_ID',
  ratedToModel: 'User',
  rating: 5,
  review: 'Great passenger!',
  tags: ['polite', 'on_time'] // optional
});
```

---

### 13. Cancel Ride

**Emit:**
```javascript
socket.emit('rideCancelled', {
  rideId: 'RIDE_ID',
  cancelledBy: 'driver',
  reason: 'Rider not responding' // optional
});
```

---

### 14. Send Message to Rider

**Emit:**
```javascript
socket.emit('sendMessage', {
  rideId: 'RIDE_ID',
  senderId: 'DRIVER_ID',
  senderModel: 'Driver',
  receiverId: 'USER_ID',
  receiverModel: 'User',
  message: 'I have arrived at the pickup location',
  messageType: 'text'
});
```

**Listen:**
```javascript
socket.on('receiveMessage', (message) => {
  console.log('Message from rider:', message);
});
```

---

### 15. Emergency Alert

**Emit:**
```javascript
socket.emit('emergencyAlert', {
  rideId: 'RIDE_ID',
  triggeredBy: 'DRIVER_ID',
  triggeredByModel: 'Driver',
  location: {
    longitude: 77.5946,
    latitude: 12.9716
  },
  reason: 'accident',
  description: 'Minor accident occurred'
});
```

---

### 16. Go Offline

**Emit:**
```javascript
socket.emit('driverDisconnect', {
  driverId: 'DRIVER_ID'
});
```

---

## 🔄 Common Events (Both Apps)

### Error Handling

**Listen to all error events:**
```javascript
socket.on('errorEvent', (error) => {
  console.error('Socket error:', error.message);
  // Handle connection errors
});

socket.on('rideError', (error) => {
  console.error('Ride error:', error.message);
});

socket.on('messageError', (error) => {
  console.error('Message error:', error.message);
});

socket.on('emergencyError', (error) => {
  console.error('Emergency error:', error.message);
});
```

---

### Connection Status

```javascript
socket.on('connect', () => {
  console.log('Connected to server');
  // Show: "Online"
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  // Show: "Offline - Trying to reconnect..."
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  // Re-register as rider/driver
});
```

---

## 📊 Data Models

### Ride Object
```javascript
{
  _id: "ride_id",
  rider: {
    _id: "user_id",
    fullName: "John Doe",
    phone: "+91-9876543210",
    email: "john@example.com"
  },
  driver: {
    _id: "driver_id",
    name: "Driver Name",
    phone: "+91-9876543211",
    rating: 4.5,
    vehicleInfo: {
      make: "Toyota",
      model: "Innova",
      color: "White",
      licensePlate: "KA-01-AB-1234"
    }
  },
  pickupLocation: {
    type: "Point",
    coordinates: [77.5946, 12.9716]
  },
  dropoffLocation: {
    type: "Point",
    coordinates: [77.6, 12.98]
  },
  pickupAddress: "123 Main St",
  dropoffAddress: "456 Park Ave",
  fare: 150,
  distanceInKm: 5.2,
  status: "requested", // 'requested', 'accepted', 'in_progress', 'completed', 'cancelled'
  rideType: "normal",
  startOtp: "1234",
  stopOtp: "5678",
  paymentMethod: "CASH",
  actualStartTime: "2024-01-15T10:30:00Z",
  actualEndTime: "2024-01-15T11:00:00Z",
  actualDuration: 30, // minutes
  driverArrivedAt: "2024-01-15T10:25:00Z",
  createdAt: "2024-01-15T10:15:00Z",
  updatedAt: "2024-01-15T11:00:00Z"
}
```

### Message Object
```javascript
{
  _id: "message_id",
  ride: "ride_id",
  sender: "user_id",
  senderModel: "User", // or "Driver"
  receiver: "driver_id",
  receiverModel: "Driver", // or "User"
  message: "I am wearing a blue shirt",
  messageType: "text",
  isRead: false,
  createdAt: "2024-01-15T10:20:00Z"
}
```

### Notification Object
```javascript
{
  _id: "notification_id",
  recipient: "user_id",
  recipientModel: "User", // or "Driver"
  title: "Ride Accepted",
  message: "Driver is on the way",
  type: "ride_accepted",
  relatedRide: "ride_id",
  isRead: false,
  createdAt: "2024-01-15T10:15:00Z"
}
```

### Rating Object
```javascript
{
  _id: "rating_id",
  ride: "ride_id",
  ratedBy: "user_id",
  ratedByModel: "User",
  ratedTo: "driver_id",
  ratedToModel: "Driver",
  rating: 4,
  review: "Great driver!",
  tags: ["polite", "professional"],
  createdAt: "2024-01-15T11:05:00Z"
}
```

---

## ⚠️ Error Handling

### Common Errors

| Error | Description | Solution |
|-------|-------------|----------|
| `Failed to register rider socket` | userId not provided | Ensure userId is sent in riderConnect |
| `Failed to register driver socket` | driverId not provided | Ensure driverId is sent in driverConnect |
| `Ride already assigned` | Another driver accepted | Show "Ride taken by another driver" |
| `Invalid OTP` | Wrong OTP entered | Ask user to re-enter OTP |
| `Ride not found` | Invalid ride ID | Refresh ride data |
| `Rating already submitted` | Duplicate rating | Show "You already rated this ride" |

---

## ✅ Best Practices

### For Rider App

1. **Connection Management**
   - Connect on app launch
   - Reconnect automatically on network change
   - Disconnect when app goes to background (save battery)

2. **Location Updates**
   - Listen to driver location updates only during active ride
   - Update map markers smoothly (use animation)

3. **Notifications**
   - Request notification permissions on first launch
   - Play sound/vibration for important events (driver arrived, ride started)
   - Show local notifications when app is in background

4. **OTP Display**
   - Show Start OTP prominently when driver arrives
   - Show Stop OTP when reaching destination
   - Allow copy-to-clipboard for OTPs

5. **Error Handling**
   - Always listen to `rideError` events
   - Show user-friendly error messages
   - Provide retry options

### For Driver App

1. **Background Location**
   - Keep location updating even when app is in background
   - Use background location services (with permission)
   - Send location every 3-5 seconds during ride

2. **Ride Notifications**
   - Play distinct sound for new ride requests
   - Show notification even when app is in background
   - Highlight urgent ride requests (nearby, high fare)

3. **Battery Optimization**
   - Reduce location update frequency when not on ride
   - Disconnect socket when driver goes offline
   - Use efficient location APIs

4. **Navigation**
   - Integrate with Google Maps/Apple Maps for turn-by-turn
   - Show ETA to rider continuously
   - Update route in real-time based on traffic

5. **Earnings Tracking**
   - Display daily earnings
   - Show ride count and average rating
   - Track online hours

### General

1. **Socket Reconnection**
   ```javascript
   socket.on('reconnect', () => {
     // Re-register connection
     if (userType === 'rider') {
       socket.emit('riderConnect', { userId });
     } else {
       socket.emit('driverConnect', { driverId });
     }
   });
   ```

2. **Handle Disconnection**
   ```javascript
   socket.on('disconnect', () => {
     // Show "Reconnecting..." message
     // Stop location updates
     // Save app state
   });
   ```

3. **Event Cleanup**
   ```javascript
   // Remove listeners when component unmounts
   useEffect(() => {
     socket.on('rideAccepted', handleRideAccepted);
     
     return () => {
       socket.off('rideAccepted', handleRideAccepted);
     };
   }, []);
   ```

---

## 📱 Complete Flow Examples

### Rider App Flow

```
1. App Launch
   ↓
2. Connect Socket → emit('riderConnect')
   ↓
3. Request Ride → emit('newRideRequest')
   ↓
4. Wait for Driver → listen('rideAccepted')
   ↓
5. Track Driver → listen('driverLocationUpdate')
   ↓
6. Driver Arrives → listen('driverArrived')
   ↓
7. Share Start OTP with Driver
   ↓
8. Ride Starts → listen('rideStarted')
   ↓
9. Track Ride Progress → listen('rideLocationUpdate')
   ↓
10. Ride Ends → listen('rideCompleted')
    ↓
11. Share Stop OTP with Driver
    ↓
12. Rate Driver → emit('submitRating')
    ↓
13. Payment Summary
```

### Driver App Flow

```
1. App Launch
   ↓
2. Connect Socket → emit('driverConnect')
   ↓
3. Start Location Updates → emit('driverLocationUpdate')
   ↓
4. Wait for Rides → listen('newRideRequest')
   ↓
5. Accept Ride → emit('rideAccepted')
   ↓
6. Navigate to Pickup
   ↓
7. Arrive → emit('driverArrived')
   ↓
8. Get Start OTP from Rider
   ↓
9. Verify & Start → emit('verifyStartOtp') → emit('rideStarted')
   ↓
10. Navigate to Destination
    ↓
11. Send Live Location → emit('rideLocationUpdate')
    ↓
12. Arrive at Destination
    ↓
13. Get Stop OTP from Rider
    ↓
14. Complete Ride → emit('verifyStopOtp') → emit('rideCompleted')
    ↓
15. Rate Rider → emit('submitRating')
    ↓
16. Ready for Next Ride
```

---

## 🆘 Emergency Flow

### For Both Rider and Driver

```javascript
// Trigger Emergency
function triggerEmergency() {
  navigator.geolocation.getCurrentPosition((position) => {
    socket.emit('emergencyAlert', {
      rideId: currentRideId,
      triggeredBy: userId, // or driverId
      triggeredByModel: 'User', // or 'Driver'
      location: {
        longitude: position.coords.longitude,
        latitude: position.coords.latitude
      },
      reason: 'unsafe_driving', // or other reason
      description: 'Additional details...'
    });
  });
  
  // Show emergency contacts
  // Call emergency hotline
  // Share location with emergency contacts
}

// Listen for emergency confirmation
socket.on('emergencyAlertCreated', (data) => {
  // Show: "Emergency alert sent to support"
  // Display: Support phone number
  // Keep sharing live location
});
```

---

## 📞 Support

For issues or questions:
- Email: support@cerca-taxi.com
- Phone: +91-1234567890
- Documentation: https://docs.cerca-taxi.com

---

## 🔐 Security Notes

1. **Never share socket IDs publicly**
2. **Validate all data on server side**
3. **Use HTTPS/WSS in production**
4. **Implement rate limiting**
5. **Sanitize user inputs**
6. **Keep OTPs secure (4-digit, time-limited)**
7. **Log all emergency alerts**
8. **Encrypt sensitive data in transit**

---

## 📝 Version History

- **v1.0.0** (2024-01-15) - Initial release with all features
  - Connection management
  - Ride booking flow
  - OTP verification
  - Real-time tracking
  - Messaging system
  - Rating & reviews
  - Emergency alerts
  - Notifications

---

**Last Updated:** January 2024  
**API Version:** 1.0.0  
**Maintained by:** Cerca Development Team

