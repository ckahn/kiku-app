/**
 * Runtime-caching route matchers for the service worker (src/app/sw.ts).
 *
 * Pulled into a plain module (rather than left as inline regexes in sw.ts) so they can be
 * unit-tested without instantiating a Serwist/ServiceWorkerGlobalScope instance.
 */

// Matches GET /api/episodes/<id>/audio exactly — not sub-paths, not query-string-only variants.
export const AUDIO_ROUTE_RE = /^\/api\/episodes\/[^/]+\/audio$/;

// Matches GET /api/segments/<id>/study-guide exactly. Must NOT match
// /api/segments/<id>/study-guide/regenerate (a POST-only route with different caching needs).
export const STUDY_GUIDE_ROUTE_RE = /^\/api\/segments\/[^/]+\/study-guide$/;

export function isAudioRoute(pathname: string): boolean {
  return AUDIO_ROUTE_RE.test(pathname);
}

export function isStudyGuideRoute(pathname: string): boolean {
  return STUDY_GUIDE_ROUTE_RE.test(pathname);
}
