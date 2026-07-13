import { AUDIO_CACHE_NAME } from './constants';

export interface AudioProgress {
  readonly audioBytes: number;
  readonly audioTotalBytes: number | null;
}

/**
 * Checks whether the episode's audio is already sitting in the service
 * worker's `kiku-audio` Cache Storage cache (e.g. a prior download, or a
 * previous run of this same download that got as far as the audio phase).
 * Feature-guarded — no Cache Storage in some test/SSR contexts.
 */
async function findCachedAudio(episodeId: number): Promise<AudioProgress | null> {
  if (typeof caches === 'undefined') return null;

  const cache = await caches.open(AUDIO_CACHE_NAME);
  const cached = await cache.match(`/api/episodes/${episodeId}/audio`);
  if (!cached) return null;

  const contentLength = cached.headers.get('content-length');
  const audioBytes = contentLength ? Number(contentLength) : 0;
  return { audioBytes, audioTotalBytes: audioBytes };
}

/**
 * Downloads an episode's audio with no Range header (so the response is a
 * full 200 the service worker's CacheFirst route can cache — see sw.ts).
 * Reads the body via a stream reader to report byte progress as it arrives;
 * `audioTotalBytes` is null when the response has no Content-Length
 * (indeterminate progress). Skips the fetch entirely if the audio is
 * already cached, so re-running a download after the audio phase already
 * completed does not re-pay Vercel Blob egress.
 */
export async function downloadAudio(
  episodeId: number,
  onProgress: (progress: AudioProgress) => void | Promise<void>
): Promise<AudioProgress> {
  const cached = await findCachedAudio(episodeId);
  if (cached) {
    await onProgress(cached);
    return cached;
  }

  const response = await fetch(`/api/episodes/${episodeId}/audio`);
  if (!response.ok || !response.body) {
    throw new Error(`Audio fetch failed (${response.status})`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const audioTotalBytes = contentLengthHeader ? Number(contentLengthHeader) : null;

  const reader = response.body.getReader();
  let audioBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    audioBytes += value.byteLength;
    await onProgress({ audioBytes, audioTotalBytes });
  }

  return { audioBytes, audioTotalBytes };
}
