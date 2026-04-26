// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteActionMenu from '../DeleteActionMenu';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

function renderMenu(redirectTo?: string) {
  render(
    <DeleteActionMenu
      ariaLabel="Actions for item"
      deleteUrl="/api/episodes/5"
      confirmMessage="Delete it?"
      menuLabel="Delete episode"
      loadingLabel="Deleting..."
      redirectTo={redirectTo}
    />
  );
}

describe('DeleteActionMenu', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRefresh.mockReset();
    vi.restoreAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('opens the action menu from a compact trigger', async () => {
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Actions for item' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete episode/i })).toBeInTheDocument();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const fetchSpy = vi.spyOn(global, 'fetch');
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Actions for item' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete episode/i }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sends a DELETE request and refreshes when no redirect target is provided', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { deleted: true } }),
    } as Response);
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Actions for item' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete episode/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/episodes/5', { method: 'DELETE' }));
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects on success when a redirect target is provided', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { deleted: true } }),
    } as Response);
    renderMenu('/');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for item' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete episode/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('shows an inline error and re-enables the menu item on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Deletion failed' }),
    } as Response);
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Actions for item' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete episode/i }));

    await waitFor(() => expect(screen.getByText('Deletion failed')).toBeInTheDocument());
    expect(screen.getByRole('menuitem', { name: /delete episode/i })).toBeEnabled();
  });

  it('stops click propagation so row-level navigation does not fire', async () => {
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <DeleteActionMenu
          ariaLabel="Actions for item"
          deleteUrl="/api/episodes/5"
          confirmMessage="Delete it?"
          menuLabel="Delete episode"
          loadingLabel="Deleting..."
        />
      </div>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Actions for item' }));

    expect(parentClick).not.toHaveBeenCalled();
  });
});
