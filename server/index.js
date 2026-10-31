/**
 * Signaling server
 * ----------------
 * WebRTC sends audio/video DIRECTLY between the two browsers (peer-to-peer).
 * But before they can connect, the browsers need to exchange a few small
 * messages ("offer", "answer" and "ICE candidates"). This server only relays
 * those messages — no video ever passes through it.
 *
 * Message protocol (all JSON over a WebSocket at /ws):
 *
 *   client -> server                     server -> client
 *   { type: 'create', name }             { type: 'created', code }
 *   { type: 'join', name, code }         { type: 'joined', code, peerName }  (to the joiner)
 *                                        { type: 'peer-joined', peerName }   (to the person waiting)
 *   { type: 'signal', data }             { type: 'signal', data }            (relayed to the other person)
 *   { type: 'leave' }                    { type: 'peer-left' }
 *                                        { type: 'error', message }
 */
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

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

// ---------------------------------------------------------------------------
// Rooms: code -> Set of connected sockets (max 2)
// ---------------------------------------------------------------------------
const rooms = new Map();

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

/** The other person in the same room (or undefined if alone). */
function getPeer(socket) {
  const room = rooms.get(socket.roomCode);
  if (!room) return undefined;
  return [...room].find((member) => member !== socket);
}

function leaveRoom(socket) {
  const room = rooms.get(socket.roomCode);
  if (!room) return;

  room.delete(socket);
  const peer = [...room][0];
  if (peer) send(peer, { type: 'peer-left' });
  if (room.size === 0) rooms.delete(socket.roomCode);

  console.log(`[room ${socket.roomCode}] ${socket.userName} left (${room.size} remaining)`);
  socket.roomCode = null;
}

function cleanName(name) {
  return String(name ?? '').trim().slice(0, 30) || 'Guest';
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------
const handlers = {
  create(socket, { name }) {
    leaveRoom(socket);
    socket.userName = cleanName(name);
    socket.roomCode = generateRoomCode();
    rooms.set(socket.roomCode, new Set([socket]));

    send(socket, { type: 'created', code: socket.roomCode });
    console.log(`[room ${socket.roomCode}] created by ${socket.userName}`);
  },

  join(socket, { name, code }) {
    const roomCode = String(code ?? '').trim().toUpperCase();
    const room = rooms.get(roomCode);

    if (!room) return send(socket, { type: 'error', message: 'No call found with that code. Check the code and try again.' });
    if (room.size >= MAX_PEOPLE_PER_ROOM) return send(socket, { type: 'error', message: 'This call is already full.' });

    leaveRoom(socket);
    socket.userName = cleanName(name);
    socket.roomCode = roomCode;
    const waitingPerson = [...room][0];
    room.add(socket);

    // Tell the joiner who is there, and tell the waiting person to start the call.
    send(socket, { type: 'joined', code: roomCode, peerName: waitingPerson?.userName });
    if (waitingPerson) send(waitingPerson, { type: 'peer-joined', peerName: socket.userName });
    console.log(`[room ${roomCode}] ${socket.userName} joined`);
  },

  signal(socket, { data }) {
    const peer = getPeer(socket);
    if (peer) send(peer, { type: 'signal', data });
  },

  leave(socket) {
    leaveRoom(socket);
  },
};

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  socket.roomCode = null;
  socket.userName = 'Guest';
  socket.isAlive = true;

  socket.on('pong', () => (socket.isAlive = true));

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return; // ignore anything that isn't valid JSON
    }
    handlers[message.type]?.(socket, message);
  });

  socket.on('close', () => leaveRoom(socket));
});

// Every 30s, drop connections that stopped responding (e.g. laptop closed),
// so the other person is told they left instead of waiting forever.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30_000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Signaling server running on http://localhost:${PORT}`);
});
