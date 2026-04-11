// @vitest-environment jsdom
/**
 * Integration tests for the audio player flow:
 * click chunk → seek to start → playback behaviour.
 * Exercises usePlayer + ChunkList + AudioPlayer working together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen, fireEvent } from '@testing-library/react';
import EpisodePlayer from '../player/EpisodePlayer';
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

describe('click chunk → seek to start', () => {
  it('clicking chunk 2 seeks audio to its start (5s)', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[1]); // click chunk 2
    const audio = document.querySelector('audio') as HTMLAudioElement;
    expect(audio.currentTime).toBe(5); // 5000ms / 1000
  });

  it('clicking chunk 1 seeks to 0', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[0]);
    const audio = document.querySelector('audio') as HTMLAudioElement;
    expect(audio.currentTime).toBe(0); // 0ms / 1000
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
});

describe('EpisodePlayer global player', () => {
  it('global player bar is always present', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeInTheDocument();
  });
});
