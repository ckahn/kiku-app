// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import studyGuideFixture from '@fixtures/study-guide.json';
import { resetOfflineDbForTests } from '@/lib/offline/db';
import { putDownloadRecord, putEpisodeSnapshot, putStudyGuide } from '@/lib/offline/store';
import type { DownloadRecord, EpisodeSnapshot } from '@/lib/offline/types';
import type { StudyGuideContent } from '@/lib/api/types';
import OfflineShell from '../page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/audio/audioEngine', async () => {
  const { createMockAudioEngine } = await import('@/lib/audio/__tests__/mockAudioEngine');
  return { audioEngine: createMockAudioEngine() };
});

const studyGuide = studyGuideFixture as unknown as StudyGuideContent;

function makeSnapshot(): EpisodeSnapshot {
  return {
    episode: {
      id: 1,
      title: 'Episode One',
      episodeNumber: 1,
      durationMs: 6000,
      podcastSlug: 'my-podcast',
      podcastName: 'My Podcast',
    },
    segments: [
      {
        id: 101,
        segmentIndex: 0,
        textRaw: '今日はいい天気です。',
        textFurigana: '<ruby>今日<rt>きょう</rt></ruby>はいい天気です。',
        furiganaStatus: 'ok',
        furiganaWarning: null,
        startMs: 0,
        endMs: 3000,
        studyStatus: 'new',
        sentences: [{ text: '今日はいい天気です。', start_ms: 0, end_ms: 3000 }],
      },
      {
        id: 102,
        segmentIndex: 1,
        textRaw: '散歩に行きましょう。',
        textFurigana: '散歩に行きましょう。',
        furiganaStatus: 'ok',
        furiganaWarning: null,
        startMs: 3000,
        endMs: 6000,
        studyStatus: 'new',
        sentences: [{ text: '散歩に行きましょう。', start_ms: 3000, end_ms: 6000 }],
      },
    ],
  };
}


function makeDownloadRecord(overrides: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    episodeId: 1,
    status: 'complete',
    step: 'audio',
    guidesCompleted: 2,
    guidesTotal: 2,
    audioBytes: 1000,
    audioTotalBytes: 1000,
    title: 'Episode One',
    podcastSlug: 'my-podcast',
    episodeNumber: 1,
    updatedAt: 1000,
    completedAt: 2000,
    ...overrides,
  };
}

function setPathname(pathname: string): void {
  window.history.replaceState({}, '', pathname);
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('OfflineShell', () => {
  beforeEach(async () => {
    await resetOfflineDbForTests();
    indexedDB.deleteDatabase('kiku-offline');
    setOnline(true);
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    setOnline(true);
    vi.unstubAllGlobals();
    setPathname('/');
  });


  it('renders the downloaded-episodes list at the home route, newest first', async () => {
    await putDownloadRecord(makeDownloadRecord());
    await putDownloadRecord(
      makeDownloadRecord({ episodeId: 2, title: 'Episode Two', episodeNumber: 2, completedAt: 5000 }),
    );
    await putDownloadRecord(
      makeDownloadRecord({ episodeId: 3, title: 'Still Downloading', episodeNumber: 3, status: 'downloading', completedAt: undefined }),
    );
    setPathname('/');

    render(<OfflineShell />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Downloaded episodes' })).toBeInTheDocument();
    });
    const links = screen.getAllByRole('link').filter((el) => el.getAttribute('href')?.includes('/episodes/'));
    expect(links.map((el) => el.getAttribute('href'))).toEqual([
      '/podcasts/my-podcast/episodes/2',
      '/podcasts/my-podcast/episodes/1',
    ]);
    expect(screen.queryByText('Still Downloading')).not.toBeInTheDocument();
  });

  it('shows the offline home empty state when nothing is downloaded', async () => {
    setOnline(false);
    setPathname('/');

    render(<OfflineShell />);

    await waitFor(() => {
      expect(screen.getByText(/no episodes have been downloaded yet/i)).toBeInTheDocument();
    });
  });

  it('shows online-appropriate home empty copy when reached while online', async () => {
    setPathname('/');

    render(<OfflineShell />);

    await waitFor(() => {
      expect(screen.getByText('No downloaded episodes')).toBeInTheDocument();
    });
    expect(screen.queryByText(/you're offline/i)).not.toBeInTheDocument();
  });

  it('renders the transcript for a downloaded episode', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    setPathname('/podcasts/my-podcast/episodes/1');

    render(<OfflineShell />);

    await waitFor(() => expect(screen.getByText('Episode One')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Transcript' })).toBeInTheDocument();
  });

  it('renders the study surface for a downloaded segment', async () => {
    setOnline(false); // force the study-guide loader to read IndexedDB, not the network
    await putEpisodeSnapshot(makeSnapshot());
    await putStudyGuide({ segmentId: 101, content: studyGuide });
    setPathname('/podcasts/my-podcast/episodes/1/segments/0/study');

    render(<OfflineShell />);

    await waitFor(() =>
      expect(
        screen.getByText((_content, element) => element?.textContent === 'Segment 1 of 2'),
      ).toBeInTheDocument(),
    );
  });

  it('shows the offline not-downloaded empty state for an episode absent from IndexedDB', async () => {
    setOnline(false);
    setPathname('/podcasts/my-podcast/episodes/9');

    render(<OfflineShell />);

    await waitFor(() =>
      expect(screen.getByText(/hasn't been downloaded\. reconnect/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });

  it('shows online-appropriate not-downloaded copy when reached while online', async () => {
    // The shell is directly reachable online (bookmark/typed URL); it must not
    // claim the user is offline.
    setPathname('/podcasts/my-podcast/episodes/9');

    render(<OfflineShell />);

    await waitFor(() =>
      expect(screen.getByText(/hasn't been downloaded for offline use/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/nothing to show here/i)).toBeInTheDocument();
    expect(screen.queryByText(/you're offline/i)).toBeNull();
  });

  it('shows the offline unsupported empty state for an off-pattern route', async () => {
    setOnline(false);
    setPathname('/podcasts/my-podcast');

    render(<OfflineShell />);

    await waitFor(() =>
      expect(screen.getByText(/isn't available offline/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });

  it('shows online-appropriate unsupported copy when reached while online', async () => {
    setPathname('/podcasts/my-podcast');

    render(<OfflineShell />);

    await waitFor(() =>
      expect(screen.getByText(/isn't part of the offline experience/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/nothing to show here/i)).toBeInTheDocument();
    expect(screen.queryByText(/you're offline/i)).toBeNull();
  });

  it('shows the not-downloaded state for a segment index beyond the episode', async () => {
    await putEpisodeSnapshot(makeSnapshot());
    setPathname('/podcasts/my-podcast/episodes/1/segments/99/study');

    render(<OfflineShell />);

    await waitFor(() =>
      expect(screen.getByText(/hasn't been downloaded/i)).toBeInTheDocument(),
    );
  });
});
