import { openOfflineDb } from './db';
import {
  downloadRecordSchema,
  episodeSnapshotSchema,
  storedEpisodeMetaSchema,
  storedStudyGuideSchema,
  type DownloadRecord,
  type EpisodeSnapshot,
  type StoredEpisodeMeta,
  type StoredStudyGuide,
} from './types';

/**
 * Zod-validated read/write boundary for the offline IndexedDB store.
 *
 * Writes `.parse()` their input — an invalid write throws, since it means a
 * caller bug (bad data should never reach here from a Zod-validated API
 * response). Reads `.safeParse()` their output — a corrupt row (e.g. from a
 * schema change across app versions) is treated as absent rather than
 * thrown, so a stale IndexedDB row can never crash the app; the caller just
 * re-fetches/re-downloads. See the `offline-support` skill.
 */

export async function putEpisodeSnapshot(snapshot: EpisodeSnapshot): Promise<void> {
  const parsed = episodeSnapshotSchema.parse(snapshot);
  const episodeId = parsed.episode.id;
  const db = await openOfflineDb();
  const tx = db.transaction(['episodes', 'segments'], 'readwrite');
  const episodeStore = tx.objectStore('episodes');
  const segmentStore = tx.objectStore('segments');

  // A snapshot fully replaces the episode's stored segments. Delete rows
  // whose segmentIndex is absent from the incoming set (e.g. re-segmentation
  // shrank the episode) so getEpisodeSnapshot can never return phantom
  // segments left over from an earlier, longer version.
  const existingRows = await segmentStore.index('by-episode').getAll(episodeId);
  const incomingIndices = new Set(parsed.segments.map((segment) => segment.segmentIndex));
  const staleRows = existingRows.filter((row) => !incomingIndices.has(row.segmentIndex));

  await Promise.all([
    episodeStore.put({ ...parsed.episode, episodeId }),
    ...staleRows.map((row) => segmentStore.delete([episodeId, row.segmentIndex])),
    ...parsed.segments.map((segment) => segmentStore.put({ ...segment, episodeId })),
  ]);

  await tx.done;
}

export async function getEpisodeSnapshot(episodeId: number): Promise<EpisodeSnapshot | null> {
  const db = await openOfflineDb();
  const episodeRow = await db.get('episodes', episodeId);
  if (!episodeRow) return null;

  const segmentRows = await db.getAllFromIndex('segments', 'by-episode', episodeId);
  const candidate = {
    episode: episodeRow,
    segments: [...segmentRows].sort((a, b) => a.segmentIndex - b.segmentIndex),
  };

  const result = episodeSnapshotSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

// Resolves a URL's (podcastSlug, episodeNumber) pair to a stored episode.
// The offline shell only knows the requested pathname; episode rows are keyed
// by episodeId, so this scans the (small) episodes store instead of adding a
// second index for a lookup that runs once per offline navigation.
export async function findEpisodeBySlugAndNumber(
  slug: string,
  episodeNumber: number,
): Promise<StoredEpisodeMeta | null> {
  const db = await openOfflineDb();
  const rows = await db.getAll('episodes');
  const match = rows.find(
    (row) => row.podcastSlug === slug && row.episodeNumber === episodeNumber,
  );
  if (!match) return null;

  const result = storedEpisodeMetaSchema.safeParse(match);
  return result.success ? result.data : null;
}

export async function putStudyGuide(record: StoredStudyGuide): Promise<void> {
  const parsed = storedStudyGuideSchema.parse(record);
  const db = await openOfflineDb();
  await db.put('studyGuides', parsed);
}

export async function getStudyGuide(segmentId: number): Promise<StoredStudyGuide | null> {
  const db = await openOfflineDb();
  const row = await db.get('studyGuides', segmentId);
  if (!row) return null;

  const result = storedStudyGuideSchema.safeParse(row);
  return result.success ? result.data : null;
}

export async function hasStudyGuide(segmentId: number): Promise<boolean> {
  const db = await openOfflineDb();
  const key = await db.getKey('studyGuides', segmentId);
  return key !== undefined;
}

export async function putDownloadRecord(record: DownloadRecord): Promise<void> {
  const parsed = downloadRecordSchema.parse(record);
  const db = await openOfflineDb();
  await db.put('downloads', parsed);
}

export async function getDownloadRecord(episodeId: number): Promise<DownloadRecord | null> {
  const db = await openOfflineDb();
  const row = await db.get('downloads', episodeId);
  if (!row) return null;

  const result = downloadRecordSchema.safeParse(row);
  return result.success ? result.data : null;
}

export async function getAllDownloadRecords(): Promise<DownloadRecord[]> {
  const db = await openOfflineDb();
  const rows = await db.getAll('downloads');

  const records: DownloadRecord[] = [];
  for (const row of rows) {
    const result = downloadRecordSchema.safeParse(row);
    if (result.success) records.push(result.data);
  }
  return records;
}

/**
 * Delete every record for an episode across all four stores in one
 * transaction: its snapshot (episode meta + segments), any cached study
 * guides for its segments, and its download record. Does not touch Cache
 * Storage — callers that also want to purge cached audio should use
 * `removeDownload` in `downloadStore.ts`, which wraps this and the Cache
 * Storage delete together.
 */
export async function deleteEpisodeData(episodeId: number): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(['episodes', 'segments', 'studyGuides', 'downloads'], 'readwrite');
  const segmentStore = tx.objectStore('segments');
  const segmentRows = await segmentStore.index('by-episode').getAll(episodeId);

  await Promise.all([
    tx.objectStore('episodes').delete(episodeId),
    tx.objectStore('downloads').delete(episodeId),
    ...segmentRows.flatMap((row) => [
      segmentStore.delete([row.episodeId, row.segmentIndex]),
      tx.objectStore('studyGuides').delete(row.id),
    ]),
  ]);

  await tx.done;
}
