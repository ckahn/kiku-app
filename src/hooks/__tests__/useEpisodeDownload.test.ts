// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUseDownloadRecord = vi.fn();
const mockUseOnlineStatus = vi.fn();
const mockDownloadEpisode = vi.fn();
const mockRemoveDownload = vi.fn();

vi.mock('@/hooks/useDownloadRecord', () => ({
  useDownloadRecord: mockUseDownloadRecord,
}));

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: mockUseOnlineStatus,
}));

vi.mock('@/lib/offline/download', () => ({
  downloadEpisode: mockDownloadEpisode,
}));

vi.mock('@/lib/offline/downloadStore', () => ({
  removeDownload: mockRemoveDownload,
}));

const INPUT = {
  episodeId: 5,
  title: 'Episode Five',
  podcastSlug: 'my-podcast',
  episodeNumber: 5,
};

describe('useEpisodeDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDownloadRecord.mockReturnValue(undefined);
    mockUseOnlineStatus.mockReturnValue(true);
    mockDownloadEpisode.mockResolvedValue({ episodeId: 5, status: 'complete' });
    mockRemoveDownload.mockResolvedValue(undefined);
  });

  it('exposes the record from useDownloadRecord', async () => {
    const record = { episodeId: 5, status: 'complete' };
    mockUseDownloadRecord.mockReturnValue(record);

    const { useEpisodeDownload } = await import('../useEpisodeDownload');
    const { result } = renderHook(() => useEpisodeDownload(INPUT));

    expect(result.current.record).toEqual(record);
  });

  it('start() invokes downloadEpisode with the episode input', async () => {
    const { useEpisodeDownload } = await import('../useEpisodeDownload');
    const { result } = renderHook(() => useEpisodeDownload(INPUT));

    await act(async () => {
      await result.current.start();
    });

    expect(mockDownloadEpisode).toHaveBeenCalledWith(INPUT);
  });

  it('start() is a no-op while offline', async () => {
    mockUseOnlineStatus.mockReturnValue(false);

    const { useEpisodeDownload } = await import('../useEpisodeDownload');
    const { result } = renderHook(() => useEpisodeDownload(INPUT));

    expect(result.current.canStart).toBe(false);
    await act(async () => {
      await result.current.start();
    });

    expect(mockDownloadEpisode).not.toHaveBeenCalled();
  });

  it('isBusy is true while a record is downloading', async () => {
    mockUseDownloadRecord.mockReturnValue({ episodeId: 5, status: 'downloading' });

    const { useEpisodeDownload } = await import('../useEpisodeDownload');
    const { result } = renderHook(() => useEpisodeDownload(INPUT));

    expect(result.current.isBusy).toBe(true);
  });

  it('start() is a no-op while a download is already in flight', async () => {
    mockUseDownloadRecord.mockReturnValue({ episodeId: 5, status: 'downloading' });

    const { useEpisodeDownload } = await import('../useEpisodeDownload');
    const { result } = renderHook(() => useEpisodeDownload(INPUT));

    await act(async () => {
      await result.current.start();
    });

    expect(mockDownloadEpisode).not.toHaveBeenCalled();
  });

  it('remove() invokes removeDownload with the episode id', async () => {
    mockUseDownloadRecord.mockReturnValue({ episodeId: 5, status: 'complete' });

    const { useEpisodeDownload } = await import('../useEpisodeDownload');
    const { result } = renderHook(() => useEpisodeDownload(INPUT));

    await act(async () => {
      await result.current.remove();
    });

    expect(mockRemoveDownload).toHaveBeenCalledWith(5);
  });

  it('surfaces a thrown download error without rejecting', async () => {
    mockDownloadEpisode.mockRejectedValue(new Error('unexpected failure'));

    const { useEpisodeDownload } = await import('../useEpisodeDownload');
    const { result } = renderHook(() => useEpisodeDownload(INPUT));

    await act(async () => {
      await result.current.start();
    });

    expect(mockDownloadEpisode).toHaveBeenCalled();
  });
});
