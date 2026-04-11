// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import studyGuideFixture from '@fixtures/study-guide.json';
import type { Chunk } from '@/db/schema';
import StudyScreen from '../study/StudyScreen';

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: 12,
    episodeId: 5,
    chunkIndex: 3,
    textRaw: '日本語の文です。',
    textFurigana: '<ruby>日本語<rt>にほんご</rt></ruby>の文です。',
    furiganaStatus: 'ok',
    furiganaWarning: null,
    startMs: 1000,
    endMs: 3400,
    sentences: [] as unknown as Chunk['sentences'],
    createdAt: new Date(),
    ...overrides,
  };
}

describe('StudyScreen', () => {
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
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
      configurable: true,
      writable: true,
      value: 0,
    });
  });

  it('renders the anchor card immediately and shows a loading state while fetching', () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(() => undefined) as Promise<Response>
    );

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    expect(screen.getByRole('heading', { name: 'Study' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '日本語にほんごの文です。')).toBeInTheDocument();
    expect(screen.getByText(/loading study guide/i)).toBeInTheDocument();
    expect(screen.getByText('にほんご')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /furigana/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restart chunk' })).toBeNull();
  });

  it('opens vocabulary by default and keeps the other sections collapsed', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: studyGuideFixture }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    expect(await screen.findByRole('button', { name: 'Vocabulary' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Structure' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Breakdown' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Show English Translation' })).toBeInTheDocument();
    expect(screen.queryByText(studyGuideFixture.translation.fullEnglish)).toBeNull();
  });

  it('shows an error message when the study guide request fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'study guide unavailable' }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/study guide unavailable/i);
    });
  });

  it('reveals the translation only after the user asks for it', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: studyGuideFixture }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    const revealButton = await screen.findByRole('button', { name: 'Show English Translation' });
    fireEvent.click(revealButton);

    expect(screen.getByText(studyGuideFixture.translation.fullEnglish)).toBeInTheDocument();
  });

  it('starts playback from the beginning of the chunk and changes the control to stop', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: studyGuideFixture }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Play audio' }));

    const audio = document.querySelector('audio') as HTMLAudioElement;
    expect(audio.currentTime).toBe(1);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop audio' })).toBeInTheDocument();
    });
  });

  it('stops playback when the chunk reaches its end time', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: studyGuideFixture }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Play audio' }));

    const audio = document.querySelector('audio') as HTMLAudioElement;
    audio.currentTime = 3.5;
    fireEvent(audio, new Event('timeupdate'));

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(1);
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeInTheDocument();
  });

  it('stops playback and resets to the chunk start when the user clicks stop', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: studyGuideFixture }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Play audio' }));
    const audio = document.querySelector('audio') as HTMLAudioElement;
    audio.currentTime = 2.2;

    fireEvent.click(await screen.findByRole('button', { name: 'Stop audio' }));

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(1);
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeInTheDocument();
  });
});
