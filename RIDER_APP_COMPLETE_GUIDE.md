# 🚖 Rider App Complete Guide - Ride Management

## Overview
Complete implementation guide for the Rider/User app covering the entire ride lifecycle from booking to completion.

---

## 📋 Table of Contents
1. [Ride Lifecycle Overview](#ride-lifecycle-overview)
2. [Socket Connection Setup](#socket-connection-setup)
3. [Request a Ride](#request-a-ride)
4. [Wait for Driver Acceptance](#wait-for-driver-acceptance)
5. [Track Driver Arrival](#track-driver-arrival)
6. [Start Ride (OTP Verification)](#start-ride-otp-verification)
7. [Track Ride in Progress](#track-ride-in-progress)
8. [Complete Ride (Stop OTP)](#complete-ride-stop-otp)
9. [Rate & Review Driver](#rate--review-driver)
10. [Cancel Ride](#cancel-ride)
11. [Complete React Native Example](#complete-react-native-example)
12. [Testing Guide](#testing-guide)

---

## 🔄 Ride Lifecycle Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPLETE RIDE FLOW                        │
└─────────────────────────────────────────────────────────────┘

1. RIDER REQUESTS RIDE
   └─> Status: "requested"
   └─> Emit: newRideRequest
   
2. SEARCHING FOR DRIVER
   └─> Show: "Finding nearby drivers..."
   └─> Listen: rideRequested (confirmation)
   
3. DRIVER ACCEPTS
   └─> Status: "accepted"
   └─> Listen: rideAccepted
   └─> Show: Driver details, vehicle info, ETA
   
4. DRIVER ARRIVING
   └─> Listen: driverLocationUpdate
   └─> Show: Driver's real-time location on map
   └─> Track: Distance & ETA to pickup
   
5. DRIVER ARRIVED
   └─> Listen: driverArrived
   └─> Show: "Driver has arrived!"
   └─> Display: START OTP (4-digit code)
   
6. RIDE STARTS
   └─> Status: "in_progress"
   └─> Listen: rideStarted
   └─> Show: Route to destination
   └─> Display: STOP OTP (4-digit code)
   
7. RIDE IN PROGRESS
   └─> Listen: rideLocationUpdate
   └─> Show: Live tracking to destination
   └─> Display: ETA, distance remaining
   
8. RIDE COMPLETED
   └─> Status: "completed"
   └─> Listen: rideCompleted
   └─> Show: Fare breakdown, distance, duration
   └─> Action: Rate driver
   
9. RATE DRIVER
   └─> Emit: submitRating
   └─> Show: "Thank you for your feedback!"
```

---

## 🔌 Socket Connection Setup

### Install Socket.IO Client

```bash
npm install socket.io-client
```

### Create Socket Service

**`services/socket.js`**

```javascript
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOCKET_URL = 'ws://your-server-url:port'; // Replace with your server

export const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  autoConnect: false, // Manual control
});

// Initialize socket connection
export const initializeSocket = async () => {
  const userId = await AsyncStorage.getItem('userId');
  
  if (!userId) {
    console.error('User ID not found');
    return;
  }

  // Connect to socket
  socket.connect();

  // Register as rider once connected
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    socket.emit('riderConnect', { userId });
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
  });

  // Listen for connection confirmation
  socket.on('riderConnect', (data) => {
    console.log('Connected as rider:', data);
  });
};

// Disconnect socket
export const disconnectSocket = async () => {
  const userId = await AsyncStorage.getItem('userId');
  
  if (userId && socket.connected) {
    socket.emit('riderDisconnect', { userId });
    socket.disconnect();
  }
};
```

### Initialize in App

**`App.js`**

```javascript
import { useEffect } from 'react';
import { initializeSocket, disconnectSocket } from './services/socket';

function App() {
  useEffect(() => {
    // Initialize socket on app launch
    initializeSocket();

    // Cleanup on app close
    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    // Your app components
  );
}
```

---

## 1. Request a Ride

### Calculate Fare First (REST API)

```javascript
const calculateFare = async (pickupCoords, dropoffCoords) => {
  try {
    const response = await fetch(`${API_URL}/rides/calculate-fare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupLocation: {
          longitude: pickupCoords.longitude,
          latitude: pickupCoords.latitude
        },
        dropoffLocation: {
          longitude: dropoffCoords.longitude,
          latitude: dropoffCoords.latitude
        },
        rideType: 'normal', // 'normal', 'whole_day', 'custom'
        service: 'sedan' // 'sedan', 'suv', 'auto'
      })
    });

    const data = await response.json();
    return data; // { fare, distanceInKm, estimatedDuration }
  } catch (error) {
    console.error('Fare calculation error:', error);
    throw error;
  }
};
```

### Request Ride (Socket Event)

```javascript
import { socket } from '../services/socket';

const requestRide = async () => {
  try {
    // Get user ID from storage
    const userId = await AsyncStorage.getItem('userId');
    
    // Prepare ride request data
    const rideData = {
      rider: userId,
      riderId: userId,
      userSocketId: socket.id,
      pickupLocation: {
        longitude: pickupCoords.longitude,
        latitude: pickupCoords.latitude
      },
      dropoffLocation: {
        longitude: dropoffCoords.longitude,
        latitude: dropoffCoords.latitude
      },
      pickupAddress: '123 Main St, Bangalore',
      dropoffAddress: '456 Park Ave, Bangalore',
      fare: 150,
      distanceInKm: 5.2,
      service: 'sedan',
      rideType: 'normal',
      paymentMethod: 'CASH' // 'CASH', 'RAZORPAY', 'WALLET'
    };

    // Emit ride request
    socket.emit('newRideRequest', rideData);
    
    // Show loading: "Finding nearby drivers..."
    setRideStatus('searching');
    
  } catch (error) {
    console.error('Request ride error:', error);
  }
};
```

### Listen for Confirmation

```javascript
// Ride request confirmation
socket.on('rideRequested', (ride) => {
  console.log('Ride requested successfully:', ride);
  
  // Save ride details
  setCurrentRide(ride);
  setRideId(ride._id);
  
  // Display OTPs (save for later)
  setStartOtp(ride.startOtp); // e.g., "1234"
  setStopOtp(ride.stopOtp);   // e.g., "5678"
  
  // Show: "Searching for drivers..."
  setRideStatus('searching');
  
  // Navigate to ride tracking screen
  navigation.navigate('RideTracking', { rideId: ride._id });
});

// Error handling
socket.on('rideError', (error) => {
  console.error('Ride error:', error.message);
  Alert.alert('Error', error.message);
  setRideStatus('idle');
});
```

---

## 2. Wait for Driver Acceptance

### Listen for Driver Acceptance

```javascript
socket.on('rideAccepted', (ride) => {
  console.log('Driver accepted:', ride);
  
  // Update ride data
  setCurrentRide(ride);
  setRideStatus('accepted');
  
  // Extract driver details
  const driver = ride.driver;
  
  // Display driver information
  setDriverInfo({
    id: driver._id,
    name: driver.name,
    phone: driver.phone,
    rating: driver.rating,
    vehicle: driver.vehicleInfo,
    photo: driver.profilePic
  });
  
  // Show notification
  showNotification('Driver Found!', `${driver.name} is coming to pick you up`);
  
  // Play sound
  playSound('driver-found.mp3');
  
  // Update UI
  // - Show driver card
  // - Show vehicle details
  // - Show "Call Driver" button
  // - Show "Cancel Ride" button
});
```

### Driver Info Card Component

```jsx
import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from 'react-native';

const DriverInfoCard = ({ driver, onCancel }) => {
  const callDriver = () => {
    Linking.openURL(`tel:${driver.phone}`);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Image 
          source={{ uri: driver.photo || 'https://via.placeholder.com/60' }}
          style={styles.driverPhoto}
        />
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{driver.name}</Text>
          <Text style={styles.rating}>⭐ {driver.rating || 'New'}</Text>
        </View>
      </View>

      <View style={styles.vehicleInfo}>
        <Text style={styles.vehicleText}>
          {driver.vehicle?.color} {driver.vehicle?.make} {driver.vehicle?.model}
        </Text>
        <Text style={styles.licensePlate}>{driver.vehicle?.licensePlate}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.callButton} onPress={callDriver}>
          <Text style={styles.callButtonText}>📞 Call Driver</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel Ride</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  driverPhoto: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3436',
  },
  rating: {
    fontSize: 16,
    color: '#636E72',
    marginTop: 4,
  },
  vehicleInfo: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  vehicleText: {
    fontSize: 16,
    color: '#2D3436',
    fontWeight: '600',
  },
  licensePlate: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0984E3',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  callButton: {
    flex: 1,
    backgroundColor: '#00B894',
    padding: 14,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  callButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 8,
    marginLeft: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  cancelButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default DriverInfoCard;
```

---

## 3. Track Driver Arrival

### Listen for Driver Location Updates

```javascript
socket.on('driverLocationUpdate', (data) => {
  console.log('Driver location:', data);
  
  // Update driver marker on map
  setDriverLocation({
    latitude: data.location.latitude,
    longitude: data.location.longitude,
  });
  
  // Calculate ETA and distance
  const distance = calculateDistance(
    pickupCoords,
    data.location
  );
  
  setDriverDistance(distance);
  setDriverETA(calculateETA(distance)); // e.g., "2 mins"
});
```

### Map Component with Driver Tracking

```jsx
import React, { useEffect, useState } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { socket } from '../services/socket';

const RideTrackingMap = ({ pickupCoords, dropoffCoords }) => {
  const [driverLocation, setDriverLocation] = useState(null);

  useEffect(() => {
    // Listen for driver location updates
    socket.on('driverLocationUpdate', (data) => {
      setDriverLocation({
        latitude: data.location.latitude,
        longitude: data.location.longitude,
      });
    });

    return () => {
      socket.off('driverLocationUpdate');
    };
  }, []);

  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: pickupCoords.latitude,
        longitude: pickupCoords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
    >
      {/* Pickup Marker */}
      <Marker
        coordinate={pickupCoords}
        title="Pickup Location"
        pinColor="green"
      />

      {/* Dropoff Marker */}
      <Marker
        coordinate={dropoffCoords}
        title="Drop-off Location"
        pinColor="red"
      />

      {/* Driver Marker (moving) */}
      {driverLocation && (
        <Marker
          coordinate={driverLocation}
          title="Your Driver"
        >
          <Image 
            source={require('../assets/car-icon.png')} 
            style={{ width: 40, height: 40 }}
          />
        </Marker>
      )}

      {/* Route Line */}
      {driverLocation && (
        <Polyline
          coordinates={[driverLocation, pickupCoords]}
          strokeColor="#0984E3"
          strokeWidth={4}
        />
      )}
    </MapView>
  );
};

export default RideTrackingMap;
```

---

## 4. Driver Arrived at Pickup

### Listen for Arrival

```javascript
socket.on('driverArrived', (ride) => {
  console.log('Driver arrived:', ride);
  
  // Update status
  setRideStatus('arrived');
  
  // Show notification
  showNotification('Driver Arrived!', 'Your driver is waiting for you');
  
  // Play sound
  playSound('driver-arrived.mp3');
  
  // Vibrate phone
  Vibration.vibrate(1000);
  
  // Show START OTP prominently
  Alert.alert(
    '🚗 Driver Arrived!',
    `Please share this OTP with your driver to start the ride:\n\n${startOtp}`,
    [{ text: 'OK' }]
  );
});
```

### OTP Display Component

```jsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Clipboard } from 'react-native';

const OTPDisplay = ({ otp, label, onCopy }) => {
  const copyToClipboard = () => {
    Clipboard.setString(otp);
    onCopy && onCopy();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      
      <TouchableOpacity 
        style={styles.otpContainer} 
        onPress={copyToClipboard}
      >
        <Text style={styles.otpText}>{otp}</Text>
      </TouchableOpacity>
      
      <TouchableOpacity onPress={copyToClipboard}>
        <Text style={styles.copyText}>📋 Tap to Copy</Text>
      </TouchableOpacity>
      
      <Text style={styles.instruction}>
        Share this code with your driver
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  label: {
    fontSize: 16,
    color: '#636E72',
    marginBottom: 12,
    fontWeight: '600',
  },
  otpContainer: {
    backgroundColor: '#0984E3',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  otpText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFF',
    letterSpacing: 8,
  },
  copyText: {
    fontSize: 14,
    color: '#0984E3',
    fontWeight: '600',
    marginBottom: 8,
  },
  instruction: {
    fontSize: 13,
    color: '#636E72',
    textAlign: 'center',
  },
});

export default OTPDisplay;
```

---

## 5. Start Ride (OTP Verification)

### Listen for Ride Start

```javascript
socket.on('rideStarted', (ride) => {
  console.log('Ride started:', ride);
  
  // Update status
  setRideStatus('in_progress');
  setCurrentRide(ride);
  
  // Show notification
  showNotification('Ride Started!', 'You are now on your way');
  
  // Update UI
  // - Hide START OTP
  // - Show STOP OTP
  // - Show route to destination
  // - Start tracking ride duration
  // - Show live location updates
  
  // Start ride timer
  setRideStartTime(Date.now());
});
```

---

## 6. Track Ride in Progress

### Listen for Live Location Updates

```javascript
socket.on('rideLocationUpdate', (data) => {
  console.log('Ride location update:', data);
  
  // Update driver/vehicle location on map
  setDriverLocation({
    latitude: data.location.latitude,
    longitude: data.location.longitude,
  });
  
  // Calculate distance remaining
  const remaining = calculateDistance(
    data.location,
    dropoffCoords
  );
  
  setDistanceRemaining(remaining);
  setETA(calculateETA(remaining));
});
```

### Ride Progress Component

```jsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const RideProgress = ({ startTime, distanceRemaining, eta }) => {
  const [duration, setDuration] = useState('0:00');

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      setDuration(`${mins}:${secs.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <View style={styles.container}>
      <View style={styles.statBox}>
        <Text style={styles.label}>Duration</Text>
        <Text style={styles.value}>{duration}</Text>
      </View>

      <View style={styles.statBox}>
        <Text style={styles.label}>Distance Left</Text>
        <Text style={styles.value}>{distanceRemaining} km</Text>
      </View>

      <View style={styles.statBox}>
        <Text style={styles.label}>ETA</Text>
        <Text style={styles.value}>{eta} mins</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFF',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statBox: {
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: '#636E72',
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3436',
  },
});

export default RideProgress;
```

---

## 7. Complete Ride (Stop OTP)

### Listen for Ride Completion

```javascript
socket.on('rideCompleted', (ride) => {
  console.log('Ride completed:', ride);
  
  // Update status
  setRideStatus('completed');
  setCurrentRide(ride);
  
  // Show ride summary
  const summary = {
    fare: ride.fare,
    distance: ride.distanceInKm,
    duration: ride.actualDuration,
    startTime: ride.actualStartTime,
    endTime: ride.actualEndTime,
    paymentMethod: ride.paymentMethod,
  };
  
  // Navigate to ride summary screen
  navigation.navigate('RideSummary', { ride: summary });
  
  // Show notification
  showNotification('Ride Completed!', 'Thank you for riding with us');
});
```

### Ride Summary Component

```jsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const RideSummary = ({ ride, onRate, onPayment }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ride Completed! 🎉</Text>
      
      <View style={styles.summaryCard}>
        <View style={styles.row}>
          <Text style={styles.label}>Total Fare</Text>
          <Text style={styles.value}>₹{ride.fare}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Distance</Text>
          <Text style={styles.value}>{ride.distanceInKm} km</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Duration</Text>
          <Text style={styles.value}>{ride.actualDuration} mins</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Payment Method</Text>
          <Text style={styles.value}>{ride.paymentMethod}</Text>
        </View>
      </View>

      {ride.paymentMethod === 'RAZORPAY' && (
        <TouchableOpacity style={styles.payButton} onPress={onPayment}>
          <Text style={styles.payButtonText}>Pay Now</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.rateButton} onPress={onRate}>
        <Text style={styles.rateButtonText}>⭐ Rate Your Driver</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
    color: '#2D3436',
  },
  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  label: {
    fontSize: 16,
    color: '#636E72',
  },
  value: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2D3436',
  },
  payButton: {
    backgroundColor: '#0984E3',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  payButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  rateButton: {
    backgroundColor: '#FDCB6E',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  rateButtonText: {
    color: '#2D3436',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default RideSummary;
```

---

## 8. Rate & Review Driver

### Submit Rating

```javascript
const submitRating = (rating, review, tags) => {
  socket.emit('submitRating', {
    rideId: currentRide._id,
    ratedBy: userId,
    ratedByModel: 'User',
    ratedTo: currentRide.driver._id,
    ratedToModel: 'Driver',
    rating: rating, // 1-5
    review: review,
    tags: tags // ['polite', 'professional', 'clean_vehicle']
  });
};

// Listen for confirmation
socket.on('ratingSubmitted', (data) => {
  console.log('Rating submitted:', data);
  
  // Show success message
  Alert.alert('Thank You!', 'Your feedback helps us improve');
  
  // Navigate to home
  navigation.navigate('Home');
});

socket.on('ratingError', (error) => {
  console.error('Rating error:', error);
  Alert.alert('Error', error.message);
});
```

### Rating Component

```jsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';

const RatingScreen = ({ driver, onSubmit }) => {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);

  const tags = [
    'Polite',
    'Professional',
    'Clean Vehicle',
    'Safe Driver',
    'On Time',
    'Friendly'
  ];

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = () => {
    if (rating === 0) {
      Alert.alert('Please select a rating');
      return;
    }
    
    onSubmit(rating, review, selectedTags);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rate Your Ride</Text>
      
      {/* Driver Info */}
      <View style={styles.driverCard}>
        <Text style={styles.driverName}>{driver.name}</Text>
        <Text style={styles.vehicleInfo}>
          {driver.vehicle?.make} {driver.vehicle?.model}
        </Text>
      </View>

      {/* Star Rating */}
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity key={star} onPress={() => setRating(star)}>
            <Text style={styles.star}>
              {star <= rating ? '⭐' : '☆'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tags */}
      <Text style={styles.sectionTitle}>What did you like?</Text>
      <View style={styles.tagsContainer}>
        {tags.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[
              styles.tag,
              selectedTags.includes(tag) && styles.tagSelected
            ]}
            onPress={() => toggleTag(tag)}
          >
            <Text style={[
              styles.tagText,
              selectedTags.includes(tag) && styles.tagTextSelected
            ]}>
              {tag}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Review Text */}
      <Text style={styles.sectionTitle}>Add a comment (optional)</Text>
      <TextInput
        style={styles.reviewInput}
        placeholder="Share your experience..."
        value={review}
        onChangeText={setReview}
        multiline
        numberOfLines={4}
      />

      {/* Submit Button */}
      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitButtonText}>Submit Rating</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
    color: '#2D3436',
  },
  driverCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  driverName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3436',
  },
  vehicleInfo: {
    fontSize: 14,
    color: '#636E72',
    marginTop: 4,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
  },
  star: {
    fontSize: 48,
    marginHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  tag: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DFE6E9',
  },
  tagSelected: {
    backgroundColor: '#0984E3',
    borderColor: '#0984E3',
  },
  tagText: {
    color: '#636E72',
    fontSize: 14,
  },
  tagTextSelected: {
    color: '#FFF',
  },
  reviewInput: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 24,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#00B894',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default RatingScreen;
```

---

## 9. Cancel Ride

### Cancel Ride Socket Event

```javascript
const cancelRide = (reason) => {
  socket.emit('rideCancelled', {
    rideId: currentRide._id,
    cancelledBy: 'rider',
    reason: reason // Optional
  });
};

// Listen for cancellation confirmation
socket.on('rideCancelled', (ride) => {
  console.log('Ride cancelled:', ride);
  
  // Show message
  Alert.alert('Ride Cancelled', 'Your ride has been cancelled');
  
  // Reset state
  setCurrentRide(null);
  setRideStatus('idle');
  
  // Navigate back to home
  navigation.navigate('Home');
});
```

### Cancel Ride Component

```jsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';

const CancelRideModal = ({ visible, onCancel, onConfirm }) => {
  const [selectedReason, setSelectedReason] = useState('');

  const reasons = [
    'Changed my mind',
    'Wrong pickup location',
    'Driver taking too long',
    'Found another ride',
    'Other'
  ];

  const handleConfirm = () => {
    if (!selectedReason) {
      Alert.alert('Please select a reason');
      return;
    }
    
    onConfirm(selectedReason);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Cancel Ride?</Text>
          
          <Text style={styles.subtitle}>
            Please select a reason for cancellation:
          </Text>

          {reasons.map((reason) => (
            <TouchableOpacity
              key={reason}
              style={[
                styles.reasonButton,
                selectedReason === reason && styles.reasonButtonSelected
              ]}
              onPress={() => setSelectedReason(reason)}
            >
              <Text style={[
                styles.reasonText,
                selectedReason === reason && styles.reasonTextSelected
              ]}>
                {reason}
              </Text>
            </TouchableOpacity>
          ))}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.backButton} onPress={onCancel}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmButtonText}>Cancel Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    color: '#2D3436',
  },
  subtitle: {
    fontSize: 14,
    color: '#636E72',
    textAlign: 'center',
    marginBottom: 20,
  },
  reasonButton: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DFE6E9',
  },
  reasonButtonSelected: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFC107',
  },
  reasonText: {
    fontSize: 16,
    color: '#2D3436',
  },
  reasonTextSelected: {
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 20,
  },
  backButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#636E72',
  },
  confirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    marginLeft: 8,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
});

export default CancelRideModal;
```

---

## 10. Complete React Native Example

### Main Ride Screen

```jsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { socket } from '../services/socket';
import RideTrackingMap from '../components/RideTrackingMap';
import DriverInfoCard from '../components/DriverInfoCard';
import OTPDisplay from '../components/OTPDisplay';
import RideProgress from '../components/RideProgress';
import CancelRideModal from '../components/CancelRideModal';

const RideScreen = ({ route, navigation }) => {
  const { rideId } = route.params;
  
  const [rideStatus, setRideStatus] = useState('searching'); // searching, accepted, arrived, in_progress, completed
  const [currentRide, setCurrentRide] = useState(null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [startOtp, setStartOtp] = useState('');
  const [stopOtp, setStopOtp] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [rideStartTime, setRideStartTime] = useState(null);

  useEffect(() => {
    setupSocketListeners();

    return () => {
      // Cleanup listeners
      socket.off('rideRequested');
      socket.off('rideAccepted');
      socket.off('driverArrived');
      socket.off('rideStarted');
      socket.off('rideCompleted');
      socket.off('rideCancelled');
      socket.off('rideError');
    };
  }, []);

  const setupSocketListeners = () => {
    // Ride requested confirmation
    socket.on('rideRequested', (ride) => {
      setCurrentRide(ride);
      setStartOtp(ride.startOtp);
      setStopOtp(ride.stopOtp);
      setRideStatus('searching');
    });

    // Driver accepted
    socket.on('rideAccepted', (ride) => {
      setCurrentRide(ride);
      setDriverInfo(ride.driver);
      setRideStatus('accepted');
      Alert.alert('Driver Found!', `${ride.driver.name} is coming to pick you up`);
    });

    // Driver arrived
    socket.on('driverArrived', (ride) => {
      setRideStatus('arrived');
      Alert.alert(
        'Driver Arrived!',
        `Your driver is here. Share this OTP: ${startOtp}`,
        [{ text: 'OK' }]
      );
    });

    // Ride started
    socket.on('rideStarted', (ride) => {
      setRideStatus('in_progress');
      setRideStartTime(Date.now());
      Alert.alert('Ride Started!', 'Have a safe journey');
    });

    // Ride completed
    socket.on('rideCompleted', (ride) => {
      setRideStatus('completed');
      navigation.navigate('RideSummary', { ride });
    });

    // Ride cancelled
    socket.on('rideCancelled', (ride) => {
      Alert.alert('Ride Cancelled', 'Your ride has been cancelled');
      navigation.goBack();
    });

    // Errors
    socket.on('rideError', (error) => {
      Alert.alert('Error', error.message);
    });
  };

  const handleCancelRide = (reason) => {
    socket.emit('rideCancelled', {
      rideId: currentRide._id,
      cancelledBy: 'rider',
      reason: reason
    });
    setShowCancelModal(false);
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <RideTrackingMap
        pickupCoords={currentRide?.pickupLocation.coordinates}
        dropoffCoords={currentRide?.dropoffLocation.coordinates}
      />

      {/* Status-based UI */}
      {rideStatus === 'searching' && (
        <View style={styles.statusCard}>
          <Text style={styles.statusText}>🔍 Finding nearby drivers...</Text>
        </View>
      )}

      {rideStatus === 'accepted' && driverInfo && (
        <DriverInfoCard
          driver={driverInfo}
          onCancel={() => setShowCancelModal(true)}
        />
      )}

      {rideStatus === 'arrived' && (
        <OTPDisplay
          otp={startOtp}
          label="START OTP"
          onCopy={() => Alert.alert('Copied!', 'OTP copied to clipboard')}
        />
      )}

      {rideStatus === 'in_progress' && (
        <>
          <RideProgress
            startTime={rideStartTime}
            distanceRemaining={currentRide?.distanceInKm}
            eta={15}
          />
          <OTPDisplay
            otp={stopOtp}
            label="STOP OTP"
            onCopy={() => Alert.alert('Copied!', 'OTP copied to clipboard')}
          />
        </>
      )}

      {/* Cancel Modal */}
      <CancelRideModal
        visible={showCancelModal}
        onCancel={() => setShowCancelModal(false)}
        onConfirm={handleCancelRide}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusCard: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default RideScreen;
```

---

## 11. Testing Guide

### Test Complete Flow in Postman

**Connection 1 (Rider):**
```json
1. riderConnect → { "userId": "USER_ID" }
2. newRideRequest → { "rider": "USER_ID", ... }
```

**Connection 2 (Driver):**
```json
3. driverConnect → { "driverId": "DRIVER_ID" }
4. rideAccepted → { "rideId": "RIDE_ID", "driverId": "DRIVER_ID" }
5. driverArrived → { "rideId": "RIDE_ID" }
6. rideStarted → { "rideId": "RIDE_ID", "otp": "1234" }
7. rideCompleted → { "rideId": "RIDE_ID", "fare": 150, "otp": "5678" }
```

**Connection 1 (Rider) - Listen for:**
- `rideRequested`
- `rideAccepted`
- `driverArrived`
- `rideStarted`
- `rideCompleted`

---

## 📚 Summary

### All Socket Events for Rider App

| Event | Type | Purpose |
|-------|------|---------|
| `riderConnect` | EMIT | Connect as rider |
| `newRideRequest` | EMIT | Request a new ride |
| `rideCancelled` | EMIT | Cancel ride |
| `submitRating` | EMIT | Rate driver after ride |
| `sendMessage` | EMIT | Send message to driver |
| `emergencyAlert` | EMIT | Trigger SOS |
| `riderConnect` | LISTEN | Connection confirmation |
| `rideRequested` | LISTEN | Ride request confirmation |
| `rideAccepted` | LISTEN | Driver accepted ride |
| `driverLocationUpdate` | LISTEN | Driver location updates |
| `driverArrived` | LISTEN | Driver arrived at pickup |
| `rideStarted` | LISTEN | Ride started |
| `rideLocationUpdate` | LISTEN | Live ride tracking |
| `rideCompleted` | LISTEN | Ride completed |
| `rideCancelled` | LISTEN | Ride cancelled |
| `rideError` | LISTEN | Ride errors |

---

## ✅ Checklist

- [ ] Socket connection established
- [ ] Can request new ride
- [ ] Receives ride request confirmation
- [ ] Receives driver acceptance notification
- [ ] Can track driver location in real-time
- [ ] Receives driver arrived notification
- [ ] Start OTP displayed when driver arrives
- [ ] Receives ride start notification
- [ ] Can track ride progress in real-time
- [ ] Stop OTP displayed during ride
- [ ] Receives ride completion notification
- [ ] Can view ride summary (fare, distance, duration)
- [ ] Can rate and review driver
- [ ] Can cancel ride at any time (before start)

---

**For complete socket events, see:** `SOCKET_API_DOCUMENTATION.md`  
**For testing, see:** `SOCKET_TESTING_GUIDE.md`

