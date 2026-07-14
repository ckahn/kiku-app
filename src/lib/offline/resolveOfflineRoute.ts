/**
 * Pure pathname parser for the offline app-shell (M3). The service worker
 * serves the precached `/offline` document for offline navigations, but the
 * browser keeps the *requested* URL — so the shell reads
 * `window.location.pathname` and resolves it against the two study routes:
 *
 *   /podcasts/:slug/episodes/:number
 *   /podcasts/:slug/episodes/:number/segments/:segmentIndex/study
 *
 * Anything else is `unsupported` (handled by the shell's honest empty state).
 * Validation mirrors the RSC study page: episode numbers are positive
 * integers, segment indices are non-negative integers.
 */

export type OfflineRoute =
  | { readonly kind: 'episode'; readonly slug: string; readonly episodeNumber: number }
  | {
      readonly kind: 'study';
      readonly slug: string;
      readonly episodeNumber: number;
      readonly segmentIndex: number;
    }
  | { readonly kind: 'unsupported' };

const UNSUPPORTED: OfflineRoute = { kind: 'unsupported' };

/** Parse a non-negative integer written in plain decimal digits, else null. */
function parseIndex(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

export function resolveOfflineRoute(pathname: string): OfflineRoute {
  const parts = pathname.split('/').filter((part) => part.length > 0);

  // /podcasts/:slug/episodes/:number
  if (
    parts.length === 4 &&
    parts[0] === 'podcasts' &&
    parts[2] === 'episodes'
  ) {
    const slug = parts[1];
    const episodeNumber = parseIndex(parts[3]);
    if (episodeNumber === null || episodeNumber < 1) return UNSUPPORTED;
    return { kind: 'episode', slug, episodeNumber };
  }

  // /podcasts/:slug/episodes/:number/segments/:segmentIndex/study
  if (
    parts.length === 7 &&
    parts[0] === 'podcasts' &&
    parts[2] === 'episodes' &&
    parts[4] === 'segments' &&
    parts[6] === 'study'
  ) {
    const slug = parts[1];
    const episodeNumber = parseIndex(parts[3]);
    const segmentIndex = parseIndex(parts[5]);
    if (episodeNumber === null || episodeNumber < 1) return UNSUPPORTED;
    if (segmentIndex === null) return UNSUPPORTED;
    return { kind: 'study', slug, episodeNumber, segmentIndex };
  }

  return UNSUPPORTED;
}
