import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { transcribe } from '@/lib/api/elevenlabs';
import { chunkTranscript, addFurigana } from '@/lib/api/claude';
import {
  setEpisodeTranscribing,
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

  const [episode] = await db
    .select({ audioUrl: episodes.audioUrl, status: episodes.status })
    .from(episodes)
    .where(eq(episodes.id, episodeId));

  if (!episode) return apiErr('not found', 404);

  // Guard: only process episodes in 'uploaded' state to prevent duplicate runs.
  if (episode.status !== 'uploaded') {
    return apiErr(`episode is already ${episode.status}`, 409);
  }

  await setEpisodeTranscribing(episodeId);

  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) throw new Error('BLOB_READ_WRITE_TOKEN is not configured');

    const audioRes = await fetch(episode.audioUrl, {
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
    await setEpisodeError(episodeId, getErrorMessage(error));
    return apiErr(getErrorMessage(error), 500);
  }
}
