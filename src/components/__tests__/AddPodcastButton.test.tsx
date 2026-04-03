// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddPodcastButton from '../AddPodcastButton';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../PodcastCreateForm', () => ({
  default: ({ onClose }: { onClose?: () => void }) => (
    <button onClick={onClose}>MockForm</button>
  ),
}));

describe('AddPodcastButton', () => {
  it('renders the trigger button', () => {
    render(<AddPodcastButton />);
    expect(screen.getByRole('button', { name: '+ New podcast' })).toBeInTheDocument();
  });

  it('modal is not visible initially', () => {
    render(<AddPodcastButton />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens modal when trigger is clicked', async () => {
    render(<AddPodcastButton />);
    await userEvent.click(screen.getByRole('button', { name: '+ New podcast' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New podcast')).toBeInTheDocument();
  });

  it('closes modal when onClose is called', async () => {
    render(<AddPodcastButton />);
    await userEvent.click(screen.getByRole('button', { name: '+ New podcast' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // MockForm's button calls onClose
    await userEvent.click(screen.getByRole('button', { name: 'MockForm' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes modal via the modal close button', async () => {
    render(<AddPodcastButton />);
    await userEvent.click(screen.getByRole('button', { name: '+ New podcast' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
