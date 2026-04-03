import { db } from '@/db';
import { episodes, rawTranscripts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { apiOk, apiErr } from '@/lib/api-response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, Number(id)));
  if (!episode) return apiErr('not found', 404);

  // Include the raw transcript text so the poller can display it without an
  // extra round-trip once the episode transitions to 'ready'.
  if (episode.status === 'ready') {
    const [raw] = await db
      .select({ payload: rawTranscripts.payload })
      .from(rawTranscripts)
      .where(eq(rawTranscripts.episodeId, episode.id));

    const transcriptText =
      raw?.payload != null
        ? (raw.payload as { text?: string }).text ?? null
        : null;

    return apiOk({ ...episode, transcriptText });
  }

  return apiOk(episode);
}
