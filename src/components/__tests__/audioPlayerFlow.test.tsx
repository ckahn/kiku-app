// @vitest-environment jsdom
/**
 * Integration tests for the complete audio player flow:
 * click chunk → seek to start → playback behaviour.
 * Exercises usePlayer + ChunkList + AudioPlayer working together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import EpisodePlayer from '../player/EpisodePlayer';
import { CHUNK_PLAYBACK_OFFSET_SEC } from '../player/usePlayer';
import type { Chunk } from '@/db/schema';

function makeChunk(id: number, startMs: number, endMs: number): Chunk {
  return {
    id,
    episodeId: 1,
    chunkIndex: id - 1,
    textRaw: `テスト${id}`,
    textFurigana: `テスト${id}`,
    furiganaStatus: 'ok',
    furiganaWarning: null,
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
const chunk2StartSec = CHUNKS[1].startMs / 1000 - CHUNK_PLAYBACK_OFFSET_SEC;
const chunk2EndSec = CHUNKS[1].endMs / 1000 - CHUNK_PLAYBACK_OFFSET_SEC;


beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    writable: true,
    value: 0,
  });
});

describe('click chunk → clamped playback', () => {
  it('clicking chunk 2 seeks audio to its start (5s)', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[1]); // click chunk 2
    // Audio element currentTime should be set slightly before chunk 2 start.
    const audio = document.querySelector('audio') as HTMLAudioElement;
    expect(audio.currentTime).toBe(chunk2StartSec);
  });

  it('timeupdate past chunk end exits chunk mode and continues playing when loop is off', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const audio = document.querySelector('audio') as HTMLAudioElement;
    const items = screen.getAllByRole('listitem');

    act(() => { fireEvent.click(items[1]); });

    // Simulate timeupdate at near-end of chunk (within CLAMP_EPSILON = 0.05s)
    act(() => {
      audio.currentTime = chunk2EndSec + 0.07;
      fireEvent(audio, new Event('timeupdate'));
    });

    // Should exit chunk mode without pausing
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  });

  it('audio ended event stops playback', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const audio = document.querySelector('audio') as HTMLAudioElement;

    act(() => {
      fireEvent(audio, new Event('ended'));
    });

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('timeupdate past chunk end loops back when loop is on', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const audio = document.querySelector('audio') as HTMLAudioElement;
    const items = screen.getAllByRole('listitem');

    act(() => { fireEvent.click(items[1]); }); // focus chunk 2

    // Enable loop
    fireEvent.click(screen.getByRole('button', { name: 'Toggle loop' }));

    act(() => {
      audio.currentTime = chunk2EndSec + 0.07;
      fireEvent(audio, new Event('timeupdate'));
    });

    // Should seek back to adjusted chunk start without pausing
    expect(audio.currentTime).toBe(chunk2StartSec);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  });
});

describe('EpisodePlayer click-through flow', () => {
  it('global player bar is always present', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeInTheDocument();
  });
});
