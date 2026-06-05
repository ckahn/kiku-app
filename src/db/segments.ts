import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { db } from '.';
import { segments, episodes, podcasts } from './schema';
import type { Segment } from './schema';
import { segmentSrsFields, type StudyStatus } from '@/lib/episodeStudyStatus';
import type {
  SegmentWithFurigana,
  ElevenLabsWord,
  TranscriptSentence,
} from '@/lib/api/types';

export interface RandomSegmentData {
  segmentId: number;
  segmentIndex: number;
  textRaw: string;
  startMs: number;
  endMs: number;
  episodeId: number;
  episodeNumber: number;
  episodeTitle: string;
  podcastSlug: string;
  podcastName: string;
}

type SegmentInsertInput = SegmentWithFurigana & {
  readonly sentences?: readonly TranscriptSentence[];
};

function buildSegmentSentences(
  segment: SegmentInsertInput,
  startMs: number,
  endMs: number
): readonly Record<string, unknown>[] {
  if (segment.sentences === undefined || segment.sentences.length === 0) {
    return [{ text: segment.text, start_ms: startMs, end_ms: endMs }];
  }

  return segment.sentences.map((sentence) => ({
    text: sentence.text,
    start_ms: sentence.start_ms,
    end_ms: sentence.end_ms,
  }));
}

/**
 * Bulk-insert segments for an episode.
 * Derives start_ms and end_ms from the word-level timestamp array.
 */
export async function insertSegments(
  episodeId: number,
  segmentsWithFurigana: readonly SegmentInsertInput[],
  words: readonly ElevenLabsWord[]
): Promise<void> {
  // Pre-compute raw startMs for every segment so we can extend each segment's
  // endMs to fill the gap before the next segment starts. ElevenLabs sometimes
  // compresses word timestamps at phrase boundaries, placing the last few
  // words inside the reported endSecond while the speech actually runs into
  // the inter-segment gap. Filling the gap ensures no spoken audio is lost.
  const rawStartMs = segmentsWithFurigana.map((segment, index) => {
    const startWord = words[segment.first_word_index];
    if (!startWord) {
      throw new Error(
        `Segment ${index} has out-of-bounds first_word_index=${segment.first_word_index}, ` +
        `words.length=${words.length}`
      );
    }
    return Math.round(startWord.startSecond * 1000);
  });

  const values = segmentsWithFurigana.map((segment, index) => {
    const startWord = words[segment.first_word_index];
    const endWord = words[segment.last_word_index];
    if (!startWord || !endWord) {
      throw new Error(
        `Segment ${index} has out-of-bounds word indices: ` +
        `first=${segment.first_word_index}, last=${segment.last_word_index}, ` +
        `words.length=${words.length}`
      );
    }
    const startMs = rawStartMs[index];
    const wordEndMs = Math.round(endWord.endSecond * 1000);
    const nextStartMs = rawStartMs[index + 1];
    // Extend endMs to fill any gap before the next segment, so speech that
    // ElevenLabs places in the gap (due to timestamp compression) is included.
    const endMs = nextStartMs !== undefined && nextStartMs > wordEndMs
      ? nextStartMs
      : wordEndMs;
    return {
      episodeId,
      segmentIndex: index,
      textRaw: segment.text,
      textFurigana: segment.text_furigana,
      furiganaStatus: segment.furigana_status,
      furiganaWarning: segment.furigana_warning,
      startMs,
      endMs,
      sentences: buildSegmentSentences(segment, startMs, endMs),
    };
  });
  await db.insert(segments).values(values);
}

/**
 * Fetch all segments for an episode in order.
 */
export async function getSegmentsByEpisodeId(episodeId: number): Promise<Segment[]> {
  return db
    .select()
    .from(segments)
    .where(eq(segments.episodeId, episodeId))
    .orderBy(asc(segments.segmentIndex));
}

/**
 * Fetch a single segment by id.
 */
export async function getSegmentById(segmentId: number): Promise<Segment | null> {
  const [segment] = await db
    .select()
    .from(segments)
    .where(eq(segments.id, segmentId));

  return segment ?? null;
}

/**
 * Fetch a random segment from an episode currently being studied.
 */
export async function getRandomStudyingSegment(excludeSegmentId?: number): Promise<RandomSegmentData | null> {
  const [row] = await db
    .select({
      segmentId: segments.id,
      segmentIndex: segments.segmentIndex,
      textRaw: segments.textRaw,
      startMs: segments.startMs,
      endMs: segments.endMs,
      episodeId: episodes.id,
      episodeNumber: episodes.episodeNumber,
      episodeTitle: episodes.title,
      podcastSlug: podcasts.slug,
      podcastName: podcasts.name,
    })
    .from(segments)
    .innerJoin(episodes, eq(segments.episodeId, episodes.id))
    .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
    .where(and(
      eq(segments.studyStatus, 'studying'),
      eq(episodes.status, 'ready'),
      excludeSegmentId !== undefined ? ne(segments.id, excludeSegmentId) : undefined,
    ))
    .orderBy(sql`RANDOM()`)
    .limit(1);

  return row ?? null;
}

/**
 * Update a single segment's study status. Stamps or clears learnedAt to match
 * the new status; nextReview is left untouched (the review flow is deferred).
 */
export async function updateSegmentStudyStatus(
  segmentId: number,
  status: StudyStatus
): Promise<Segment | null> {
  const { studyStatus, learnedAt } = segmentSrsFields(status);
  const [updated] = await db
    .update(segments)
    .set({ studyStatus, learnedAt })
    .where(eq(segments.id, segmentId))
    .returning();

  return updated ?? null;
}

/**
 * Cascade a study status to every segment of an episode. Used by the
 * episode-level start/stop-studying action, which overwrites all segments
 * (including any marked 'learned').
 */
export async function setEpisodeSegmentsStudyStatus(
  episodeId: number,
  status: StudyStatus
): Promise<void> {
  const { studyStatus, learnedAt } = segmentSrsFields(status);
  await db
    .update(segments)
    .set({ studyStatus, learnedAt })
    .where(eq(segments.episodeId, episodeId));
}

/**
 * Fetch a single segment by episode id and segment index.
 */
export async function getSegmentByEpisodeIdAndIndex(
  episodeId: number,
  segmentIndex: number
): Promise<Segment | null> {
  const [segment] = await db
    .select()
    .from(segments)
    .where(and(
      eq(segments.episodeId, episodeId),
      eq(segments.segmentIndex, segmentIndex)
    ));

  return segment ?? null;
}
