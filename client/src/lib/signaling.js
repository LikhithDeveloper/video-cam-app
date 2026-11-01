/**
 * Tiny wrapper around the Socket.IO connection to our signaling server.
 *
 * Socket.IO connects to the page's own origin (Vite proxies /socket.io to the
 * Node server in development), queues anything emitted before the connection
 * is open, and keeps the connection alive with its own heartbeat.
 */
import { io } from 'socket.io-client';

export function connectSignaling({ onDisconnect }) {
  // No auto-reconnect: the server tells the other person we left as soon as
  // the connection drops, so a reconnected socket would no longer be in the call.
  const socket = io({ reconnection: false });
  let closedByUs = false;

  const handleLost = () => {
    if (!closedByUs) onDisconnect?.();
  };
  socket.on('disconnect', handleLost);
  socket.on('connect_error', handleLost);

  return {
    /** Listen for an event from the server. */
    on(event, handler) {
      socket.on(event, handler);
    },
    /** Send an event to the server. */
    emit(event, payload) {
      socket.emit(event, payload);
    },
    close() {
      closedByUs = true;
      if (socket.connected) socket.emit('leave');
      socket.disconnect();
    },
  };
}
