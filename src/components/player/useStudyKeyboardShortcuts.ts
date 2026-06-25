'use client';

import { useEffect } from 'react';
import { isTypingTarget } from './useEpisodeKeyboardShortcuts';

const HANDLED_KEYS = new Set(['Space', 'KeyM', 'KeyJ', 'KeyK', 'KeyL', 'ArrowLeft', 'ArrowRight']);

interface UseStudyKeyboardShortcutsOptions {
  readonly togglePlay: () => void;
  readonly toggleLoop: () => void;
  readonly prevHref?: string;
  readonly nextHref?: string;
  readonly navigate: (href: string) => void;
}

export function useStudyKeyboardShortcuts({
  togglePlay,
  toggleLoop,
  prevHref,
  nextHref,
  navigate,
}: UseStudyKeyboardShortcutsOptions): void {
  useEffect(() => {
    const keyMap: Record<string, (() => void) | undefined> = {
      Space: togglePlay,
      KeyM: togglePlay,
      KeyL: toggleLoop,
      ArrowLeft: prevHref ? () => navigate(prevHref) : undefined,
      KeyJ: prevHref ? () => navigate(prevHref) : undefined,
      ArrowRight: nextHref ? () => navigate(nextHref) : undefined,
      KeyK: nextHref ? () => navigate(nextHref) : undefined,
    };

    function handleKeyDown(e: KeyboardEvent) {
      if (!HANDLED_KEYS.has(e.code)) return;
      if (isTypingTarget(e.target)) return;

      const action = keyMap[e.code];
      if (!action) return;

      e.preventDefault();
      action();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleLoop, prevHref, nextHref, navigate]);
}
