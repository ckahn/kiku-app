import Link from 'next/link';

interface PageShellProps {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

export default function PageShell({ children, backHref, backLabel = 'Back' }: PageShellProps) {
  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-6 sm:px-6">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink transition-colors mb-6"
        >
          ← {backLabel}
        </Link>
      )}
      {children}
    </main>
  );
}
