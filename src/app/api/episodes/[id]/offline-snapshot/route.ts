import { z } from 'zod';
import { getEpisodeWithPodcast } from '@/db/episodes';
import { getSegmentsByEpisodeId } from '@/db/segments';
import { apiErr, apiOk } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { episodeSnapshotSchema } from '@/lib/offline/types';

const episodeIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Serves everything a client needs to store an episode offline in one call:
 * episode metadata (with the podcast slug/name resolved server-side) and its
 * full segment list. Backs the download orchestrator in
 * src/lib/offline/download.ts. See the `offline-support` skill.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawParams = await params;
  const parsedParams = episodeIdParamsSchema.safeParse(rawParams);

  if (!parsedParams.success) {
    return apiErr('invalid episode id', 400);
  }

  const { id: episodeId } = parsedParams.data;

  try {
    const episode = await getEpisodeWithPodcast(episodeId);
    if (!episode) return apiErr('not found', 404);
    if (episode.status !== 'ready') {
      return apiErr(`episode is ${episode.status}`, 409);
    }

    const segments = await getSegmentsByEpisodeId(episodeId);

    const snapshot = episodeSnapshotSchema.parse({
      episode: {
        id: episode.id,
        title: episode.title,
        episodeNumber: episode.episodeNumber,
        durationMs: episode.durationMs,
        podcastSlug: episode.podcastSlug,
        podcastName: episode.podcastName,
      },
      segments: segments.map((segment) => ({
        id: segment.id,
        segmentIndex: segment.segmentIndex,
        textRaw: segment.textRaw,
        textFurigana: segment.textFurigana,
        furiganaStatus: segment.furiganaStatus,
        furiganaWarning: segment.furiganaWarning,
        startMs: segment.startMs,
        endMs: segment.endMs,
        studyStatus: segment.studyStatus,
        sentences: segment.sentences,
      })),
    });

    return apiOk(snapshot);
  } catch (error: unknown) {
    console.error(`[offline-snapshot] episode ${episodeId} failed`, error);
    return apiErr(getErrorMessage(error), 500);
  }
}
