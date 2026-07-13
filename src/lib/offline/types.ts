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

export const episodeSnapshotSchema = z.object({
  episode: z.object({
    id: z.number().int().positive(),
    title: z.string(),
    episodeNumber: z.number().int().positive(),
    durationMs: z.number().int().nonnegative().nullable(),
    podcastSlug: z.string(),
    podcastName: z.string(),
  }),
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
  audioBytes: z.number().int().nonnegative(),
  // null when the audio response has no Content-Length (indeterminate progress).
  audioTotalBytes: z.number().int().nonnegative().nullable(),
  // Final downloaded size, set once the download completes; null/absent until then.
  bytesTotal: z.number().int().nonnegative().nullable().optional(),
  error: z.string().optional(),
  title: z.string(),
  podcastSlug: z.string(),
  episodeNumber: z.number().int().positive(),
  updatedAt: z.number(),
  completedAt: z.number().optional(),
});
export type DownloadRecord = z.infer<typeof downloadRecordSchema>;
