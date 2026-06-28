'use client';

import { useEffect, useRef, useState } from 'react';
import { Repeat } from 'lucide-react';
import { MOCK_SEGMENTS, formatMs } from './fakeSegments';
import {
  makeAnchor,
  rangeLength,
  setEndpoint,
  type Endpoint,
  type IndexRange,
} from './rangeEdit';

const COUNT = MOCK_SEGMENTS.length;

// Distance from a viewport edge (px) within which a drag triggers auto-scroll.
const EDGE_ZONE = 84;
// Per-frame scroll speed ramps from MIN to MAX as the pointer nears the edge.
const MIN_SCROLL_SPEED = 4;
const MAX_SCROLL_SPEED = 18;

// Resolve a pointer position to the gutter cell index it is over, by walking up
// from the topmost element to the nearest [data-gutter-index] ancestor.
function gutterIndexAtPoint(clientX: number, clientY: number): number | null {
  const el = document.elementFromPoint(clientX, clientY);
  const cell = el?.closest('[data-gutter-index]');
  if (!cell) return null;
  const value = Number((cell as HTMLElement).dataset.gutterIndex);
  return Number.isNaN(value) ? null : value;
}

// Signed per-frame scroll delta for a pointer Y: negative near the top edge,
// positive near the bottom, 0 in the middle. Speed scales with edge proximity.
function autoScrollDelta(clientY: number): number {
  const topDepth = EDGE_ZONE - clientY;
  const bottomDepth = clientY - (window.innerHeight - EDGE_ZONE);
  if (topDepth > 0) return -speedFor(topDepth);
  if (bottomDepth > 0) return speedFor(bottomDepth);
  return 0;
}

function speedFor(depth: number): number {
  const t = Math.min(depth, EDGE_ZONE) / EDGE_ZONE; // 0..1
  return MIN_SCROLL_SPEED + t * (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED);
}

export default function LoopGutterMock() {
  const [isLooping, setIsLooping] = useState(false);
  // Default the loop to the 4th segment so the gutter has somewhere to appear.
  const [range, setRange] = useState<IndexRange>(() => makeAnchor(3));

  // Which endpoint (if any) is being dragged. Held in state so the window-level
  // drag listeners can be (re)bound for the life of each drag — the drag must
  // outlive the handle element, which remounts into a different row as the
  // range grows.
  const [dragging, setDragging] = useState<Endpoint | null>(null);

  // Live pointer position + current auto-scroll velocity, read by the rAF loop.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const scrollDeltaRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const which = dragging;

    // Move the dragged edge to whatever segment now sits under the pointer.
    // Called on pointermove and on every auto-scroll frame (where the pointer
    // is stationary but new segments scroll beneath it).
    function syncEdgeToPointer() {
      const pos = pointerRef.current;
      if (!pos) return;
      const index = gutterIndexAtPoint(pos.x, pos.y);
      if (index === null) return;
      setRange((r) => setEndpoint(r, which, index, COUNT));
    }

    function tick() {
      const delta = scrollDeltaRef.current;
      if (delta === 0) {
        rafRef.current = null;
        return;
      }
      window.scrollBy(0, delta);
      syncEdgeToPointer();
      rafRef.current = requestAnimationFrame(tick);
    }

    function handleMove(e: PointerEvent) {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      scrollDeltaRef.current = autoScrollDelta(e.clientY);
      // Kick off the auto-scroll loop if we entered an edge zone.
      if (scrollDeltaRef.current !== 0 && rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
      syncEdgeToPointer();
    }

    function handleUp() {
      setDragging(null);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      scrollDeltaRef.current = 0;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pointerRef.current = null;
    };
  }, [dragging]);

  function toggleLoop() {
    setIsLooping((on) => !on);
  }

  function handlePointerDown(which: Endpoint, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    pointerRef.current = { x: e.clientX, y: e.clientY };
    setDragging(which);
  }

  return (
    <div className={`mx-auto max-w-2xl px-4 py-6 ${dragging ? 'select-none' : ''}`}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Loop gutter — mock</h1>
          <p className="text-sm text-muted">
            {isLooping
              ? `Looping ${rangeLength(range)} segment${rangeLength(range) === 1 ? '' : 's'} (#${range.start + 1}–#${range.end + 1})`
              : 'Loop off'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleLoop}
          aria-pressed={isLooping}
          aria-label="Toggle loop"
          className={`cursor-pointer rounded-full p-3 transition-colors ${
            isLooping
              ? 'bg-primary-subtle text-primary'
              : 'text-muted hover:bg-canvas-subtle hover:text-ink'
          }`}
        >
          <Repeat className="h-5 w-5" />
        </button>
      </header>

      <p className="mb-4 rounded-lg border border-border bg-canvas-subtle px-3 py-2 text-xs text-muted">
        Toggle loop on, then drag the round handles at the top/bottom of the bar
        to grow or shrink the range. Drag near the top or bottom of the screen to
        auto-scroll past what&apos;s visible.
      </p>

      <ol className="space-y-3 pb-24">
        {MOCK_SEGMENTS.map((segment, index) => {
          const inRange = isLooping && index >= range.start && index <= range.end;
          const isTop = index === range.start;
          const isBottom = index === range.end;
          return (
            <li key={segment.id} className="flex items-stretch gap-2">
              {isLooping && (
                <div
                  data-gutter-index={index}
                  className="relative flex w-11 shrink-0 items-center justify-center"
                  aria-hidden
                >
                  {/* Faint full-height track so the gutter reads as a column. */}
                  <span className="absolute inset-y-0 w-1.5 rounded-full bg-border/50" />
                  {/* Filled bar segment for in-range cells. */}
                  {inRange && (
                    <span
                      className={`absolute inset-y-0 w-1.5 bg-primary ${
                        isTop ? 'rounded-t-full' : ''
                      } ${isBottom ? 'rounded-b-full' : ''}`}
                    />
                  )}
                  {/* Top drag handle on the first in-range cell. */}
                  {inRange && isTop && (
                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDown('start', e)}
                      aria-label="Drag to move loop start"
                      style={{ touchAction: 'none' }}
                      className="absolute -top-1 flex h-11 w-11 cursor-grab items-start justify-center active:cursor-grabbing"
                    >
                      <span className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow" />
                    </button>
                  )}
                  {/* Bottom drag handle on the last in-range cell. */}
                  {inRange && isBottom && (
                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDown('end', e)}
                      aria-label="Drag to move loop end"
                      style={{ touchAction: 'none' }}
                      className="absolute -bottom-1 flex h-11 w-11 cursor-grab items-end justify-center active:cursor-grabbing"
                    >
                      <span className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow" />
                    </button>
                  )}
                </div>
              )}

              <div
                className={`flex-1 rounded-lg border p-4 transition-colors ${
                  inRange
                    ? 'border-primary/60 bg-primary-subtle'
                    : 'border-border bg-surface'
                }`}
              >
                <div className="mb-1 text-xs font-mono text-muted">
                  #{index + 1} · {formatMs(segment.startMs)}
                </div>
                <p className="font-jp text-lg leading-loose text-ink">{segment.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
