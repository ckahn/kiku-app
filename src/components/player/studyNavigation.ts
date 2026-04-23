'use client';

const STUDY_TRANSCRIPT_RESTORE_KEY = 'kiku:study-transcript-restore';

interface TranscriptRestoreState {
  readonly episodeHref: string;
  readonly chunkId: number;
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveTranscriptRestoreState(state: TranscriptRestoreState): void {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(STUDY_TRANSCRIPT_RESTORE_KEY, JSON.stringify(state));
}

export function consumeTranscriptRestoreState(episodeHref: string): TranscriptRestoreState | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(STUDY_TRANSCRIPT_RESTORE_KEY);
  if (!rawValue) {
    return null;
  }

  window.localStorage.removeItem(STUDY_TRANSCRIPT_RESTORE_KEY);

  try {
    const parsed = JSON.parse(rawValue) as Partial<TranscriptRestoreState>;
    if (parsed.episodeHref !== episodeHref || typeof parsed.chunkId !== 'number') {
      return null;
    }

    return {
      episodeHref: parsed.episodeHref,
      chunkId: parsed.chunkId,
    };
  } catch {
    return null;
  }
}
