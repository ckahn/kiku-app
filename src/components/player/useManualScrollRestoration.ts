'use client';

import { useEffect } from 'react';

// We need this to prevent the browser from automatically scrolling to the top
// of the page when the user scrolls up and then refreshes (e.g., mobile refresh
// via drag-down gesture).
//
// The browser's default behavior is to scroll to the top of the page when the
// user refreshes the page. But for episode details page, we want to keep the
// last selected segment in view.
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
