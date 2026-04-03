// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>ready</Badge>);
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  it('applies neutral variant by default', () => {
    render(<Badge>neutral</Badge>);
    expect(screen.getByText('neutral').className).toContain('bg-canvas');
  });

  it('applies info variant classes', () => {
    render(<Badge variant="info">uploaded</Badge>);
    const el = screen.getByText('uploaded');
    expect(el.className).toContain('bg-info-subtle');
    expect(el.className).toContain('text-info-on-subtle');
  });

  it('applies warning variant classes', () => {
    render(<Badge variant="warning">transcribing</Badge>);
    const el = screen.getByText('transcribing');
    expect(el.className).toContain('bg-warning-subtle');
    expect(el.className).toContain('text-warning-on-subtle');
  });

  it('applies success variant classes', () => {
    render(<Badge variant="success">ready</Badge>);
    const el = screen.getByText('ready');
    expect(el.className).toContain('bg-success-subtle');
    expect(el.className).toContain('text-success-on-subtle');
  });

  it('applies error variant classes', () => {
    render(<Badge variant="error">error</Badge>);
    const el = screen.getByText('error');
    expect(el.className).toContain('bg-error-subtle');
    expect(el.className).toContain('text-error-on-subtle');
  });

  it('merges custom className', () => {
    render(<Badge className="my-extra">text</Badge>);
    expect(screen.getByText('text').className).toContain('my-extra');
  });
});
