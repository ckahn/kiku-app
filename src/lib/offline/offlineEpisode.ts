import type { PlayerSegment } from '@/components/player/types';
import type { EpisodeSnapshot, StoredSegment } from './types';

/**
 * Pure adapters from a stored EpisodeSnapshot to the props the study surfaces
 * expect. The offline shell (M3) feeds these into the same EpisodePlayer /
 * StudyScreen components the RSC pages use — no offline-specific rendering.
 * Href/URL derivation mirrors the RSC pages exactly so online and offline
 * navigation land on identical routes.
 */

export interface OfflineEpisodePlayerProps {
  readonly segments: readonly PlayerSegment[];
  readonly audioUrl: string;
  readonly durationMs: number;
  readonly podcastSlug: string;
  readonly episodeNumber: number;
  readonly episodeHref: string;
}

export interface OfflineStudyScreenProps {
  readonly segment: PlayerSegment;
  readonly totalSegments: number;
  readonly audioUrl: string;
  readonly studyGuideUrl: string;
  readonly backHref: string;
  readonly prevHref?: string;
  readonly nextHref?: string;
}

export function toPlayerSegments(segments: readonly StoredSegment[]): PlayerSegment[] {
  return [...segments]
    .sort((a, b) => a.segmentIndex - b.segmentIndex)
    .map((segment) => ({
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
    }));
}

function episodeHref(snapshot: EpisodeSnapshot): string {
  const { podcastSlug, episodeNumber } = snapshot.episode;
  return `/podcasts/${podcastSlug}/episodes/${episodeNumber}`;
}

export function buildEpisodePlayerProps(snapshot: EpisodeSnapshot): OfflineEpisodePlayerProps {
  const { episode } = snapshot;
  return {
    segments: toPlayerSegments(snapshot.segments),
    audioUrl: `/api/episodes/${episode.id}/audio`,
    // EpisodePlayer treats 0 as "unknown" and falls back to the max segment
    // endMs — same as the RSC page's `episode.durationMs ?? 0`.
    durationMs: episode.durationMs ?? 0,
    podcastSlug: episode.podcastSlug,
    episodeNumber: episode.episodeNumber,
    episodeHref: episodeHref(snapshot),
  };
}

export function buildStudyScreenProps(
  snapshot: EpisodeSnapshot,
  segmentIndex: number,
): OfflineStudyScreenProps | null {
  const segments = toPlayerSegments(snapshot.segments);
  const segment = segments.find((s) => s.segmentIndex === segmentIndex);
  if (!segment) return null;

  const segmentBase = `${episodeHref(snapshot)}/segments`;
  return {
    segment,
    totalSegments: segments.length,
    audioUrl: `/api/episodes/${snapshot.episode.id}/audio`,
    studyGuideUrl: `/api/segments/${segment.id}/study-guide`,
    backHref: episodeHref(snapshot),
    prevHref: segmentIndex > 0 ? `${segmentBase}/${segmentIndex - 1}/study` : undefined,
    nextHref:
      segmentIndex < segments.length - 1 ? `${segmentBase}/${segmentIndex + 1}/study` : undefined,
  };
}
