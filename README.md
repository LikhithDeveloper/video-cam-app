# BubbleCall 🫧

One-to-one video calls with React + WebRTC. Enter your name, create a call, send the 6-character code to a friend, and they join with it.

## Run it

```bash
npm install      # installs root, server and client dependencies
npm run dev      # starts the signaling server (3001) and the React app (5173)
```

Open http://localhost:5173 in two browser tabs to try it.

### Calling another device on your Wi-Fi (phone, second laptop)

Browsers only allow the camera on `localhost` or over HTTPS, so use:

```bash
npm run dev:https
```

Then open `https://<your-PC-IP>:5173` on the other device and accept the self-signed certificate warning.

### Production

```bash
npm run build    # builds the React app into client/dist
npm start        # the Node server serves the app + signaling on port 3001
```

When you deploy it (e.g. on Render), it gets HTTPS automatically. Both people still need to be on the same network.

## How it works

```
 Browser A ──(WebSocket: offer/answer/ICE)──► Signaling server ◄──(WebSocket)── Browser B
     ▲                                                                            ▲
     └──────────────── audio + video, directly peer-to-peer (WebRTC) ─────────────┘
```

| File | What it does |
| --- | --- |
| `server/index.js` | Creates rooms and codes, and relays signaling messages between the two people |
| `client/src/hooks/useVideoCall.js` | All the call logic: camera, peer connection, offer/answer, reconnecting |
| `client/src/lib/webrtc.js` | Low-latency WebRTC settings and helpers |
| `client/src/lib/signaling.js` | Small WebSocket wrapper |
| `client/src/components/` | UI: `Home`, `CallRoom`, `VideoTile`, `Bubbles`, `Icons` |

## Why the latency is low

- **Peer-to-peer:** video never goes through a server.
- **Trickle ICE:** connection paths are sent as soon as they are found, so the call connects fast.
- **Minimal jitter buffer** (`jitterBufferTarget = 0`): incoming frames are played right away.
- **`maintain-framerate` + `contentHint: 'motion'`:** on a bad network, quality drops instead of the video lagging.
- **Live RTT badge** in the call header (green under 80 ms).

## Limitation: same network only

The app uses no STUN/TURN servers, so both people must be on the **same Wi-Fi / local
network**. Calls between different networks (e.g. one phone on mobile data) will not connect.
