/**
 * Tiny wrapper around a WebSocket connection to our signaling server.
 * Messages sent before the socket is open are queued and sent on connect.
 */
export function connectSignaling({ onMessage, onDisconnect }) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
  const outbox = [];
  let closedByUs = false;

  socket.onopen = () => {
    outbox.splice(0).forEach((message) => socket.send(message));
  };

  socket.onmessage = (event) => {
    onMessage(JSON.parse(event.data));
  };

  socket.onclose = () => {
    if (!closedByUs) onDisconnect?.();
  };

  return {
    send(message) {
      const text = JSON.stringify(message);
      if (socket.readyState === WebSocket.OPEN) socket.send(text);
      else outbox.push(text);
    },
    close() {
      closedByUs = true;
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' }));
      socket.close();
    },
  };
}
