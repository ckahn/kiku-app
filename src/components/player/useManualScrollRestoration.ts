'use client';

import { useEffect } from 'react';

export function useManualScrollRestoration(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || !('scrollRestoration' in window.history)) {
      return;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);
}
