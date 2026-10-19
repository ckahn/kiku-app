// A time-domain limit on playback, enforced by the engine rather than by a
// React effect. A hidden page (a locked phone screen) stops being serviced
// requestAnimationFrame, so anything that watches currentTime from React
// silently stops firing while audio keeps playing. The Web Audio engine uses
// native loopStart/loopEnd and a scheduled stop(); the media-element engine
// uses timers, which Chrome keeps running in audible tabs. The engine knows
// nothing about segments — callers project their loop state down to seconds.
export type PlaybackBoundary =
  | { readonly kind: 'loop'; readonly startSec: number; readonly endSec: number }
  | { readonly kind: 'stop'; readonly endSec: number };

// Clamps a requested boundary against the loaded buffer. Resolved lazily on
// read rather than at set time, so a boundary set before the buffer finishes
// loading is still clamped once the duration is known.
export function resolveBoundary(boundary: PlaybackBoundary | null, duration: number): PlaybackBoundary | null {
  if (!boundary) return null;
  const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
  const endSec = Math.min(boundary.endSec, max);
  if (boundary.kind === 'stop') {
    return endSec > 0 ? { kind: 'stop', endSec } : null;
  }
  const startSec = Math.max(0, Math.min(boundary.startSec, max));
  // A degenerate range would make the wrap math divide by zero; treat it as
  // no boundary at all rather than as a zero-length loop.
  if (endSec <= startSec) return null;
  return { kind: 'loop', startSec, endSec };
}
