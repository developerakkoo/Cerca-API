# 🚗 Driver App Implementation Guide

## Overview
This guide covers the implementation of:
1. **Driver Status Toggle** - Control when driver receives ride requests
2. **Ride Request Overlay** - Show new ride requests in app (foreground)
3. **Background Notifications** - Accept/Reject rides when app is in background
4. **Status Display** - Real-time online/offline status based on toggle, socket, and background services

---

## 📋 Table of Contents
1. [Driver Status Management](#driver-status-management)
2. [Ride Request Overlay (Foreground)](#ride-request-overlay-foreground)
3. [Background Ride Notifications](#background-ride-notifications)
4. [Status Display Logic](#status-display-logic)
5. [Complete React Native Example](#complete-react-native-example)
6. [Testing Guide](#testing-guide)

---

## 🔄 Driver Status Management

### Status States Explained

| Field | Purpose | When Changed |
|-------|---------|--------------|
| `isOnline` | Socket connection status | App connects/disconnects from socket |
| `isActive` | Toggle ON/OFF for accepting rides | Driver manually toggles status |
| `isBusy` | Currently on an active ride | System sets when ride starts/ends |

### Status Logic

```
Driver can receive rides ONLY when:
✅ isOnline = true (connected to socket)
✅ isActive = true (toggle is ON)
✅ isBusy = false (not on a ride)

If ANY of these is false → Driver will NOT receive ride requests
```

---

## 1. Driver Status Toggle Implementation

### Socket Events

#### **EMIT: driverConnect** (On App Launch/Socket Connect)
```javascript
socket.emit('driverConnect', {
  driverId: 'DRIVER_ID'
});
```

#### **LISTEN: driverStatusUpdate** (Get Current Status)
```javascript
socket.on('driverStatusUpdate', (data) => {
  console.log('Driver Status:', data);
  // data = { driverId, isOnline, isActive, isBusy, message }
  
  // Update UI based on status
  setIsOnline(data.isOnline);
  setIsActive(data.isActive);
  setIsBusy(data.isBusy);
});
```

#### **EMIT: driverToggleStatus** (When Driver Toggles ON/OFF)
```javascript
// When driver clicks the toggle switch
const handleToggleStatus = (newStatus) => {
  socket.emit('driverToggleStatus', {
    driverId: driverId,
    isActive: newStatus // true = ON, false = OFF
  });
};
```

#### **LISTEN: driverStatusUpdate** (Confirmation)
```javascript
socket.on('driverStatusUpdate', (data) => {
  // Update local state
  setIsActive(data.isActive);
  setStatusMessage(data.message);
  // Show toast: "You are now accepting ride requests" or "You are offline"
});
```

---

## 2. Ride Request Overlay (Foreground)

### Requirements
1. ✅ When app is **open** (foreground), show ride request as **overlay/modal**
2. ✅ When **Home tab is active**, show ride in **list** (no overlay)
3. ✅ When accepted, navigate to **Ride Active Page**
4. ✅ Only show rides when `isActive = true`

### Implementation

#### Socket Event: Listen for New Rides
```javascript
socket.on('newRideRequest', (ride) => {
  console.log('New ride request:', ride);
  
  // Check if driver is in accepting mode
  if (!isActive) {
    console.log('Driver toggle is OFF, ignoring ride request');
    return; // Don't show ride if toggle is OFF
  }

  // Check current screen/tab
  const currentRoute = navigation.getCurrentRoute().name;
  
  if (currentRoute === 'Home' || currentRoute === 'RidesList') {
    // User is on home tab - add to list, NO overlay
    setRidesList(prevRides => [ride, ...prevRides]);
  } else {
    // User is on other screen - show overlay/modal
    setIncomingRide(ride);
    setShowRideOverlay(true);
    playNotificationSound();
  }
});
```

#### Ride Overlay Component (React Native Example)

```jsx
import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Audio } from 'expo-av';

const RideRequestOverlay = ({ visible, ride, onAccept, onReject }) => {
  const [timeLeft, setTimeLeft] = useState(30); // 30 seconds to respond
  const scaleAnim = new Animated.Value(0);

  useEffect(() => {
    if (visible) {
      // Animate modal entrance
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();

      // Play notification sound
      playSound();

      // Start countdown timer
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            onReject(); // Auto-reject after 30 seconds
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [visible]);

  const playSound = async () => {
    const { sound } = await Audio.Sound.createAsync(
      require('./assets/ride-request.mp3')
    );
    await sound.playAsync();
  };

  if (!ride) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onReject}
    >
      <View style={styles.overlay}>
        <Animated.View 
          style={[
            styles.modalContainer,
            { transform: [{ scale: scaleAnim }] }
          ]}
        >
          {/* Timer */}
          <View style={styles.timerContainer}>
            <Text style={styles.timerText}>{timeLeft}s</Text>
          </View>

          {/* Ride Details */}
          <Text style={styles.title}>New Ride Request</Text>
          
          <View style={styles.detailsContainer}>
            {/* Rider Info */}
            <View style={styles.riderInfo}>
              <Text style={styles.riderName}>{ride.rider?.fullName || 'Rider'}</Text>
              <Text style={styles.riderRating}>⭐ {ride.rider?.rating || 'N/A'}</Text>
            </View>

            {/* Pickup */}
            <View style={styles.locationRow}>
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>📍</Text>
              </View>
              <View style={styles.addressContainer}>
                <Text style={styles.label}>Pickup</Text>
                <Text style={styles.address} numberOfLines={2}>
                  {ride.pickupAddress}
                </Text>
              </View>
            </View>

            {/* Dropoff */}
            <View style={styles.locationRow}>
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>🏁</Text>
              </View>
              <View style={styles.addressContainer}>
                <Text style={styles.label}>Drop-off</Text>
                <Text style={styles.address} numberOfLines={2}>
                  {ride.dropoffAddress}
                </Text>
              </View>
            </View>

            {/* Fare & Distance */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Distance</Text>
                <Text style={styles.statValue}>{ride.distanceInKm} km</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Fare</Text>
                <Text style={styles.statValue}>₹{ride.fare}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Payment</Text>
                <Text style={styles.statValue}>{ride.paymentMethod}</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.rejectButton]} 
              onPress={onReject}
            >
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.acceptButton]} 
              onPress={onAccept}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  timerContainer: {
    position: 'absolute',
    top: -15,
    right: 20,
    backgroundColor: '#FF6B6B',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  timerText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2D3436',
    textAlign: 'center',
    marginBottom: 20,
  },
  detailsContainer: {
    marginBottom: 20,
  },
  riderInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
  },
  riderName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3436',
  },
  riderRating: {
    fontSize: 16,
    color: '#636E72',
  },
  locationRow: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F3F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  addressContainer: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#636E72',
    marginBottom: 4,
    fontWeight: '600',
  },
  address: {
    fontSize: 14,
    color: '#2D3436',
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    marginHorizontal: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#636E72',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2D3436',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  rejectButton: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  rejectButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: 'bold',
  },
  acceptButton: {
    backgroundColor: '#00B894',
  },
  acceptButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default RideRequestOverlay;
```

#### Using the Overlay Component

```jsx
import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import RideRequestOverlay from './components/RideRequestOverlay';
import { socket } from './services/socket';

const DriverHomeScreen = ({ navigation }) => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [incomingRide, setIncomingRide] = useState(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Listen for new ride requests
    socket.on('newRideRequest', handleNewRideRequest);

    return () => {
      socket.off('newRideRequest', handleNewRideRequest);
    };
  }, [isActive]);

  const handleNewRideRequest = (ride) => {
    // Only process if driver toggle is ON
    if (!isActive) {
      console.log('Driver is offline, ignoring ride');
      return;
    }

    // Check current route
    const currentRoute = navigation.getCurrentRoute().name;
    
    if (currentRoute === 'Home' || currentRoute === 'RidesList') {
      // Add to list, no overlay
      // ... add to rides list state
    } else {
      // Show overlay
      setIncomingRide(ride);
      setShowOverlay(true);
    }
  };

  const handleAcceptRide = () => {
    // Emit accept event
    socket.emit('rideAccepted', {
      rideId: incomingRide._id,
      driverId: driverId
    });

    // Close overlay
    setShowOverlay(false);
    
    // Navigate to ride active page
    navigation.navigate('RideActive', { rideId: incomingRide._id });
  };

  const handleRejectRide = () => {
    setShowOverlay(false);
    setIncomingRide(null);
    // Optionally emit rejection event if needed
  };

  return (
    <View>
      {/* Your home screen content */}
      
      <RideRequestOverlay
        visible={showOverlay}
        ride={incomingRide}
        onAccept={handleAcceptRide}
        onReject={handleRejectRide}
      />
    </View>
  );
};
```

---

## 3. Background Ride Notifications

When the app is in the **background** or **closed**, the driver should still receive ride requests as push notifications with Accept/Reject actions.

### Setup: Firebase Cloud Messaging (FCM) + Notifee

#### Install Dependencies
```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
npm install @notifee/react-native
```

#### Configure Background Handler

**`index.js` or `App.js` (Top Level)**

```javascript
import notifee, { AndroidImportance, AndroidCategory } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { socket } from './services/socket';

// Background message handler (when app is in background/quit)
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('Background notification received:', remoteMessage);
  
  const { data } = remoteMessage;
  
  if (data.type === 'new_ride_request') {
    const ride = JSON.parse(data.ride);
    
    // Create notification with action buttons
    await displayRideNotification(ride);
  }
});

async function displayRideNotification(ride) {
  // Create notification channel (Android)
  const channelId = await notifee.createChannel({
    id: 'ride_requests',
    name: 'Ride Requests',
    importance: AndroidImportance.HIGH,
    sound: 'ride_alert',
    vibration: true,
  });

  // Display notification with action buttons
  await notifee.displayNotification({
    id: ride._id, // Use ride ID as notification ID
    title: '🚗 New Ride Request',
    body: `₹${ride.fare} • ${ride.distanceInKm}km • ${ride.pickupAddress}`,
    android: {
      channelId,
      importance: AndroidImportance.HIGH,
      category: AndroidCategory.CALL,
      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },
      actions: [
        {
          title: '❌ Reject',
          pressAction: {
            id: 'reject',
            launchActivity: 'default',
          },
        },
        {
          title: '✅ Accept',
          pressAction: {
            id: 'accept',
            launchActivity: 'default',
          },
        },
      ],
      fullScreenAction: {
        id: 'default',
        launchActivity: 'default',
      },
      timeoutAfter: 30000, // Auto-dismiss after 30 seconds
    },
    ios: {
      categoryId: 'ride_request',
      sound: 'ride_alert.mp3',
      critical: true,
    },
    data: {
      rideId: ride._id,
      riderId: ride.rider._id,
      fare: ride.fare.toString(),
    },
  });
}

// Handle notification actions (Accept/Reject from background)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;
  
  if (type === EventType.ACTION_PRESS) {
    const rideId = notification.data.rideId;
    const driverId = await AsyncStorage.getItem('driverId');
    
    if (pressAction.id === 'accept') {
      console.log('Driver accepted ride from background:', rideId);
      
      // Connect socket if not connected
      if (!socket.connected) {
        socket.connect();
        socket.emit('driverConnect', { driverId });
      }
      
      // Emit accept event
      socket.emit('rideAccepted', {
        rideId: rideId,
        driverId: driverId
      });
      
      // Dismiss notification
      await notifee.cancelNotification(rideId);
      
      // Show success notification
      await notifee.displayNotification({
        title: 'Ride Accepted',
        body: 'Navigating to pickup location...',
        android: {
          channelId: 'ride_updates',
        },
      });
      
    } else if (pressAction.id === 'reject') {
      console.log('Driver rejected ride from background:', rideId);
      
      // Dismiss notification
      await notifee.cancelNotification(rideId);
      
      // Optionally emit rejection event
      // socket.emit('rideRejected', { rideId, driverId });
    }
  }
});

// Foreground notification handler
messaging().onMessage(async (remoteMessage) => {
  console.log('Foreground notification received:', remoteMessage);
  
  const { data } = remoteMessage;
  
  if (data.type === 'new_ride_request') {
    const ride = JSON.parse(data.ride);
    
    // If app is in foreground, let socket handle it
    // Socket event will show overlay instead
    console.log('App in foreground, socket will handle ride request');
  }
});
```

---

## 4. Status Display Logic

### Status Text Calculation

```javascript
const getDriverStatusText = (isOnline, isActive, isBusy, isSocketConnected) => {
  // Priority order for status display
  
  if (isBusy) {
    return {
      text: 'On a Ride',
      color: '#FFA500', // Orange
      icon: '🚗'
    };
  }
  
  if (!isSocketConnected) {
    return {
      text: 'Disconnected',
      color: '#FF0000', // Red
      icon: '📡'
    };
  }
  
  if (isOnline && isActive) {
    return {
      text: 'Online - Accepting Rides',
      color: '#00B894', // Green
      icon: '✅'
    };
  }
  
  if (isOnline && !isActive) {
    return {
      text: 'Online - Not Accepting',
      color: '#FDCB6E', // Yellow
      icon: '⏸️'
    };
  }
  
  return {
    text: 'Offline',
    color: '#636E72', // Gray
    icon: '⭕'
  };
};
```

### Driver Status Toggle Component

```jsx
import React, { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { socket } from '../services/socket';

const DriverStatusToggle = ({ driverId }) => {
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    // Monitor socket connection
    socket.on('connect', () => {
      setIsSocketConnected(true);
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      setIsSocketConnected(false);
      setIsOnline(false);
      console.log('Socket disconnected');
    });

    // Listen for status updates
    socket.on('driverStatusUpdate', (data) => {
      setIsOnline(data.isOnline);
      setIsActive(data.isActive);
      setIsBusy(data.isBusy);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('driverStatusUpdate');
    };
  }, []);

  const handleToggle = (newValue) => {
    if (!isSocketConnected) {
      alert('Not connected to server. Please check your internet connection.');
      return;
    }

    // Emit toggle status
    socket.emit('driverToggleStatus', {
      driverId: driverId,
      isActive: newValue
    });

    // Optimistic update
    setIsActive(newValue);
  };

  const status = getDriverStatusText(isOnline, isActive, isBusy, isSocketConnected);

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <View style={styles.statusInfo}>
          <Text style={styles.statusIcon}>{status.icon}</Text>
          <View>
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.text}
            </Text>
            <Text style={styles.subText}>
              {isSocketConnected ? 'Connected' : 'Not Connected'}
            </Text>
          </View>
        </View>

        {/* Only show toggle if connected and not busy */}
        {isSocketConnected && !isBusy && (
          <Switch
            value={isActive}
            onValueChange={handleToggle}
            trackColor={{ false: '#D3D3D3', true: '#00B894' }}
            thumbColor={isActive ? '#FFF' : '#F4F3F4'}
            ios_backgroundColor="#D3D3D3"
          />
        )}
      </View>

      {/* Warning message if toggle is OFF */}
      {isSocketConnected && !isActive && !isBusy && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            ⚠️ You are not accepting ride requests. Toggle ON to start receiving rides.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  subText: {
    fontSize: 12,
    color: '#636E72',
    marginTop: 2,
  },
  warningBox: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  warningText: {
    color: '#856404',
    fontSize: 13,
  },
});

export default DriverStatusToggle;
```

---

## 5. Complete React Native Example

### Socket Service Setup

**`services/socket.js`**

```javascript
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOCKET_URL = 'ws://your-server-url:port'; // Replace with your server URL

export const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  autoConnect: false, // Manual connection control
});

// Initialize socket connection
export const initializeSocket = async () => {
  const driverId = await AsyncStorage.getItem('driverId');
  
  if (!driverId) {
    console.error('Driver ID not found');
    return;
  }

  // Connect to socket
  socket.connect();

  // Register as driver once connected
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    socket.emit('driverConnect', { driverId });
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
  });
};

// Disconnect socket
export const disconnectSocket = async () => {
  const driverId = await AsyncStorage.getItem('driverId');
  
  if (driverId && socket.connected) {
    socket.emit('driverDisconnect', { driverId });
    socket.disconnect();
  }
};
```

### Main Driver App Component

**`App.js` or `DriverMainScreen.js`**

```jsx
import React, { useEffect, useState } from 'react';
import { View, AppState } from 'react-native';
import { socket, initializeSocket, disconnectSocket } from './services/socket';
import DriverStatusToggle from './components/DriverStatusToggle';
import RideRequestOverlay from './components/RideRequestOverlay';

const DriverApp = () => {
  const [appState, setAppState] = useState(AppState.currentState);
  const [driverId, setDriverId] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [incomingRide, setIncomingRide] = useState(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Initialize driver
    loadDriverData();

    // Handle app state changes (background/foreground)
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, []);

  const loadDriverData = async () => {
    const id = await AsyncStorage.getItem('driverId');
    setDriverId(id);
    
    // Initialize socket
    await initializeSocket();
    
    // Setup socket listeners
    setupSocketListeners();
  };

  const setupSocketListeners = () => {
    // Status updates
    socket.on('driverStatusUpdate', (data) => {
      setIsActive(data.isActive);
    });

    // New ride requests
    socket.on('newRideRequest', handleNewRide);

    // Ride accepted confirmation
    socket.on('rideAssigned', (ride) => {
      console.log('Ride assigned:', ride);
      navigation.navigate('RideActive', { ride });
    });

    // Error handling
    socket.on('errorEvent', (error) => {
      console.error('Socket error:', error);
      alert(error.message);
    });
  };

  const handleNewRide = (ride) => {
    // Only show if driver is active
    if (!isActive) {
      console.log('Driver is offline, ignoring ride');
      return;
    }

    // Show overlay
    setIncomingRide(ride);
    setShowOverlay(true);
  };

  const handleAppStateChange = (nextAppState) => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground
      console.log('App came to foreground');
      
      // Reconnect socket if disconnected
      if (!socket.connected && driverId) {
        initializeSocket();
      }
    }

    if (nextAppState.match(/inactive|background/)) {
      // App went to background
      console.log('App went to background');
      
      // Socket stays connected in background for location updates
      // But notifications will be handled by FCM
    }

    setAppState(nextAppState);
  };

  const handleAcceptRide = () => {
    socket.emit('rideAccepted', {
      rideId: incomingRide._id,
      driverId: driverId
    });

    setShowOverlay(false);
    navigation.navigate('RideActive', { rideId: incomingRide._id });
  };

  const handleRejectRide = () => {
    setShowOverlay(false);
    setIncomingRide(null);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Driver Status Toggle */}
      <DriverStatusToggle driverId={driverId} />

      {/* Your main app screens */}
      {/* ... */}

      {/* Ride Request Overlay */}
      <RideRequestOverlay
        visible={showOverlay}
        ride={incomingRide}
        onAccept={handleAcceptRide}
        onReject={handleRejectRide}
      />
    </View>
  );
};

export default DriverApp;
```

---

## 6. Testing Guide

### Test Scenario 1: Driver Toggle Status

1. **Open driver app**
2. **Socket connects** → Status shows "Online - Not Accepting" (toggle OFF)
3. **Toggle ON** → Status changes to "Online - Accepting Rides"
4. **Verify socket event:**
```javascript
socket.emit('driverToggleStatus', {
  driverId: 'DRIVER_ID',
  isActive: true
});
```
5. **Toggle OFF** → Status changes to "Online - Not Accepting"

### Test Scenario 2: Foreground Ride Request

1. **Driver toggle is ON**
2. **User requests a ride**
3. **Overlay appears** with ride details
4. **Click Accept** → Navigate to Ride Active page
5. **Verify socket event:**
```javascript
socket.emit('rideAccepted', {
  rideId: 'RIDE_ID',
  driverId: 'DRIVER_ID'
});
```

### Test Scenario 3: Background Ride Request

1. **Driver toggle is ON**
2. **Close or minimize the app**
3. **User requests a ride**
4. **Push notification appears** with Accept/Reject buttons
5. **Click Accept from notification** → Ride accepted, app opens
6. **Verify socket event** is emitted from background handler

### Test Scenario 4: Toggle OFF - No Rides

1. **Driver toggle is OFF**
2. **User requests a ride**
3. **Driver receives NO notification** (neither overlay nor push)
4. **Verify in backend logs:** "Found 0 nearby drivers" or driver not in results

### Test Scenario 5: Home Tab Active

1. **Driver is on Home/Rides List tab**
2. **Driver toggle is ON**
3. **User requests a ride**
4. **Ride appears in list** (no overlay)
5. **Driver can accept from list**

---

## 🔧 Backend Socket Events Summary

### Events Driver App Must Emit

| Event | When | Payload |
|-------|------|---------|
| `driverConnect` | On app launch / socket connect | `{ driverId }` |
| `driverToggleStatus` | When driver toggles ON/OFF | `{ driverId, isActive }` |
| `driverLocationUpdate` | Every 5-10 seconds when online | `{ driverId, location, rideId? }` |
| `rideAccepted` | When driver accepts ride | `{ rideId, driverId }` |
| `driverArrived` | When driver reaches pickup | `{ rideId }` |
| `rideStarted` | When ride starts | `{ rideId, otp }` |
| `rideCompleted` | When ride ends | `{ rideId, fare, otp }` |
| `driverDisconnect` | When app closes / driver goes offline | `{ driverId }` |

### Events Driver App Must Listen To

| Event | Purpose | Response |
|-------|---------|----------|
| `driverStatusUpdate` | Get current driver status | Update UI status |
| `newRideRequest` | New ride available | Show overlay or add to list |
| `rideAssigned` | Ride assigned confirmation | Navigate to active ride |
| `rideCancelled` | Ride cancelled by rider | Update UI |
| `errorEvent` | Socket errors | Show error message |

---

## 📱 Push Notification Setup (Backend)

To send push notifications when driver is in background, you need to send FCM messages from your backend.

### Example: Sending FCM Notification When Ride is Created

**In `socket.js` (newRideRequest event)**

```javascript
const admin = require('firebase-admin');

socket.on('newRideRequest', async (data) => {
  const ride = await createRide(data);
  const nearbyDrivers = await autoAssignDriver(ride._id, ride.pickupLocation, 10000);

  nearbyDrivers.forEach(async (driver) => {
    // Send via Socket if driver is online and app is in foreground
    if (driver.socketId) {
      io.to(driver.socketId).emit('newRideRequest', ride);
    }

    // Also send FCM push notification for background
    if (driver.fcmToken) {
      await admin.messaging().send({
        token: driver.fcmToken,
        data: {
          type: 'new_ride_request',
          ride: JSON.stringify(ride),
        },
        android: {
          priority: 'high',
          ttl: 30000, // 30 seconds
        },
        apns: {
          payload: {
            aps: {
              'content-available': 1,
              sound: 'ride_alert.mp3',
            },
          },
        },
      });
    }
  });
});
```

### Store FCM Token in Driver Model

Update driver model to store FCM token:

```javascript
const driverSchema = new mongoose.Schema({
  // ... existing fields
  fcmToken: {
    type: String,
  },
});
```

### Update FCM Token from App

```javascript
// In driver app
import messaging from '@react-native-firebase/messaging';

const updateFCMToken = async (driverId) => {
  const fcmToken = await messaging().getToken();
  
  // Send to backend
  await fetch(`${API_URL}/drivers/${driverId}/fcm-token`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fcmToken }),
  });
};
```

---

## ✅ Checklist

- [ ] Socket connects when app opens
- [ ] Driver status toggle emits `driverToggleStatus` event
- [ ] Status text updates based on `isOnline`, `isActive`, `isBusy`, and socket connection
- [ ] Ride overlay appears when app is in foreground (not on home tab)
- [ ] Ride appears in list when on home tab (no overlay)
- [ ] Accept button emits `rideAccepted` and navigates to Ride Active page
- [ ] Background notifications show Accept/Reject actions
- [ ] Accept from background notification emits socket event
- [ ] Driver does NOT receive rides when toggle is OFF
- [ ] Socket disconnects when app closes
- [ ] FCM token is stored and updated

---

## 🎯 Summary

This implementation ensures:
1. ✅ **Driver only receives rides when toggle is ON** (`isActive = true`)
2. ✅ **Foreground rides show as overlay** (except on home tab)
3. ✅ **Background rides show as push notifications** with Accept/Reject
4. ✅ **Status display is accurate** based on socket, toggle, and ride state
5. ✅ **Socket events properly emit** for accept, reject, and status changes

---

**Need help with implementation? Check the examples above or refer to SOCKET_API_DOCUMENTATION.md**

