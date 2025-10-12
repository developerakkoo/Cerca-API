# 🚗 Quick Reference: Driver Toggle & Ride Requests

## 🔥 Quick Socket Events

### Driver Status Toggle
```javascript
// Toggle ON (start accepting rides)
socket.emit('driverToggleStatus', {
  driverId: 'YOUR_DRIVER_ID',
  isActive: true
});

// Toggle OFF (stop accepting rides)
socket.emit('driverToggleStatus', {
  driverId: 'YOUR_DRIVER_ID',
  isActive: false
});

// Listen for status updates
socket.on('driverStatusUpdate', (data) => {
  console.log(data);
  // { driverId, isOnline, isActive, isBusy, message }
});
```

---

## 📊 Status Logic

| isOnline | isActive | isBusy | Status Display | Receives Rides? |
|----------|----------|--------|----------------|-----------------|
| ✅ Yes | ✅ Yes | ❌ No | "Online - Accepting Rides" 🟢 | ✅ YES |
| ✅ Yes | ❌ No | ❌ No | "Online - Not Accepting" 🟡 | ❌ NO |
| ✅ Yes | ✅ Yes | ✅ Yes | "On a Ride" 🟠 | ❌ NO |
| ❌ No | - | - | "Disconnected" 🔴 | ❌ NO |

---

## 🎯 Postman Quick Test

### 1. Connect Driver
```json
Event: driverConnect
{
  "driverId": "67abc123..."
}
```

### 2. Toggle ON
```json
Event: driverToggleStatus
{
  "driverId": "67abc123...",
  "isActive": true
}
```

### 3. Update Location
```json
Event: driverLocationUpdate
{
  "driverId": "67abc123...",
  "location": {
    "longitude": 77.5946,
    "latitude": 12.9716
  }
}
```

### 4. Request Ride (Different Connection)
```json
Event: newRideRequest
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

### 5. Accept Ride
```json
Event: rideAccepted
{
  "rideId": "RIDE_ID_FROM_REQUEST",
  "driverId": "67abc123..."
}
```

---

## ✅ Expected Behaviors

### ✅ Toggle ON → Receives Rides
1. Emit `driverToggleStatus` with `isActive: true`
2. Create ride request from rider
3. **Driver receives `newRideRequest` event** ✅

### ❌ Toggle OFF → No Rides
1. Emit `driverToggleStatus` with `isActive: false`
2. Create ride request from rider
3. **Driver does NOT receive `newRideRequest` event** ✅

---

## 📱 Mobile App Code Snippet

```jsx
import { socket } from './services/socket';

// Toggle handler
const handleToggle = (isActive) => {
  socket.emit('driverToggleStatus', {
    driverId: driverId,
    isActive: isActive
  });
};

// Listen for status updates
useEffect(() => {
  socket.on('driverStatusUpdate', (data) => {
    setIsActive(data.isActive);
    setIsOnline(data.isOnline);
    setIsBusy(data.isBusy);
  });

  socket.on('newRideRequest', (ride) => {
    if (!isActive) return; // Don't show if toggle is OFF
    setIncomingRide(ride);
    setShowOverlay(true);
  });

  return () => {
    socket.off('driverStatusUpdate');
    socket.off('newRideRequest');
  };
}, [isActive]);
```

---

## 🐛 Debugging Checklist

### Driver Not Receiving Rides?
- [ ] Is socket connected? (`isOnline = true`)
- [ ] Is toggle ON? (`isActive = true`)
- [ ] Is driver available? (`isBusy = false`)
- [ ] Is location updated? (send `driverLocationUpdate`)
- [ ] Is driver within 10km of pickup?

### Status Not Updating?
- [ ] Are you listening to `driverStatusUpdate` event?
- [ ] Is the toggle emitting `driverToggleStatus`?
- [ ] Check server logs for event reception
- [ ] Verify `driverId` is correct

---

## 📚 Full Documentation

- **Implementation Guide:** `DRIVER_APP_IMPLEMENTATION_GUIDE.md`
- **Testing Guide:** `SOCKET_TESTING_GUIDE.md`
- **All Socket Events:** `SOCKET_API_DOCUMENTATION.md`
- **Summary:** `DRIVER_TOGGLE_IMPLEMENTATION_SUMMARY.md`

---

## 🚀 Quick Start

1. **Backend:** Already implemented ✅
2. **Test in Postman:** Use scenarios above
3. **Mobile App:** Implement using `DRIVER_APP_IMPLEMENTATION_GUIDE.md`
4. **Deploy:** Follow deployment checklist

---

**Need Help?** Check `SOCKET_TESTING_GUIDE.md` for detailed testing scenarios.

