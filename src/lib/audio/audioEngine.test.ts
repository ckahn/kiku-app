// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine } from './audioEngine';

// ---------------------------------------------------------------------------
// Web Audio API mocks
// ---------------------------------------------------------------------------

function makeMockAudioBuffer(duration = 10): AudioBuffer {
  return {
    duration,
    length: duration * 44100,
    sampleRate: 44100,
    numberOfChannels: 1,
  } as unknown as AudioBuffer;
}

interface MockSourceNode {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: ((e: Event) => void) | null;
  _fireEnded: () => void;
}

function makeMockSourceNode(): MockSourceNode {
  const node: MockSourceNode = {
    buffer: null,
    playbackRate: { value: 1 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
    _fireEnded() {
      node.onended?.(new Event('ended'));
    },
  };
  return node;
}

interface MockAudioContext {
  currentTime: number;
  state: AudioContextState;
  destination: Record<string, never>;
  resume: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  decodeAudioData: ReturnType<typeof vi.fn>;
  _advance: (sec: number) => void;
  _lastSource: () => MockSourceNode;
}

function makeMockAudioContext(bufferDuration = 10): MockAudioContext {
  let time = 0;
  const sources: MockSourceNode[] = [];
  const ctx: MockAudioContext = {
    get currentTime() { return time; },
    state: 'running' as AudioContextState,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createBufferSource: vi.fn(() => {
      const node = makeMockSourceNode();
      sources.push(node);
      return node;
    }),
    decodeAudioData: vi.fn().mockResolvedValue(makeMockAudioBuffer(bufferDuration)),
    _advance(sec: number) { time += sec; },
    _lastSource() { return sources[sources.length - 1]; },
  };
  return ctx;
}

function makeOkFetchResponse(bufferBytes = new ArrayBuffer(8)) {
  return {
    ok: true,
    arrayBuffer: vi.fn().mockResolvedValue(bufferBytes),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioEngine', () => {
  let engine: AudioEngine;
  let mockCtx: MockAudioContext;
  let CtorMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    engine = new AudioEngine();
    mockCtx = makeMockAudioContext();
    CtorMock = vi.fn(function () { return mockCtx; });
    vi.stubGlobal('AudioContext', CtorMock);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // load()
  // -------------------------------------------------------------------------

  describe('load()', () => {
    it('transitions idle → loading → ready and notifies subscribers', async () => {
      const statuses: string[] = [];
      engine.subscribe(() => statuses.push(engine.status));

      await engine.load('/audio/ep1.mp3');

      expect(statuses).toEqual(['loading', 'ready']);
      expect(engine.status).toBe('ready');
      expect(engine.duration).toBe(10);
      expect(engine.error).toBeNull();
    });

    it('is a no-op when called again with the same URL while ready', async () => {
      await engine.load('/audio/ep1.mp3');
      const fetchCallsBefore = vi.mocked(fetch).mock.calls.length;

      await engine.load('/audio/ep1.mp3');

      expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCallsBefore);
      expect(engine.status).toBe('ready');
    });

    it('is a no-op when called again with the same URL while already loading', async () => {
      let resolveDecodeFirst!: (b: AudioBuffer) => void;
      const slowCtx = makeMockAudioContext();
      slowCtx.decodeAudioData = vi.fn().mockReturnValue(
        new Promise<AudioBuffer>((resolve) => { resolveDecodeFirst = resolve; }),
      );
      vi.stubGlobal('AudioContext', vi.fn(function () { return slowCtx; }));

      const firstLoad = engine.load('/audio/ep1.mp3');
      const secondLoad = engine.load('/audio/ep1.mp3'); // same URL — no-op

      expect(engine.status).toBe('loading');
      expect(vi.mocked(fetch).mock.calls.length).toBe(1);

      resolveDecodeFirst(makeMockAudioBuffer());
      await Promise.all([firstLoad, secondLoad]);

      expect(engine.status).toBe('ready');
    });

    it('evicts the previous buffer when a different URL is loaded', async () => {
      await engine.load('/audio/ep1.mp3');
      expect(engine.duration).toBe(10);

      mockCtx.decodeAudioData.mockResolvedValue(makeMockAudioBuffer(30));
      await engine.load('/audio/ep2.mp3');

      expect(engine.status).toBe('ready');
      expect(engine.duration).toBe(30);
    });

    it('sets status to error when fetch returns non-ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, arrayBuffer: vi.fn() }));
      engine.unlock(); // create context first so the error is from fetch, not from missing context

      await engine.load('/audio/missing.mp3');

      expect(engine.status).toBe('error');
      expect(engine.error).toMatch('404');
    });

    it('sets status to error when decodeAudioData rejects', async () => {
      engine.unlock();
      mockCtx.decodeAudioData.mockRejectedValue(new Error('corrupt audio data'));

      await engine.load('/audio/bad.mp3');

      expect(engine.status).toBe('error');
      expect(engine.error).toBe('corrupt audio data');
    });

    it('ignores a stale load result when superseded by a newer URL', async () => {
      let resolveFirst!: (b: AudioBuffer) => void;
      const slowCtx = makeMockAudioContext();
      let callCount = 0;
      slowCtx.decodeAudioData = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise<AudioBuffer>((resolve) => { resolveFirst = resolve; });
        }
        return Promise.resolve(makeMockAudioBuffer(5));
      });
      vi.stubGlobal('AudioContext', vi.fn(function () { return slowCtx; }));
      engine = new AudioEngine();
      engine.unlock();

      const first = engine.load('/audio/ep1.mp3');
      // ep2 starts and finishes before ep1
      await engine.load('/audio/ep2.mp3');
      expect(engine.duration).toBe(5);

      // Now let the slow ep1 decode finish — should be ignored
      resolveFirst(makeMockAudioBuffer(99));
      await first;

      expect(engine.duration).toBe(5);
      expect(engine.status).toBe('ready');
    });
  });

  // -------------------------------------------------------------------------
  // play() / pause()
  // -------------------------------------------------------------------------

  describe('play() and pause()', () => {
    beforeEach(async () => {
      engine.unlock();
      await engine.load('/audio/ep1.mp3');
    });

    it('starts playback from offset 0 by default', () => {
      engine.play();

      expect(engine.isPlaying).toBe(true);
      expect(mockCtx._lastSource().start).toHaveBeenCalledWith(0, 0);
    });

    it('starts playback from the given startSec', () => {
      engine.play(3);

      expect(engine.isPlaying).toBe(true);
      expect(mockCtx._lastSource().start).toHaveBeenCalledWith(0, 3);
    });

    it('clamps startSec below 0 to 0', () => {
      engine.play(-5);
      expect(mockCtx._lastSource().start).toHaveBeenCalledWith(0, 0);
    });

    it('clamps startSec above duration to duration', () => {
      engine.play(999);
      expect(mockCtx._lastSource().start).toHaveBeenCalledWith(0, 10);
    });

    it('applies the current playbackRate to the source node', () => {
      engine.setPlaybackRate(0.5);
      engine.play();

      expect(mockCtx._lastSource().playbackRate.value).toBe(0.5);
    });

    it('notifies subscribers when playback starts', () => {
      const fn = vi.fn();
      engine.subscribe(fn);
      engine.play();
      expect(fn).toHaveBeenCalled();
    });

    it('is a no-op when no buffer is loaded', () => {
      const fresh = new AudioEngine();
      fresh.unlock();
      expect(() => fresh.play()).not.toThrow();
      expect(fresh.isPlaying).toBe(false);
    });

    it('pause() records current position and stops playback', () => {
      engine.play(2);
      mockCtx._advance(3); // 3s real time at 1× = 3s audio advance

      engine.pause();

      expect(engine.isPlaying).toBe(false);
      expect(engine.currentTime).toBeCloseTo(5); // 2 start + 3 elapsed
    });

    it('pause() is a no-op when already paused', () => {
      const fn = vi.fn();
      engine.subscribe(fn);
      fn.mockClear();

      engine.pause();

      expect(fn).not.toHaveBeenCalled();
    });

    it('resumes from the saved position after pause', () => {
      engine.play(2);
      mockCtx._advance(3);
      engine.pause();

      engine.play();

      expect(mockCtx._lastSource().start).toHaveBeenCalledWith(0, 5);
    });
  });

  // -------------------------------------------------------------------------
  // seek()
  // -------------------------------------------------------------------------

  describe('seek()', () => {
    beforeEach(async () => {
      engine.unlock();
      await engine.load('/audio/ep1.mp3');
    });

    it('updates position while paused without creating a source node', () => {
      const createsBefore = vi.mocked(mockCtx.createBufferSource).mock.calls.length;
      engine.seek(4);

      expect(engine.currentTime).toBe(4);
      expect(vi.mocked(mockCtx.createBufferSource).mock.calls.length).toBe(createsBefore);
    });

    it('restarts from the new position while playing', () => {
      engine.play();
      engine.seek(6);

      expect(engine.isPlaying).toBe(true);
      expect(mockCtx._lastSource().start).toHaveBeenCalledWith(0, 6);
    });

    it('clamps below 0 to 0', () => {
      engine.seek(-1);
      expect(engine.currentTime).toBe(0);
    });

    it('clamps above duration to duration', () => {
      engine.seek(100);
      expect(engine.currentTime).toBe(10);
    });

    it('is a no-op when no buffer is loaded', () => {
      const fresh = new AudioEngine();
      expect(() => fresh.seek(5)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // setPlaybackRate()
  // -------------------------------------------------------------------------

  describe('setPlaybackRate()', () => {
    beforeEach(async () => {
      engine.unlock();
      await engine.load('/audio/ep1.mp3');
    });

    it('while playing: restarts at current audio position with the new rate', () => {
      engine.play(2);
      mockCtx._advance(2); // 2s real at 1× = position 4

      engine.setPlaybackRate(0.5);

      expect(mockCtx._lastSource().start).toHaveBeenCalledWith(0, 4);
      expect(mockCtx._lastSource().playbackRate.value).toBe(0.5);
    });

    it('while paused: stores the rate without creating a source node', () => {
      const createsBefore = vi.mocked(mockCtx.createBufferSource).mock.calls.length;
      engine.setPlaybackRate(0.75);

      expect(vi.mocked(mockCtx.createBufferSource).mock.calls.length).toBe(createsBefore);

      engine.play(0);
      expect(mockCtx._lastSource().playbackRate.value).toBe(0.75);
    });
  });

  // -------------------------------------------------------------------------
  // currentTime getter
  // -------------------------------------------------------------------------

  describe('currentTime', () => {
    beforeEach(async () => {
      engine.unlock();
      await engine.load('/audio/ep1.mp3');
    });

    it('returns startOffset when paused', () => {
      engine.seek(3);
      expect(engine.currentTime).toBe(3);
    });

    it('accounts for elapsed real time at 1× speed', () => {
      engine.play(1);
      mockCtx._advance(2.5);
      expect(engine.currentTime).toBeCloseTo(3.5);
    });

    it('accounts for elapsed real time at 0.5× speed', () => {
      engine.setPlaybackRate(0.5);
      engine.play(0);
      mockCtx._advance(4); // 4s real × 0.5 = 2s audio
      expect(engine.currentTime).toBeCloseTo(2);
    });

    it('accounts for elapsed real time at 2× speed', () => {
      engine.setPlaybackRate(2);
      engine.play(0);
      mockCtx._advance(3); // 3s real × 2 = 6s audio
      expect(engine.currentTime).toBeCloseTo(6);
    });
  });

  // -------------------------------------------------------------------------
  // onended discrimination: natural end vs explicit stop
  // -------------------------------------------------------------------------

  describe('onended discrimination', () => {
    beforeEach(async () => {
      engine.unlock();
      await engine.load('/audio/ep1.mp3');
    });

    it('fires general and end subscribers on natural file end', () => {
      const general = vi.fn();
      const end = vi.fn();
      engine.subscribe(general);
      engine.subscribeToEnd(end);
      engine.play();
      general.mockClear();

      mockCtx._lastSource()._fireEnded();

      expect(engine.isPlaying).toBe(false);
      expect(general).toHaveBeenCalled();
      expect(end).toHaveBeenCalled();
    });

    it('does NOT fire end subscribers when pause() stops the source', () => {
      const end = vi.fn();
      engine.subscribeToEnd(end);
      engine.play();
      const source = mockCtx._lastSource();

      engine.pause();
      // onended fires from the audio thread after stop() — the guard must reject it
      source._fireEnded();

      expect(end).not.toHaveBeenCalled();
    });

    it('does NOT fire end subscribers when a seek replaces the source', () => {
      const end = vi.fn();
      engine.subscribeToEnd(end);
      engine.play(0);
      const oldSource = mockCtx._lastSource();

      engine.seek(5); // stops old source, creates a new one
      oldSource._fireEnded();

      expect(end).not.toHaveBeenCalled();
    });

    it('resets isPlaying and currentTime to 0 on natural end', () => {
      engine.play(3);
      mockCtx._lastSource()._fireEnded();

      expect(engine.isPlaying).toBe(false);
      expect(engine.currentTime).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // subscribe / subscribeToEnd
  // -------------------------------------------------------------------------

  describe('subscribe()', () => {
    it('notifies the subscriber on engine state changes', async () => {
      engine.unlock();
      const fn = vi.fn();
      engine.subscribe(fn);

      await engine.load('/audio/ep1.mp3');

      expect(fn).toHaveBeenCalled();
    });

    it('stops notifying after the returned unsubscribe is called', async () => {
      engine.unlock();
      const fn = vi.fn();
      const unsubscribe = engine.subscribe(fn);
      unsubscribe();
      fn.mockClear();

      await engine.load('/audio/ep1.mp3');

      expect(fn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // unlock()
  // -------------------------------------------------------------------------

  describe('unlock()', () => {
    it('creates the AudioContext lazily on first call', () => {
      const fresh = new AudioEngine();
      expect(CtorMock).not.toHaveBeenCalled();
      fresh.unlock();
      expect(CtorMock).toHaveBeenCalledTimes(1);
    });

    it('calls ctx.resume() when the context is suspended', () => {
      mockCtx.state = 'suspended';
      engine.unlock(); // creates context
      expect(mockCtx.resume).toHaveBeenCalled();
    });

    it('does not call ctx.resume() when the context is already running', () => {
      mockCtx.state = 'running';
      engine.unlock();
      expect(mockCtx.resume).not.toHaveBeenCalled();
    });
  });
});
