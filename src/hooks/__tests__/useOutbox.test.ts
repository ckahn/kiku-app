// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSubscribe = vi.fn();
const mockGetStateSnapshot = vi.fn();
const mockEnsureOutboxInitialized = vi.fn();

vi.mock('@/lib/offline/outboxStore', () => ({
  subscribe: mockSubscribe,
  getStateSnapshot: mockGetStateSnapshot,
  ensureOutboxInitialized: mockEnsureOutboxInitialized,
}));

describe('useOutboxState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureOutboxInitialized.mockResolvedValue(undefined);
    mockSubscribe.mockImplementation(() => () => {});
    mockGetStateSnapshot.mockReturnValue({ count: 0, error: null });
  });

  it('calls ensureOutboxInitialized on mount', async () => {
    const { useOutboxState } = await import('../useOutbox');
    renderHook(() => useOutboxState());

    expect(mockEnsureOutboxInitialized).toHaveBeenCalledTimes(1);
  });

  it('returns the store snapshot', async () => {
    mockGetStateSnapshot.mockReturnValue({ count: 3, error: null });

    const { useOutboxState } = await import('../useOutbox');
    const { result } = renderHook(() => useOutboxState());

    expect(result.current).toEqual({ count: 3, error: null });
  });

  it('re-renders when the store notifies subscribers', async () => {
    let notify: () => void = () => {};
    mockSubscribe.mockImplementation((listener: () => void) => {
      notify = listener;
      return () => {};
    });

    let current = { count: 0, error: null as string | null };
    mockGetStateSnapshot.mockImplementation(() => current);

    const { useOutboxState } = await import('../useOutbox');
    const { result } = renderHook(() => useOutboxState());

    expect(result.current).toEqual({ count: 0, error: null });

    current = { count: 1, error: null };
    act(() => {
      notify();
    });

    expect(result.current).toEqual({ count: 1, error: null });
  });

  it('unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribe);

    const { useOutboxState } = await import('../useOutbox');
    const { unmount } = renderHook(() => useOutboxState());
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
