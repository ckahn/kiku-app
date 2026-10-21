// Media Session wiring: the OS media notification, lock-screen controls and
// headphone buttons. The OS attaches these controls to the audio engine's
// playing <audio> element.

export const MEDIA_SESSION_ACTIONS = ['play', 'pause', 'previoustrack', 'nexttrack'] as const;

export type MediaSessionAction = (typeof MEDIA_SESSION_ACTIONS)[number];
export type MediaSessionHandlers = Partial<Record<MediaSessionAction, () => void>>;

// The Media Session is page-global, like the audio engine singleton. React
// mounts the incoming page before unmounting the outgoing one, so a plain
// clear-on-unmount would strip the handlers the new page just registered.
// Each claim takes ownership; a release only clears if it still owns it.
let currentOwner: symbol | null = null;

function getSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return navigator.mediaSession;
}

function setHandler(session: MediaSession, action: MediaSessionAction, handler: (() => void) | null): void {
  try {
    session.setActionHandler(action, handler);
  } catch {
    // setActionHandler throws for actions this browser does not support.
  }
}

export function claimMediaSession(handlers: MediaSessionHandlers): () => void {
  const session = getSession();
  if (!session) return () => undefined;

  const owner = Symbol('media-session-owner');
  currentOwner = owner;
  MEDIA_SESSION_ACTIONS.forEach((action) => setHandler(session, action, handlers[action] ?? null));

  return () => {
    if (currentOwner !== owner) return;
    currentOwner = null;
    MEDIA_SESSION_ACTIONS.forEach((action) => setHandler(session, action, null));
  };
}
