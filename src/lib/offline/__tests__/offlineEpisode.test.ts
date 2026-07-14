import { describe, expect, it } from 'vitest';
import {
  buildEpisodePlayerProps,
  buildStudyScreenProps,
  toPlayerSegments,
} from '../offlineEpisode';
import type { EpisodeSnapshot, StoredSegment } from '../types';

function makeSegment(overrides: Partial<StoredSegment> = {}): StoredSegment {
  return {
    id: 101,
    segmentIndex: 0,
    textRaw: '今日はいい天気です。',
    textFurigana: '<ruby>今日<rt>きょう</rt></ruby>はいい天気です。',
    furiganaStatus: 'ok',
    furiganaWarning: null,
    startMs: 0,
    endMs: 3000,
    studyStatus: 'new',
    sentences: [{ text: '今日はいい天気です。', start_ms: 0, end_ms: 3000 }],
    ...overrides,
  };
}

function makeSnapshot(segments: StoredSegment[], durationMs: number | null = 60_000): EpisodeSnapshot {
  return {
    episode: {
      id: 7,
      title: 'Episode Seven',
      episodeNumber: 7,
      durationMs,
      podcastSlug: 'my-podcast',
      podcastName: 'My Podcast',
    },
    segments,
  };
}

const threeSegments = [
  makeSegment({ id: 103, segmentIndex: 2, startMs: 6000, endMs: 9000 }),
  makeSegment({ id: 101, segmentIndex: 0 }),
  makeSegment({ id: 102, segmentIndex: 1, startMs: 3000, endMs: 6000 }),
];

describe('toPlayerSegments', () => {
  it('sorts by segmentIndex and preserves the player fields', () => {
    const result = toPlayerSegments(threeSegments);

    expect(result.map((s) => s.id)).toEqual([101, 102, 103]);
    expect(result[0]).toEqual({
      id: 101,
      segmentIndex: 0,
      textRaw: '今日はいい天気です。',
      textFurigana: '<ruby>今日<rt>きょう</rt></ruby>はいい天気です。',
      furiganaStatus: 'ok',
      furiganaWarning: null,
      startMs: 0,
      endMs: 3000,
      studyStatus: 'new',
      sentences: [{ text: '今日はいい天気です。', start_ms: 0, end_ms: 3000 }],
    });
  });

  it('does not mutate its input', () => {
    const input = [...threeSegments];
    toPlayerSegments(input);
    expect(input.map((s) => s.id)).toEqual([103, 101, 102]);
  });
});

describe('buildEpisodePlayerProps', () => {
  it('derives urls and passes duration through', () => {
    const props = buildEpisodePlayerProps(makeSnapshot(threeSegments));

    expect(props.audioUrl).toBe('/api/episodes/7/audio');
    expect(props.episodeHref).toBe('/podcasts/my-podcast/episodes/7');
    expect(props.podcastSlug).toBe('my-podcast');
    expect(props.episodeNumber).toBe(7);
    expect(props.durationMs).toBe(60_000);
    expect(props.segments).toHaveLength(3);
  });

  it('maps a null durationMs to 0 so EpisodePlayer falls back to max endMs', () => {
    const props = buildEpisodePlayerProps(makeSnapshot(threeSegments, null));
    expect(props.durationMs).toBe(0);
  });
});

describe('buildStudyScreenProps', () => {
  const snapshot = makeSnapshot(threeSegments);

  it('builds props for a middle segment with both nav hrefs', () => {
    const props = buildStudyScreenProps(snapshot, 1);

    expect(props).not.toBeNull();
    expect(props?.segment.id).toBe(102);
    expect(props?.totalSegments).toBe(3);
    expect(props?.audioUrl).toBe('/api/episodes/7/audio');
    expect(props?.studyGuideUrl).toBe('/api/segments/102/study-guide');
    expect(props?.backHref).toBe('/podcasts/my-podcast/episodes/7');
    expect(props?.prevHref).toBe('/podcasts/my-podcast/episodes/7/segments/0/study');
    expect(props?.nextHref).toBe('/podcasts/my-podcast/episodes/7/segments/2/study');
  });

  it('omits prevHref on the first segment and nextHref on the last', () => {
    const first = buildStudyScreenProps(snapshot, 0);
    const last = buildStudyScreenProps(snapshot, 2);

    expect(first?.prevHref).toBeUndefined();
    expect(first?.nextHref).toBe('/podcasts/my-podcast/episodes/7/segments/1/study');
    expect(last?.prevHref).toBe('/podcasts/my-podcast/episodes/7/segments/1/study');
    expect(last?.nextHref).toBeUndefined();
  });

  it('returns null for a segmentIndex the snapshot does not contain', () => {
    expect(buildStudyScreenProps(snapshot, 3)).toBeNull();
    expect(buildStudyScreenProps(snapshot, -1)).toBeNull();
  });
});
