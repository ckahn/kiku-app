'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import ActionMenu from '@/components/ActionMenu';

interface DeleteActionMenuProps {
  ariaLabel: string;
  deleteUrl: string;
  confirmMessage: string;
  menuLabel: string;
  loadingLabel: string;
  redirectTo?: string;
}

interface DeleteResponse {
  error?: string;
}

export default function DeleteActionMenu({
  ariaLabel,
  deleteUrl,
  confirmMessage,
  menuLabel,
  loadingLabel,
  redirectTo,
}: DeleteActionMenuProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(closeMenu: () => void): Promise<void> {
    setError(null);
    if (!window.confirm(confirmMessage)) {
      closeMenu();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(deleteUrl, { method: 'DELETE' });
      const data: DeleteResponse = await response.json().catch(() => ({} as DeleteResponse));

      if (!response.ok) {
        throw new Error(data.error ?? `Delete failed (${response.status})`);
      }

      closeMenu();
      if (redirectTo) {
        router.push(redirectTo);
        return;
      }

      router.refresh();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ActionMenu ariaLabel={ariaLabel}>
      {({ closeMenu }) => (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={loading}
            onClick={() => void handleDelete(closeMenu)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-error-on-subtle transition-colors hover:bg-error-subtle disabled:opacity-50"
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>{loading ? loadingLabel : menuLabel}</span>
          </button>
          {error && (
            <p className="px-3 pb-2 pt-1 text-xs text-error-on-subtle">
              {error}
            </p>
          )}
        </>
      )}
    </ActionMenu>
  );
}
