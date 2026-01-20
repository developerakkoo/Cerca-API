const { io } = require('socket.io-client');

// 🔁 CHANGE THIS
const SERVER_URL = 'http://localhost:3000'; // or your domain
const RIDER_TOKEN = 'RIDER_JWT_TOKEN'; // optional if auth used

const socket = io(SERVER_URL, {
  transports: ['websocket'],
  auth: {
    token: RIDER_TOKEN
  }
});

socket.on('connect', () => {
  console.log('✅ Rider connected');
  console.log('🆔 Rider socketId:', socket.id);
});

// 🔔 EVENTS RIDER SHOULD RECEIVE
socket.on('rideAccepted', data => {
  console.log('✅ rideAccepted:', data);
});

socket.on('noDriverFound', data => {
  console.log('❌ noDriverFound:', data);
});

socket.on('joinRideRoom', data => {
  console.log('🚪 joinRideRoom:', data);
});

// 🔍 DEBUG ALL EVENTS
socket.onAny((event, data) => {
  console.log('📡 Rider event:', event, data);
});

socket.on('disconnect', () => {
  console.log('❌ Rider disconnected');
});
