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

  it('renders furigana HTML via dangerouslySetInnerHTML', () => {
    const furigana = '<ruby>今日<rt>きょう</rt></ruby>も';
    const chunks = [makeChunk({ textFurigana: furigana, id: 1 })];
    const { container } = render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ showFurigana: { 1: true } })}
        controls={makeControls()}
      />,
    );
    expect(container.querySelector('ruby')).not.toBeNull();
    expect(container.querySelector('rt')?.textContent).toBe('きょう');
  });

  it('renders plain text when furigana is toggled off', () => {
    const furigana = '<ruby>今日<rt>きょう</rt></ruby>も';
    const chunks = [makeChunk({ textFurigana: furigana, id: 1 })];
    render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ showFurigana: { 1: false } })}
        controls={makeControls()}
      />,
    );
    // rt text should not be present when furigana is off
    expect(screen.queryByText('きょう')).toBeNull();
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

  it('focused chunk has data-focused attribute', () => {
    const chunks = [
      makeChunk({ id: 1, chunkIndex: 0 }),
      makeChunk({ id: 2, chunkIndex: 1 }),
    ];
    render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ mode: 'chunk', focusedChunkId: 2 })}
        controls={makeControls()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('data-focused');
    expect(items[1]).toHaveAttribute('data-focused');
  });

  it('active chunk during global playback has data-active attribute', () => {
    const chunks = [
      makeChunk({ id: 1, chunkIndex: 0, startMs: 0, endMs: 5000 }),
      makeChunk({ id: 2, chunkIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    // currentTime = 6s → chunk 2 is active
    render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ mode: 'global', currentTime: 6 })}
        controls={makeControls()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('data-active');
    expect(items[1]).toHaveAttribute('data-active');
  });

  it('shows chunk controls when chunk is focused', () => {
    const chunks = [makeChunk({ id: 1, chunkIndex: 0 })];
    render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ mode: 'chunk', focusedChunkId: 1 })}
        controls={makeControls()}
      />,
    );
    expect(screen.getByRole('button', { name: /play chunk|pause chunk/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit chunk focus' })).toBeInTheDocument();
  });

  it('exit button calls controls.unfocusChunk', () => {
    const controls = makeControls();
    const chunks = [makeChunk({ id: 1, chunkIndex: 0 })];
    render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ mode: 'chunk', focusedChunkId: 1 })}
        controls={controls}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exit chunk focus' }));
    expect(controls.unfocusChunk).toHaveBeenCalledOnce();
  });
});
