// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteButton from '../DeleteButton';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

describe('DeleteButton', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockRefresh.mockReset();
    vi.restoreAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('does nothing when the confirmation is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(
      <DeleteButton
        deleteUrl="/api/episodes/5"
        confirmMessage="Delete it?"
        idleLabel="Delete"
        loadingLabel="Deleting…"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('sends a DELETE request and refreshes when no redirect target is provided', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { deleted: true } }),
    } as Response);

    render(
      <DeleteButton
        deleteUrl="/api/episodes/5"
        confirmMessage="Delete it?"
        idleLabel="Delete"
        loadingLabel="Deleting…"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/episodes/5', { method: 'DELETE' }));
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects on success when a redirect target is provided', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { deleted: true } }),
    } as Response);

    render(
      <DeleteButton
        deleteUrl="/api/podcasts/2"
        confirmMessage="Delete it?"
        idleLabel="Delete"
        loadingLabel="Deleting…"
        redirectTo="/"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('shows an inline error and re-enables the button on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Deletion failed' }),
    } as Response);

    render(
      <DeleteButton
        deleteUrl="/api/episodes/5"
        confirmMessage="Delete it?"
        idleLabel="Delete"
        loadingLabel="Deleting…"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('Deletion failed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('stops click propagation so row-level navigation does not fire', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { deleted: true } }),
    } as Response);
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <DeleteButton
          deleteUrl="/api/episodes/5"
          confirmMessage="Delete it?"
          idleLabel="Delete"
          loadingLabel="Deleting…"
        />
      </div>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(parentClick).not.toHaveBeenCalled();
  });
});
