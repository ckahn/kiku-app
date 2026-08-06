import { z } from 'zod';
import { studyGuideContentSchema } from '@/lib/api/study-guide';

/**
 * Zod schemas + inferred types for everything persisted in the offline
 * IndexedDB store (src/lib/offline/db.ts, store.ts). Every write is
 * `.parse()`d (throw on invalid) and every read is `.safeParse()`d (drop
 * silently on invalid — see the `offline-support` skill for why a corrupt
 * row is treated as absent rather than surfaced as an error).
 */

export const storedSentenceSchema = z.object({
  text: z.string(),
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().nonnegative(),
});
export type StoredSentence = z.infer<typeof storedSentenceSchema>;

export const storedSegmentSchema = z.object({
  id: z.number().int().positive(),
  segmentIndex: z.number().int().nonnegative(),
  textRaw: z.string(),
  textFurigana: z.string(),
  furiganaStatus: z.enum(['ok', 'suspect']),
  furiganaWarning: z.string().nullable(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  studyStatus: z.enum(['new', 'studying', 'learned']),
  sentences: z.array(storedSentenceSchema),
});
export type StoredSegment = z.infer<typeof storedSegmentSchema>;

export const storedEpisodeMetaSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  episodeNumber: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().nullable(),
  podcastSlug: z.string(),
  podcastName: z.string(),
});
export type StoredEpisodeMeta = z.infer<typeof storedEpisodeMetaSchema>;

export const episodeSnapshotSchema = z.object({
  episode: storedEpisodeMetaSchema,
  segments: z.array(storedSegmentSchema),
});
export type EpisodeSnapshot = z.infer<typeof episodeSnapshotSchema>;

export const storedStudyGuideSchema = z.object({
  segmentId: z.number().int().positive(),
  content: studyGuideContentSchema,
});
export type StoredStudyGuide = z.infer<typeof storedStudyGuideSchema>;

export const downloadStatusSchema = z.enum(['downloading', 'complete', 'error']);
export type DownloadStatus = z.infer<typeof downloadStatusSchema>;

export const downloadStepSchema = z.enum(['guides', 'audio']);
export type DownloadStep = z.infer<typeof downloadStepSchema>;

export const downloadRecordSchema = z.object({
  episodeId: z.number().int().positive(),
  status: downloadStatusSchema,
  step: downloadStepSchema,
  guidesCompleted: z.number().int().nonnegative(),
  guidesTotal: z.number().int().nonnegative(),
  // For a 'complete' record, audioBytes is the final downloaded audio size.
  audioBytes: z.number().int().nonnegative(),
  // null when the audio response has no Content-Length (indeterminate progress).
  audioTotalBytes: z.number().int().nonnegative().nullable(),
  error: z.string().optional(),
  title: z.string(),
  podcastSlug: z.string(),
  episodeNumber: z.number().int().positive(),
  updatedAt: z.number(),
  completedAt: z.number().optional(),
});
export type DownloadRecord = z.infer<typeof downloadRecordSchema>;

// Study status enum, duplicated here (rather than imported from
// src/lib/episodeStudyStatus.ts) to keep the offline persisted-shape schemas
// self-contained in this file, matching the pattern of every other schema
// above (e.g. furiganaStatus). Keep in sync with `StudyStatus` there.
export const outboxStudyStatusSchema = z.enum(['new', 'studying', 'learned']);

export const outboxKindSchema = z.enum(['segment-status', 'episode-status']);
export type OutboxKind = z.infer<typeof outboxKindSchema>;

/**
 * A queued offline study-status mutation. `id` is the coalescing key
 * (`${kind}:${targetId}`) — enqueuing the same target again overwrites the
 * prior entry (last-write-wins), so repeatedly flipping one segment's status
 * offline leaves exactly one queued entry carrying the latest status. `url`/
 * `method`/`body` are deliberately NOT stored; they're derived at replay time
 * by `toReplayRequest` (see `outboxReplay.ts`) so a future route rename can't
 * strand queued entries with a stale URL.
 */
export const outboxEntrySchema = z.object({
  id: z.string().min(1),
  kind: outboxKindSchema,
  targetId: z.number().int().positive(),
  status: outboxStudyStatusSchema,
  clientTimestamp: z.number(),
});
export type OutboxEntry = z.infer<typeof outboxEntrySchema>;
