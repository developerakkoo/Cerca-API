const { io } = require('socket.io-client');

// 🔁 CHANGE THIS
const SERVER_URL = 'http://localhost:3000';
const DRIVER_TOKEN = 'DRIVER_JWT_TOKEN';
const DRIVER_ID = '681dc62aa10f062e34128b84';

const socket = io(SERVER_URL, {
  transports: ['websocket'],
  auth: {
    token: DRIVER_TOKEN
  }
});

socket.on('connect', () => {
  console.log('✅ Driver connected');
  console.log('🆔 Driver socketId:', socket.id);
});

// 🚨 DRIVER RECEIVES RIDE
socket.on('newRideRequest', ride => {
  console.log('🚕 newRideRequest received');
  console.log('Ride ID:', ride._id);

  // ⏳ Simulate driver decision
  setTimeout(() => {
    console.log('✅ Driver accepting ride');

    socket.emit('rideAccepted', {
      rideId: ride._id,
      driverId: DRIVER_ID
    });
  }, 5000); // accept after 5 sec
});

// 🔍 DEBUG ALL EVENTS
socket.onAny((event, data) => {
  console.log('📡 Driver event:', event, data);
});

socket.on('disconnect', () => {
  console.log('❌ Driver disconnected');
});
