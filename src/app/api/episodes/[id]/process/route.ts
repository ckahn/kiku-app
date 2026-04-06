import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { transcribe } from '@/lib/api/elevenlabs';
import { chunkTranscript, addFurigana } from '@/lib/api/claude';
import {
  setEpisodeChunking,
  setEpisodeReady,
  setEpisodeError,
  insertRawTranscript,
} from '@/db/episodes';
import { insertChunks } from '@/db/chunks';

// Vercel Hobby plan: 60s max. Sufficient for episodes up to ~20 min.
// For longer files, upgrade to Pro (300s) or switch to async processing.
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const episodeId = Number(id);

  // Atomically claim the episode for processing: only succeeds if status is
  // still 'uploaded'. Concurrent invocations (Strict Mode, retries) get 0
  // rows back and are rejected, preventing duplicate chunk inserts.
  const claimed = await db
    .update(episodes)
    .set({ status: 'transcribing', updatedAt: new Date() })
    .where(and(eq(episodes.id, episodeId), eq(episodes.status, 'uploaded')))
    .returning({ audioUrl: episodes.audioUrl });

  if (claimed.length === 0) {
    const [ep] = await db
      .select({ status: episodes.status })
      .from(episodes)
      .where(eq(episodes.id, episodeId));
    if (!ep) return apiErr('not found', 404);
    return apiErr(`episode is already ${ep.status}`, 409);
  }

  const { audioUrl } = claimed[0];

  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) throw new Error('BLOB_READ_WRITE_TOKEN is not configured');

    const audioRes = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${blobToken}` },
    });
    if (!audioRes.ok) {
      throw new Error(`Failed to fetch audio blob: HTTP ${audioRes.status}`);
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const transcript = await transcribe(audioBuffer);

    await insertRawTranscript(episodeId, transcript);
    await setEpisodeChunking(episodeId);

    const transcriptChunks = await chunkTranscript(transcript.text, transcript.segments);
    const chunksWithFurigana = await addFurigana(transcriptChunks);
    await insertChunks(episodeId, chunksWithFurigana, transcript.segments);

    await setEpisodeReady(episodeId);

    return apiOk({ status: 'ready' });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error(`[process] episode ${episodeId} failed:`, error);
    await setEpisodeError(episodeId, message);
    return apiErr(message, 500);
  }
}
