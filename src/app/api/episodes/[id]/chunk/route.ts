import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { chunkTranscript, addFurigana } from '@/lib/api/claude';
import {
  MINIMUM_CHUNK_CHARACTERS,
  TRANSCRIPT_SEGMENTATION_STRATEGY,
} from '@/lib/constants';
import { segmentTranscriptDeterministically } from '@/lib/transcript-segmentation';
import { getRawTranscript, setEpisodeReady, setEpisodeError } from '@/db/episodes';
import { insertChunks } from '@/db/chunks';

export const maxDuration = 60;

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`[chunk] ${label} completed in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.error(`[chunk] ${label} failed after ${Date.now() - start}ms`);
    throw err;
  }
}

async function segmentTranscript(
  text: string,
  segments: Parameters<typeof chunkTranscript>[1]
) {
  // TODO: remove the Claude chunking branch entirely or move it to a better async job flow
  // before we consider enabling it again.
  if (TRANSCRIPT_SEGMENTATION_STRATEGY === 'deterministic') {
    return segmentTranscriptDeterministically(segments, MINIMUM_CHUNK_CHARACTERS);
  }

  return chunkTranscript(text, segments);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const episodeId = Number(id);

  const [ep] = await db
    .select({ status: episodes.status })
    .from(episodes)
    .where(eq(episodes.id, episodeId));
  if (!ep) return apiErr('not found', 404);
  if (ep.status !== 'chunking') return apiErr(`episode is ${ep.status}`, 409);

  try {
    const rawTranscript = await getRawTranscript(episodeId);
    const transcriptChunks = await timed(`${TRANSCRIPT_SEGMENTATION_STRATEGY} segmentation`, () =>
      segmentTranscript(rawTranscript.text, rawTranscript.segments)
    );
    const chunksWithFurigana = await timed('claude furigana', () =>
      addFurigana(transcriptChunks)
    );
    await insertChunks(episodeId, chunksWithFurigana, rawTranscript.segments);
    await setEpisodeReady(episodeId);
    return apiOk({ status: 'ready' });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error(`[chunk] episode ${episodeId} failed:`, error);
    await setEpisodeError(episodeId, message);
    return apiErr(message, 500);
  }
}
