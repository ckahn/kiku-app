import { eq } from 'drizzle-orm';
import { db } from '.';
import { episodes, rawTranscripts } from './schema';
import type { ElevenLabsTranscript } from '@/lib/api/types';

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
 * Mark an episode as actively being chunked by Claude.
 * Always sets updatedAt explicitly — Drizzle does not auto-update it.
 */
export async function setEpisodeChunking(episodeId: number): Promise<void> {
  await db
    .update(episodes)
    .set({ status: 'chunking', updatedAt: new Date() })
    .where(eq(episodes.id, episodeId));
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
