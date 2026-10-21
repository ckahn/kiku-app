// Playback engine: one native <audio> element, fed from a single full
// download. Playing through a media element makes the OS treat it as media:
// Chrome keeps it playing with the screen off, shows notification /
// lock-screen controls via the Media Session API, and slows speech down with
// its own pitch-preserving time-stretch.
//
// Vercel Blob egress is why the element never streams from the network: the
// file is fetched once in full and handed to the element as an object URL, so
// every seek and loop wrap reads local bytes instead of issuing a new range
// request. Only the compressed file is held in memory.
//
// Boundaries are enforced by a timer aimed at the boundary, with timeupdate as
// a backup. Chrome does not throttle timers in an audible tab, so this keeps
// working while the page is hidden.

import { resolveBoundary, type PlaybackBoundary } from './playbackBoundary';

export type { PlaybackBoundary } from './playbackBoundary';

export type AudioStatus = 'idle' | 'loading' | 'ready' | 'error';

// A wrap or stop due within this many seconds is handled now rather than
// re-armed: timers have a few ms of slop, and re-arming for a sub-frame
// remainder would just overshoot by a timer tick instead.
const BOUNDARY_TOLERANCE_SEC = 0.005;

type ElementFactory = () => HTMLAudioElement | null;

function createDefaultElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  return new Audio();
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// play() rejects with a DOMException, which is not an Error subclass in every
// environment.
function playErrorMessage(err: unknown): string {
  return err instanceof Error || err instanceof DOMException ? err.message : 'Playback failed';
}

export class AudioEngine {
  private _audio: HTMLAudioElement | null = null;
  private _objectUrl: string | null = null;
  private _url: string | null = null;
  private _loadingUrl: string | null = null;
  private _status: AudioStatus = 'idle';
  private _isPlaying = false;
  private _error: string | null = null;
  private _pendingSeek: number | null = null;
  private _playbackRate = 1;
  private _boundary: PlaybackBoundary | null = null;  // as requested, unclamped
  private _boundaryTimer: ReturnType<typeof setTimeout> | null = null;
  private _subscribers = new Set<() => void>();
  private _endSubscribers = new Set<() => void>();

  constructor(private readonly _createElement: ElementFactory = createDefaultElement) {}

  private _getElement(): HTMLAudioElement | null {
    if (this._audio) return this._audio;
    const audio = this._createElement();
    if (!audio) return null;
    audio.preload = 'auto';
    audio.preservesPitch = true;
    // The element can change state without the engine asking: the media
    // notification, a headphone button, or another app taking audio focus.
    // Treat its events as the source of truth for isPlaying.
    audio.addEventListener('play', this._onElementPlay);
    audio.addEventListener('pause', this._onElementPause);
    audio.addEventListener('ended', this._onElementEnded);
    audio.addEventListener('timeupdate', this._onTimeUpdate);
    audio.addEventListener('error', this._onElementError);
    audio.addEventListener('seeked', this._armBoundary);
    audio.addEventListener('playing', this._armBoundary);
    this._audio = audio;
    return audio;
  }

  private _notify() {
    this._subscribers.forEach((fn) => fn());
  }

  async load(url: string): Promise<void> {
    if (this._url === url && this._status === 'ready') return;
    if (this._loadingUrl === url && this._status === 'loading') return;

    this._loadingUrl = url;
    this._url = null;
    this._status = 'loading';
    this._error = null;
    this._clearBoundaryTimer();
    if (this._isPlaying) {
      this._isPlaying = false;
      this._audio?.pause();
    }
    this._notify();

    try {
      const audio = this._getElement();
      if (!audio) throw new Error('Audio playback is not supported in this browser.');

      // A plain, Range-less fetch: one full download, which the service
      // worker's audio cache also captures for offline use.
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);
      const blob = await response.blob();
      if (this._loadingUrl !== url) return;

      this._replaceObjectUrl(audio, URL.createObjectURL(blob));
      await waitForMetadata(audio);
      if (this._loadingUrl !== url) return;

      audio.playbackRate = this._playbackRate;
      if (this._pendingSeek !== null) {
        audio.currentTime = this._clamp(this._pendingSeek);
        this._pendingSeek = null;
      }
      this._url = url;
      this._loadingUrl = null;
      this._status = 'ready';
      this._notify();
    } catch (err: unknown) {
      if (this._loadingUrl !== url) return;
      this._status = 'error';
      this._error = err instanceof Error ? err.message : 'Unknown audio error';
      this._loadingUrl = null;
      this._notify();
    }
  }

  private _replaceObjectUrl(audio: HTMLAudioElement, objectUrl: string): void {
    const previous = this._objectUrl;
    this._objectUrl = objectUrl;
    audio.src = objectUrl;
    if (previous) URL.revokeObjectURL(previous);
  }

  play(startSec?: number): void {
    const audio = this._audio;
    if (!audio || this._status !== 'ready') return;

    const boundary = this._resolvedBoundary;
    const requested = startSec !== undefined ? this._clamp(startSec) : audio.currentTime;
    // Starting at or past a loop's end would never wrap, so pull the start
    // back into the range.
    audio.currentTime = boundary?.kind === 'loop' && requested >= boundary.endSec
      ? boundary.startSec
      : requested;

    this._error = null;
    this._isPlaying = true;
    this._notify();
    this._armBoundary();

    audio.play().catch((err: unknown) => {
      // pause() during a pending play() rejects it with AbortError — that is
      // the user stopping playback, not a failure.
      if (isAbortError(err)) return;
      this._isPlaying = false;
      this._error = playErrorMessage(err);
      this._clearBoundaryTimer();
      this._notify();
    });
  }

  pause(): void {
    if (!this._isPlaying) return;
    this._isPlaying = false;
    this._clearBoundaryTimer();
    this._audio?.pause();
    this._notify();
  }

  restartAtZero(): void {
    this._clearBoundaryTimer();
    this._pendingSeek = null;
    this._isPlaying = false;
    if (this._audio) {
      this._audio.pause();
      if (this._status === 'ready') this._audio.currentTime = 0;
    }
    this._notify();
  }

  seek(sec: number): void {
    const audio = this._audio;
    if (!audio || this._status !== 'ready') {
      this._pendingSeek = sec;
      return;
    }
    this._pendingSeek = null;
    if (this._isPlaying) {
      this.play(sec);
    } else {
      audio.currentTime = this._clamp(sec);
    }
  }

  setPlaybackRate(rate: number): void {
    this._playbackRate = rate;
    if (this._audio) {
      this._audio.playbackRate = rate;
      this._audio.preservesPitch = true;
    }
    // The wall-clock time left until the boundary depends on the rate.
    this._armBoundary();
  }

  setBoundary(boundary: PlaybackBoundary | null): void {
    this._boundary = boundary;
    const next = this._resolvedBoundary;
    // A range that shrank under the playhead (an endpoint dragged in the
    // gutter) would never be reached again — jump to its start.
    if (this._isPlaying && next?.kind === 'loop' && this.currentTime >= next.endSec) {
      this.play(next.startSec);
      return;
    }
    this._armBoundary();
  }

  subscribe(fn: () => void): () => void {
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  // Fires on natural file end and when a stop boundary is reached — both mean
  // this playback ran out, as opposed to an explicit pause or seek.
  subscribeToEnd(fn: () => void): () => void {
    this._endSubscribers.add(fn);
    return () => this._endSubscribers.delete(fn);
  }

  get currentTime(): number {
    if (!this._audio || this._status !== 'ready') return 0;
    return this._audio.currentTime;
  }

  get duration(): number {
    return this._status === 'ready' ? this._elementDuration() : 0;
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

  private get _resolvedBoundary(): PlaybackBoundary | null {
    return resolveBoundary(this._boundary, this.duration);
  }

  // Reads the element directly rather than the public getter, which reports 0
  // until the status flips to ready — a seek queued during load is applied
  // just before that flip.
  private _elementDuration(): number {
    const duration = this._audio?.duration;
    return duration !== undefined && Number.isFinite(duration) ? duration : 0;
  }

  private _clamp(sec: number): number {
    return Math.max(0, Math.min(this._elementDuration(), sec));
  }

  private _clearBoundaryTimer(): void {
    if (this._boundaryTimer !== null) {
      clearTimeout(this._boundaryTimer);
      this._boundaryTimer = null;
    }
  }

  // Aims a timer at the boundary. Arrow function so it can double as an
  // element event listener (seeked / playing re-sync the timer to the real
  // media clock, which can lag behind a just-requested seek).
  private _armBoundary = (): void => {
    this._clearBoundaryTimer();
    const boundary = this._resolvedBoundary;
    if (!this._isPlaying || !boundary) return;
    const remainingSec = boundary.endSec - this.currentTime;
    if (remainingSec <= BOUNDARY_TOLERANCE_SEC) {
      this._reachBoundary(boundary);
      return;
    }
    const delayMs = (remainingSec / this._playbackRate) * 1000;
    this._boundaryTimer = setTimeout(this._armBoundary, delayMs);
  };

  private _reachBoundary(boundary: PlaybackBoundary): void {
    const audio = this._audio;
    if (!audio) return;
    if (boundary.kind === 'loop') {
      audio.currentTime = boundary.startSec;
      this._armBoundary();
      return;
    }
    this._finish();
  }

  // Common tail of a stop boundary and the natural end of the file.
  private _finish(): void {
    this._clearBoundaryTimer();
    this._isPlaying = false;
    if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
    }
    this._notify();
    this._endSubscribers.forEach((fn) => fn());
  }

  private _onTimeUpdate = (): void => {
    const boundary = this._resolvedBoundary;
    if (!this._isPlaying || !boundary) return;
    if (this.currentTime >= boundary.endSec - BOUNDARY_TOLERANCE_SEC) {
      this._reachBoundary(boundary);
    }
  };

  private _onElementPlay = (): void => {
    if (this._isPlaying) return;
    this._isPlaying = true;
    this._armBoundary();
    this._notify();
  };

  private _onElementPause = (): void => {
    if (!this._isPlaying) return;
    // The element pauses itself just before firing 'ended'; leave that case
    // to the ended handler so end subscribers still run.
    if (this._audio?.ended) return;
    this._isPlaying = false;
    this._clearBoundaryTimer();
    this._notify();
  };

  // Load-time errors are reported by waitForMetadata; this covers a failure
  // after the file was accepted (e.g. a corrupt frame mid-file).
  private _onElementError = (): void => {
    if (this._status !== 'ready') return;
    this._clearBoundaryTimer();
    this._isPlaying = false;
    this._error = 'Audio playback failed.';
    this._notify();
  };

  private _onElementEnded = (): void => {
    this._finish();
  };
}

function waitForMetadata(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
    };
    const onLoaded = () => { cleanup(); resolve(); };
    const onError = () => {
      cleanup();
      reject(new Error('Audio file could not be decoded.'));
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
  });
}

export const audioEngine = new AudioEngine();
