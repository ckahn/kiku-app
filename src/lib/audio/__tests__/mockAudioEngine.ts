import { vi } from 'vitest';
import type { AudioStatus } from '../audioEngine';

export interface MockAudioEngineState {
  time: number;
  isPlaying: boolean;
  error: string | null;
  status: AudioStatus;
}

export interface MockAudioEngine {
  unlock: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  seek: ReturnType<typeof vi.fn>;
  setPlaybackRate: ReturnType<typeof vi.fn>;
  subscribe: (fn: () => void) => () => void;
  subscribeToEnd: (fn: () => void) => () => void;
  // Test helpers
  _setTime: (t: number) => void;
  _setIsPlaying: (v: boolean) => void;
  _setError: (e: string | null) => void;
  _setStatus: (s: AudioStatus) => void;
  _triggerNaturalEnd: () => void;
  _reset: () => void;
  readonly currentTime: number;
  readonly duration: number;
  readonly status: AudioStatus;
  readonly isPlaying: boolean;
  readonly error: string | null;
}

export function createMockAudioEngine(): MockAudioEngine {
  const state: MockAudioEngineState = {
    time: 0,
    isPlaying: false,
    error: null,
    status: 'ready',
  };
  const generalSubs = new Set<() => void>();
  const endSubs = new Set<() => void>();

  function notifyGeneral() {
    generalSubs.forEach((fn) => fn());
  }

  const mock: MockAudioEngine = {
    unlock: vi.fn(),
    load: vi.fn().mockResolvedValue(undefined),
    play: vi.fn((startSec?: number) => {
      if (startSec !== undefined) state.time = startSec;
      state.isPlaying = true;
      notifyGeneral();
    }),
    pause: vi.fn(() => {
      state.isPlaying = false;
      notifyGeneral();
    }),
    seek: vi.fn((sec: number) => {
      state.time = Math.max(0, sec);
      notifyGeneral();
    }),
    setPlaybackRate: vi.fn(),
    subscribe(fn: () => void) {
      generalSubs.add(fn);
      return () => generalSubs.delete(fn);
    },
    subscribeToEnd(fn: () => void) {
      endSubs.add(fn);
      return () => endSubs.delete(fn);
    },
    _setTime(t: number) { state.time = t; notifyGeneral(); },
    _setIsPlaying(v: boolean) { state.isPlaying = v; notifyGeneral(); },
    _setError(e: string | null) { state.error = e; notifyGeneral(); },
    _setStatus(s: AudioStatus) { state.status = s; notifyGeneral(); },
    _triggerNaturalEnd() {
      state.isPlaying = false;
      notifyGeneral();
      endSubs.forEach((fn) => fn());
    },
    _reset() {
      state.time = 0;
      state.isPlaying = false;
      state.error = null;
      state.status = 'ready';
      generalSubs.clear();
      endSubs.clear();
      vi.clearAllMocks();
    },
    get currentTime() { return state.time; },
    get duration() { return 20; },
    get status() { return state.status; },
    get isPlaying() { return state.isPlaying; },
    get error() { return state.error; },
  };

  return mock;
}
