// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Input from '../Input';

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(<Input label="Podcast name" />);
    expect(screen.getByLabelText('Podcast name')).toBeInTheDocument();
    expect(screen.getByText('Podcast name')).toBeInTheDocument();
  });

  it('associates label with input via id', () => {
    render(<Input label="Episode title" />);
    const input = screen.getByLabelText('Episode title');
    expect(input.id).toBe('episode-title');
  });

  it('uses explicit id over generated one', () => {
    render(<Input label="Episode title" id="my-id" />);
    expect(screen.getByRole('textbox').id).toBe('my-id');
  });

  it('renders error message when provided', () => {
    render(<Input error="This field is required" />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('applies error border class when error is set', () => {
    render(<Input error="Oops" />);
    expect(screen.getByRole('textbox').className).toContain('border-error-subtle');
  });

  it('applies normal border class when no error', () => {
    render(<Input />);
    expect(screen.getByRole('textbox').className).toContain('border-border');
  });

  it('passes through input HTML props', () => {
    render(<Input placeholder="Type here" required />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Type here');
    expect(input).toBeRequired();
  });

  it('merges custom className', () => {
    render(<Input className="w-full" />);
    expect(screen.getByRole('textbox').className).toContain('w-full');
  });
});
