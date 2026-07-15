// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SegmentStatusControl from '../SegmentStatusControl';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockMutateWithOutbox = vi.fn();
vi.mock('@/lib/offline/mutateWithOutbox', () => ({
  mutateWithOutbox: (...args: unknown[]) => mockMutateWithOutbox(...args),
}));

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('SegmentStatusControl', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockMutateWithOutbox.mockReset();
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

  it('calls mutateWithOutbox with the new status and refreshes on a synced result', async () => {
    mockMutateWithOutbox.mockResolvedValue({ outcome: 'synced' });

    render(<SegmentStatusControl segmentId={7} initialStatus="new" />);
    const select = screen.getByLabelText('Study status') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'learned' } });

    expect(select.value).toBe('learned'); // optimistic
    await waitFor(() => {
      expect(mockMutateWithOutbox).toHaveBeenCalledWith({
        kind: 'segment-status',
        targetId: 7,
        status: 'learned',
        isOnline: true,
      });
    });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('is enabled while offline', () => {
    setOnline(false);
    render(<SegmentStatusControl segmentId={7} initialStatus="new" />);
    expect(screen.getByLabelText('Study status')).not.toBeDisabled();
  });

  it('an offline change on a downloaded episode keeps the value and shows the will-sync hint', async () => {
    setOnline(false);
    mockMutateWithOutbox.mockResolvedValue({ outcome: 'queued' });

    render(<SegmentStatusControl segmentId={7} initialStatus="new" />);
    const select = screen.getByLabelText('Study status') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'studying' } });

    await waitFor(() => expect(screen.getByText(/will sync when online/i)).toBeInTheDocument());
    expect(select.value).toBe('studying');
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('rolls back and shows an error when mutateWithOutbox throws', async () => {
    mockMutateWithOutbox.mockRejectedValue(new Error('boom'));

    render(<SegmentStatusControl segmentId={7} initialStatus="new" />);
    const select = screen.getByLabelText('Study status') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'studying' } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'));
    expect(select.value).toBe('new'); // rolled back
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
