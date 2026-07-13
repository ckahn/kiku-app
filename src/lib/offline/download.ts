import { studyGuideContentSchema } from '@/lib/api/study-guide';
import { getErrorMessage } from '@/lib/utils';
import { STUDY_GUIDE_DOWNLOAD_CONCURRENCY } from './constants';
import { mapWithConcurrency } from './concurrency';
import { downloadAudio } from './downloadAudio';
import {
  failDownload,
  finishDownload,
  startDownload,
  updateProgress,
} from './downloadStore';
import { hasStudyGuide, putEpisodeSnapshot, putStudyGuide } from './store';
import {
  episodeSnapshotSchema,
  type DownloadRecord,
  type EpisodeSnapshot,
  type StoredStudyGuide,
} from './types';

export interface DownloadEpisodeInput {
  readonly episodeId: number;
  readonly title: string;
  readonly podcastSlug: string;
  readonly episodeNumber: number;
}

export interface DownloadEpisodeOptions {
  readonly onProgress?: (record: DownloadRecord) => void;
}

async function parseJsonEnvelope<T>(response: Response, schema: { parse: (v: unknown) => T }): Promise<T> {
  const json: unknown = await response.json().catch(() => null);
  const envelope = json as { success?: boolean; data?: unknown; error?: string } | null;

  if (!response.ok || !envelope?.success) {
    throw new Error(envelope?.error ?? `Request failed (${response.status})`);
  }

  return schema.parse(envelope.data);
}

async function fetchOfflineSnapshot(episodeId: number): Promise<EpisodeSnapshot> {
  const response = await fetch(`/api/episodes/${episodeId}/offline-snapshot`);
  return parseJsonEnvelope(response, episodeSnapshotSchema);
}

async function fetchStudyGuideContent(segmentId: number): Promise<StoredStudyGuide['content']> {
  const response = await fetch(`/api/segments/${segmentId}/study-guide`);
  return parseJsonEnvelope(response, studyGuideContentSchema);
}

let persistRequested = false;

/** Best-effort persistent-storage request, made at most once per page load. */
async function requestPersistentStorageOnce(): Promise<void> {
  if (persistRequested) return;
  persistRequested = true;

  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    // Best-effort only — never fail the download over this.
  }
}

/** Test-only escape hatch: allows requestPersistentStorageOnce to run again. */
export function resetPersistRequestedForTests(): void {
  persistRequested = false;
}

/**
 * Downloads every segment's study guide (skipping ones already stored,
 * resumable), bounded to STUDY_GUIDE_DOWNLOAD_CONCURRENCY in flight at once.
 * Reports progress after each segment (success or skip) via `onProgress`.
 */
async function downloadGuides(
  episodeId: number,
  segments: EpisodeSnapshot['segments'],
  onProgress: (record: DownloadRecord) => void
): Promise<void> {
  let completed = 0;

  await mapWithConcurrency(segments, STUDY_GUIDE_DOWNLOAD_CONCURRENCY, async (segment) => {
    const alreadyStored = await hasStudyGuide(segment.id);
    if (!alreadyStored) {
      const content = await fetchStudyGuideContent(segment.id);
      await putStudyGuide({ segmentId: segment.id, content });
    }

    completed += 1;
    onProgress(await updateProgress(episodeId, { step: 'guides', guidesCompleted: completed }));
  });
}

/**
 * Downloads and stores everything needed to use an episode offline: its
 * segments + study guides in IndexedDB, and its audio in the service
 * worker's Cache Storage cache (via a plain, Range-less fetch — see
 * downloadAudio.ts). Idempotent and resumable: re-running after a partial
 * failure skips segments whose study guide is already stored and skips the
 * audio fetch entirely if it's already cached.
 *
 * On any phase's failure the download record is marked 'error' at that
 * step, with whatever progress had already committed left in place — see
 * the `offline-support` skill.
 */
export async function downloadEpisode(
  input: DownloadEpisodeInput,
  options: DownloadEpisodeOptions = {}
): Promise<DownloadRecord> {
  const { episodeId, title, podcastSlug, episodeNumber } = input;
  const emit = (record: DownloadRecord): DownloadRecord => {
    options.onProgress?.(record);
    return record;
  };

  emit(await startDownload({ episodeId, title, podcastSlug, episodeNumber, guidesTotal: 0 }));

  let snapshot: EpisodeSnapshot;
  try {
    snapshot = await fetchOfflineSnapshot(episodeId);
    await putEpisodeSnapshot(snapshot);
    emit(await updateProgress(episodeId, { guidesTotal: snapshot.segments.length }));
  } catch (error: unknown) {
    return emit(await failDownload(episodeId, 'guides', getErrorMessage(error)));
  }

  await requestPersistentStorageOnce();

  try {
    await downloadGuides(episodeId, snapshot.segments, emit);
  } catch (error: unknown) {
    return emit(await failDownload(episodeId, 'guides', getErrorMessage(error)));
  }

  try {
    const { audioBytes } = await downloadAudio(episodeId, async (progress) => {
      emit(await updateProgress(episodeId, { step: 'audio', ...progress }));
    });
    return emit(await finishDownload(episodeId, audioBytes));
  } catch (error: unknown) {
    return emit(await failDownload(episodeId, 'audio', getErrorMessage(error)));
  }
}
