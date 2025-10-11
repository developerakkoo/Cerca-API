# 🚀 Quick Start Guide

## 📁 New Files Created

```
Models/Driver/
├── rating.model.js          ✅ NEW - Rating & review system
└── message.model.js         ✅ NEW - In-app messaging

Models/User/
├── notification.model.js    ✅ NEW - Push notifications
└── emergency.model.js       ✅ NEW - SOS/Emergency system
```

## 🔄 Files Updated

```
Models/Driver/
├── driver.model.js          ✅ UPDATED - Added ratings, vehicle info, online status
└── ride.model.js            ✅ UPDATED - Added time tracking, ratings, payment fields

utils/
├── ride_booking_functions.js  ✅ UPDATED - Added 20+ new functions
└── socket.js                   ✅ UPDATED - Complete rewrite with all events
```

## 🎯 What's New?

### For Riders
- ✅ Get Start/Stop OTP for verification
- ✅ Rate driver after ride
- ✅ Chat with driver during ride
- ✅ Get real-time notifications
- ✅ Emergency SOS button
- ✅ Better location tracking

### For Drivers
- ✅ Verify rider OTP before start/end
- ✅ Rate rider after ride
- ✅ Chat with rider during ride
- ✅ Get notifications for nearby rides only
- ✅ Emergency SOS button
- ✅ Track online/offline status

## 📖 Documentation

1. **`SOCKET_API_DOCUMENTATION.md`** - Complete API docs (USE THIS!)
2. **`IMPLEMENTATION_SUMMARY.md`** - What was implemented
3. **`QUICK_START.md`** - This file

## 🔑 Key Socket Events

### Rider App Must Use:
```javascript
// Connect
socket.emit('riderConnect', { userId })

// Request ride
socket.emit('newRideRequest', { ...data })

// Listen for acceptance
socket.on('rideAccepted', (ride) => ...)

// Listen for driver arrived
socket.on('driverArrived', (ride) => ...)

// When ride starts
socket.on('rideStarted', (ride) => ...)

// When ride ends
socket.on('rideCompleted', (ride) => ...)

// Submit rating
socket.emit('submitRating', { ...data })

// Emergency
socket.emit('emergencyAlert', { ...data })
```

### Driver App Must Use:
```javascript
// Connect
socket.emit('driverConnect', { driverId })

// Send location (every 5 sec)
socket.emit('driverLocationUpdate', { ...data })

// Listen for rides
socket.on('newRideRequest', (ride) => ...)

// Accept ride
socket.emit('rideAccepted', { rideId, driverId })

// Mark arrived
socket.emit('driverArrived', { rideId })

// Verify & start ride
socket.emit('verifyStartOtp', { rideId, otp })
socket.emit('rideStarted', { rideId, otp })

// Verify & complete ride
socket.emit('verifyStopOtp', { rideId, otp })
socket.emit('rideCompleted', { rideId, fare, otp })

// Submit rating
socket.emit('submitRating', { ...data })
```

## 🆘 Emergency Use

```javascript
socket.emit('emergencyAlert', {
  rideId: 'RIDE_ID',
  triggeredBy: 'USER_ID',
  triggeredByModel: 'User', // or 'Driver'
  location: { longitude: 77.59, latitude: 12.97 },
  reason: 'unsafe_driving',
  description: 'Optional details'
});
```

## 💬 Messaging

```javascript
// Send message
socket.emit('sendMessage', {
  rideId: 'RIDE_ID',
  senderId: 'YOUR_ID',
  senderModel: 'User', // or 'Driver'
  receiverId: 'RECEIVER_ID',
  receiverModel: 'Driver', // or 'User'
  message: 'Hello!',
  messageType: 'text'
});

// Receive message
socket.on('receiveMessage', (message) => {
  console.log('New message:', message.message);
});
```

## ⭐ Rating

```javascript
socket.emit('submitRating', {
  rideId: 'RIDE_ID',
  ratedBy: 'YOUR_ID',
  ratedByModel: 'User', // or 'Driver'
  ratedTo: 'OTHER_PERSON_ID',
  ratedToModel: 'Driver', // or 'User'
  rating: 5, // 1-5
  review: 'Great ride!',
  tags: ['polite', 'professional']
});
```

## 🔐 OTP Flow

### Start Ride:
1. Driver arrives at pickup
2. Driver sees Start OTP on screen
3. Rider shares OTP with driver
4. Driver enters OTP: `socket.emit('verifyStartOtp', { rideId, otp })`
5. If valid: `socket.emit('rideStarted', { rideId, otp })`

### End Ride:
1. Driver reaches destination
2. Driver sees Stop OTP on screen
3. Rider shares OTP with driver
4. Driver enters OTP: `socket.emit('verifyStopOtp', { rideId, otp })`
5. If valid: `socket.emit('rideCompleted', { rideId, fare, otp })`

## 📱 Testing with Postman/Socket.io Client

1. Install Socket.io client:
```bash
npm install -g socket.io-client
```

2. Test in Node REPL:
```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:YOUR_PORT');

// Connect as rider
socket.emit('riderConnect', { userId: 'test123' });

// Listen for events
socket.on('rideRequested', console.log);
socket.on('rideAccepted', console.log);
```

## 🐛 Troubleshooting

**Socket not connecting?**
- Check server running: `npm start`
- Check port correct
- Check CORS settings in socket.js

**Events not working?**
- Check event name spelling
- Check data format matches docs
- Check user/driver ID valid
- Check socket connected: `socket.connected`

**OTP not working?**
- Check OTP is 4 digits
- Check ride status is correct
- Ride must be 'accepted' for start OTP
- Ride must be 'in_progress' for stop OTP

## ✅ Checklist Before Going Live

- [ ] Test all socket events
- [ ] Test OTP verification
- [ ] Test emergency system
- [ ] Test ratings system
- [ ] Test messaging
- [ ] Test with multiple users simultaneously
- [ ] Test reconnection
- [ ] Test error handling
- [ ] Add SSL/TLS (HTTPS/WSS)
- [ ] Add authentication (JWT)
- [ ] Add rate limiting
- [ ] Monitor socket connections
- [ ] Log all emergencies
- [ ] Setup error alerts

## 📊 Database Indexes Required

Run these in MongoDB:
```javascript
// Driver location index
db.drivers.createIndex({ location: "2dsphere" });

// Ride location indexes
db.rides.createIndex({ pickupLocation: "2dsphere" });
db.rides.createIndex({ dropoffLocation: "2dsphere" });

// Performance indexes
db.rides.createIndex({ status: 1, createdAt: -1 });
db.notifications.createIndex({ recipient: 1, isRead: 1, createdAt: -1 });
db.messages.createIndex({ ride: 1, createdAt: 1 });
db.ratings.createIndex({ ratedTo: 1, ratedToModel: 1 });
```

## 🎊 You're Ready!

Read `SOCKET_API_DOCUMENTATION.md` for complete details.

Happy coding! 🚀

