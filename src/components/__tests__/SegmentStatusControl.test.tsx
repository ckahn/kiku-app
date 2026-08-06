// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SegmentStatusControl from '../SegmentStatusControl';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('SegmentStatusControl', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    vi.restoreAllMocks();
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('renders the current status as the selected option', () => {
    render(<SegmentStatusControl segmentId={7} initialStatus="studying" />);
    const select = screen.getByLabelText('Study status') as HTMLSelectElement;
    expect(select.value).toBe('studying');
  });

  it('PATCHes the new status and refreshes on change', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<SegmentStatusControl segmentId={7} initialStatus="new" />);
    const select = screen.getByLabelText('Study status') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'learned' } });

    expect(select.value).toBe('learned'); // optimistic
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/segments/7/study', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ studyStatus: 'learned' }),
      }));
    });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('disables the status select while offline', () => {
    setOnline(false);
    render(<SegmentStatusControl segmentId={7} initialStatus="new" />);
    expect(screen.getByLabelText('Study status')).toBeDisabled();
  });

  it('rolls back and shows an error when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SegmentStatusControl segmentId={7} initialStatus="new" />);
    const select = screen.getByLabelText('Study status') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'studying' } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'));
    expect(select.value).toBe('new'); // rolled back
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
