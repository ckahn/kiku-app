// @vitest-environment jsdom
/**
 * Integration tests for the complete audio player flow:
 * click chunk → clamped playback → loop behaviour.
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

describe('click chunk → clamped playback', () => {
  it('focusing chunk 2 seeks audio to its start (5s)', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[1]); // focus chunk 2
    expect(items[1]).toHaveAttribute('data-focused');
    // Audio element currentTime should be set to chunk 2 start (5s)
    const audio = document.querySelector('audio') as HTMLAudioElement;
    expect(audio.currentTime).toBe(5);
  });

  it('timeupdate past chunk end pauses audio when loop is off', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const audio = document.querySelector('audio') as HTMLAudioElement;
    const items = screen.getAllByRole('listitem');

    act(() => { fireEvent.click(items[1]); }); // focus chunk 2 (ends at 12s)

    // Simulate timeupdate at near-end of chunk (within CLAMP_EPSILON = 0.05s)
    act(() => {
      audio.currentTime = 11.97;
      fireEvent(audio, new Event('timeupdate'));
    });

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(5); // reset to chunk start
  });

  it('timeupdate past chunk end loops back when loop is on', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const audio = document.querySelector('audio') as HTMLAudioElement;
    const items = screen.getAllByRole('listitem');

    act(() => { fireEvent.click(items[1]); }); // focus chunk 2

    // Enable loop — use first toggle (chunk controls; both control same state)
    fireEvent.click(screen.getAllByRole('button', { name: 'Toggle loop' })[0]);

    act(() => {
      audio.currentTime = 11.97;
      fireEvent(audio, new Event('timeupdate'));
    });

    // Should seek back to chunk start without pausing
    expect(audio.currentTime).toBe(5);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  });
});

describe('EpisodePlayer click-through flow', () => {
  it('clicking chunk 2 then exit returns to global mode', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');

    fireEvent.click(items[1]); // click chunk 2
    expect(items[1]).toHaveAttribute('data-focused');

    fireEvent.click(screen.getByRole('button', { name: 'Exit chunk focus' }));
    expect(items[1]).not.toHaveAttribute('data-focused');
    // Global player bar is still present
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeInTheDocument();
  });

  it('furigana toggle per chunk does not affect other chunks', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');

    // Focus chunk 1 and toggle its furigana on
    fireEvent.click(items[0]);
    const furiganaBtn = screen.getByRole('button', { name: /show furigana|hide furigana/i });
    const initialLabel = furiganaBtn.getAttribute('aria-label');
    fireEvent.click(furiganaBtn);
    expect(furiganaBtn.getAttribute('aria-label')).not.toBe(initialLabel);

    // Chunk 2 is not focused — its furigana state should be unaffected
    // (we can't easily test its internal state without focusing it, but
    // we verify focusing chunk 2 shows its own untouched furigana toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Exit chunk focus' }));
    fireEvent.click(items[1]);
    const chunk2Furigana = screen.getByRole('button', { name: /show furigana|hide furigana/i });
    expect(chunk2Furigana).toHaveAttribute('aria-pressed', 'false');
  });
});
