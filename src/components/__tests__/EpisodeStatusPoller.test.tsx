// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import EpisodeStatusPoller from '../EpisodeStatusPoller';

const FAST_POLL = 20; // ms — fast enough for tests, avoids fake-timer complexity

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeEpisodeResponse(status: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ success: true, data: { id: 1, status, ...extra } }),
    { status: 200 }
  );
}

function makeProcessResponse() {
  return new Response(
    JSON.stringify({ success: true, data: { status: 'ready' } }),
    { status: 200 }
  );
}

describe('EpisodeStatusPoller', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders transcript immediately when initialStatus is ready', () => {
    render(
      <EpisodeStatusPoller
        episodeId={1}
        initialStatus="ready"
        transcriptText="テスト文章"
      />
    );
    expect(screen.getByText('テスト文章')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows error message immediately when initialStatus is error', () => {
    render(
      <EpisodeStatusPoller
        episodeId={1}
        initialStatus="error"
        errorMessage="Transcription failed"
      />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Transcription failed')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows fallback error when errorMessage is absent', () => {
    render(<EpisodeStatusPoller episodeId={1} initialStatus="error" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Processing failed.')).toBeInTheDocument();
  });

  it('shows a processing indicator while status is uploaded', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('fires POST to /process on mount when status is uploaded', async () => {
    mockFetch
      .mockResolvedValueOnce(makeProcessResponse())
      .mockResolvedValue(makeEpisodeResponse('ready', { transcriptText: '完了' }));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => url === '/api/episodes/1/process' && (init as RequestInit)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
    });
  });

  it('does NOT fire POST to /process when status is transcribing', async () => {
    mockFetch.mockResolvedValue(makeEpisodeResponse('ready', { transcriptText: '完了' }));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="transcribing" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    for (const call of mockFetch.mock.calls) {
      const [url, init] = call as [string, RequestInit | undefined];
      expect(url === '/api/episodes/1/process' && init?.method === 'POST').toBe(false);
    }
  });

  it('displays transcript text when polling detects ready', async () => {
    mockFetch
      .mockResolvedValueOnce(makeProcessResponse())
      .mockResolvedValue(makeEpisodeResponse('ready', { transcriptText: 'テスト完了' }));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      expect(screen.getByText('テスト完了')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('shows error when polling detects error status', async () => {
    mockFetch
      .mockResolvedValueOnce(makeProcessResponse())
      .mockResolvedValue(makeEpisodeResponse('error', { errorMessage: 'Timeout exceeded' }));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Timeout exceeded')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('stops polling once status reaches ready', async () => {
    mockFetch
      .mockResolvedValueOnce(makeProcessResponse())
      .mockResolvedValueOnce(makeEpisodeResponse('transcribing'))
      .mockResolvedValue(makeEpisodeResponse('ready', { transcriptText: '完了' }));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      expect(screen.getByText('完了')).toBeInTheDocument();
    }, { timeout: 2000 });

    const callCountAtReady = mockFetch.mock.calls.length;

    // Wait several more poll intervals — no additional fetches should fire
    await new Promise((r) => setTimeout(r, FAST_POLL * 5));
    expect(mockFetch.mock.calls.length).toBe(callCountAtReady);
  });

  it('does not start polling if unmounted before process fetch resolves', async () => {
    // Simulate Strict Mode: cleanup fires before the async process fetch completes.
    // The cleanedUp flag should prevent the interval from being created.
    let resolveProcess!: (r: Response) => void;
    mockFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveProcess = resolve;
      })
    );

    const { unmount } = render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    unmount();
    resolveProcess(makeProcessResponse()); // resolve after unmount

    // Wait several poll intervals — no GET calls should have been made
    await new Promise((r) => setTimeout(r, FAST_POLL * 5));
    const pollCalls = mockFetch.mock.calls.filter(
      ([url]) => !(url as string).includes('/process')
    );
    expect(pollCalls).toHaveLength(0);
  });
});
