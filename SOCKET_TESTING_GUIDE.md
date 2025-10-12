# 🧪 Socket.IO Testing Guide for Driver App

## Quick Testing with Postman

### Prerequisites
- Install Postman (latest version with WebSocket support)
- Have your server running
- Get a valid `driverId` and `userId` from your database

---

## 🎯 Test Scenario 1: Driver Toggle Status (ON/OFF)

### Step 1: Connect as Driver
**Event:** `driverConnect`
```json
{
  "driverId": "YOUR_DRIVER_ID_HERE"
}
```

**Expected Response:** `driverStatusUpdate`
```json
{
  "driverId": "YOUR_DRIVER_ID_HERE",
  "isOnline": true,
  "isActive": false,
  "isBusy": false
}
```

### Step 2: Toggle Status to ON
**Event:** `driverToggleStatus`
```json
{
  "driverId": "YOUR_DRIVER_ID_HERE",
  "isActive": true
}
```

**Expected Response:** `driverStatusUpdate`
```json
{
  "driverId": "YOUR_DRIVER_ID_HERE",
  "isOnline": true,
  "isActive": true,
  "isBusy": false,
  "message": "You are now accepting ride requests"
}
```

### Step 3: Toggle Status to OFF
**Event:** `driverToggleStatus`
```json
{
  "driverId": "YOUR_DRIVER_ID_HERE",
  "isActive": false
}
```

**Expected Response:** `driverStatusUpdate`
```json
{
  "driverId": "YOUR_DRIVER_ID_HERE",
  "isOnline": true,
  "isActive": false,
  "isBusy": false,
  "message": "You are now offline for ride requests"
}
```

---

## 🚗 Test Scenario 2: New Ride Request (Driver Toggle ON)

### Postman Setup
**Open TWO WebSocket connections:**
1. **Connection 1:** Driver (Toggle ON)
2. **Connection 2:** Rider (to create ride)

### Connection 1 (Driver):

**Step 1:** Connect as driver
```json
{
  "driverId": "DRIVER_ID"
}
```

**Step 2:** Toggle ON
```json
{
  "driverId": "DRIVER_ID",
  "isActive": true
}
```

**Step 3:** Update driver location (so driver is "nearby")
```json
{
  "driverId": "DRIVER_ID",
  "location": {
    "longitude": 77.5946,
    "latitude": 12.9716
  }
}
```

### Connection 2 (Rider):

**Step 4:** Connect as rider
```json
{
  "userId": "USER_ID"
}
```

**Step 5:** Request a new ride (near driver's location)
```json
{
  "rider": "USER_ID",
  "riderId": "USER_ID",
  "pickupLocation": {
    "longitude": 77.5946,
    "latitude": 12.9716
  },
  "dropoffLocation": {
    "longitude": 77.6,
    "latitude": 12.98
  },
  "pickupAddress": "123 Main St, Bangalore",
  "dropoffAddress": "456 Park Ave, Bangalore",
  "fare": 150,
  "distanceInKm": 5.2,
  "service": "sedan",
  "rideType": "normal",
  "paymentMethod": "CASH"
}
```

### Expected Result (Connection 1 - Driver):
**Driver receives:** `newRideRequest`
```json
{
  "_id": "RIDE_ID",
  "rider": {
    "fullName": "John Doe",
    "phone": "+91-XXXXXXXXXX"
  },
  "pickupAddress": "123 Main St, Bangalore",
  "dropoffAddress": "456 Park Ave, Bangalore",
  "fare": 150,
  "distanceInKm": 5.2,
  "status": "requested",
  "startOtp": "1234",
  "stopOtp": "5678"
}
```

✅ **Driver should see the ride request!**

---

## 🚫 Test Scenario 3: No Ride Request (Driver Toggle OFF)

### Connection 1 (Driver):

**Step 1:** Connect as driver
```json
{
  "driverId": "DRIVER_ID"
}
```

**Step 2:** Make sure toggle is OFF
```json
{
  "driverId": "DRIVER_ID",
  "isActive": false
}
```

**Step 3:** Update driver location
```json
{
  "driverId": "DRIVER_ID",
  "location": {
    "longitude": 77.5946,
    "latitude": 12.9716
  }
}
```

### Connection 2 (Rider):

**Step 4:** Request a ride (same as before)
```json
{
  "rider": "USER_ID",
  "riderId": "USER_ID",
  "pickupLocation": {
    "longitude": 77.5946,
    "latitude": 12.9716
  },
  "dropoffLocation": {
    "longitude": 77.6,
    "latitude": 12.98
  },
  "pickupAddress": "123 Main St, Bangalore",
  "dropoffAddress": "456 Park Ave, Bangalore",
  "fare": 150,
  "distanceInKm": 5.2,
  "service": "sedan",
  "rideType": "normal",
  "paymentMethod": "CASH"
}
```

### Expected Result (Connection 1 - Driver):
❌ **Driver does NOT receive `newRideRequest`** (because toggle is OFF)

✅ **This is the correct behavior!**

### Check Server Logs:
You should see:
```
Found 0 nearby drivers for rideId: XXXXX
```
or
```
No nearby drivers found for rideId: XXXXX, broadcasting to all drivers
```

---

## ✅ Test Scenario 4: Accept Ride

### Driver Connection:

**Step 1:** Ensure driver toggle is ON and has received a ride request

**Step 2:** Accept the ride
```json
{
  "rideId": "RIDE_ID_FROM_REQUEST",
  "driverId": "DRIVER_ID"
}
```

**Expected Response:** `rideAssigned`
```json
{
  "_id": "RIDE_ID",
  "status": "accepted",
  "driver": {
    "_id": "DRIVER_ID",
    "name": "Driver Name",
    "phone": "+91-XXXXXXXXXX",
    "vehicleInfo": { ... }
  },
  "rider": { ... }
}
```

### Rider Connection:
**Rider receives:** `rideAccepted`
```json
{
  "_id": "RIDE_ID",
  "status": "accepted",
  "driver": {
    "name": "Driver Name",
    "phone": "+91-XXXXXXXXXX"
  }
}
```

---

## 🔄 Test Scenario 5: Complete Ride Flow

### 1. Driver Connects
```json
{
  "driverId": "DRIVER_ID"
}
```

### 2. Driver Toggles ON
```json
{
  "driverId": "DRIVER_ID",
  "isActive": true
}
```

### 3. Rider Requests Ride
```json
{
  "rider": "USER_ID",
  "pickupLocation": { "longitude": 77.5946, "latitude": 12.9716 },
  "dropoffLocation": { "longitude": 77.6, "latitude": 12.98 },
  "pickupAddress": "123 Main St",
  "dropoffAddress": "456 Park Ave",
  "fare": 150,
  "distanceInKm": 5.2
}
```

### 4. Driver Accepts
```json
{
  "rideId": "RIDE_ID",
  "driverId": "DRIVER_ID"
}
```

### 5. Driver Arrives at Pickup
```json
{
  "rideId": "RIDE_ID"
}
```

### 6. Driver Starts Ride (with OTP)
```json
{
  "rideId": "RIDE_ID",
  "otp": "1234"
}
```

### 7. Driver Sends Location Updates During Ride
```json
{
  "rideId": "RIDE_ID",
  "driverId": "DRIVER_ID",
  "location": {
    "longitude": 77.595,
    "latitude": 12.972
  }
}
```

### 8. Driver Completes Ride (with Stop OTP)
```json
{
  "rideId": "RIDE_ID",
  "fare": 150,
  "otp": "5678"
}
```

### 9. Driver Rates Rider
```json
{
  "rideId": "RIDE_ID",
  "ratedBy": "DRIVER_ID",
  "ratedByModel": "Driver",
  "ratedTo": "USER_ID",
  "ratedToModel": "User",
  "rating": 5,
  "review": "Great passenger!"
}
```

---

## 🎨 Testing in Postman

### Create WebSocket Request

1. **Open Postman**
2. **Click "New" → "WebSocket Request"**
3. **Enter URL:** `ws://localhost:YOUR_PORT` (or your server URL)
4. **Click "Connect"**

### Send Events

1. **In the "Message" tab:**
   - Select "JSON" format
   - Enter event name in top field (e.g., `driverConnect`)
   - Enter JSON payload in message body
   - Click "Send"

2. **View Responses:**
   - Switch to "Messages" tab
   - See all incoming events from server

### Example Screenshot Layout:
```
┌─────────────────────────────────────────┐
│  WebSocket URL: ws://localhost:3000     │
│  [Connect] [Disconnect]                 │
├─────────────────────────────────────────┤
│  Message                                │
│  ┌───────────────────────────────────┐  │
│  │ Event: driverConnect             │  │
│  │                                   │  │
│  │ {                                 │  │
│  │   "driverId": "67abc123..."       │  │
│  │ }                                 │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│  [Send]                                 │
├─────────────────────────────────────────┤
│  Messages ↓                             │
│  ← driverStatusUpdate                   │
│     { "isOnline": true, ... }           │
│  ← newRideRequest                       │
│     { "rider": ..., "fare": 150 }       │
└─────────────────────────────────────────┘
```

---

## 📊 Expected Behaviors Summary

| Scenario | Driver Toggle | Socket Connected | Receives Rides? |
|----------|---------------|------------------|-----------------|
| 1 | OFF | ❌ No | ❌ NO |
| 2 | OFF | ✅ Yes | ❌ NO |
| 3 | ON | ❌ No | ❌ NO |
| 4 | ON | ✅ Yes | ✅ YES |

### Status Display Logic:
- **"Online - Accepting Rides"** = `isOnline: true`, `isActive: true`, `isBusy: false`
- **"Online - Not Accepting"** = `isOnline: true`, `isActive: false`
- **"On a Ride"** = `isBusy: true`
- **"Disconnected"** = `isOnline: false` (socket not connected)
- **"Offline"** = Default state

---

## 🐛 Common Issues & Debugging

### Issue 1: Driver Not Receiving Rides (Toggle is ON)

**Check:**
1. Is socket connected? → Listen for `connect` event
2. Is `isActive = true`? → Check `driverStatusUpdate` response
3. Is driver location updated? → Send `driverLocationUpdate` event
4. Is driver within 10km of pickup? → Check coordinates
5. Is `isBusy = false`? → Check driver status in database

**Solution:**
```javascript
// Make sure driver is nearby the pickup location
socket.emit('driverLocationUpdate', {
  driverId: "DRIVER_ID",
  location: {
    longitude: 77.5946, // SAME or CLOSE to pickup
    latitude: 12.9716
  }
});
```

### Issue 2: Toggle Event Not Working

**Check Server Logs:**
```bash
# You should see:
driverToggleStatus event - driverId: XXX, isActive: true
Driver toggle status updated - driverId: XXX, isActive: true
```

**If not:**
- Check if `driverId` is valid
- Check if `isActive` is a boolean (not string "true")
- Check socket connection

### Issue 3: Status Not Updating in App

**Check:**
1. Are you listening to `driverStatusUpdate` event?
2. Is the event handler updating state correctly?
3. Check React Native state updates (use `useEffect` dependencies)

**Solution:**
```javascript
socket.on('driverStatusUpdate', (data) => {
  console.log('Status update:', data); // Debug log
  setIsActive(data.isActive);
  setIsOnline(data.isOnline);
  setIsBusy(data.isBusy);
});
```

---

## 📝 Testing Checklist

- [ ] Driver can connect via `driverConnect`
- [ ] Driver receives `driverStatusUpdate` on connect
- [ ] Driver can toggle status ON via `driverToggleStatus`
- [ ] Driver can toggle status OFF via `driverToggleStatus`
- [ ] Driver receives rides when toggle is ON
- [ ] Driver does NOT receive rides when toggle is OFF
- [ ] Status text updates based on `isOnline`, `isActive`, `isBusy`
- [ ] Driver can accept ride via `rideAccepted`
- [ ] Driver can update location via `driverLocationUpdate`
- [ ] Driver can disconnect via `driverDisconnect`

---

## 🚀 Next Steps

1. **Test with Postman** using the scenarios above
2. **Implement in Mobile App** using the DRIVER_APP_IMPLEMENTATION_GUIDE.md
3. **Test Background Notifications** (requires FCM setup)
4. **Test on Real Devices** (not just emulator)

---

**For full implementation details, see:** `DRIVER_APP_IMPLEMENTATION_GUIDE.md`
**For all socket events, see:** `SOCKET_API_DOCUMENTATION.md`

