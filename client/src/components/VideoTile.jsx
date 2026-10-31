import { useEffect, useRef } from 'react';
import { MicOffIcon } from './Icons.jsx';

/**
 * Shows one person's video. When their camera is off (or not connected yet),
 * a bubble avatar with their initial is shown instead.
 */
export default function VideoTile({ stream, name, camOn = true, micOn = true, muted = false, mirrored = false, className = '' }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream ?? null;
  }, [stream]);

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

      {name && (
        <div className="name-tag">
          {!micOn && <MicOffIcon />}
          {name}
        </div>
      )}
    </div>
  );
}
