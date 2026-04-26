import type { ReactNode } from 'react';
import Link from 'next/link';

interface ListItemRowProps {
  href: string;
  children: ReactNode;
  actions?: ReactNode;
}

export default function ListItemRow({ href, children, actions }: ListItemRowProps) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2 transition-colors hover:bg-canvas">
      <Link
        href={href}
        className="flex min-h-12 min-w-0 flex-1 items-center"
      >
        <div className="min-w-0">
          {children}
        </div>
      </Link>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
