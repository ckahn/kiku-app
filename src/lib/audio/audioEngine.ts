// Decoded AudioBuffers are large: ~210 MB for a 20-min mono 44.1 kHz file,
// ~420 MB stereo. We cache only 1 buffer at a time — enough for single-episode
// study sessions. If the user switches episodes the old buffer is GC'd and the
// new one is fetched fresh.

export type AudioStatus = 'idle' | 'loading' | 'ready' | 'error';

function getAudioContext(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

export class AudioEngine {
  private _ctx: AudioContext | null = null;
  private _cache: { url: string; buffer: AudioBuffer } | null = null;
  private _sourceNode: AudioBufferSourceNode | null = null;
  private _status: AudioStatus = 'idle';
  private _isPlaying = false;
  private _error: string | null = null;
  private _startOffset = 0;       // seconds into the buffer when play began
  private _startedAt = 0;         // ctx.currentTime when play began
  private _playbackRate = 1;
  private _subscribers = new Set<() => void>();
  private _endSubscribers = new Set<() => void>();
  private _loadingUrl: string | null = null;

  private _getOrCreateContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this._ctx) {
      const Ctor = getAudioContext();
      if (!Ctor) return null;
      this._ctx = new Ctor();
    }
    return this._ctx;
  }

  private _notify() {
    this._subscribers.forEach((fn) => fn());
  }

  unlock(): void {
    const ctx = this._getOrCreateContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
  }

  async load(url: string): Promise<void> {
    if (this._cache?.url === url && this._status === 'ready') return;
    if (this._loadingUrl === url && this._status === 'loading') return;

    // Evict previous buffer
    this._cache = null;
    this._loadingUrl = url;
    this._status = 'loading';
    this._error = null;
    this._notify();

    try {
      const ctx = this._getOrCreateContext();
      if (!ctx) throw new Error('Web Audio API is not supported in this browser.');

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);

      const rawBuffer = await response.arrayBuffer();
      // .slice() prevents detached-buffer errors if decodeAudioData is called
      // again with the same ArrayBuffer reference on some browsers.
      const buffer = await ctx.decodeAudioData(rawBuffer.slice(0));

      // Guard against a newer load() call having evicted us while we awaited
      if (this._loadingUrl !== url) return;

      this._cache = { url, buffer };
      this._status = 'ready';
      this._loadingUrl = null;
      this._notify();
    } catch (err: unknown) {
      if (this._loadingUrl !== url) return;
      this._status = 'error';
      this._error = err instanceof Error ? err.message : 'Unknown audio error';
      this._loadingUrl = null;
      this._notify();
    }
  }

  play(startSec?: number): void {
    const ctx = this._ctx;
    const buffer = this._cache?.buffer;
    if (!ctx || !buffer) return;

    // Stop any existing source without triggering onended bookkeeping
    this._stopSource();

    const offset = startSec !== undefined
      ? Math.max(0, Math.min(buffer.duration, startSec))
      : this._startOffset;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this._playbackRate;
    source.connect(ctx.destination);
    source.onended = () => {
      // onended fires on natural end AND on explicit stop(). Distinguish by
      // checking whether we are still tracking this node as current.
      if (this._sourceNode === source) {
        this._sourceNode = null;
        this._startOffset = 0;
        this._isPlaying = false;
        // Notify general subscribers first, then end subscribers.
        // End subscribers (e.g. loop handlers) may call play() which will fire
        // another general notification — React 18 batches these into one render.
        this._notify();
        this._endSubscribers.forEach((fn) => fn());
      }
    };
    try {
      source.start(0, offset);
    } catch (err) {
      // source.start() can throw InvalidStateError on iOS Safari when the
      // AudioContext is suspended and resume() silently failed.
      this._isPlaying = false;
      this._error = err instanceof Error ? err.message : 'Playback failed';
      this._notify();
      return;
    }

    this._sourceNode = source;
    this._startOffset = offset;
    this._startedAt = ctx.currentTime;
    this._isPlaying = true;
    this._notify();
  }

  pause(): void {
    if (!this._isPlaying) return;
    this._startOffset = this.currentTime;
    this._stopSource();
    this._isPlaying = false;
    this._notify();
  }

  seek(sec: number): void {
    const buffer = this._cache?.buffer;
    if (!buffer) return;
    const clamped = Math.max(0, Math.min(buffer.duration, sec));
    if (this._isPlaying) {
      this.play(clamped);
    } else {
      this._startOffset = clamped;
    }
  }

  setPlaybackRate(rate: number): void {
    // Snapshot position before changing rate — currentTime uses _playbackRate
    // in its formula, so the rate must not change until after the capture.
    const pos = this.currentTime;
    this._playbackRate = rate;
    if (this._isPlaying) {
      this.play(pos);
    }
  }

  subscribe(fn: () => void): () => void {
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  // subscribeToEnd fires only on natural file end (not explicit pause/seek).
  // Use this to handle behaviors like "loop a chunk when the file runs out."
  subscribeToEnd(fn: () => void): () => void {
    this._endSubscribers.add(fn);
    return () => this._endSubscribers.delete(fn);
  }

  get currentTime(): number {
    if (!this._isPlaying || !this._ctx) return this._startOffset;
    return this._startOffset + (this._ctx.currentTime - this._startedAt) * this._playbackRate;
  }

  get duration(): number {
    return this._cache?.buffer.duration ?? 0;
  }

  get status(): AudioStatus {
    return this._status;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get error(): string | null {
    return this._error;
  }

  private _stopSource(): void {
    if (this._sourceNode) {
      const node = this._sourceNode;
      // Null out first so onended skips its bookkeeping for this stop
      this._sourceNode = null;
      try { node.stop(); } catch { /* already stopped */ }
    }
  }
}

export const audioEngine = new AudioEngine();
