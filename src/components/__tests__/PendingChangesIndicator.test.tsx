// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUseOutboxState = vi.fn();
const mockRetry = vi.fn();
const mockAcknowledgeError = vi.fn();

vi.mock('@/hooks/useOutbox', () => ({
  useOutboxState: () => mockUseOutboxState(),
}));

vi.mock('@/lib/offline/outboxStore', () => ({
  retry: (...args: unknown[]) => mockRetry(...args),
  acknowledgeError: (...args: unknown[]) => mockAcknowledgeError(...args),
}));

// Imported after the mocks so the component picks up the mocked modules.
import PendingChangesIndicator from '../PendingChangesIndicator';

describe('PendingChangesIndicator', () => {
  beforeEach(() => {
    mockRetry.mockResolvedValue(undefined);
  });

  afterEach(() => {
    mockUseOutboxState.mockReset();
    mockRetry.mockReset();
    mockAcknowledgeError.mockReset();
  });

  it('renders nothing when there are no pending changes and no error', () => {
    mockUseOutboxState.mockReturnValue({ count: 0, error: null });
    const { container } = render(<PendingChangesIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the singular count message', () => {
    mockUseOutboxState.mockReturnValue({ count: 1, error: null });
    render(<PendingChangesIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('1 change waiting to sync');
  });

  it('renders the plural count message', () => {
    mockUseOutboxState.mockReturnValue({ count: 3, error: null });
    render(<PendingChangesIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('3 changes waiting to sync');
  });

  it('renders the error text when a replay failed permanently', () => {
    mockUseOutboxState.mockReturnValue({ count: 0, error: "A change couldn't be synced and was discarded." });
    render(<PendingChangesIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(
      "A change couldn't be synced and was discarded."
    );
  });

  it('renders both the count and the error when both are present', () => {
    mockUseOutboxState.mockReturnValue({ count: 2, error: 'One change was discarded.' });
    render(<PendingChangesIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('2 changes waiting to sync');
    expect(status).toHaveTextContent('One change was discarded.');
  });

  it('shows a Retry now action when changes are pending and triggers a manual drain', async () => {
    mockUseOutboxState.mockReturnValue({ count: 2, error: null });
    render(<PendingChangesIndicator />);

    const retryButton = screen.getByRole('button', { name: /retry now/i });
    await userEvent.click(retryButton);

    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the Retry now action when nothing is queued', () => {
    mockUseOutboxState.mockReturnValue({ count: 0, error: 'boom' });
    render(<PendingChangesIndicator />);

    expect(screen.queryByRole('button', { name: /retry now/i })).not.toBeInTheDocument();
  });

  it('shows a dismiss action for the error and acknowledges it on click', async () => {
    mockUseOutboxState.mockReturnValue({ count: 0, error: 'boom' });
    render(<PendingChangesIndicator />);

    const dismissButton = screen.getByRole('button', { name: /dismiss sync error/i });
    await userEvent.click(dismissButton);

    expect(mockAcknowledgeError).toHaveBeenCalledTimes(1);
  });

  it('hides the dismiss action when there is no error', () => {
    mockUseOutboxState.mockReturnValue({ count: 2, error: null });
    render(<PendingChangesIndicator />);

    expect(screen.queryByRole('button', { name: /dismiss sync error/i })).not.toBeInTheDocument();
  });
});
