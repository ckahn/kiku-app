import type { ApiResponse } from '@/lib/api-response';
import type { StudyGuideContent } from '@/lib/api/types';
import { getStudyGuide } from './store';

/**
 * Study-guide read policy (see the `offline-support` skill): the IndexedDB
 * store is authoritative for downloaded episodes, the network is authoritative
 * otherwise. Online we go network-first (fresh regenerations win) and fall
 * back to the stored copy; offline we read only the store — no fetch attempt.
 *
 * Resilience tradeoff: an *online* transient network failure silently serves
 * the stored copy, which may be stale (e.g. the guide was regenerated
 * server-side after the download). We prefer a saved guide over an error, but
 * the caller must be able to tell the user — so the result carries a `source`
 * tag. `'cache'` while online means "saved copy, possibly stale; check your
 * connection"; `'cache'` while offline is expected behavior and needs no hint.
 */

export type StudyGuideSource = 'network' | 'cache';

export interface LoadedStudyGuide {
  readonly content: StudyGuideContent;
  readonly source: StudyGuideSource;
}

interface LoadStudyGuideOptions {
  readonly isOnline: boolean;
}

async function fetchStudyGuideFromNetwork(studyGuideUrl: string): Promise<StudyGuideContent> {
  const response = await fetch(studyGuideUrl);
  const payload = (await response.json()) as ApiResponse<StudyGuideContent>;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error ?? 'Could not load the study guide.');
  }

  return payload.data;
}

async function readStoredStudyGuide(segmentId: number): Promise<StudyGuideContent | null> {
  try {
    const stored = await getStudyGuide(segmentId);
    return stored?.content ?? null;
  } catch {
    // An unusable IndexedDB (unsupported, blocked, private mode) is a store
    // miss, not an error to surface — the caller falls back to the network
    // path's own error handling.
    return null;
  }
}

export async function loadStudyGuideContent(
  segmentId: number,
  studyGuideUrl: string,
  { isOnline }: LoadStudyGuideOptions,
): Promise<LoadedStudyGuide> {
  if (!isOnline) {
    const stored = await readStoredStudyGuide(segmentId);
    if (stored) return { content: stored, source: 'cache' };
    throw new Error(
      'This study guide is not available offline. Make the episode available offline to study it without a connection.',
    );
  }

  try {
    return { content: await fetchStudyGuideFromNetwork(studyGuideUrl), source: 'network' };
  } catch (networkError: unknown) {
    const stored = await readStoredStudyGuide(segmentId);
    if (stored) return { content: stored, source: 'cache' };
    throw networkError instanceof Error
      ? networkError
      : new Error('Could not load the study guide.');
  }
}
