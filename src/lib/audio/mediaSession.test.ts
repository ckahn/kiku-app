// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { claimMediaSession } from './mediaSession';

function stubMediaSession() {
  const handlers = new Map<string, (() => void) | null>();
  const session = {
    setActionHandler: vi.fn((action: string, handler: (() => void) | null) => {
      handlers.set(action, handler);
    }),
  };
  vi.stubGlobal('navigator', { ...navigator, mediaSession: session });
  return { session, handlers };
}

describe('claimMediaSession', () => {
  let handlers: Map<string, (() => void) | null>;

  beforeEach(() => {
    ({ handlers } = stubMediaSession());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers the given handlers and clears the actions it was not given', () => {
    const play = vi.fn();
    claimMediaSession({ play });

    handlers.get('play')?.();
    expect(play).toHaveBeenCalled();
    expect(handlers.get('nexttrack')).toBeNull();
  });

  it('release clears the handlers when the claimer still owns the session', () => {
    const release = claimMediaSession({ play: vi.fn() });
    release();
    expect(handlers.get('play')).toBeNull();
  });

  it('a stale release does not strip the next owner', () => {
    // React mounts the incoming page before unmounting the outgoing one, so
    // the outgoing page's release runs after the new page has claimed.
    const releaseOld = claimMediaSession({ play: vi.fn() });
    const newPlay = vi.fn();
    claimMediaSession({ play: newPlay });

    releaseOld();
    handlers.get('play')?.();
    expect(newPlay).toHaveBeenCalled();
  });

  it('skips actions the browser does not support', () => {
    const { session } = stubMediaSession();
    session.setActionHandler.mockImplementation((action: string) => {
      if (action === 'nexttrack') throw new TypeError('unsupported');
    });
    expect(() => claimMediaSession({ play: vi.fn(), nexttrack: vi.fn() })).not.toThrow();
  });

  it('is a no-op without Media Session support', () => {
    vi.stubGlobal('navigator', {});
    const release = claimMediaSession({ play: vi.fn() });
    expect(() => release()).not.toThrow();
  });
});
