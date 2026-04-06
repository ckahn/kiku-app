import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { transcribe } from '@/lib/api/elevenlabs';
import { setEpisodeChunking, setEpisodeError, insertRawTranscript } from '@/db/episodes';

export const maxDuration = 60;

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`[transcribe] ${label} completed in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.error(`[transcribe] ${label} failed after ${Date.now() - start}ms`);
    throw err;
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const episodeId = Number(id);

  // Atomically claim the episode for processing: only succeeds if status is
  // still 'uploaded'. Concurrent invocations (Strict Mode, retries) get 0
  // rows back and are rejected, preventing duplicate work.
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
    const transcript = await timed('elevenlabs transcribe', () =>
      transcribe(new URL(audioUrl))
    );
    await insertRawTranscript(episodeId, transcript);
    await setEpisodeChunking(episodeId);
    return apiOk({ status: 'chunking' });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error(`[transcribe] episode ${episodeId} failed:`, error);
    await setEpisodeError(episodeId, message);
    return apiErr(message, 500);
  }
}
