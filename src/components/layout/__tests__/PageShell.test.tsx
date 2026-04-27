// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageShell from '../PageShell';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => <a href={href} className={className}>{children}</a>,
}));

describe('PageShell', () => {
  it('renders back link with a 44px pointer target', () => {
    render(
      <PageShell backHref="/" backLabel="Library">
        <p>Content</p>
      </PageShell>
    );

    expect(screen.getByRole('link', { name: /library/i })).toHaveClass(
      'min-h-11',
      'min-w-11',
      'cursor-pointer'
    );
  });
});
