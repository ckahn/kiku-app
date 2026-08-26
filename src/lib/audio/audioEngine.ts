// Decoded AudioBuffers are large: ~210 MB for a 20-min mono 44.1 kHz file,
// ~420 MB stereo. We cache only 1 buffer at a time — enough for single-episode
// study sessions. If the user switches episodes the old buffer is GC'd and the
// new one is fetched fresh.

import type { SoundTouchNode } from '@soundtouchjs/audio-worklet';

export type AudioStatus = 'idle' | 'loading' | 'ready' | 'error';

// A time-domain limit on playback, enforced on the audio rendering thread
// rather than by a React effect. A hidden page (a locked phone screen) stops
// being serviced requestAnimationFrame, so anything that watches currentTime
// from React silently stops firing while the audio graph keeps rendering.
// Native loopStart/loopEnd wrapping and a scheduled stop() both survive that.
// The engine knows nothing about segments — callers project their loop state
// down to seconds.
export type PlaybackBoundary =
  | { readonly kind: 'loop'; readonly startSec: number; readonly endSec: number }
  | { readonly kind: 'stop'; readonly endSec: number };

// Clamps a requested boundary against the loaded buffer. Resolved lazily on
// read rather than at set time, so a boundary set before the buffer finishes
// loading is still clamped once the duration is known.
function resolveBoundary(boundary: PlaybackBoundary | null, duration: number): PlaybackBoundary | null {
  if (!boundary) return null;
  const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
  const endSec = Math.min(boundary.endSec, max);
  if (boundary.kind === 'stop') {
    return endSec > 0 ? { kind: 'stop', endSec } : null;
  }
  const startSec = Math.max(0, Math.min(boundary.startSec, max));
  // A degenerate range would make the wrap math divide by zero; treat it as
  // no boundary at all rather than as a zero-length loop.
  if (endSec <= startSec) return null;
  return { kind: 'loop', startSec, endSec };
}

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
  private _pendingSeek: number | null = null;
  private _subscribers = new Set<() => void>();
  private _endSubscribers = new Set<() => void>();
  private _loadingUrl: string | null = null;
  private _workletLoaded = false;
  private _workletLoading: Promise<void> | null = null;
  private _pitchNode: AudioWorkletNode | null = null;
  private _SoundTouchNode: typeof SoundTouchNode | null = null;
  private _boundary: PlaybackBoundary | null = null;  // as requested, unclamped
  private _stopScheduled = false;

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

  unlock(): Promise<void> {
    const ctx = this._getOrCreateContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
    return this._loadWorklet();
  }

  private _loadWorklet(): Promise<void> {
    const ctx = this._ctx;
    if (!ctx?.audioWorklet || this._workletLoaded) return Promise.resolve();
    if (this._workletLoading) return this._workletLoading;
    const loading = import('@soundtouchjs/audio-worklet').then(({ SoundTouchNode }) => {
      this._SoundTouchNode = SoundTouchNode;
      // Reference the processor by its public/ path. new URL(bareSpecifier,
      // import.meta.url) does not resolve package exports — it produces a
      // path relative to the bundle file which 404s in production.
      return SoundTouchNode.register(ctx, '/soundtouch-processor.js');
    })
      .then(() => { this._workletLoaded = true; this._workletLoading = null; this._notify(); })
      .catch((err: unknown) => {
        this._workletLoading = null;
        // Pitch correction will silently fall back to uncompensated playback;
        // log so the failure is diagnosable without blocking audio.
        console.warn('SoundTouch worklet failed to load — pitch correction unavailable:', err);
      });
    this._workletLoading = loading;
    return loading;
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
      if (this._pendingSeek !== null) {
        this._startOffset = Math.max(0, Math.min(buffer.duration, this._pendingSeek));
        this._pendingSeek = null;
      }
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

    const boundary = this._resolvedBoundary;
    const requested = startSec !== undefined
      ? Math.max(0, Math.min(buffer.duration, startSec))
      : this._startOffset;
    // Starting at or past loopEnd would never wrap — the node plays straight
    // out to the end of the buffer — so pull the offset back into the range.
    const offset = boundary?.kind === 'loop' && requested >= boundary.endSec
      ? boundary.startSec
      : requested;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this._playbackRate;
    this._applyLoopRegion(source);
    if (this._playbackRate !== 1 && this._workletLoaded && this._SoundTouchNode) {
      const pitchNode = new this._SoundTouchNode({ context: ctx });
      // Telling SoundTouch the playbackRate lets it auto-compensate pitch so
      // the output plays at the right speed but retains the original pitch.
      pitchNode.playbackRate.value = this._playbackRate;
      source.connect(pitchNode);
      pitchNode.connect(ctx.destination);
      this._pitchNode = pitchNode;
    } else {
      source.connect(ctx.destination);
    }
    source.onended = () => {
      // onended fires on natural end AND on explicit stop(). Distinguish by
      // checking whether we are still tracking this node as current.
      if (this._sourceNode === source) {
        this._sourceNode = null;
        if (this._pitchNode) {
          this._pitchNode.disconnect();
          this._pitchNode = null;
        }
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
    // stop() must be scheduled after start(), never before it.
    this._scheduleBoundaryStop(source, offset);
    this._notify();
  }

  // Projects a time-domain boundary onto the audio graph. Loop state itself
  // stays with the caller (PlayerState.loopRange on the episode page, a local
  // flag on the study page); this is a one-way push, like setPlaybackRate.
  setBoundary(boundary: PlaybackBoundary | null): void {
    // Resolve the position under the *previous* boundary — currentTime's wrap
    // math reads _boundary, so it must be sampled before the swap.
    const pos = this.currentTime;
    const hadScheduledStop = this._stopScheduled;
    this._boundary = boundary;
    const next = this._resolvedBoundary;

    const source = this._sourceNode;
    const ctx = this._ctx;
    if (!this._isPlaying || !source || !ctx) return;

    // A range that shrank under the playhead (an endpoint dragged in the
    // gutter) can never wrap natively — the node is already past loopEnd.
    if (next?.kind === 'loop' && pos >= next.endSec) {
      this.play(next.startSec);
      return;
    }

    // A scheduled stop() cannot be cancelled; a fresh source node is the only
    // way to clear or re-time one.
    if (hadScheduledStop) {
      this.play(pos);
      return;
    }

    // Rebase the linear clock onto the node's true position: wraps already
    // played out under the old boundary, future ones follow the new one.
    this._startOffset = pos;
    this._startedAt = ctx.currentTime;
    this._stopScheduled = false;
    this._applyLoopRegion(source);
    this._scheduleBoundaryStop(source, pos);
  }

  private get _resolvedBoundary(): PlaybackBoundary | null {
    return resolveBoundary(this._boundary, this.duration);
  }

  private _applyLoopRegion(source: AudioBufferSourceNode): void {
    const boundary = this._resolvedBoundary;
    if (boundary?.kind === 'loop') {
      source.loop = true;
      source.loopStart = boundary.startSec;
      source.loopEnd = boundary.endSec;
    } else {
      source.loop = false;
    }
  }

  private _scheduleBoundaryStop(source: AudioBufferSourceNode, fromSec: number): void {
    this._stopScheduled = false;
    const boundary = this._resolvedBoundary;
    const ctx = this._ctx;
    if (boundary?.kind !== 'stop' || !ctx) return;
    const remaining = Math.max(0, (boundary.endSec - fromSec) / this._playbackRate);
    try {
      source.stop(ctx.currentTime + remaining);
      this._stopScheduled = true;
    } catch {
      /* source already stopped */
    }
  }

  pause(): void {
    if (!this._isPlaying) return;
    this._startOffset = this.currentTime;
    this._stopSource();
    this._isPlaying = false;
    this._notify();
  }

  // Atomically stops playback and resets position to 0 without calling play().
  // Use this instead of seek(0)+pause() to avoid briefly starting a new source
  // node at position 0 when the engine is currently playing.
  restartAtZero(): void {
    this._stopSource();
    this._startOffset = 0;
    this._isPlaying = false;
    this._pendingSeek = null;
    this._notify();
  }

  seek(sec: number): void {
    const buffer = this._cache?.buffer;
    if (!buffer) {
      this._pendingSeek = sec;
      return;
    }
    this._pendingSeek = null;
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
  // Use this to handle behaviors like "loop a segment when the file runs out."
  subscribeToEnd(fn: () => void): () => void {
    this._endSubscribers.add(fn);
    return () => this._endSubscribers.delete(fn);
  }

  get currentTime(): number {
    if (!this._isPlaying || !this._ctx) return this._startOffset;
    const raw = this._startOffset + (this._ctx.currentTime - this._startedAt) * this._playbackRate;
    // The linear clock keeps counting past loopEnd while the node wraps, so
    // fold it back into the range. This is what lets the UI resume at the
    // right position after the page was hidden for many loop iterations.
    const boundary = this._resolvedBoundary;
    if (boundary?.kind !== 'loop' || raw < boundary.endSec) return raw;
    const length = boundary.endSec - boundary.startSec;
    return boundary.startSec + ((raw - boundary.startSec) % length);
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

  get workletReady(): boolean {
    return this._workletLoaded;
  }

  private _stopSource(): void {
    this._stopScheduled = false;
    if (this._sourceNode) {
      const node = this._sourceNode;
      // Null out first so onended skips its bookkeeping for this stop
      this._sourceNode = null;
      try { node.stop(); } catch { /* already stopped */ }
    }
    if (this._pitchNode) {
      this._pitchNode.disconnect();
      this._pitchNode = null;
    }
  }
}

export const audioEngine = new AudioEngine();
