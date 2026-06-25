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
    tapSegment: vi.fn(),
    growLoopUp: vi.fn(),
    growLoopDown: vi.fn(),
    shrinkLoopUp: vi.fn(),
    shrinkLoopDown: vi.fn(),
    clearLoop: vi.fn(),
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

  it('clicking a segment calls controls.tapSegment with the segment id', () => {
    const controls = makeControls();
    const segments = [makeSegment({ id: 5, segmentIndex: 0 })];
    render(
      <SegmentList segments={segments} playerState={playerState()} controls={controls} />,
    );
    fireEvent.click(screen.getByRole('listitem'));
    expect(controls.tapSegment).toHaveBeenCalledWith(5);
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

  describe('loop band visual affordances', () => {
    const threeSegs = [
      makeSegment({ id: 1, segmentIndex: 0 }),
      makeSegment({ id: 2, segmentIndex: 1 }),
      makeSegment({ id: 3, segmentIndex: 2 }),
    ];

    it('in-band segments receive data-in-loop; out-of-band do not', () => {
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 1, lastSegmentId: 2 } })}
          controls={makeControls()}
        />,
      );
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveAttribute('data-in-loop');
      expect(items[1]).toHaveAttribute('data-in-loop');
      expect(items[2]).not.toHaveAttribute('data-in-loop');
    });

    it('first and last in-band segments receive data-loop-edge; middle segments do not', () => {
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 1, lastSegmentId: 3 } })}
          controls={makeControls()}
        />,
      );
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveAttribute('data-loop-edge');
      expect(items[1]).not.toHaveAttribute('data-loop-edge');
      expect(items[2]).toHaveAttribute('data-loop-edge');
    });

    it('single-segment band gets both data-in-loop and data-loop-edge', () => {
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 2, lastSegmentId: 2 } })}
          controls={makeControls()}
        />,
      );
      const items = screen.getAllByRole('listitem');
      expect(items[1]).toHaveAttribute('data-in-loop');
      expect(items[1]).toHaveAttribute('data-loop-edge');
    });

    it('shows Expand loop up on the neighbor above the band', () => {
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 2, lastSegmentId: 3 } })}
          controls={makeControls()}
        />,
      );
      expect(screen.getByRole('button', { name: 'Expand loop up' })).toBeInTheDocument();
    });

    it('hides Expand loop up when band starts at the top of the list', () => {
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 1, lastSegmentId: 2 } })}
          controls={makeControls()}
        />,
      );
      expect(screen.queryByRole('button', { name: 'Expand loop up' })).toBeNull();
    });

    it('shows Expand loop down on the neighbor below the band', () => {
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 1, lastSegmentId: 2 } })}
          controls={makeControls()}
        />,
      );
      expect(screen.getByRole('button', { name: 'Expand loop down' })).toBeInTheDocument();
    });

    it('hides Expand loop down when band ends at the bottom of the list', () => {
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 2, lastSegmentId: 3 } })}
          controls={makeControls()}
        />,
      );
      expect(screen.queryByRole('button', { name: 'Expand loop down' })).toBeNull();
    });

    it('shows shrink handles on edge cards when band length >= 2', () => {
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 1, lastSegmentId: 3 } })}
          controls={makeControls()}
        />,
      );
      expect(screen.getByRole('button', { name: 'Shrink loop up' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Shrink loop down' })).toBeInTheDocument();
    });

    it('hides shrink handles when band is length 1', () => {
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 2, lastSegmentId: 2 } })}
          controls={makeControls()}
        />,
      );
      expect(screen.queryByRole('button', { name: 'Shrink loop up' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Shrink loop down' })).toBeNull();
    });

    it('Expand loop up button calls controls.growLoopUp', () => {
      const controls = makeControls();
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 2, lastSegmentId: 3 } })}
          controls={controls}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Expand loop up' }));
      expect(controls.growLoopUp).toHaveBeenCalledOnce();
    });

    it('Expand loop down button calls controls.growLoopDown', () => {
      const controls = makeControls();
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 1, lastSegmentId: 2 } })}
          controls={controls}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Expand loop down' }));
      expect(controls.growLoopDown).toHaveBeenCalledOnce();
    });

    it('Shrink loop up button calls controls.shrinkLoopUp', () => {
      const controls = makeControls();
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 1, lastSegmentId: 3 } })}
          controls={controls}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Shrink loop up' }));
      expect(controls.shrinkLoopUp).toHaveBeenCalledOnce();
    });

    it('Shrink loop down button calls controls.shrinkLoopDown', () => {
      const controls = makeControls();
      render(
        <SegmentList
          segments={threeSegs}
          playerState={playerState({ loopRange: { firstSegmentId: 1, lastSegmentId: 3 } })}
          controls={controls}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Shrink loop down' }));
      expect(controls.shrinkLoopDown).toHaveBeenCalledOnce();
    });
  });
});
