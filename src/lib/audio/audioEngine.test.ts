// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine } from './audioEngine';

// ---------------------------------------------------------------------------
// Fake <audio> element. jsdom does not implement media playback, so the
// engine takes an element factory and the tests drive the clock by hand.
// ---------------------------------------------------------------------------

class FakeAudio extends EventTarget {
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  playbackRate = 1;
  preservesPitch = false;
  preload = '';
  src = '';
  playResult: Promise<void> = Promise.resolve();

  play = vi.fn(() => {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return this.playResult;
  });

  pause = vi.fn(() => {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });

  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });

  load = vi.fn();

  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }

  // Simulates the browser finishing metadata parsing for the current src.
  resolveMetadata(duration = 10) {
    this.duration = duration;
    this.fire('loadedmetadata');
  }

  // Simulates playback reaching the natural end of the file.
  playToEnd() {
    this.currentTime = this.duration;
    this.paused = true;
    this.fire('pause');
    this.fire('ended');
  }
}

function okResponse() {
  return { ok: true, status: 200, blob: vi.fn().mockResolvedValue(new Blob(['x'])) };
}

let objectUrlCount = 0;

async function loadReady(engine: AudioEngine, audio: FakeAudio, url = '/api/episodes/1/audio', duration = 10) {
  const previousSrc = audio.src;
  const loading = engine.load(url);
  // Let fetch + blob resolve so the engine attaches the new src and starts
  // waiting for metadata.
  await vi.waitFor(() => expect(audio.src).not.toBe(previousSrc));
  audio.resolveMetadata(duration);
  await loading;
}

describe('AudioEngine', () => {
  let audio: FakeAudio;
  let engine: AudioEngine;

  beforeEach(() => {
    objectUrlCount = 0;
    audio = new FakeAudio();
    engine = new AudioEngine(() => audio as unknown as HTMLAudioElement);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse()));
    vi.stubGlobal('URL', Object.assign(Object.create(URL), {
      createObjectURL: vi.fn(() => `blob:fake/${++objectUrlCount}`),
      revokeObjectURL: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // load()
  // -------------------------------------------------------------------------

  describe('load()', () => {
    it('fetches the file once, plays it from an object URL, and becomes ready', async () => {
      const statuses: string[] = [];
      engine.subscribe(() => statuses.push(engine.status));

      await loadReady(engine, audio);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('/api/episodes/1/audio');
      expect(audio.src).toBe('blob:fake/1');
      expect(engine.status).toBe('ready');
      expect(engine.duration).toBe(10);
      expect(statuses).toEqual(['loading', 'ready']);
    });

    it('keeps the browser pitch correction on', async () => {
      await loadReady(engine, audio);
      expect(audio.preservesPitch).toBe(true);
    });

    it('is a no-op when the same URL is already ready', async () => {
      await loadReady(engine, audio);
      await engine.load('/api/episodes/1/audio');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when the same URL is already loading', async () => {
      const first = engine.load('/api/episodes/1/audio');
      const second = engine.load('/api/episodes/1/audio');
      await vi.waitFor(() => expect(audio.src).not.toBe(''));
      audio.resolveMetadata();
      await Promise.all([first, second]);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('revokes the previous object URL when a different file is loaded', async () => {
      await loadReady(engine, audio, '/api/episodes/1/audio');
      await loadReady(engine, audio, '/api/episodes/2/audio', 30);

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake/1');
      expect(audio.src).toBe('blob:fake/2');
      expect(engine.duration).toBe(30);
    });

    it('reports an error when the fetch is not ok', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
      await engine.load('/api/episodes/1/audio');
      expect(engine.status).toBe('error');
      expect(engine.error).toBe('Audio fetch failed: 404');
    });

    it('reports an error when the element cannot decode the file', async () => {
      const loading = engine.load('/api/episodes/1/audio');
      await vi.waitFor(() => expect(audio.src).not.toBe(''));
      audio.fire('error');
      await loading;
      expect(engine.status).toBe('error');
      expect(engine.error).toMatch(/could not be decoded/i);
    });

    it('applies a seek requested before the file was ready', async () => {
      const loading = engine.load('/api/episodes/1/audio');
      engine.seek(4);
      await vi.waitFor(() => expect(audio.src).not.toBe(''));
      audio.resolveMetadata();
      await loading;
      expect(audio.currentTime).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // play / pause / seek
  // -------------------------------------------------------------------------

  describe('playback', () => {
    beforeEach(async () => {
      await loadReady(engine, audio);
    });

    it('does nothing before a file is ready', () => {
      const fresh = new AudioEngine(() => new FakeAudio() as unknown as HTMLAudioElement);
      fresh.play(2);
      expect(fresh.isPlaying).toBe(false);
    });

    it('play(startSec) seeks then plays', () => {
      engine.play(3);
      expect(audio.currentTime).toBe(3);
      expect(audio.play).toHaveBeenCalled();
      expect(engine.isPlaying).toBe(true);
      expect(engine.currentTime).toBe(3);
    });

    it('play() with no argument resumes from the current position', () => {
      audio.currentTime = 6;
      engine.play();
      expect(audio.currentTime).toBe(6);
    });

    it('clamps a start position to the file duration', () => {
      engine.play(99);
      expect(audio.currentTime).toBe(10);
    });

    it('pause() pauses the element and keeps the position', () => {
      engine.play(3);
      audio.currentTime = 4;
      engine.pause();
      expect(audio.pause).toHaveBeenCalled();
      expect(engine.isPlaying).toBe(false);
      expect(engine.currentTime).toBe(4);
    });

    it('seek() while paused moves the position without playing', () => {
      engine.seek(5);
      expect(audio.currentTime).toBe(5);
      expect(audio.play).not.toHaveBeenCalled();
    });

    it('seek() while playing keeps playing from the new position', () => {
      engine.play(1);
      engine.seek(7);
      expect(audio.currentTime).toBe(7);
      expect(engine.isPlaying).toBe(true);
    });

    it('restartAtZero() stops and rewinds', () => {
      engine.play(5);
      engine.restartAtZero();
      expect(engine.isPlaying).toBe(false);
      expect(audio.currentTime).toBe(0);
    });

    it('surfaces a rejected play() as an error', async () => {
      audio.playResult = Promise.reject(new DOMException('blocked', 'NotAllowedError'));
      engine.play(0);
      await vi.waitFor(() => expect(engine.error).toBe('blocked'));
      expect(engine.isPlaying).toBe(false);
    });

    it('ignores the AbortError from a play() interrupted by pause()', async () => {
      audio.playResult = Promise.reject(new DOMException('interrupted', 'AbortError'));
      engine.play(0);
      await Promise.resolve();
      await Promise.resolve();
      expect(engine.error).toBeNull();
    });

    it('setPlaybackRate() applies to the element', () => {
      engine.setPlaybackRate(0.75);
      expect(audio.playbackRate).toBe(0.75);
      expect(audio.preservesPitch).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // External state changes (notification controls, headphones, audio focus)
  // -------------------------------------------------------------------------

  describe('external element events', () => {
    beforeEach(async () => {
      await loadReady(engine, audio);
    });

    it('tracks a pause that did not come from the engine', () => {
      engine.play(1);
      const listener = vi.fn();
      engine.subscribe(listener);
      audio.pause();
      expect(engine.isPlaying).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('tracks a play that did not come from the engine', () => {
      audio.play();
      expect(engine.isPlaying).toBe(true);
    });

    it('surfaces a media error during playback', () => {
      engine.play(1);
      audio.fire('error');
      expect(engine.isPlaying).toBe(false);
      expect(engine.error).toMatch(/playback failed/i);
    });

    it('natural end rewinds to 0 and notifies end subscribers', () => {
      const onEnd = vi.fn();
      engine.subscribeToEnd(onEnd);
      engine.play(9);
      audio.playToEnd();
      expect(engine.isPlaying).toBe(false);
      expect(engine.currentTime).toBe(0);
      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Boundaries
  // -------------------------------------------------------------------------

  describe('boundaries', () => {
    beforeEach(async () => {
      await loadReady(engine, audio);
      vi.useFakeTimers();
    });

    it('wraps a loop back to its start when the end is reached', () => {
      engine.setBoundary({ kind: 'loop', startSec: 2, endSec: 4 });
      engine.play(2);

      audio.currentTime = 4;
      vi.advanceTimersByTime(2000);

      expect(audio.currentTime).toBe(2);
      expect(engine.isPlaying).toBe(true);
    });

    it('schedules the wrap from the remaining time, scaled by playback rate', () => {
      engine.setPlaybackRate(0.5);
      engine.setBoundary({ kind: 'loop', startSec: 2, endSec: 4 });
      engine.play(2);

      // 2s of media at 0.5x is 4s of wall time.
      audio.currentTime = 3.9;
      vi.advanceTimersByTime(3000);
      expect(audio.currentTime).toBe(3.9);

      audio.currentTime = 4;
      vi.advanceTimersByTime(1000);
      expect(audio.currentTime).toBe(2);
    });

    it('re-arms when a timer fires early instead of wrapping', () => {
      engine.setBoundary({ kind: 'loop', startSec: 2, endSec: 4 });
      engine.play(2);

      // The element lagged (e.g. still finishing the seek), so the timer fires
      // before the media clock reaches the end.
      audio.currentTime = 3.5;
      vi.advanceTimersByTime(2000);
      expect(audio.currentTime).toBe(3.5);

      audio.currentTime = 4;
      vi.advanceTimersByTime(500);
      expect(audio.currentTime).toBe(2);
    });

    it('wraps from timeupdate as a backup when a timer was throttled', () => {
      engine.setBoundary({ kind: 'loop', startSec: 2, endSec: 4 });
      engine.play(2);
      audio.currentTime = 4.2;
      audio.fire('timeupdate');
      expect(audio.currentTime).toBe(2);
    });

    it('pulls a start at or past the loop end back to the loop start', () => {
      engine.setBoundary({ kind: 'loop', startSec: 2, endSec: 4 });
      engine.play(6);
      expect(audio.currentTime).toBe(2);
    });

    it('jumps to the loop start when the range shrinks under the playhead', () => {
      engine.setBoundary({ kind: 'loop', startSec: 2, endSec: 8 });
      engine.play(6);
      engine.setBoundary({ kind: 'loop', startSec: 2, endSec: 4 });
      expect(audio.currentTime).toBe(2);
    });

    it('a stop boundary pauses, rewinds to 0, and notifies end subscribers', () => {
      const onEnd = vi.fn();
      engine.subscribeToEnd(onEnd);
      engine.setBoundary({ kind: 'stop', endSec: 3 });
      engine.play(1);

      audio.currentTime = 3;
      vi.advanceTimersByTime(2000);

      expect(audio.pause).toHaveBeenCalled();
      expect(engine.isPlaying).toBe(false);
      expect(engine.currentTime).toBe(0);
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('clearing a boundary cancels the pending wrap', () => {
      engine.setBoundary({ kind: 'loop', startSec: 2, endSec: 4 });
      engine.play(2);
      engine.setBoundary(null);

      audio.currentTime = 4;
      vi.advanceTimersByTime(5000);
      audio.fire('timeupdate');

      expect(audio.currentTime).toBe(4);
    });

    it('does not enforce a boundary while paused', () => {
      engine.setBoundary({ kind: 'stop', endSec: 3 });
      engine.seek(3.5);
      audio.fire('timeupdate');
      expect(audio.pause).not.toHaveBeenCalled();
    });
  });
});
