const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const RoomManager = require('./roomManager');
const gameLogic = require('./gameLogic');
const { SPRINT_TEXTS, MARATHON_TEXTS, ENDLESS_TEXTS } = require('./textBank');

const app = express();
const server = http.createServer(app);
const defaultClientOrigins = 'http://localhost:5173,http://localhost:3000,https://typing-game-frontend-five.vercel.app';
const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/$/, '');
const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || defaultClientOrigins)
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  if (allowedOrigins.includes(normalizedOrigin)) return true;

  // Allow Vercel preview/prod frontend domains when explicitly enabled.
  if (process.env.ALLOW_VERCEL_ORIGINS === 'true') {
    try {
      const host = new URL(normalizedOrigin).hostname;
      if (host.endsWith('.vercel.app')) return true;
    } catch (error) {
      return false;
    }
  }

  return false;
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

app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'Server running' });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ topScores: [] });
});

const roomManager = new RoomManager();

const getTextForMode = (gameMode) => {
  switch (gameMode) {
    case gameLogic.GAME_MODES.MARATHON:
      return MARATHON_TEXTS[Math.floor(Math.random() * MARATHON_TEXTS.length)];
    case gameLogic.GAME_MODES.ENDLESS:
      return ENDLESS_TEXTS[Math.floor(Math.random() * ENDLESS_TEXTS.length)];
    case gameLogic.GAME_MODES.SPRINT:
    default:
      return SPRINT_TEXTS[Math.floor(Math.random() * SPRINT_TEXTS.length)];
  }
};

const sanitizeMode = (gameMode) => {
  if (gameMode === gameLogic.GAME_MODES.MARATHON) return gameLogic.GAME_MODES.MARATHON;
  if (gameMode === gameLogic.GAME_MODES.ENDLESS) return gameLogic.GAME_MODES.ENDLESS;
  return gameLogic.GAME_MODES.SPRINT;
};

const finalizeRace = (roomCode, reason = 'complete') => {
  const room = roomManager.getRoom(roomCode);
  if (!room || !room.gameStarted) return;

  room.players.forEach((player) => {
    if (player.finishTime && !player.timeElapsed && room.startTime) {
      player.timeElapsed = Math.round(((player.finishTime - room.startTime) / 1000) * 10) / 10;
    }
  });

  const results = gameLogic.generateLeaderboard(room.players, room.gameMode);
  room.gameStarted = false;

  if (room.sprintTimeoutId) {
    clearTimeout(room.sprintTimeoutId);
    room.sprintTimeoutId = null;
  }

  io.to(roomCode).emit('raceComplete', {
    results,
    gameMode: room.gameMode,
    reason
  });

  console.log(`Race complete (${room.gameMode}) in room ${roomCode}, reason: ${reason}`);
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('createRoom', ({ playerName }, callback) => {
    try {
      const room = roomManager.createRoom(playerName, socket.id);
      socket.join(room.roomCode);

      console.log(`Room created: ${room.roomCode} by ${playerName}`);
      callback({ success: true, room });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    try {
      const room = roomManager.joinRoom(roomCode, playerName, socket.id);
      socket.join(roomCode);

      io.to(roomCode).emit('playerJoined', {
        players: room.players,
        gameMode: room.gameMode,
        message: `${playerName} joined the race!`
      });

      console.log(`${playerName} joined room: ${roomCode}`);
      callback({ success: true, room });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('setGameMode', ({ roomCode, gameMode }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('Room not found');
      if (room.gameStarted) throw new Error('Cannot change mode after game starts');
      if (socket.id !== room.hostSocketId) {
        throw new Error('Only the room creator can choose mode');
      }

      const selectedMode = sanitizeMode(gameMode);
      room.gameMode = selectedMode;

      io.to(roomCode).emit('gameModeUpdated', {
        gameMode: selectedMode
      });

      callback({ success: true, gameMode: selectedMode });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('startGame', ({ roomCode, gameMode }, callback) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room) throw new Error('Room not found');
      if (socket.id !== room.hostSocketId) {
        throw new Error('Only the room creator can start the game and choose mode');
      }

      const selectedMode = sanitizeMode(room.gameMode);
      const selectedText = getTextForMode(selectedMode);

      room.gameMode = selectedMode;
      room.gameStarted = true;
      room.gameText = selectedText;
      room.startTime = Date.now();

      if (room.sprintTimeoutId) {
        clearTimeout(room.sprintTimeoutId);
        room.sprintTimeoutId = null;
      }

      room.players.forEach((p) => {
        p.typed = '';
        p.finished = false;
        p.finishTime = null;
        p.timeElapsed = 0;
        p.wpm = 0;
        p.accuracy = 0;
        p.progress = 0;
        p.finalWpm = 0;
        p.finalAccuracy = 0;
      });

      if (selectedMode === gameLogic.GAME_MODES.SPRINT) {
        const sprintLimitSeconds = gameLogic.GAME_MODE_CONFIG.sprint.timeLimit || 60;
        room.sprintTimeoutId = setTimeout(() => {
          finalizeRace(roomCode, 'timeUp');
        }, sprintLimitSeconds * 1000);
      }

      io.to(roomCode).emit('gameStarted', {
        text: selectedText,
        startTime: room.startTime,
        gameMode: selectedMode
      });

      console.log(`Game started: ${selectedMode} mode in room ${roomCode}`);
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('typingProgress', ({ roomCode, typed, characterIndex }) => {
    try {
      const room = roomManager.getRoom(roomCode);
      if (!room || !room.gameStarted) return;

      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) return;

      player.typed = typed;
      player.characterIndex = characterIndex;

      const progress = gameLogic.calculateProgress(typed, room.gameText);
      const wpm = gameLogic.calculateWPM(typed, room.startTime);
      const accuracy = gameLogic.calculateAccuracy(typed, room.gameText);

      player.wpm = wpm;
      player.accuracy = accuracy;
      player.progress = progress;

      const isFinished = gameLogic.isPlayerFinished(typed, room.gameText, room.gameMode);

      if (isFinished && !player.finished && room.gameMode !== gameLogic.GAME_MODES.ENDLESS) {
        player.finished = true;
        player.finishTime = Date.now();

        const timeElapsed = (player.finishTime - room.startTime) / 1000;
        const finalStats = gameLogic.calculateFinalStats(typed, room.gameText, timeElapsed);

        player.finalWpm = finalStats.wpm;
        player.finalAccuracy = finalStats.accuracy;
        player.timeElapsed = finalStats.timeElapsed;

        io.to(roomCode).emit('playerFinished', {
          playerName: player.name,
          wpm: finalStats.wpm,
          accuracy: finalStats.accuracy,
          timeElapsed,
          placement: room.players.filter((p) => p.finished).length,
          gameMode: room.gameMode
        });

        if (room.gameMode === gameLogic.GAME_MODES.MARATHON) {
          const allFinished = room.players.every((p) => p.finished);
          if (allFinished) {
            finalizeRace(roomCode, 'allFinished');
            return;
          }
        }
      }

      io.to(roomCode).emit('playersProgress', {
        players: room.players.map((p) => ({
          name: p.name,
          progress: p.progress,
          wpm: p.wpm,
          accuracy: p.accuracy,
          finished: p.finished
        })),
        gameMode: room.gameMode
      });
    } catch (error) {
      console.error('Typing progress error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    const affectedRooms = roomManager.removePlayer(socket.id);

    affectedRooms.forEach((roomCode) => {
      const room = roomManager.getRoom(roomCode);
      if (room) {
        io.to(roomCode).emit('playerLeft', {
          players: room.players,
          gameMode: room.gameMode,
          message: 'A player left the race'
        });

        if (room.players.length === 0) {
          if (room.sprintTimeoutId) {
            clearTimeout(room.sprintTimeoutId);
          }
          roomManager.deleteRoom(roomCode);
          console.log(`Empty room deleted: ${roomCode}`);
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
  console.log(`TypeRush backend listening on port ${PORT}`);
});

module.exports = server;
