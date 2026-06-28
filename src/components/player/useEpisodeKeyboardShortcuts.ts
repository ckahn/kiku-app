'use client';

import { useEffect } from 'react';
import { isTypingTarget, hasModifier } from './keyboardUtils';
import type { Endpoint } from './loopRange';

const HANDLED_KEYS = new Set([
  'Space', 'ArrowLeft', 'ArrowRight', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyM',
  'BracketLeft', 'BracketRight',
]);

interface UseKeyboardShortcutsOptions {
  readonly toggle: () => void;
  readonly rewind: () => void;
  readonly forward: () => void;
  readonly toggleLoop: () => void;
  readonly restart: () => void;
  readonly shiftLoopEndpoint: (which: Endpoint, direction: 'earlier' | 'later') => void;
}

export function useEpisodeKeyboardShortcuts({
  toggle,
  rewind,
  forward,
  toggleLoop,
  restart,
  shiftLoopEndpoint,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const keyMap: Record<string, () => void> = {
      Space: toggle,
      ArrowLeft: rewind,
      ArrowRight: forward,
      KeyH: restart,
      KeyJ: rewind,
      KeyK: forward,
      KeyL: toggleLoop,
      KeyM: toggle,
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (!HANDLED_KEYS.has(e.code)) return;
      if (hasModifier(e)) return;
      if (isTypingTarget(e.target)) return;

      e.preventDefault();

      if (e.code === 'BracketLeft') {
        // [ = grow loop from start (move start earlier)
        // { = shrink loop from start (move start later)
        shiftLoopEndpoint('start', e.shiftKey ? 'later' : 'earlier');
        return;
      }
      if (e.code === 'BracketRight') {
        // ] = grow loop from end (move end later)
        // } = shrink loop from end (move end earlier)
        shiftLoopEndpoint('end', e.shiftKey ? 'earlier' : 'later');
        return;
      }

      keyMap[e.code]?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle, rewind, forward, toggleLoop, restart, shiftLoopEndpoint]);
}
