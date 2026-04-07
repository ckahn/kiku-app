import { describe, it, expect } from 'vitest';
import { findActiveChunkId, stripFurigana } from '../player/chunkUtils';
import type { Chunk } from '@/db/schema';

function makeChunk(id: number, startMs: number, endMs: number): Chunk {
  return {
    id,
    episodeId: 1,
    chunkIndex: id - 1,
    textRaw: 'テスト',
    textFurigana: 'テスト',
    startMs,
    endMs,
    sentences: [] as unknown as Chunk['sentences'],
    createdAt: new Date(),
  };
}

const CHUNKS = [
  makeChunk(1, 0, 5000),
  makeChunk(2, 5000, 12000),
  makeChunk(3, 12000, 20000),
];

describe('findActiveChunkId', () => {
  it('returns the chunk id containing the current time', () => {
    expect(findActiveChunkId(CHUNKS, 0)).toBe(1);
    expect(findActiveChunkId(CHUNKS, 2.5)).toBe(1);
    expect(findActiveChunkId(CHUNKS, 5)).toBe(2);
    expect(findActiveChunkId(CHUNKS, 11.9)).toBe(2);
    expect(findActiveChunkId(CHUNKS, 12)).toBe(3);
    expect(findActiveChunkId(CHUNKS, 19.9)).toBe(3);
  });

  it('returns null when time is beyond all chunks', () => {
    expect(findActiveChunkId(CHUNKS, 20)).toBeNull();
    expect(findActiveChunkId(CHUNKS, 999)).toBeNull();
  });

  it('returns null for an empty chunk list', () => {
    expect(findActiveChunkId([], 5)).toBeNull();
  });

  it('end_ms boundary is exclusive (next chunk at start boundary)', () => {
    // At exactly 5s, chunk 1 ends (endMs=5000) and chunk 2 begins (startMs=5000)
    // chunk 1: [0, 5) → NOT active at 5
    // chunk 2: [5, 12) → active at 5
    expect(findActiveChunkId(CHUNKS, 5)).toBe(2);
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
