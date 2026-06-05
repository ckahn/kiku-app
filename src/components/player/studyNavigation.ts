'use client';

const EPISODE_FOCUS_KEY = 'kiku:episode-focus';

interface EpisodeSegmentState {
  readonly episodeHref: string;
  readonly segmentId: number;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveEpisodeFocusState(state: EpisodeSegmentState): void {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(EPISODE_FOCUS_KEY, JSON.stringify(state));
}

export function loadEpisodeFocusState(episodeHref: string): EpisodeSegmentState | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(EPISODE_FOCUS_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<EpisodeSegmentState>;
    if (parsed.episodeHref !== episodeHref || typeof parsed.segmentId !== 'number') {
      return null;
    }

    return { episodeHref: parsed.episodeHref, segmentId: parsed.segmentId };
  } catch {
    return null;
  }
}
