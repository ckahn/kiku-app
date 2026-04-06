// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChunkList from '../ChunkList';
import type { Chunk } from '@/db/schema';

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: 1,
    episodeId: 10,
    chunkIndex: 0,
    textRaw: 'テスト',
    textFurigana: 'テスト',
    startMs: 0,
    endMs: 500,
    sentences: [{ text: 'テスト', start_ms: 0, end_ms: 500 }] as unknown as Chunk['sentences'],
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ChunkList', () => {
  it('renders one list item per chunk', () => {
    const chunks = [
      makeChunk({ id: 1, chunkIndex: 0 }),
      makeChunk({ id: 2, chunkIndex: 1 }),
      makeChunk({ id: 3, chunkIndex: 2 }),
    ];
    render(<ChunkList chunks={chunks} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders an empty list when chunks is empty', () => {
    render(<ChunkList chunks={[]} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('renders furigana HTML via dangerouslySetInnerHTML', () => {
    const furigana = '<ruby>今日<rt>きょう</rt></ruby>も';
    const chunks = [makeChunk({ textFurigana: furigana })];
    const { container } = render(<ChunkList chunks={chunks} />);
    expect(container.querySelector('ruby')).not.toBeNull();
    expect(container.querySelector('rt')?.textContent).toBe('きょう');
  });

  it('renders plain text when there are no kanji', () => {
    const chunks = [makeChunk({ textFurigana: 'おはようございます' })];
    render(<ChunkList chunks={chunks} />);
    expect(screen.getByText('おはようございます')).toBeInTheDocument();
  });
});
