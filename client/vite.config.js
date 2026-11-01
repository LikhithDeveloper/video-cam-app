import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev`        -> http://localhost:5173 (camera works on localhost)
// `npm run dev:https`  -> https://<your-LAN-IP>:5173 so a phone/other PC on
//                         your Wi-Fi can use the camera (browsers require HTTPS).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: {
    host: true, // also listen on your LAN IP, not only localhost
    proxy: {
      // Forward Socket.IO (signaling) traffic to the Node server.
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
}));
