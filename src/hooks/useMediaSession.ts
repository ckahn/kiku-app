'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  claimMediaSession,
  MEDIA_SESSION_ACTIONS,
  type MediaSessionAction,
  type MediaSessionHandlers,
} from '@/lib/audio/mediaSession';

// Registers OS media controls for the mounted page. Handlers may change every
// render; the session is only re-claimed when the set of actions changes.
export function useMediaSession(handlers: MediaSessionHandlers): void {
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  const actionsKey = MEDIA_SESSION_ACTIONS.filter((action) => handlers[action]).join(',');

  useEffect(() => {
    const actions = actionsKey.split(',').filter(Boolean) as MediaSessionAction[];
    const wrapped: MediaSessionHandlers = Object.fromEntries(
      actions.map((action) => [action, () => handlersRef.current[action]?.()]),
    );
    return claimMediaSession(wrapped);
  }, [actionsKey]);
}
