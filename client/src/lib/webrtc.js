/**
 * WebRTC settings, tuned for the lowest possible latency.
 *
 * Where the latency savings come from:
 *  1. Peer-to-peer: video goes straight between the two browsers, no server hop.
 *  2. Trickle ICE: connection paths are sent as soon as they're found,
 *     so the call connects faster.
 *  3. max-bundle / rtcp-mux: audio + video share one network connection.
 *  4. Minimal jitter buffer on the receiver: frames are played as soon as they
 *     arrive instead of being held back "just in case".
 *  5. "maintain-framerate": on a weak network the browser lowers resolution
 *     instead of buffering or dropping frames, so motion stays real-time.
 */

// ---- Peer connection settings -------------------------------------------
// No STUN/TURN servers: the two browsers connect using their local network
// addresses, so both people must be on the same Wi-Fi / network.
export const RTC_CONFIG = {
  iceServers: [],
  bundlePolicy: 'max-bundle', // audio + video share one connection
  rtcpMuxPolicy: 'require',
};

// ---- Camera & microphone --------------------------------------------------
export const MEDIA_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: 'user',
  },
};

const MAX_VIDEO_BITRATE = 2_500_000; // 2.5 Mbps is plenty for 720p

/** Ask the browser to favour smooth, real-time video for an outgoing track. */
export async function tuneSenderForLowLatency(sender) {
  if (!sender.track) return;

  const params = sender.getParameters();
  if (sender.track.kind === 'video') {
    params.degradationPreference = 'maintain-framerate';
  }
  for (const encoding of params.encodings ?? []) {
    encoding.priority = 'high';
    encoding.networkPriority = 'high';
    if (sender.track.kind === 'video') encoding.maxBitrate = MAX_VIDEO_BITRATE;
  }

  try {
    await sender.setParameters(params);
  } catch (err) {
    // Not every browser supports every option — the call still works without them.
    console.warn('Could not apply sender tuning:', err);
  }
}

/**
 * Prefer the VP8 video codec. Every browser decodes VP8 in software, while
 * H.264 relies on phone hardware decoders that can show black video between
 * different devices (e.g. iPhone <-> Android). Must be called after addTrack.
 */
export function preferVp8Codec(peerConnection) {
  const codecs = RTCRtpReceiver.getCapabilities?.('video')?.codecs;
  if (!codecs || !('setCodecPreferences' in RTCRtpTransceiver.prototype)) return;

  const isVp8 = (codec) => codec.mimeType.toLowerCase() === 'video/vp8';
  const ordered = [...codecs.filter(isVp8), ...codecs.filter((codec) => !isVp8(codec))];

  for (const transceiver of peerConnection.getTransceivers()) {
    if (transceiver.sender.track?.kind !== 'video') continue;
    try {
      transceiver.setCodecPreferences(ordered);
    } catch (err) {
      console.warn('Could not set codec preference:', err);
    }
  }
}

/** Play incoming audio/video with the smallest possible buffer delay. */
export function tuneReceiverForLowLatency(receiver) {
  if ('jitterBufferTarget' in receiver) {
    receiver.jitterBufferTarget = 0; // modern Chrome/Edge (milliseconds)
  } else if ('playoutDelayHint' in receiver) {
    receiver.playoutDelayHint = 0; // older Chrome (seconds)
  }
}

/** Current network round-trip time between the two peers, in milliseconds. */
export async function getRoundTripTimeMs(peerConnection) {
  const stats = await peerConnection.getStats();
  let seconds = null;

  stats.forEach((report) => {
    const isActivePair = report.type === 'candidate-pair' && report.state === 'succeeded' && (report.nominated || report.selected);
    if (isActivePair && report.currentRoundTripTime != null) seconds = report.currentRoundTripTime;
  });

  return seconds == null ? null : Math.round(seconds * 1000);
}

/** Turn getUserMedia errors into a message a user understands. */
export function describeMediaError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Camera/microphone permission was denied. Allow access in your browser and try again.';
    case 'NotFoundError':
      return 'No camera or microphone was found on this device.';
    case 'NotReadableError':
      return 'Your camera is being used by another app. Close it and try again.';
    default:
      if (!window.isSecureContext) return 'Camera access needs HTTPS. Open the app over https:// or on localhost.';
      return `Could not start camera: ${err?.message ?? err}`;
  }
}
