import { describe, it, expect } from 'vitest';
import { segmentStartSec, findActiveSegmentId, stripFurigana } from '../player/segmentUtils';
import type { Segment } from '@/db/schema';

function makeSegment(id: number, startMs: number, endMs: number): Segment {
  return {
    id,
    episodeId: 1,
    segmentIndex: id - 1,
    textRaw: 'テスト',
    textFurigana: 'テスト',
    furiganaStatus: 'ok',
    furiganaWarning: null,
    startMs,
    endMs,
    sentences: [] as unknown as Segment['sentences'],
    studyStatus: 'new',
    learnedAt: null,
    nextReview: null,
    createdAt: new Date(),
  };
}

const SEGMENTS = [
  makeSegment(1, 0, 5000),
  makeSegment(2, 5000, 12000),
  makeSegment(3, 12000, 20000),
];

describe('segmentStartSec', () => {
  it('subtracts SEGMENT_PLAYBACK_OFFSET_SEC from startMs converted to seconds', () => {
    expect(segmentStartSec({ startMs: 5000 })).toBeCloseTo(4.9);
  });

  it('clamps to 0 when startMs is less than the offset', () => {
    expect(segmentStartSec({ startMs: 0 })).toBe(0);
    expect(segmentStartSec({ startMs: 50 })).toBe(0); // 0.05s < 0.1s offset
  });
});

describe('findActiveSegmentId', () => {
  it('returns the segment id containing the current time', () => {
    expect(findActiveSegmentId(SEGMENTS, 0)).toBe(1);
    expect(findActiveSegmentId(SEGMENTS, 2.5)).toBe(1);
    expect(findActiveSegmentId(SEGMENTS, 5)).toBe(2);
    expect(findActiveSegmentId(SEGMENTS, 11.85)).toBe(2);
    expect(findActiveSegmentId(SEGMENTS, 12)).toBe(3);
    expect(findActiveSegmentId(SEGMENTS, 19.85)).toBe(3);
  });

  it('returns null when time is beyond all segments', () => {
    expect(findActiveSegmentId(SEGMENTS, 20)).toBeNull();
    expect(findActiveSegmentId(SEGMENTS, 999)).toBeNull();
  });

  it('returns null for an empty segment list', () => {
    expect(findActiveSegmentId([], 5)).toBeNull();
  });

  it('returns correct segment id even when segments are passed out of order', () => {
    const reversed = [...SEGMENTS].reverse();
    expect(findActiveSegmentId(reversed, 6)).toBe(2);
    expect(findActiveSegmentId(reversed, 13)).toBe(3);
  });

  it('end_ms boundary is exclusive (next segment at start boundary)', () => {
    // With SEGMENT_PLAYBACK_OFFSET_SEC=0.1: segment 1 window=[0,4.9), segment 2 window=[4.9,11.9)
    // At t=5, segment 1 has already ended and segment 2 is active.
    expect(findActiveSegmentId(SEGMENTS, 5)).toBe(2);
  });
});

describe('stripFurigana', () => {
  it('removes <ruby> and <rt> tags, keeping base text', () => {
    const html = '<ruby>今日<rt>きょう</rt></ruby>も';
    expect(stripFurigana(html)).toBe('今日も');
  });

  it('handles multiple ruby annotations', () => {
    const html = '<ruby>日本語<rt>にほんご</rt></ruby>を<ruby>勉強<rt>べんきょう</rt></ruby>する';
    expect(stripFurigana(html)).toBe('日本語を勉強する');
  });

  it('returns plain text unchanged', () => {
    expect(stripFurigana('おはようございます')).toBe('おはようございます');
  });

  it('handles empty string', () => {
    expect(stripFurigana('')).toBe('');
  });

  it('is case-insensitive for tag names', () => {
    const html = '<RUBY>漢字<RT>かんじ</RT></RUBY>';
    expect(stripFurigana(html)).toBe('漢字');
  });
});
