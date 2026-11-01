/**
 * Signaling server (Socket.IO)
 * ----------------------------
 * WebRTC sends audio/video DIRECTLY between the two browsers (peer-to-peer).
 * But before they can connect, the browsers need to exchange a few small
 * messages ("offer", "answer" and "ICE candidates"). This server only relays
 * those messages — no video ever passes through it.
 *
 * Socket.IO events:
 *
 *   client -> server                     server -> client
 *   'create', { name }                   'created',     { code }
 *   'join',   { name, code }             'joined',      { code, peerName }  (to the joiner)
 *                                        'peer-joined', { peerName }        (to the person waiting)
 *   'signal', data                       'signal',      data                (relayed to the other person)
 *   'leave'                              'peer-left'
 *                                        'call-error',  { message }
 *
 * Each call is a Socket.IO room named by its 6-character code, so relaying
 * to "the other person" is just `socket.to(code).emit(...)`.
 */
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;
const MAX_PEOPLE_PER_ROOM = 2;

// No 0/O or 1/I/L, so codes are easy to read out loud and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// ---------------------------------------------------------------------------
// HTTP server: serves the built React app in production (after `npm run build`)
// ---------------------------------------------------------------------------
const app = express();

const clientBuildDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
app.use(express.static(clientBuildDir));

const server = http.createServer(app);

// Same origin in production, and Vite proxies /socket.io in development,
// so no CORS settings are needed. Socket.IO's own heartbeat detects
// connections that silently died (e.g. laptop closed).
const io = new Server(server);

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/** Socket ids currently in a call room (empty set if the room doesn't exist). */
function roomMembers(code) {
  return io.sockets.adapter.rooms.get(code) ?? new Set();
}

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  } while (roomMembers(code).size > 0);
  return code;
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;

  socket.leave(code);
  socket.to(code).emit('peer-left');
  socket.data.roomCode = null;

  console.log(`[room ${code}] ${socket.data.userName} left (${roomMembers(code).size} remaining)`);
}

function cleanName(name) {
  return String(name ?? '').trim().slice(0, 30) || 'Guest';
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.data.roomCode = null;
  socket.data.userName = 'Guest';

  socket.on('create', ({ name } = {}) => {
    leaveRoom(socket);
    socket.data.userName = cleanName(name);
    socket.data.roomCode = generateRoomCode();
    socket.join(socket.data.roomCode);

    socket.emit('created', { code: socket.data.roomCode });
    console.log(`[room ${socket.data.roomCode}] created by ${socket.data.userName}`);
  });

  socket.on('join', ({ name, code } = {}) => {
    const roomCode = String(code ?? '').trim().toUpperCase();
    const members = roomMembers(roomCode);

    if (members.size === 0) {
      return socket.emit('call-error', { message: 'No call found with that code. Check the code and try again.' });
    }
    if (members.size >= MAX_PEOPLE_PER_ROOM) {
      return socket.emit('call-error', { message: 'This call is already full.' });
    }

    leaveRoom(socket);
    socket.data.userName = cleanName(name);
    socket.data.roomCode = roomCode;
    const waitingPerson = io.sockets.sockets.get([...members][0]);
    socket.join(roomCode);

    // Tell the joiner who is there, and tell the waiting person to start the call.
    socket.emit('joined', { code: roomCode, peerName: waitingPerson?.data.userName });
    socket.to(roomCode).emit('peer-joined', { peerName: socket.data.userName });
    console.log(`[room ${roomCode}] ${socket.data.userName} joined`);
  });

  socket.on('signal', (data) => {
    // Guard: socket.to(null) would broadcast to everyone on the server.
    if (socket.data.roomCode) socket.to(socket.data.roomCode).emit('signal', data);
  });

  socket.on('leave', () => leaveRoom(socket));

  // Fires just before the socket leaves its rooms, so the peer still gets told.
  socket.on('disconnecting', () => leaveRoom(socket));
});

server.listen(PORT, () => {
  console.log(`Signaling server running on http://localhost:${PORT}`);
});
