import { useCallback, useEffect, useRef, useState } from 'react';
import { connectSignaling } from '../lib/signaling.js';
import {
  RTC_CONFIG,
  MEDIA_CONSTRAINTS,
  tuneSenderForLowLatency,
  tuneReceiverForLowLatency,
  preferVp8Codec,
  getRoundTripTimeMs,
  describeMediaError,
} from '../lib/webrtc.js';

/**
 * Runs one video call from start to finish.
 *
 * How a call is set up:
 *   1. Turn on camera + mic.
 *   2. Connect to the signaling server (Socket.IO) and either `create` a room
 *      (get a code) or `join` one with a friend's code.
 *   3. When both people are in the room, the person who was waiting sends an
 *      "offer"; the joiner replies with an "answer". Both sides also trade
 *      "ICE candidates" (possible network paths).
 *   4. The browsers connect directly and the video starts flowing.
 *
 * @param {{ name: string, mode: 'create' | 'join', code?: string }} options
 *
 * status: 'starting' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'error'
 */
export function useVideoCall({ name, mode, code }) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [roomCode, setRoomCode] = useState(code ?? '');
  const [peer, setPeer] = useState(null); // { name, micOn, camOn }
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState('');
  const [latencyMs, setLatencyMs] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const localStreamRef = useRef(null);
  const signalingRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let signaling = null;
    let pc = null; // the current RTCPeerConnection
    let isCaller = false; // true for the person who sends the offer
    let pendingCandidates = []; // ICE candidates that arrived before the offer/answer
    let signalQueue = Promise.resolve(); // processes signals strictly one at a time
    let statsTimer = null;
    let failTimer = null; // gives a failed connection a moment to recover before giving up
    let iceRestarted = false; // the caller retries once with new network paths

    const CONNECT_FAILED_MESSAGE =
      'Could not connect to your friend. One of your networks blocks direct connections — ' +
      'try a different Wi-Fi or mobile data, then start the call again.';

    const sendSignal = (data) => signaling?.emit('signal', data);

    /** Run async WebRTC steps in order, so they never overlap. */
    const enqueue = (task) => {
      signalQueue = signalQueue.then(task).catch((err) => console.error('WebRTC error:', err));
    };

    const currentMediaState = () => ({
      micOn: localStreamRef.current?.getAudioTracks()[0]?.enabled ?? false,
      camOn: localStreamRef.current?.getVideoTracks()[0]?.enabled ?? false,
    });

    // ---------------------------------------------------------------------
    // Peer connection
    // ---------------------------------------------------------------------
    function createPeerConnection() {
      closePeerConnection();

      const connection = new RTCPeerConnection(RTC_CONFIG);
      pc = connection;

      // Send our camera + mic to the other person.
      const stream = localStreamRef.current;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      preferVp8Codec(connection);

      // Send each network path to the peer as soon as it's discovered (trickle ICE).
      connection.onicecandidate = ({ candidate }) => {
        if (candidate) sendSignal({ candidate });
      };

      // Their audio/video arrived. Each track arrives separately, so build a new
      // stream with every track so far (a new object makes <video> reload it).
      connection.ontrack = ({ receiver, track }) => {
        tuneReceiverForLowLatency(receiver);
        setRemoteStream((current) => new MediaStream([...(current?.getTracks() ?? []), track]));
      };

      connection.oniceconnectionstatechange = () => {
        console.log('[call] ICE state:', connection.iceConnectionState);
      };

      connection.onconnectionstatechange = () => {
        console.log('[call] connection state:', connection.connectionState);
        switch (connection.connectionState) {
          case 'connected':
            clearTimeout(failTimer);
            setStatus('connected');
            connection.getSenders().forEach(tuneSenderForLowLatency);
            startLatencyMonitor(connection);
            break;
          case 'disconnected':
            setStatus('reconnecting'); // often recovers on its own within a few seconds
            break;
          case 'failed':
            setStatus('reconnecting');
            if (isCaller && !iceRestarted) {
              iceRestarted = true;
              enqueue(() => restartIce(connection));
            }
            // If the retry doesn't connect within 15s, stop and tell the user why.
            clearTimeout(failTimer);
            failTimer = setTimeout(() => {
              if (connection === pc && connection.connectionState !== 'connected') {
                setError(CONNECT_FAILED_MESSAGE);
                setStatus('error');
              }
            }, 15_000);
            break;
        }
      };
    }

    function closePeerConnection() {
      clearInterval(statsTimer);
      clearTimeout(failTimer);
      iceRestarted = false;
      pc?.close();
      pc = null;
      pendingCandidates = [];
      setRemoteStream(null);
      setLatencyMs(null);
    }

    function startLatencyMonitor(connection) {
      clearInterval(statsTimer);
      statsTimer = setInterval(async () => {
        if (connection.connectionState !== 'connected') return;
        setLatencyMs(await getRoundTripTimeMs(connection));
      }, 1000);
    }

    /** Caller: create the offer and send it to the peer. */
    async function startCall() {
      isCaller = true;
      createPeerConnection();
      await pc.setLocalDescription(await pc.createOffer());
      sendSignal({ description: pc.localDescription });
    }

    /** Caller: try new network paths if the connection broke. */
    async function restartIce(connection) {
      if (connection !== pc) return;
      await connection.setLocalDescription(await connection.createOffer({ iceRestart: true }));
      sendSignal({ description: connection.localDescription });
    }

    /** Handle an offer, answer, ICE candidate or mic/cam update from the peer. */
    async function handleSignal(data) {
      if (data.mediaState) {
        setPeer((current) => (current ? { ...current, ...data.mediaState } : current));
        return;
      }
      if (!pc) return;

      if (data.description) {
        await pc.setRemoteDescription(data.description);

        if (data.description.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          sendSignal({ description: pc.localDescription });
        }

        // Now that the remote description is set, apply candidates we had to hold back.
        for (const candidate of pendingCandidates) await pc.addIceCandidate(candidate);
        pendingCandidates = [];
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else pendingCandidates.push(data.candidate);
      }
    }

    // ---------------------------------------------------------------------
    // Events from the signaling server
    // ---------------------------------------------------------------------
    function listenToServer() {
      signaling.on('created', ({ code: newCode }) => {
        setRoomCode(newCode);
        setStatus('waiting');
      });

      // We joined someone's room: get ready to receive their offer.
      signaling.on('joined', ({ code: joinedCode, peerName }) => {
        setRoomCode(joinedCode);
        setPeer({ name: peerName, micOn: true, camOn: true });
        setStatus('connecting');
        isCaller = false;
        enqueue(() => createPeerConnection());
        sendSignal({ mediaState: currentMediaState() });
      });

      // A friend joined our room: we start the call.
      signaling.on('peer-joined', ({ peerName }) => {
        setPeer({ name: peerName, micOn: true, camOn: true });
        setStatus('connecting');
        enqueue(startCall);
        sendSignal({ mediaState: currentMediaState() });
      });

      signaling.on('signal', (data) => enqueue(() => handleSignal(data)));

      signaling.on('peer-left', () => {
        closePeerConnection();
        setPeer(null);
        setStatus('waiting'); // stay in the room, so the friend can rejoin with the same code
      });

      signaling.on('call-error', ({ message }) => {
        setError(message);
        setStatus('error');
      });
    }

    // ---------------------------------------------------------------------
    // Start everything
    // ---------------------------------------------------------------------
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        // Tell the encoder this is live motion video → prefer smooth frame rate.
        stream.getVideoTracks().forEach((track) => (track.contentHint = 'motion'));
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (err) {
        if (!cancelled) {
          setError(describeMediaError(err));
          setStatus('error');
        }
        return;
      }

      signaling = connectSignaling({
        onDisconnect: () => {
          setError('Lost connection to the server. Please start the call again.');
          setStatus('error');
        },
      });
      signalingRef.current = signaling;
      listenToServer();

      if (mode === 'create') signaling.emit('create', { name });
      else signaling.emit('join', { name, code });
    }

    start();

    // Clean up when leaving the call screen.
    return () => {
      cancelled = true;
      closePeerConnection();
      signaling?.close();
      signalingRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, [name, mode, code]);

  // -----------------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------------
  const toggleTrack = useCallback((kind, setEnabled) => {
    const track = localStreamRef.current?.getTracks().find((t) => t.kind === kind);
    if (!track) return;

    track.enabled = !track.enabled; // disabled tracks send silence / black frames
    setEnabled(track.enabled);

    const key = kind === 'audio' ? 'micOn' : 'camOn';
    signalingRef.current?.emit('signal', { mediaState: { [key]: track.enabled } });
  }, []);

  const toggleMic = useCallback(() => toggleTrack('audio', setMicOn), [toggleTrack]);
  const toggleCam = useCallback(() => toggleTrack('video', setCamOn), [toggleTrack]);

  return {
    localStream,
    remoteStream,
    roomCode,
    peer,
    status,
    error,
    latencyMs,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
  };
}
