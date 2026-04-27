'use client';

const EPISODE_FOCUS_KEY = 'kiku:episode-focus';

interface EpisodeChunkState {
  readonly episodeHref: string;
  readonly chunkId: number;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveEpisodeFocusState(state: EpisodeChunkState): void {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(EPISODE_FOCUS_KEY, JSON.stringify(state));
}

export function loadEpisodeFocusState(episodeHref: string): EpisodeChunkState | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(EPISODE_FOCUS_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<EpisodeChunkState>;
    if (parsed.episodeHref !== episodeHref || typeof parsed.chunkId !== 'number') {
      return null;
    }

    return { episodeHref: parsed.episodeHref, chunkId: parsed.chunkId };
  } catch {
    return null;
  }
}
