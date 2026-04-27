// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal isOpen={false} onClose={vi.fn()} title="Test"><p>Content</p></Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog and title when open', () => {
    render(<Modal isOpen onClose={vi.fn()} title="New podcast"><p>Content</p></Modal>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New podcast')).toBeInTheDocument();
  });

  it('renders children when open', () => {
    render(<Modal isOpen onClose={vi.fn()} title="T"><p>Hello world</p></Modal>);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="T"><p>x</p></Modal>);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses a 44px close button touch target', () => {
    render(<Modal isOpen onClose={vi.fn()} title="T"><p>x</p></Modal>);

    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('h-11', 'w-11');
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    const { container } = render(<Modal isOpen onClose={onClose} title="T"><p>x</p></Modal>);
    // The backdrop is the first child div of the outermost div
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('marks the clickable backdrop with a pointer cursor', () => {
    const { container } = render(<Modal isOpen onClose={vi.fn()} title="T"><p>x</p></Modal>);
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;

    expect(backdrop).toHaveClass('cursor-pointer');
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="T"><p>x</p></Modal>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on Escape when closed', async () => {
    const onClose = vi.fn();
    render(<Modal isOpen={false} onClose={onClose} title="T"><p>x</p></Modal>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps focus in an input while typing even when onClose changes on rerender', async () => {
    function ModalWithChangingCloseHandler() {
      const [value, setValue] = useState('');

      return (
        <Modal isOpen onClose={() => undefined} title="Edit">
          <label htmlFor="modal-input">Name</label>
          <input
            id="modal-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Modal>
      );
    }

    render(<ModalWithChangingCloseHandler />);

    const input = screen.getByLabelText('Name');
    await userEvent.click(input);
    await userEvent.type(input, 'New name');

    expect(input).toHaveFocus();
    expect(input).toHaveValue('New name');
  });
});
