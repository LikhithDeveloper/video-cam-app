import { useEffect, useRef, useState } from 'react';
import { MicOffIcon } from './Icons.jsx';

/**
 * Shows one person's video. When their camera is off (or not connected yet),
 * a bubble avatar with their initial is shown instead.
 */
export default function VideoTile({ stream, name, camOn = true, micOn = true, muted = false, mirrored = false, className = '' }) {
  const videoRef = useRef(null);
  const [needsTapForSound, setNeedsTapForSound] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream ?? null;
    if (!stream) return;

    // Phones often block auto-playing video that has sound, which leaves the
    // video black. If that happens, play it muted and ask for one tap to unmute.
    video.play().catch((err) => {
      if (err.name !== 'NotAllowedError') return;
      video.muted = true;
      video.play().catch(() => {});
      if (!muted) setNeedsTapForSound(true);
    });
  }, [stream, muted]);

  function enableSound() {
    const video = videoRef.current;
    video.muted = false;
    video
      .play()
      .then(() => setNeedsTapForSound(false))
      .catch(() => {});
  }

  const showVideo = stream && camOn;

  return (
    <div className={`video-tile ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`${mirrored ? 'mirrored' : ''} ${showVideo ? '' : 'hidden'}`}
      />

      {!showVideo && (
        <div className="avatar">
          <span>{name?.[0]?.toUpperCase() ?? '?'}</span>
        </div>
      )}

      {needsTapForSound && (
        <button className="tap-for-sound" onClick={enableSound}>
          🔊 Tap to turn on sound
        </button>
      )}

      {name && (
        <div className="name-tag">
          {!micOn && <MicOffIcon />}
          {name}
        </div>
      )}
    </div>
  );
}
