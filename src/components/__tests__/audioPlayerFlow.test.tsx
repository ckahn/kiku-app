// @vitest-environment jsdom
/**
 * Integration tests for the audio player flow:
 * click segment → seek to start → playback behaviour.
 * Exercises usePlayer + SegmentList + AudioPlayer working together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import EpisodePlayer from '../player/EpisodePlayer';
import type { Segment } from '@/db/schema';

vi.mock('@/lib/audio/audioEngine', async () => {
  const { createMockAudioEngine } = await import('@/lib/audio/__tests__/mockAudioEngine');
  return { audioEngine: createMockAudioEngine() };
});

import { audioEngine } from '@/lib/audio/audioEngine';
import type { MockAudioEngine } from '@/lib/audio/__tests__/mockAudioEngine';
const engineMock = audioEngine as unknown as MockAudioEngine;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSegment(id: number, startMs: number, endMs: number): Segment {
  return {
    id,
    episodeId: 1,
    segmentIndex: id - 1,
    textRaw: `テスト${id}`,
    textFurigana: `テスト${id}`,
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

beforeEach(() => {
  vi.clearAllMocks();
  engineMock._reset();
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0 as unknown as ReturnType<typeof requestAnimationFrame>);
  vi.spyOn(window, 'cancelAnimationFrame').mockReturnValue(undefined);
});

describe('click segment → seek to start', () => {
  it('clicking segment 2 seeks audio to its start (5s)', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[1]); // click segment 2
    expect(engineMock.seek).toHaveBeenCalledWith(4.9); // 5000ms / 1000 - 0.1s offset
  });

  it('clicking segment 1 seeks to 0', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[0]);
    expect(engineMock.seek).toHaveBeenCalledWith(0);
  });

  it('natural file end while not looping stops playback', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );

    act(() => { engineMock._triggerNaturalEnd(); });

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });
});

describe('EpisodePlayer global player', () => {
  it('global player bar is always present', () => {
    render(
      <EpisodePlayer segments={SEGMENTS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeInTheDocument();
  });
});
