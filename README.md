# BubbleCall 🫧

One-to-one video calls with React + WebRTC, with Socket.IO for signaling. Enter your name, create a call, send the 6-character code to a friend, and they join with it.

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

When you deploy it (e.g. on Render), it gets HTTPS automatically and people can call each other from anywhere.

## How it works

```
 Browser A ──(Socket.IO: offer/answer/ICE)──► Signaling server ◄──(Socket.IO)── Browser B
     ▲                                                                            ▲
     └──────────────── audio + video, directly peer-to-peer (WebRTC) ─────────────┘
```

| File | What it does |
| --- | --- |
| `server/index.js` | Socket.IO server: creates rooms and codes, and relays signaling events between the two people |
| `client/src/hooks/useVideoCall.js` | All the call logic: camera, peer connection, offer/answer, reconnecting |
| `client/src/lib/webrtc.js` | Low-latency WebRTC settings and helpers |
| `client/src/lib/signaling.js` | Small Socket.IO client wrapper |
| `client/src/components/` | UI: `Home`, `CallRoom`, `VideoTile`, `Bubbles`, `Icons` |

## Why the latency is low

- **Peer-to-peer:** video never goes through a server.
- **Trickle ICE:** connection paths are sent as soon as they are found, so the call connects fast.
- **Minimal jitter buffer** (`jitterBufferTarget = 0`): incoming frames are played right away.
- **`maintain-framerate` + `contentHint: 'motion'`:** on a bad network, quality drops instead of the video lagging.
- **Live RTT badge** in the call header (green under 80 ms).

## Calling between different networks

The peer connection uses free public **STUN** servers (Google, Cloudflare) so each browser
can learn its public address. That is enough for most home Wi-Fi and mobile connections.

A few strict networks (some mobile carriers, offices, hotspots with client isolation) block
every direct path. There the call shows *"Could not connect to your friend"*. Those networks
need a **TURN** relay: add one to `RTC_CONFIG` in `client/src/lib/webrtc.js`:

```js
{ urls: 'turn:turn.example.com:3478', username: '...', credential: '...' }
```

Free TURN tiers exist at e.g. Metered.ca, Twilio and Cloudflare Calls.
