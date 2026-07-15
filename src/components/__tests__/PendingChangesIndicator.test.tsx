// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUseOutboxState = vi.fn();

vi.mock('@/hooks/useOutbox', () => ({
  useOutboxState: () => mockUseOutboxState(),
}));

// Imported after the mock so the component picks up the mocked hook.
import PendingChangesIndicator from '../PendingChangesIndicator';

describe('PendingChangesIndicator', () => {
  afterEach(() => {
    mockUseOutboxState.mockReset();
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
});
