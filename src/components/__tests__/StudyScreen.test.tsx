// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import studyGuideFixture from '@fixtures/study-guide.json';
import type { Chunk } from '@/db/schema';
import StudyScreen from '../study/StudyScreen';
import * as studyNavigation from '../player/studyNavigation';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ href, children, className }: { href: string; children: any; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
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
    Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
      configurable: true,
      writable: true,
      value: 1,
    });
  });

  it('renders the anchor card immediately and shows a loading state while fetching', () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(() => undefined) as Promise<Response>
    );

    render(
      <StudyScreen
        chunk={makeChunk()}
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
        prevHref="/podcasts/slow-japanese/episodes/7/segments/2/study"
        nextHref="/podcasts/slow-japanese/episodes/7/segments/4/study"
      />
    );

    expect(screen.getByRole('heading', { name: 'Study' })).toBeInTheDocument();
    expect(screen.getByText('Segment 4 of 10')).toBeInTheDocument();
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    expect(await screen.findByRole('button', { name: 'Vocabulary' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Grammar' })).toHaveAttribute('aria-expanded', 'false');
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/study guide unavailable/i);
    });
    expect(screen.queryByRole('button', { name: /regenerate/i })).toBeNull();
  });

  it('reveals the translation only after the user opens its accordion', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: studyGuideFixture }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
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

  it('changes the play control to stop immediately while audio playback is starting', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(() => undefined) as Promise<Response>
    );
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn(() => new Promise(() => undefined)),
    });

    render(
      <StudyScreen
        chunk={makeChunk()}
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));

    expect(screen.getByRole('button', { name: 'Stop audio' })).toBeInTheDocument();
  });

  it('stops playback when the chunk reaches its end time', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: studyGuideFixture }),
    } as Response);

    render(
      <StudyScreen
        chunk={makeChunk()}
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    const structureToggle = await screen.findByRole('button', { name: 'Grammar' });
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    const structureToggle = await screen.findByRole('button', { name: 'Grammar' });
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
        totalSegments={10}
        audioUrl="/api/episodes/5/audio"
        studyGuideUrl="/api/segments/12/study-guide"
        backHref="/podcasts/slow-japanese/episodes/7"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Suspicious reading detected.');
  });

  describe('playback rate controls', () => {
    beforeEach(() => {
      vi.spyOn(global, 'fetch').mockImplementation(
        () => new Promise(() => undefined) as Promise<Response>
      );
    });

    it('renders the speed button showing 1× by default', () => {
      render(
        <StudyScreen
          chunk={makeChunk()}
          totalSegments={10}
          audioUrl="/api/episodes/5/audio"
          studyGuideUrl="/api/segments/12/study-guide"
          backHref="/podcasts/slow-japanese/episodes/7"
        />
      );

      expect(screen.getByRole('button', { name: 'Playback speed: 1×' })).toBeInTheDocument();
    });

    it('keeps segment action controls as fixed same-size squares when speed changes', () => {
      render(
        <StudyScreen
          chunk={makeChunk()}
          totalSegments={10}
          audioUrl="/api/episodes/5/audio"
          studyGuideUrl="/api/segments/12/study-guide"
          backHref="/podcasts/slow-japanese/episodes/7"
        />
      );

      const expectedButtonSizeClass = 'h-11 w-11';
      const actionButtons = [
        screen.getByRole('button', { name: 'Play audio' }),
        screen.getByRole('button', { name: 'Toggle loop' }),
        screen.getByRole('button', { name: 'Playback speed: 1×' }),
        screen.getByRole('button', { name: 'Copy segment text' }),
      ];

      actionButtons.forEach((button) => {
        expect(button).toHaveClass(...expectedButtonSizeClass.split(' '));
      });

      fireEvent.click(screen.getByRole('button', { name: 'Playback speed: 1×' }));
      expect(screen.getByRole('button', { name: 'Playback speed: 0.75×' })).toHaveClass(
        ...expectedButtonSizeClass.split(' ')
      );

      fireEvent.click(screen.getByRole('button', { name: 'Playback speed: 0.75×' }));
      expect(screen.getByRole('button', { name: 'Playback speed: 0.5×' })).toHaveClass(
        ...expectedButtonSizeClass.split(' ')
      );
    });

    it('cycles 1× → 0.75× → 0.5× → 1× on successive clicks', () => {
      render(
        <StudyScreen
          chunk={makeChunk()}
          totalSegments={10}
          audioUrl="/api/episodes/5/audio"
          studyGuideUrl="/api/segments/12/study-guide"
          backHref="/podcasts/slow-japanese/episodes/7"
        />
      );

      const audio = document.querySelector('audio') as HTMLAudioElement;

      fireEvent.click(screen.getByRole('button', { name: 'Playback speed: 1×' }));
      expect(audio.playbackRate).toBe(0.75);
      expect(screen.getByRole('button', { name: 'Playback speed: 0.75×' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Playback speed: 0.75×' }));
      expect(audio.playbackRate).toBe(0.5);
      expect(screen.getByRole('button', { name: 'Playback speed: 0.5×' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Playback speed: 0.5×' }));
      expect(audio.playbackRate).toBe(1);
      expect(screen.getByRole('button', { name: 'Playback speed: 1×' })).toBeInTheDocument();
    });

    it('retains selected speed across play/stop cycles within the same segment', async () => {
      render(
        <StudyScreen
          chunk={makeChunk()}
          totalSegments={10}
          audioUrl="/api/episodes/5/audio"
          studyGuideUrl="/api/segments/12/study-guide"
          backHref="/podcasts/slow-japanese/episodes/7"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Playback speed: 1×' }));
      fireEvent.click(screen.getByRole('button', { name: 'Play audio' }));
      await screen.findByRole('button', { name: 'Stop audio' });
      fireEvent.click(screen.getByRole('button', { name: 'Stop audio' }));

      expect(screen.getByRole('button', { name: 'Playback speed: 0.75×' })).toBeInTheDocument();
      expect(document.querySelector('audio')!.playbackRate).toBe(0.75);
    });
  });

  describe('back navigation', () => {
    beforeEach(() => {
      vi.spyOn(global, 'fetch').mockImplementation(
        () => new Promise(() => undefined) as Promise<Response>
      );
    });

    it('saves the current chunk id when the study page renders', () => {
      const saveSpy = vi.spyOn(studyNavigation, 'saveEpisodeFocusState');

      render(
        <StudyScreen
          chunk={makeChunk({ id: 99, chunkIndex: 5 })}
          totalSegments={10}
          audioUrl="/api/episodes/5/audio"
          studyGuideUrl="/api/segments/99/study-guide"
          backHref="/podcasts/slow-japanese/episodes/7"
        />
      );

      expect(saveSpy).toHaveBeenCalledWith({
        episodeHref: '/podcasts/slow-japanese/episodes/7',
        chunkId: 99,
      });
    });

    it('saves the current chunk id when the back button is clicked', () => {
      const saveSpy = vi.spyOn(studyNavigation, 'saveEpisodeFocusState');

      render(
        <StudyScreen
          chunk={makeChunk({ id: 99, chunkIndex: 5 })}
          totalSegments={10}
          audioUrl="/api/episodes/5/audio"
          studyGuideUrl="/api/segments/99/study-guide"
          backHref="/podcasts/slow-japanese/episodes/7"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /transcript/i }));

      expect(saveSpy).toHaveBeenLastCalledWith({
        episodeHref: '/podcasts/slow-japanese/episodes/7',
        chunkId: 99,
      });
    });
  });

  describe('prev/next navigation', () => {
    beforeEach(() => {
      vi.spyOn(global, 'fetch').mockImplementation(
        () => new Promise(() => undefined) as Promise<Response>
      );
    });

    it('renders both links as anchors when both hrefs are provided (middle segment)', () => {
      render(
        <StudyScreen
          chunk={makeChunk({ chunkIndex: 3 })}
          totalSegments={10}
          audioUrl="/api/episodes/5/audio"
          studyGuideUrl="/api/segments/12/study-guide"
          backHref="/podcasts/slow-japanese/episodes/7"
          prevHref="/podcasts/slow-japanese/episodes/7/segments/2/study"
          nextHref="/podcasts/slow-japanese/episodes/7/segments/4/study"
        />
      );

      const prevLink = screen.getByRole('link', { name: /previous/i });
      const nextLink = screen.getByRole('link', { name: /next/i });
      expect(prevLink).toHaveAttribute('href', '/podcasts/slow-japanese/episodes/7/segments/2/study');
      expect(nextLink).toHaveAttribute('href', '/podcasts/slow-japanese/episodes/7/segments/4/study');
    });

    it('renders previous as a dimmed span (not a link) when on the first segment', () => {
      render(
        <StudyScreen
          chunk={makeChunk({ chunkIndex: 0 })}
          totalSegments={10}
          audioUrl="/api/episodes/5/audio"
          studyGuideUrl="/api/segments/12/study-guide"
          backHref="/podcasts/slow-japanese/episodes/7"
          nextHref="/podcasts/slow-japanese/episodes/7/segments/1/study"
        />
      );

      expect(screen.queryByRole('link', { name: /previous/i })).toBeNull();
      expect(screen.getByText(/← previous/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute(
        'href',
        '/podcasts/slow-japanese/episodes/7/segments/1/study'
      );
    });

    it('renders next as a dimmed span (not a link) when on the last segment', () => {
      render(
        <StudyScreen
          chunk={makeChunk({ chunkIndex: 9 })}
          totalSegments={10}
          audioUrl="/api/episodes/5/audio"
          studyGuideUrl="/api/segments/12/study-guide"
          backHref="/podcasts/slow-japanese/episodes/7"
          prevHref="/podcasts/slow-japanese/episodes/7/segments/8/study"
        />
      );

      expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
        'href',
        '/podcasts/slow-japanese/episodes/7/segments/8/study'
      );
      expect(screen.queryByRole('link', { name: /next/i })).toBeNull();
      expect(screen.getByText(/next →/i)).toBeInTheDocument();
    });
  });
});
