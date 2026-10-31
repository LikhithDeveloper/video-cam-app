import { useEffect, useState } from 'react';
import { useVideoCall } from '../hooks/useVideoCall.js';
import { copyText } from '../lib/clipboard.js';
import VideoTile from './VideoTile.jsx';
import { MicIcon, MicOffIcon, CamIcon, CamOffIcon, HangUpIcon, CopyIcon, CheckIcon, ShareIcon } from './Icons.jsx';

const STATUS_TEXT = {
  starting: 'Starting camera…',
  waiting: 'Waiting for your friend',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Error',
};

/** Colour-coded latency badge: green < 80ms, yellow < 200ms, red above. */
function LatencyBadge({ ms }) {
  if (ms == null) return null;
  const level = ms < 80 ? 'good' : ms < 200 ? 'ok' : 'bad';
  return <span className={`latency latency-${level}`}>{ms} ms</span>;
}

export default function CallRoom({ name, mode, code, onLeave }) {
  const call = useVideoCall({ name, mode, code });
  const [copied, setCopied] = useState(false);

  // If something went wrong (bad code, no camera…), go back home and show why.
  useEffect(() => {
    if (call.status === 'error') onLeave(call.error);
  }, [call.status, call.error, onLeave]);

  async function handleCopy() {
    if (await copyText(call.roomCode)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  function handleShare() {
    navigator.share?.({
      title: 'Join my BubbleCall',
      text: `Join my video call on BubbleCall with code: ${call.roomCode}`,
      url: window.location.origin,
    });
  }

  const isWaiting = call.status === 'starting' || call.status === 'waiting';

  return (
    <main className="call">
      {/* Top bar: code + status + latency */}
      <header className="call-header glass">
        <button className="code-chip" onClick={handleCopy} title="Copy code" disabled={!call.roomCode}>
          {call.roomCode || '······'}
          {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
        </button>
        <span className={`status status-${call.status}`}>
          <span className="dot" />
          {STATUS_TEXT[call.status]}
        </span>
        <LatencyBadge ms={call.latencyMs} />
      </header>

      {/* Video area */}
      <section className="stage">
        {isWaiting ? (
          <div className="waiting glass">
            <p className="waiting-title">Share this code with your friend</p>
            <div className="code-boxes">
              {(call.roomCode || '      ').split('').map((char, i) => (
                <span key={i} className="code-box" style={{ '--i': i }}>
                  {char}
                </span>
              ))}
            </div>
            <div className="waiting-actions">
              <button className="btn btn-primary" onClick={handleCopy} disabled={!call.roomCode}>
                {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
                {copied ? 'Copied!' : 'Copy code'}
              </button>
              {navigator.share && (
                <button className="btn btn-ghost" onClick={handleShare} disabled={!call.roomCode}>
                  <ShareIcon size={18} /> Share
                </button>
              )}
            </div>
            <p className="waiting-hint">
              They open this app, tap <b>Join with a code</b> and enter it.
            </p>
            <div className="pulse-ring" />
          </div>
        ) : (
          <VideoTile
            className="remote"
            stream={call.remoteStream}
            name={call.peer?.name}
            camOn={call.peer?.camOn}
            micOn={call.peer?.micOn}
          />
        )}

        {/* Your own camera, small in the corner. Muted so you don't hear yourself. */}
        <VideoTile
          className="local"
          stream={call.localStream}
          name={`${name} (you)`}
          camOn={call.camOn}
          micOn={call.micOn}
          muted
          mirrored
        />
      </section>

      {/* Controls */}
      <footer className="controls glass">
        <button
          className={`control ${call.micOn ? '' : 'off'}`}
          onClick={call.toggleMic}
          title={call.micOn ? 'Mute' : 'Unmute'}
        >
          {call.micOn ? <MicIcon /> : <MicOffIcon />}
        </button>
        <button
          className={`control ${call.camOn ? '' : 'off'}`}
          onClick={call.toggleCam}
          title={call.camOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {call.camOn ? <CamIcon /> : <CamOffIcon />}
        </button>
        <button className="control hangup" onClick={() => onLeave()} title="Leave call">
          <HangUpIcon />
        </button>
      </footer>
    </main>
  );
}
