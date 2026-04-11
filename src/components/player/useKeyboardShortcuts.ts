'use client';

import { useEffect } from 'react';

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
  readonly toggle: () => void;
  readonly rewind: () => void;
  readonly forward: () => void;
  readonly toggleLoop: () => void;
}

export function useKeyboardShortcuts({ toggle, rewind, forward, toggleLoop }: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const keyMap: Record<string, () => void> = {
      Space: toggle,
      ArrowLeft: rewind,
      ArrowRight: forward,
      KeyL: toggleLoop,
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (!HANDLED_KEYS.has(e.code)) return;
      if (isTypingTarget(e.target)) return;

      e.preventDefault();
      keyMap[e.code]?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle, rewind, forward, toggleLoop]);
}
