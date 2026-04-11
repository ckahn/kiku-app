// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChunkList from '../ChunkList';
import { initialPlayerState } from '../player/playerReducer';
import type { Chunk } from '@/db/schema';
import type { PlayerState } from '../player/types';
import type { PlayerControls } from '../player/usePlayer';

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: 1,
    episodeId: 10,
    chunkIndex: 0,
    textRaw: 'テスト',
    textFurigana: 'テスト',
    furiganaStatus: 'ok',
    furiganaWarning: null,
    startMs: 0,
    endMs: 500,
    sentences: [{ text: 'テスト', start_ms: 0, end_ms: 500 }] as unknown as Chunk['sentences'],
    createdAt: new Date(),
    ...overrides,
  };
}

function makeControls(): PlayerControls {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    rewind: vi.fn(),
    forward: vi.fn(),
    toggleLoop: vi.fn(),
    restart: vi.fn(),
    focusChunk: vi.fn(),
    unfocusChunk: vi.fn(),
    toggleFurigana: vi.fn(),
  };
}

function playerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return { ...initialPlayerState, ...overrides };
}

describe('ChunkList', () => {
  it('renders one list item per chunk', () => {
    const chunks = [
      makeChunk({ id: 1, chunkIndex: 0 }),
      makeChunk({ id: 2, chunkIndex: 1 }),
      makeChunk({ id: 3, chunkIndex: 2 }),
    ];
    render(
      <ChunkList chunks={chunks} playerState={playerState()} controls={makeControls()} />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders an empty list when chunks is empty', () => {
    render(
      <ChunkList chunks={[]} playerState={playerState()} controls={makeControls()} />,
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('always renders plain text without furigana', () => {
    const furigana = '<ruby>今日<rt>きょう</rt></ruby>も';
    const chunks = [makeChunk({ textFurigana: furigana, id: 1 })];
    render(
      <ChunkList chunks={chunks} playerState={playerState()} controls={makeControls()} />,
    );
    expect(screen.queryByText('きょう')).toBeNull();
    expect(screen.getByText('今日も')).toBeInTheDocument();
  });

  it('clicking a chunk calls controls.focusChunk with the chunk id', () => {
    const controls = makeControls();
    const chunks = [makeChunk({ id: 5, chunkIndex: 0 })];
    render(
      <ChunkList chunks={chunks} playerState={playerState()} controls={controls} />,
    );
    fireEvent.click(screen.getByRole('listitem'));
    expect(controls.focusChunk).toHaveBeenCalledWith(5);
  });

  it('active chunk during playback has data-active attribute', () => {
    const chunks = [
      makeChunk({ id: 1, chunkIndex: 0, startMs: 0, endMs: 5000 }),
      makeChunk({ id: 2, chunkIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    // currentTime = 6s → chunk 2 is active
    render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 6 })}
        controls={makeControls()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('data-active');
    expect(items[1]).toHaveAttribute('data-active');
  });
});
