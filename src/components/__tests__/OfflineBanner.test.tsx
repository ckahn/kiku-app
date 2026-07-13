// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUseOnlineStatus = vi.fn();

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}));

// Imported after the mock so the component picks up the mocked hook.
import OfflineBanner from '../OfflineBanner';

describe('OfflineBanner', () => {
  afterEach(() => {
    mockUseOnlineStatus.mockReset();
  });

  it('renders nothing when online', () => {
    mockUseOnlineStatus.mockReturnValue(true);
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a banner when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });
});
