// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import studyGuideFixture from '@fixtures/study-guide.json';
import type { Chunk } from '@/db/schema';
import StudyScreen from '../study/StudyScreen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

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
    expect(screen.getByLabelText(/loading study guide/i)).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'English translation' })).toHaveAttribute('aria-expanded', 'false');
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

  it('always shows a regenerate button even when loading the study guide fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'Invalid study guide content' }),
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
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid study guide content/i);
    });
    expect(screen.getByRole('button', { name: /regenerate study guide/i })).toBeInTheDocument();
  });

  it('regenerates the study guide after a load error', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: 'Invalid study guide content' }),
      } as Response)
      .mockResolvedValueOnce({
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

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /regenerate study guide/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith('/api/chunks/12/study-guide/regenerate', {
        method: 'POST',
      });
    });
    expect(await screen.findByText(studyGuideFixture.vocabulary[0].japanese)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error when regenerating the study guide fails', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: studyGuideFixture }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: 'regeneration unavailable' }),
      } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    await screen.findByRole('button', { name: 'Vocabulary' });
    fireEvent.click(screen.getByRole('button', { name: /regenerate study guide/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/regeneration unavailable/i);
    });
  });

  it('reveals the translation only after the user opens its accordion', async () => {
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

    const translationToggle = await screen.findByRole('button', { name: 'English translation' });
    fireEvent.click(translationToggle);

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

  it('shows an error when audio.play() rejects', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(() => undefined) as Promise<Response>
    );
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError')),
    });

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not play this chunk audio/i);
    });
  });

  it('hides the reading for a vocabulary item when it matches the japanese text', async () => {
    const guideWithKanaVocab = {
      ...studyGuideFixture,
      vocabulary: [
        { id: 'vocab-kana', japanese: 'きれい', reading: 'きれい', meaning: 'beautiful' },
      ],
    };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: guideWithKanaVocab }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    await screen.findByRole('button', { name: 'Vocabulary' });
    const items = screen.getAllByText('きれい');
    // Only the japanese text should appear — not duplicated as a reading
    expect(items).toHaveLength(1);
  });

  it('shows the reading for a vocabulary item when it differs from the japanese text', async () => {
    const guideWithKanjiVocab = {
      ...studyGuideFixture,
      vocabulary: [
        {
          id: 'vocab-kanji',
          japanese: '綺麗',
          reading: 'きれい',
          partOfSpeech: 'na-adj',
          dictionaryForm: '綺麗',
          meaning: 'beautiful',
        },
      ],
    };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: guideWithKanjiVocab }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    await screen.findByRole('button', { name: 'Vocabulary' });
    expect(screen.getByText('綺麗')).toBeInTheDocument();
    expect(screen.getByText('きれい')).toBeInTheDocument();
  });

  it('shows the part of speech for a vocabulary item when present', async () => {
    const guideWithPartOfSpeech = {
      ...studyGuideFixture,
      vocabulary: [
        {
          id: 'vocab-kanji',
          japanese: '綺麗',
          reading: 'きれい',
          partOfSpeech: 'na-adj',
          dictionaryForm: '綺麗',
          meaning: 'beautiful',
        },
      ],
    };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: guideWithPartOfSpeech }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    await screen.findByRole('button', { name: 'Vocabulary' });
    expect(screen.getByText('na-adj')).toBeInTheDocument();
  });

  it('hides the reading for a structure item when it matches the pattern text', async () => {
    const guideWithKanaStructure = {
      ...studyGuideFixture,
      structures: [
        { id: 'struct-kana', pattern: 'てみる', reading: 'てみる', meaning: 'try doing' },
      ],
    };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: guideWithKanaStructure }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    const structureToggle = await screen.findByRole('button', { name: 'Structure' });
    fireEvent.click(structureToggle);
    const items = screen.getAllByText('てみる');
    // Only the pattern text should appear — not duplicated as a reading
    expect(items).toHaveLength(1);
  });

  it('shows the reading for a structure item when it differs from the pattern text', async () => {
    const guideWithKanjiStructure = {
      ...studyGuideFixture,
      structures: [
        { id: 'struct-kanji', pattern: '〜て見る', reading: 'てみる', meaning: 'try doing' },
      ],
    };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: guideWithKanjiStructure }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    const structureToggle = await screen.findByRole('button', { name: 'Structure' });
    fireEvent.click(structureToggle);
    expect(screen.getByText('〜て見る')).toBeInTheDocument();
    expect(screen.getByText('てみる')).toBeInTheDocument();
  });

  it('shows the furigana suspect warning when furiganaStatus is suspect', () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(() => undefined) as Promise<Response>
    );

    render(
      <StudyScreen
        chunk={makeChunk({ furiganaStatus: 'suspect', furiganaWarning: 'Suspicious reading detected.' })}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/chunks/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Suspicious reading detected.');
  });
});
