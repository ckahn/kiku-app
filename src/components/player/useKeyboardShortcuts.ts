'use client';

import { useEffect } from 'react';
import type { PlayerControls } from './usePlayer';

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // target.contentEditable is 'true'/'false'/'inherit' in browsers, but
  // jsdom may return a boolean. String() normalises both cases.
  const ce = String((target as HTMLElement & { contentEditable: unknown }).contentEditable);
  return INPUT_TAGS.has(target.tagName) || target.isContentEditable || ce === 'true';
}

const HANDLED_KEYS = new Set([
  'Space', 'ArrowLeft', 'ArrowRight', 'KeyL',
]);

interface UseKeyboardShortcutsOptions {
  readonly controls: PlayerControls;
}

export function useKeyboardShortcuts({ controls }: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const keyMap: Record<string, () => void> = {
      Space: () => controls.toggle(),
      ArrowLeft: () => controls.rewind(),
      ArrowRight: () => controls.forward(),
      KeyL: () => controls.toggleLoop(),
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (!HANDLED_KEYS.has(e.code)) return;
      if (isTypingTarget(e.target)) return;

      e.preventDefault();
      keyMap[e.code]?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controls]);
}
