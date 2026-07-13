// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSubscribe = vi.fn();
const mockGetSnapshot = vi.fn();
const mockEnsureInitialized = vi.fn();

vi.mock('@/lib/offline/downloadStore', () => ({
  subscribe: mockSubscribe,
  getSnapshot: mockGetSnapshot,
  ensureInitialized: mockEnsureInitialized,
}));

describe('useDownloadRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureInitialized.mockResolvedValue(undefined);
    mockSubscribe.mockImplementation(() => () => {});
    mockGetSnapshot.mockReturnValue(undefined);
  });

  it('calls ensureInitialized on mount', async () => {
    const { useDownloadRecord } = await import('../useDownloadRecord');
    renderHook(() => useDownloadRecord(1));

    expect(mockEnsureInitialized).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the store has no record for the episode', async () => {
    const { useDownloadRecord } = await import('../useDownloadRecord');
    mockGetSnapshot.mockReturnValue(undefined);

    const { result } = renderHook(() => useDownloadRecord(1));

    expect(result.current).toBeUndefined();
  });

  it('returns the record the store provides for that episode id', async () => {
    const record = { episodeId: 2, status: 'downloading' as const };
    mockGetSnapshot.mockImplementation((episodeId: number) =>
      episodeId === 2 ? record : undefined
    );

    const { useDownloadRecord } = await import('../useDownloadRecord');
    const { result } = renderHook(() => useDownloadRecord(2));

    expect(result.current).toEqual(record);
  });

  it('re-renders when the store notifies subscribers', async () => {
    let notify: () => void = () => {};
    mockSubscribe.mockImplementation((listener: () => void) => {
      notify = listener;
      return () => {};
    });

    let current: { episodeId: number; status: string } | undefined = undefined;
    mockGetSnapshot.mockImplementation(() => current);

    const { useDownloadRecord } = await import('../useDownloadRecord');
    const { result } = renderHook(() => useDownloadRecord(3));

    expect(result.current).toBeUndefined();

    current = { episodeId: 3, status: 'complete' };
    act(() => {
      notify();
    });

    expect(result.current).toEqual(current);
  });

  it('unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribe);

    const { useDownloadRecord } = await import('../useDownloadRecord');
    const { unmount } = renderHook(() => useDownloadRecord(4));
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
