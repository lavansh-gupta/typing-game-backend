const { v4: uuidv4 } = require('uuid');

class RoomManager {
  constructor() {
    this.rooms = {};
  }

  /**
   * Generate a unique 6-character room code
   */
  generateRoomCode() {
    return Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
  }

  /**
   * Create a new room
   */
  createRoom(hostName, socketId) {
    const roomCode = this.generateRoomCode();

    this.rooms[roomCode] = {
      roomCode,
      hostSocketId: socketId,
      gameMode: 'sprint',
      gameStarted: false,
      gameText: '',
      startTime: null,
      sprintTimeoutId: null,
      players: [
        {
          id: uuidv4(),
          name: hostName,
          socketId,
          wpm: 0,
          accuracy: 0,
          progress: 0,
          typed: '',
          finished: false,
          finishTime: null,
          finalWpm: 0,
          finalAccuracy: 0
        }
      ],
      createdAt: Date.now()
    };

    return this.rooms[roomCode];
  }

  /**
   * Join an existing room
   */
  joinRoom(roomCode, playerName, socketId) {
    if (!this.rooms[roomCode]) {
      throw new Error('Room not found');
    }

    const room = this.rooms[roomCode];

    if (room.gameStarted) {
      throw new Error('Game already in progress');
    }

    if (room.players.length >= 2) {
      throw new Error('Room is full');
    }

    if (room.players.some(p => p.socketId === socketId)) {
      throw new Error('Player already in this room');
    }

    room.players.push({
      id: uuidv4(),
      name: playerName,
      socketId,
      wpm: 0,
      accuracy: 0,
      progress: 0,
      typed: '',
      finished: false,
      finishTime: null,
      finalWpm: 0,
      finalAccuracy: 0
    });

    return room;
  }

  /**
   * Get a room by code
   */
  getRoom(roomCode) {
    return this.rooms[roomCode];
  }

  /**
   * Remove a player from all rooms
   */
  removePlayer(socketId) {
    const affectedRooms = [];

    for (const roomCode in this.rooms) {
      const room = this.rooms[roomCode];
      const playerIndex = room.players.findIndex(p => p.socketId === socketId);

      if (playerIndex > -1) {
        room.players.splice(playerIndex, 1);
        affectedRooms.push(roomCode);
      }
    }

    return affectedRooms;
  }

  /**
   * Delete a room
   */
  deleteRoom(roomCode) {
    delete this.rooms[roomCode];
  }

  /**
   * Get all active rooms
   */
  getAllRooms() {
    return this.rooms;
  }

  /**
   * Get room stats
   */
  getRoomStats() {
    const totalRooms = Object.keys(this.rooms).length;
    const totalPlayers = Object.values(this.rooms).reduce(
      (sum, room) => sum + room.players.length,
      0
    );

    return {
      totalRooms,
      totalPlayers,
      activeGames: Object.values(this.rooms).filter(r => r.gameStarted).length
    };
  }
}

module.exports = RoomManager;
