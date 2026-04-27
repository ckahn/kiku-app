// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChunkList from '../ChunkList';
import { initialPlayerState } from '../player/playerReducer';
import type { Chunk } from '@/db/schema';
import type { PlayerState } from '../player/types';
import type { PlayerControls } from '../player/usePlayer';

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value: 0,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: 800,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

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
    seekToChunk: vi.fn(),
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

  it('clicking a chunk calls controls.seekToChunk with the chunk id', () => {
    const controls = makeControls();
    const chunks = [makeChunk({ id: 5, chunkIndex: 0 })];
    render(
      <ChunkList chunks={chunks} playerState={playerState()} controls={controls} />,
    );
    fireEvent.click(screen.getByRole('listitem'));
    expect(controls.seekToChunk).toHaveBeenCalledWith(5);
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

  it('does not scroll on the initial render', () => {
    const chunks = [
      makeChunk({ id: 1, chunkIndex: 0, startMs: 0, endMs: 5000 }),
      makeChunk({ id: 2, chunkIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 0 })}
        controls={makeControls()}
      />,
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to bring the active chunk above the player when currentTime advances', () => {
    const chunks = [
      makeChunk({ id: 1, chunkIndex: 0, startMs: 0, endMs: 5000 }),
      makeChunk({ id: 2, chunkIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    const controls = makeControls();
    const { rerender } = render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 1 })}
        controls={controls}
      />,
    );

    // Chunk 2's rect: below the viewport's usable area (ceiling = 800 - 160 = 640).
    const chunk2 = screen.getAllByRole('listitem')[1];
    vi.spyOn(chunk2, 'getBoundingClientRect').mockReturnValue({
      top: 700,
      bottom: 900,
      left: 0,
      right: 0,
      width: 0,
      height: 200,
      x: 0,
      y: 700,
      toJSON: () => ({}),
    } as DOMRect);

    expect(window.scrollTo).not.toHaveBeenCalled();

    rerender(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 6 })}
        controls={controls}
      />,
    );

    // delta = chunkBottom(900) - ceiling(640) = 260; window.scrollY is 0.
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 260, behavior: 'smooth' });
  });

  it('does not scroll when the active chunk is unchanged across re-renders', () => {
    const chunks = [makeChunk({ id: 1, chunkIndex: 0, startMs: 0, endMs: 5000 })];
    const controls = makeControls();
    const { rerender } = render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 1 })}
        controls={controls}
      />,
    );
    rerender(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 2 })}
        controls={controls}
      />,
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when activeChunkId becomes null', () => {
    const chunks = [
      makeChunk({ id: 1, chunkIndex: 0, startMs: 0, endMs: 5000 }),
      makeChunk({ id: 2, chunkIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    const controls = makeControls();
    const { rerender } = render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 1 })}
        controls={controls}
      />,
    );

    // currentTime past the final chunk → no active chunk
    rerender(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 99 })}
        controls={controls}
      />,
    );

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when the active chunk is already comfortably visible', () => {
    const chunks = [
      makeChunk({ id: 1, chunkIndex: 0, startMs: 0, endMs: 5000 }),
      makeChunk({ id: 2, chunkIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    const controls = makeControls();
    const { rerender } = render(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 1 })}
        controls={controls}
      />,
    );

    // Chunk 2's rect fits comfortably above the 640px ceiling.
    const chunk2 = screen.getAllByRole('listitem')[1];
    vi.spyOn(chunk2, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
      left: 0,
      right: 0,
      width: 0,
      height: 200,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);

    rerender(
      <ChunkList
        chunks={chunks}
        playerState={playerState({ currentTime: 6 })}
        controls={controls}
      />,
    );

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('links to the study page using the segment route', () => {
    const chunks = [makeChunk({ id: 1, chunkIndex: 2 })];

    render(
      <ChunkList
        chunks={chunks}
        playerState={playerState()}
        controls={makeControls()}
        podcastSlug="slow-japanese"
        episodeNumber={7}
        episodeHref="/podcasts/slow-japanese/episodes/7"
      />,
    );

    expect(screen.getByRole('link', { name: 'Study this segment' })).toHaveAttribute(
      'href',
      '/podcasts/slow-japanese/episodes/7/segments/2/study',
    );
  });

  it('renders the study link with a 44px pointer target', () => {
    const chunks = [makeChunk({ id: 1, chunkIndex: 2 })];

    render(
      <ChunkList
        chunks={chunks}
        playerState={playerState()}
        controls={makeControls()}
        podcastSlug="slow-japanese"
        episodeNumber={7}
        episodeHref="/podcasts/slow-japanese/episodes/7"
      />,
    );

    expect(screen.getByRole('link', { name: 'Study this segment' })).toHaveClass(
      'h-11',
      'w-11',
      'cursor-pointer'
    );
  });
});
