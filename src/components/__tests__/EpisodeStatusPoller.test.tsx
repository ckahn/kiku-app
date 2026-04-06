// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import EpisodeStatusPoller from '../EpisodeStatusPoller';

const FAST_POLL = 20; // ms — fast enough for tests, avoids fake-timer complexity
const FAST_STALL = 1;  // ms — fires on the very first poll

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeEpisodeResponse(status: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ success: true, data: { id: 1, status, ...extra } }),
    { status: 200 }
  );
}

function makeTranscribeResponse() {
  return new Response(
    JSON.stringify({ success: true, data: { status: 'chunking' } }),
    { status: 200 }
  );
}

describe('EpisodeStatusPoller', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockRefresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a processing indicator while status is uploaded', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows "Transcribing…" while status is transcribing', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="transcribing" pollIntervalMs={FAST_POLL} />
    );
    expect(screen.getByText('Transcribing…')).toBeInTheDocument();
  });

  it('shows "Chunking…" while status is chunking', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="chunking" pollIntervalMs={FAST_POLL} />
    );
    expect(screen.getByText('Chunking…')).toBeInTheDocument();
  });

  it('fires POST to /transcribe on mount when status is uploaded', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTranscribeResponse())
      .mockResolvedValue(makeEpisodeResponse('ready'));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => url === '/api/episodes/1/transcribe' && (init as RequestInit)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
    });
  });

  it('does NOT fire POST to /transcribe when status is transcribing', async () => {
    mockFetch.mockResolvedValue(makeEpisodeResponse('ready'));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="transcribing" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    for (const call of mockFetch.mock.calls) {
      const [url, init] = call as [string, RequestInit | undefined];
      expect(url === '/api/episodes/1/transcribe' && init?.method === 'POST').toBe(false);
    }
  });

  it('fires POST to /chunk when polling detects status change to chunking', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTranscribeResponse())      // POST /transcribe
      .mockResolvedValueOnce(makeEpisodeResponse('transcribing'))
      .mockResolvedValueOnce(makeEpisodeResponse('chunking'))
      .mockResolvedValue(makeEpisodeResponse('ready'));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      const chunkCall = mockFetch.mock.calls.find(
        ([url, init]) => url === '/api/episodes/1/chunk' && (init as RequestInit)?.method === 'POST'
      );
      expect(chunkCall).toBeDefined();
    }, { timeout: 2000 });
  });

  it('fires POST to /chunk only once even if multiple polls return chunking', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTranscribeResponse())      // POST /transcribe
      .mockResolvedValueOnce(makeEpisodeResponse('chunking'))
      .mockResolvedValueOnce(makeEpisodeResponse('chunking'))
      .mockResolvedValueOnce(makeEpisodeResponse('chunking'))
      .mockResolvedValue(makeEpisodeResponse('ready'));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled(), { timeout: 2000 });

    const chunkCalls = mockFetch.mock.calls.filter(
      ([url, init]) => url === '/api/episodes/1/chunk' && (init as RequestInit)?.method === 'POST'
    );
    expect(chunkCalls).toHaveLength(1);
  });

  it('also fires /chunk when initial status is already chunking', async () => {
    mockFetch
      .mockResolvedValueOnce(makeEpisodeResponse('chunking'))
      .mockResolvedValue(makeEpisodeResponse('ready'));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="chunking" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      const chunkCall = mockFetch.mock.calls.find(
        ([url, init]) => url === '/api/episodes/1/chunk' && (init as RequestInit)?.method === 'POST'
      );
      expect(chunkCall).toBeDefined();
    }, { timeout: 2000 });
  });

  it('shows stall message after stallTimeoutMs with no status change', async () => {
    mockFetch.mockResolvedValue(makeEpisodeResponse('transcribing'));

    render(
      <EpisodeStatusPoller
        episodeId={1}
        initialStatus="transcribing"
        pollIntervalMs={FAST_POLL}
        stallTimeoutMs={FAST_STALL}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('stall message names the transcription stage', async () => {
    mockFetch.mockResolvedValue(makeEpisodeResponse('transcribing'));

    render(
      <EpisodeStatusPoller
        episodeId={1}
        initialStatus="transcribing"
        pollIntervalMs={FAST_POLL}
        stallTimeoutMs={FAST_STALL}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/transcription/i);
    }, { timeout: 2000 });
  });

  it('stall message names the chunking stage', async () => {
    mockFetch.mockResolvedValue(makeEpisodeResponse('chunking'));

    render(
      <EpisodeStatusPoller
        episodeId={1}
        initialStatus="chunking"
        pollIntervalMs={FAST_POLL}
        stallTimeoutMs={FAST_STALL}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/chunking/i);
    }, { timeout: 2000 });
  });

  it('stops polling once stalled', async () => {
    mockFetch.mockResolvedValue(makeEpisodeResponse('transcribing'));

    render(
      <EpisodeStatusPoller
        episodeId={1}
        initialStatus="transcribing"
        pollIntervalMs={FAST_POLL}
        stallTimeoutMs={FAST_STALL}
      />
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });

    const callCountAtStall = mockFetch.mock.calls.length;
    await new Promise((r) => setTimeout(r, FAST_POLL * 5));
    expect(mockFetch.mock.calls.length).toBe(callCountAtStall);
  });

  it('calls router.refresh() when polling detects ready', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTranscribeResponse())
      .mockResolvedValue(makeEpisodeResponse('ready'));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('calls router.refresh() when polling detects error status', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTranscribeResponse())
      .mockResolvedValue(makeEpisodeResponse('error', { errorMessage: 'Timeout exceeded' }));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('stops polling once status reaches ready', async () => {
    mockFetch
      .mockResolvedValueOnce(makeTranscribeResponse())
      .mockResolvedValueOnce(makeEpisodeResponse('transcribing'))
      .mockResolvedValue(makeEpisodeResponse('ready'));

    render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    }, { timeout: 2000 });

    const callCountAtReady = mockFetch.mock.calls.length;

    // Wait several more poll intervals — no additional fetches should fire
    await new Promise((r) => setTimeout(r, FAST_POLL * 5));
    expect(mockFetch.mock.calls.length).toBe(callCountAtReady);
  });

  it('does not start polling if unmounted before transcribe fetch resolves', async () => {
    let resolveTranscribe!: (r: Response) => void;
    mockFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveTranscribe = resolve;
      })
    );

    const { unmount } = render(
      <EpisodeStatusPoller episodeId={1} initialStatus="uploaded" pollIntervalMs={FAST_POLL} />
    );

    unmount();
    resolveTranscribe(makeTranscribeResponse()); // resolve after unmount

    // Wait several poll intervals — no GET calls should have been made
    await new Promise((r) => setTimeout(r, FAST_POLL * 5));
    const pollCalls = mockFetch.mock.calls.filter(
      ([url]) => !(url as string).includes('/transcribe')
    );
    expect(pollCalls).toHaveLength(0);
  });
});
