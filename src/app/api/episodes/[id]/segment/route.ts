import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { apiOk, apiErr } from '@/lib/api-response';
import { getErrorMessage } from '@/lib/utils';
import { segmentTranscript, addFurigana } from '@/lib/api/claude';
import {
  MINIMUM_SEGMENT_CHARACTERS,
  TRANSCRIPT_SEGMENTATION_STRATEGY,
} from '@/lib/constants';
import { segmentTranscriptDeterministically } from '@/lib/transcript-segmentation';
import { getRawTranscript, setEpisodeReady, setEpisodeError } from '@/db/episodes';
import { insertSegments } from '@/db/segments';
import type {
  SegmentWithFurigana,
  DeterministicTranscriptSegment,
  TranscriptSegment,
} from '@/lib/api/types';

export const maxDuration = 60;

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`[segment] ${label} completed in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.error(`[segment] ${label} failed after ${Date.now() - start}ms`);
    throw err;
  }
}

async function segmentTranscriptByStrategy(
  text: string,
  segments: Parameters<typeof segmentTranscript>[1]
) {
  // TODO: remove the Claude segmenting branch entirely or move it to a better async job flow
  // before we consider enabling it again.
  if (TRANSCRIPT_SEGMENTATION_STRATEGY === 'deterministic') {
    return segmentTranscriptDeterministically(segments, MINIMUM_SEGMENT_CHARACTERS);
  }

  return segmentTranscript(text, segments);
}

function attachSentenceMetadata(
  transcriptSegments: readonly TranscriptSegment[] | readonly DeterministicTranscriptSegment[],
  segmentsWithFurigana: readonly SegmentWithFurigana[]
): readonly (SegmentWithFurigana & { readonly sentences?: DeterministicTranscriptSegment['sentences'] })[] {
  return segmentsWithFurigana.map((segment, index) => {
    const transcriptSegment = transcriptSegments[index];
    if (transcriptSegment === undefined || !('sentences' in transcriptSegment)) {
      return segment;
    }

    return {
      ...segment,
      sentences: transcriptSegment.sentences,
    };
  });
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
  if (ep.status !== 'segmenting') return apiErr(`episode is ${ep.status}`, 409);

  try {
    const rawTranscript = await getRawTranscript(episodeId);
    const transcriptSegments = await timed(`${TRANSCRIPT_SEGMENTATION_STRATEGY} segmentation`, () =>
      segmentTranscriptByStrategy(rawTranscript.text, rawTranscript.segments)
    );
    const segmentsWithFurigana = await timed('claude furigana', () =>
      addFurigana(transcriptSegments)
    );
    await insertSegments(
      episodeId,
      attachSentenceMetadata(transcriptSegments, segmentsWithFurigana),
      rawTranscript.segments
    );
    await setEpisodeReady(episodeId);
    return apiOk({ status: 'ready' });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error(`[segment] episode ${episodeId} failed:`, error);
    await setEpisodeError(episodeId, message);
    return apiErr(message, 500);
  }
}
