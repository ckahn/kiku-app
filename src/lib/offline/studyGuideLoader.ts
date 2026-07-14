import type { ApiResponse } from '@/lib/api-response';
import type { StudyGuideContent } from '@/lib/api/types';
import { getStudyGuide } from './store';

/**
 * Study-guide read policy (see the `offline-support` skill): the IndexedDB
 * store is authoritative for downloaded episodes, the network is authoritative
 * otherwise. Online we go network-first (fresh regenerations win) and fall
 * back to the stored copy; offline we read only the store — no fetch attempt.
 */

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
): Promise<StudyGuideContent> {
  if (!isOnline) {
    const stored = await readStoredStudyGuide(segmentId);
    if (stored) return stored;
    throw new Error(
      'This study guide is not available offline. Make the episode available offline to study it without a connection.',
    );
  }

  try {
    return await fetchStudyGuideFromNetwork(studyGuideUrl);
  } catch (networkError: unknown) {
    const stored = await readStoredStudyGuide(segmentId);
    if (stored) return stored;
    throw networkError instanceof Error
      ? networkError
      : new Error('Could not load the study guide.');
  }
}
