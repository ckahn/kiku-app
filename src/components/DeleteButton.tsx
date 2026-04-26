'use client';

import type { MouseEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface DeleteButtonProps {
  deleteUrl: string;
  confirmMessage: string;
  idleLabel: string;
  loadingLabel: string;
  redirectTo?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  align?: 'start' | 'end';
}

interface DeleteResponse {
  error?: string;
}

export default function DeleteButton({
  deleteUrl,
  confirmMessage,
  idleLabel,
  loadingLabel,
  redirectTo,
  variant = 'ghost',
  size = 'sm',
  className = '',
  align = 'end',
}: DeleteButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    setError(null);
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(deleteUrl, { method: 'DELETE' });
      const data: DeleteResponse = await response.json().catch(() => ({} as DeleteResponse));

      if (!response.ok) {
        throw new Error(data.error ?? `Delete failed (${response.status})`);
      }

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

  const alignmentClassName = align === 'start' ? 'items-start' : 'items-end';

  return (
    <div className={`flex flex-col gap-1 ${alignmentClassName}`}>
      <Button
        type="button"
        variant={variant}
        size={size}
        loading={loading}
        onClick={handleClick}
        className={className}
      >
        {loading ? loadingLabel : idleLabel}
      </Button>
      {error && (
        <p className="max-w-56 text-xs text-error-on-subtle">
          {error}
        </p>
      )}
    </div>
  );
}
