// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PodcastCreateForm from '../PodcastCreateForm';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('PodcastCreateForm', () => {
  beforeEach(() => {
    mockPush.mockReset();
    vi.restoreAllMocks();
  });

  it('renders name and description inputs', () => {
    render(<PodcastCreateForm />);
    expect(screen.getByPlaceholderText('Podcast name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Description (optional)')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    render(<PodcastCreateForm />);
    expect(screen.getByRole('button', { name: 'Add podcast' })).toBeInTheDocument();
  });

  it('navigates to new podcast and calls onClose on success', async () => {
    const onClose = vi.fn();
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { slug: 'my-show' } }),
    } as Response);

    render(<PodcastCreateForm onClose={onClose} />);
    await userEvent.type(screen.getByPlaceholderText('Podcast name'), 'My Show');
    await userEvent.click(screen.getByRole('button', { name: 'Add podcast' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/podcasts/my-show'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows error message on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Name already taken' }),
    } as Response);

    render(<PodcastCreateForm />);
    await userEvent.type(screen.getByPlaceholderText('Podcast name'), 'Duplicate');
    await userEvent.click(screen.getByRole('button', { name: 'Add podcast' }));

    await waitFor(() => expect(screen.getByText('Name already taken')).toBeInTheDocument());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows fallback error when response has no error field', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);

    render(<PodcastCreateForm />);
    await userEvent.type(screen.getByPlaceholderText('Podcast name'), 'Test');
    await userEvent.click(screen.getByRole('button', { name: 'Add podcast' }));

    await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeInTheDocument());
  });

  it('works without onClose prop', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { slug: 'solo' } }),
    } as Response);

    render(<PodcastCreateForm />);
    await userEvent.type(screen.getByPlaceholderText('Podcast name'), 'Solo');
    await userEvent.click(screen.getByRole('button', { name: 'Add podcast' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/podcasts/solo'));
  });
});
