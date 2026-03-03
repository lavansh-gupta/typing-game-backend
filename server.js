const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const RoomManager = require('./roomManager');
const gameLogic = require('./gameLogic');
const { TEXT_BANK } = require('./textBank');

const app = express();
const server = http.createServer(app);
const defaultClientOrigins = 'http://localhost:5173,http://localhost:3000';
const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/$/, '');
const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || defaultClientOrigins)
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  return allowedOrigins.includes(normalizeOrigin(origin));
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`Blocked by CORS: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  credentials: true
};

const io = socketIo(server, {
  cors: corsOptions
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'Server running' });
});

app.get('/api/leaderboard', (req, res) => {
  // TODO: Fetch from MongoDB
  res.json({ topScores: [] });
});

// Socket.io event handlers
const roomManager = new RoomManager();

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // ===== ROOM CREATION =====
  socket.on('createRoom', ({ playerName }, callback) => {
    try {
      const room = roomManager.createRoom(playerName, socket.id);
      socket.join(room.roomCode);
      
      console.log(`📍 Room created: ${room.roomCode} by ${playerName}`);
      callback({ success: true, room });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // ===== JOIN ROOM =====
  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    try {
      const room = roomManager.joinRoom(roomCode, playerName, socket.id);
      socket.join(roomCode);

      // Broadcast updated players list to all in room
      io.to(roomCode).emit('playerJoined', {
        players: room.players,
        message: `${playerName} joined the race!`
      });

      console.log(`📍 ${playerName} joined room: ${roomCode}`);
      callback({ success: true, room });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // ===== START GAME =====
  socket.on('startGame', ({ roomCode }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('Room not found');

      // Get random text
      const selectedText = TEXT_BANK[Math.floor(Math.random() * TEXT_BANK.length)];
      
      // Update room state
      room.gameStarted = true;
      room.gameText = selectedText;
      room.startTime = Date.now();
      room.players.forEach(p => {
        p.typed = '';
        p.finished = false;
        p.finishTime = null;
      });

      // Emit to all players in room
      io.to(roomCode).emit('gameStarted', {
        text: selectedText,
        startTime: room.startTime
      });

      console.log(`🎮 Game started in room: ${roomCode}`);
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // ===== TYPING PROGRESS =====
  socket.on('typingProgress', ({ roomCode, typed, characterIndex }) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) return;

      // Find player and update their progress
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      player.typed = typed;
      player.characterIndex = characterIndex;

      // Calculate live stats
      const progress = gameLogic.calculateProgress(typed, room.gameText);
      const wpm = gameLogic.calculateWPM(typed, room.startTime);
      const accuracy = gameLogic.calculateAccuracy(typed, room.gameText);

      player.wpm = wpm;
      player.accuracy = accuracy;
      player.progress = progress;

      // Check if player finished
      if (typed.length >= room.gameText.length && !player.finished) {
        player.finished = true;
        player.finishTime = Date.now();

        // Calculate final stats
        const timeElapsed = (player.finishTime - room.startTime) / 1000;
        const finalStats = gameLogic.calculateFinalStats(
          typed,
          room.gameText,
          timeElapsed
        );

        player.finalWpm = finalStats.wpm;
        player.finalAccuracy = finalStats.accuracy;

        // Broadcast finish event
        io.to(roomCode).emit('playerFinished', {
          playerName: player.name,
          wpm: finalStats.wpm,
          accuracy: finalStats.accuracy,
          timeElapsed: timeElapsed,
          placement: room.players.filter(p => p.finished).length
        });

        // Check if all players finished
        const allFinished = room.players.every(p => p.finished);
        if (allFinished) {
          const results = gameLogic.generateLeaderboard(room.players);
          io.to(roomCode).emit('raceComplete', { results });
          console.log(`🏁 Race complete in room: ${roomCode}`);
        }
      }

      // Broadcast typing progress to all players in room
      io.to(roomCode).emit('playersProgress', {
        players: room.players.map(p => ({
          name: p.name,
          progress: p.progress,
          wpm: p.wpm,
          accuracy: p.accuracy,
          finished: p.finished
        }))
      });
    } catch (error) {
      console.error('Typing progress error:', error);
    }
  });

  // ===== DISCONNECT =====
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    
    // Find and remove player from all rooms
    const affectedRooms = roomManager.removePlayer(socket.id);
    
    affectedRooms.forEach(roomCode => {
      const room = roomManager.getRoom(roomCode);
      if (room) {
        // Notify remaining players
        io.to(roomCode).emit('playerLeft', {
          players: room.players,
          message: 'A player left the race'
        });

        // Delete empty rooms
        if (room.players.length === 0) {
          roomManager.deleteRoom(roomCode);
          console.log(`🗑️ Empty room deleted: ${roomCode}`);
        }
      }
    });
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║        🏎️  TYPERUS BACKEND LIVE 🏎️     ║
║      Listening on port ${PORT}           ║
╚════════════════════════════════════════╝
  `);
});

module.exports = server;
