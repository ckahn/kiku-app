// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SegmentList from '../SegmentList';
import { initialPlayerState } from '../player/playerReducer';
import type { Segment } from '@/db/schema';
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

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 1,
    episodeId: 10,
    segmentIndex: 0,
    textRaw: 'テスト',
    textFurigana: 'テスト',
    furiganaStatus: 'ok',
    furiganaWarning: null,
    startMs: 0,
    endMs: 500,
    sentences: [{ text: 'テスト', start_ms: 0, end_ms: 500 }] as unknown as Segment['sentences'],
    studyStatus: 'new',
    learnedAt: null,
    nextReview: null,
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
    seekToSegment: vi.fn(),
    setLoopEndpoint: vi.fn(),
    shiftLoopEndpoint: vi.fn(),
  };
}

function playerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return { ...initialPlayerState, ...overrides };
}

describe('SegmentList', () => {
  it('renders one list item per segment', () => {
    const segments = [
      makeSegment({ id: 1, segmentIndex: 0 }),
      makeSegment({ id: 2, segmentIndex: 1 }),
      makeSegment({ id: 3, segmentIndex: 2 }),
    ];
    render(
      <SegmentList segments={segments} playerState={playerState()} controls={makeControls()} />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders an empty list when segments is empty', () => {
    render(
      <SegmentList segments={[]} playerState={playerState()} controls={makeControls()} />,
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('always renders plain text without furigana', () => {
    const furigana = '<ruby>今日<rt>きょう</rt></ruby>も';
    const segments = [makeSegment({ textFurigana: furigana, id: 1 })];
    render(
      <SegmentList segments={segments} playerState={playerState()} controls={makeControls()} />,
    );
    expect(screen.queryByText('きょう')).toBeNull();
    expect(screen.getByText('今日も')).toBeInTheDocument();
  });

  it('clicking a segment calls controls.seekToSegment with the segment id', () => {
    const controls = makeControls();
    const segments = [makeSegment({ id: 5, segmentIndex: 0 })];
    render(
      <SegmentList segments={segments} playerState={playerState()} controls={controls} />,
    );
    fireEvent.click(screen.getByRole('listitem'));
    expect(controls.seekToSegment).toHaveBeenCalledWith(5);
  });

  it('active segment during playback has data-active attribute', () => {
    const segments = [
      makeSegment({ id: 1, segmentIndex: 0, startMs: 0, endMs: 5000 }),
      makeSegment({ id: 2, segmentIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    // currentTime = 6s → segment 2 is active
    render(
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 6 })}
        controls={makeControls()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('data-active');
    expect(items[1]).toHaveAttribute('data-active');
  });

  it('does not scroll on the initial render', () => {
    const segments = [
      makeSegment({ id: 1, segmentIndex: 0, startMs: 0, endMs: 5000 }),
      makeSegment({ id: 2, segmentIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    render(
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 0 })}
        controls={makeControls()}
      />,
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to bring the active segment above the player when currentTime advances', () => {
    const segments = [
      makeSegment({ id: 1, segmentIndex: 0, startMs: 0, endMs: 5000 }),
      makeSegment({ id: 2, segmentIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    const controls = makeControls();
    const { rerender } = render(
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 1 })}
        controls={controls}
      />,
    );

    // Segment 2's rect: below the viewport's usable area (ceiling = 800 - 160 = 640).
    const segment2 = screen.getAllByRole('listitem')[1];
    vi.spyOn(segment2, 'getBoundingClientRect').mockReturnValue({
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
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 6 })}
        controls={controls}
      />,
    );

    // delta = segmentBottom(900) - ceiling(640) = 260; window.scrollY is 0.
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 260, behavior: 'smooth' });
  });

  it('does not scroll when the active segment is unchanged across re-renders', () => {
    const segments = [makeSegment({ id: 1, segmentIndex: 0, startMs: 0, endMs: 5000 })];
    const controls = makeControls();
    const { rerender } = render(
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 1 })}
        controls={controls}
      />,
    );
    rerender(
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 2 })}
        controls={controls}
      />,
    );
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when activeSegmentId becomes null', () => {
    const segments = [
      makeSegment({ id: 1, segmentIndex: 0, startMs: 0, endMs: 5000 }),
      makeSegment({ id: 2, segmentIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    const controls = makeControls();
    const { rerender } = render(
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 1 })}
        controls={controls}
      />,
    );

    // currentTime past the final segment → no active segment
    rerender(
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 99 })}
        controls={controls}
      />,
    );

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when the active segment is already comfortably visible', () => {
    const segments = [
      makeSegment({ id: 1, segmentIndex: 0, startMs: 0, endMs: 5000 }),
      makeSegment({ id: 2, segmentIndex: 1, startMs: 5000, endMs: 10000 }),
    ];
    const controls = makeControls();
    const { rerender } = render(
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 1 })}
        controls={controls}
      />,
    );

    // Segment 2's rect fits comfortably above the 640px ceiling.
    const segment2 = screen.getAllByRole('listitem')[1];
    vi.spyOn(segment2, 'getBoundingClientRect').mockReturnValue({
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
      <SegmentList
        segments={segments}
        playerState={playerState({ currentTime: 6 })}
        controls={controls}
      />,
    );

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('links to the study page using the segment route', () => {
    const segments = [makeSegment({ id: 1, segmentIndex: 2 })];

    render(
      <SegmentList
        segments={segments}
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

});
