import { useMemo } from 'react';

const BUBBLE_COUNT = 22;

const random = (min, max) => Math.random() * (max - min) + min;

/**
 * Animated background of floating bubbles.
 * Each bubble gets a random size, position, speed and colour, passed to CSS
 * as custom properties. All the motion happens in CSS (GPU-accelerated),
 * so it costs almost nothing while a call is running.
 */
export default function Bubbles() {
  const bubbles = useMemo(
    () =>
      Array.from({ length: BUBBLE_COUNT }, (_, id) => ({
        id,
        size: random(24, 140),
        left: random(0, 100),
        duration: random(14, 30),
        delay: -random(0, 30), // negative delay = already mid-animation on first paint
        drift: random(-60, 60),
        hue: random(190, 300), // cyan → violet → pink
      })),
    [],
  );

  return (
    <div className="bubbles" aria-hidden="true">
      {bubbles.map((b) => (
        <span
          key={b.id}
          className="bubble"
          style={{
            '--size': `${b.size}px`,
            '--left': `${b.left}%`,
            '--duration': `${b.duration}s`,
            '--delay': `${b.delay}s`,
            '--drift': `${b.drift}px`,
            '--hue': b.hue,
          }}
        />
      ))}
    </div>
  );
}
