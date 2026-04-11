// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import EpisodePlayer from '../player/EpisodePlayer';
import type { Chunk } from '@/db/schema';
import * as studyNavigation from '../player/studyNavigation';

// Mock HTMLMediaElement since jsdom doesn't implement playback
beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(),
  });
  // currentTime is a real property in jsdom but always 0; allow setting
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    writable: true,
    value: 0,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

function makeChunk(id: number, startMs: number, endMs: number, index: number): Chunk {
  return {
    id,
    episodeId: 1,
    chunkIndex: index,
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
  makeChunk(1, 0, 5000, 0),
  makeChunk(2, 5000, 12000, 1),
  makeChunk(3, 12000, 20000, 2),
];

describe('EpisodePlayer (integration)', () => {
  it('renders a chunk list', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the global player bar', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeInTheDocument();
  });

  it('clicking a chunk focuses it and shows chunk controls', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[1]); // click chunk 2
    expect(items[1]).toHaveAttribute('data-focused');
    expect(screen.getByRole('button', { name: /play chunk|pause chunk/i })).toBeInTheDocument();
  });

  it('exit button unfocuses the chunk', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[0]);
    expect(items[0]).toHaveAttribute('data-focused');

    fireEvent.click(screen.getByRole('button', { name: 'Exit chunk focus' }));
    expect(items[0]).not.toHaveAttribute('data-focused');
  });

  it('play button calls audio.play', async () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('loop button toggles aria-pressed', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const loopBtn = screen.getByRole('button', { name: 'Toggle loop' });
    expect(loopBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(loopBtn);
    expect(loopBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('furigana toggle shows ふりがな button when chunk is focused', () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    const items = screen.getAllByRole('listitem');
    fireEvent.click(items[0]);
    expect(screen.getByRole('button', { name: /hide furigana|show furigana/i })).toBeInTheDocument();
  });

  it('Space key toggles playback', async () => {
    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
    });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('shows a helpful error when playback fails', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('Forbidden')),
    });

    render(
      <EpisodePlayer chunks={CHUNKS} audioUrl="/api/episodes/1/audio" durationMs={20000} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/could not play this episode audio/i);
  });

  it('restores the previously studied chunk and scrolls it into view', async () => {
    vi.spyOn(studyNavigation, 'consumeTranscriptRestoreState')
      .mockReturnValueOnce({
        episodeHref: '/podcasts/slow-japanese/episodes/7',
        chunkId: 2,
      })
      .mockReturnValue(null);

    render(
      <EpisodePlayer
        chunks={CHUNKS}
        audioUrl="/api/episodes/1/audio"
        durationMs={20000}
        episodeHref="/podcasts/slow-japanese/episodes/7"
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('data-focused');
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
