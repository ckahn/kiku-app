// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddEpisodeButton from '../AddEpisodeButton';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../EpisodeUploadForm', () => ({
  default: ({ onClose }: { onClose?: () => void }) => (
    <button onClick={onClose}>MockForm</button>
  ),
}));

describe('AddEpisodeButton', () => {
  it('renders the trigger button', () => {
    render(<AddEpisodeButton podcastId="1" podcastSlug="my-show" />);
    expect(screen.getByRole('button', { name: '+ New episode' })).toBeInTheDocument();
  });

  it('modal is not visible initially', () => {
    render(<AddEpisodeButton podcastId="1" podcastSlug="my-show" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens modal when trigger is clicked', async () => {
    render(<AddEpisodeButton podcastId="1" podcastSlug="my-show" />);
    await userEvent.click(screen.getByRole('button', { name: '+ New episode' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New episode')).toBeInTheDocument();
  });

  it('closes modal when onClose is called', async () => {
    render(<AddEpisodeButton podcastId="1" podcastSlug="my-show" />);
    await userEvent.click(screen.getByRole('button', { name: '+ New episode' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // MockForm's button calls onClose
    await userEvent.click(screen.getByRole('button', { name: 'MockForm' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes modal via the modal close button', async () => {
    render(<AddEpisodeButton podcastId="1" podcastSlug="my-show" />);
    await userEvent.click(screen.getByRole('button', { name: '+ New episode' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
