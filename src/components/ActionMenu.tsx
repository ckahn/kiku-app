'use client';

import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

interface ActionMenuRenderProps {
  closeMenu: () => void;
}

interface ActionMenuProps {
  ariaLabel: string;
  children: (props: ActionMenuRenderProps) => ReactNode;
}

export default function ActionMenu({ ariaLabel, children }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleTriggerClick(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    setOpen((current) => !current);
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleTriggerClick}
        className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-md border border-border bg-surface p-1 shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          {children({ closeMenu: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}
