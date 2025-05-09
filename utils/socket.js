const { Server } = require('socket.io');

let io; // Declare a variable to hold the Socket.IO instance

// Function to initialize Socket.IO
function initializeSocket(server) {
    io = new Server(server,{
        cors:{
            origin:'*',
            methods:['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        socket.on('message', (data) => {
            console.log('Message received:', data);
            io.emit('message', data); // Broadcast message to all clients
        });

        socket.on('disconnect', () => {
            console.log('A user disconnected:', socket.id);
        });
    });
}

// Function to get the Socket.IO instance
function getSocketIO() {
    if (!io) {
        throw new Error('Socket.IO is not initialized. Call initializeSocket first.');
    }
    return io;
}

module.exports = { initializeSocket, getSocketIO };