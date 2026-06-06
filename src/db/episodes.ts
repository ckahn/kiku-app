import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '.';
import { episodes, rawTranscripts, segments } from './schema';
import {
  deriveEpisodeStudyStatusFromCounts,
  type StudyStatus,
} from '@/lib/episodeStudyStatus';
import type { ElevenLabsTranscript } from '@/lib/api/types';

/**
 * Derive study status for a set of episodes from their segments, in one
 * aggregate query. Episodes with no segments default to 'new'.
 */
export async function getEpisodeStudyStatusMap(
  episodeIds: readonly number[]
): Promise<Map<number, StudyStatus>> {
  const map = new Map<number, StudyStatus>();
  for (const id of episodeIds) {
    map.set(id, 'new');
  }
  if (episodeIds.length === 0) return map;

  const rows = await db
    .select({
      episodeId: segments.episodeId,
      total: sql<number>`count(*)::int`,
      learned: sql<number>`(count(*) filter (where ${segments.studyStatus} = 'learned'))::int`,
      studying: sql<number>`(count(*) filter (where ${segments.studyStatus} = 'studying'))::int`,
    })
    .from(segments)
    .where(inArray(segments.episodeId, [...episodeIds]))
    .groupBy(segments.episodeId);

  for (const row of rows) {
    map.set(row.episodeId, deriveEpisodeStudyStatusFromCounts(row));
  }

  return map;
}

/**
 * Attach a derived `studyStatus` to a list of episode rows.
 */
export async function attachStudyStatus<T extends { id: number }>(
  rows: readonly T[]
): Promise<(T & { studyStatus: StudyStatus })[]> {
  const statusMap = await getEpisodeStudyStatusMap(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    studyStatus: statusMap.get(row.id) ?? 'new',
  }));
}

/**
 * Mark an episode as actively being transcribed.
 * Always sets updatedAt explicitly — Drizzle does not auto-update it.
 */
export async function setEpisodeTranscribing(episodeId: number): Promise<void> {
  await db
    .update(episodes)
    .set({ status: 'transcribing', updatedAt: new Date() })
    .where(eq(episodes.id, episodeId));
}

/**
 * Mark an episode as fully processed and ready.
 */
export async function setEpisodeReady(episodeId: number): Promise<void> {
  await db
    .update(episodes)
    .set({ status: 'ready', updatedAt: new Date() })
    .where(eq(episodes.id, episodeId));
}

/**
 * Mark an episode as failed, storing the error message.
 */
export async function setEpisodeError(episodeId: number, message: string): Promise<void> {
  await db
    .update(episodes)
    .set({ status: 'error', errorMessage: message, updatedAt: new Date() })
    .where(eq(episodes.id, episodeId));
}

/**
 * Mark an episode as actively being segmented by Claude.
 * Always sets updatedAt explicitly — Drizzle does not auto-update it.
 */
export async function setEpisodeSegmenting(episodeId: number): Promise<void> {
  await db
    .update(episodes)
    .set({ status: 'segmenting', updatedAt: new Date() })
    .where(eq(episodes.id, episodeId));
}

/**
 * Fetch the stored raw transcript for an episode.
 * Throws if none exists (episode hasn't been transcribed yet).
 */
export async function getRawTranscript(episodeId: number): Promise<ElevenLabsTranscript> {
  const [row] = await db
    .select({ payload: rawTranscripts.payload })
    .from(rawTranscripts)
    .where(eq(rawTranscripts.episodeId, episodeId));
  if (!row) throw new Error(`No raw transcript found for episode ${episodeId}`);
  return row.payload as unknown as ElevenLabsTranscript;
}

/**
 * Store the raw ElevenLabs transcript for an episode.
 * A simple INSERT — re-processing strategies are handled at a higher level.
 */
export async function insertRawTranscript(
  episodeId: number,
  transcript: ElevenLabsTranscript
): Promise<void> {
  await db
    .insert(rawTranscripts)
    .values({ episodeId, payload: transcript as unknown as Record<string, unknown> });
}
