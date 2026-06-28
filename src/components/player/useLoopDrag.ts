'use client';

import { useEffect, useRef, useState } from 'react';
import type { Endpoint } from './loopRange';

const EDGE_ZONE = 84;
const MIN_SCROLL_SPEED = 4;
const MAX_SCROLL_SPEED = 18;

// Hit-test a pointer Y against all gutter cells (identified by data-gutter-id),
// returning the segment ID of the nearest cell. Ignores X entirely — the drag
// is locked to vertical movement so sliding sideways never drops the grip.
function gutterIdAtY(clientY: number): number | null {
  const cells = document.querySelectorAll<HTMLElement>('[data-gutter-id]');
  let bestId: number | null = null;
  let bestDistance = Infinity;
  cells.forEach((cell) => {
    const rect = cell.getBoundingClientRect();
    const distance =
      clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
          ? clientY - rect.bottom
          : 0;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = Number(cell.dataset.gutterId);
    }
  });
  return bestId;
}

function autoScrollDelta(clientY: number): number {
  const topDepth = EDGE_ZONE - clientY;
  const bottomDepth = clientY - (window.innerHeight - EDGE_ZONE);
  if (topDepth > 0) return -speedFor(topDepth);
  if (bottomDepth > 0) return speedFor(bottomDepth);
  return 0;
}

function speedFor(depth: number): number {
  const t = Math.min(depth, EDGE_ZONE) / EDGE_ZONE;
  return MIN_SCROLL_SPEED + t * (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED);
}

export type UseLoopDragReturn = {
  dragging: Endpoint | null;
  handlePointerDown: (which: Endpoint, e: React.PointerEvent) => void;
};

export function useLoopDrag(
  setLoopEndpoint: (which: Endpoint, segmentId: number) => void,
): UseLoopDragReturn {
  const [dragging, setDragging] = useState<Endpoint | null>(null);
  const pointerYRef = useRef<number | null>(null);
  const scrollDeltaRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const which = dragging;

    function syncEdgeToPointer() {
      const y = pointerYRef.current;
      if (y === null) return;
      const segmentId = gutterIdAtY(y);
      if (segmentId === null) return;
      setLoopEndpoint(which, segmentId);
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
      pointerYRef.current = e.clientY;
      scrollDeltaRef.current = autoScrollDelta(e.clientY);
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
      pointerYRef.current = null;
    };
  }, [dragging, setLoopEndpoint]);

  function handlePointerDown(which: Endpoint, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    pointerYRef.current = e.clientY;
    setDragging(which);
  }

  return { dragging, handlePointerDown };
}
