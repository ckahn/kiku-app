import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheableResponsePlugin, CacheFirst, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import { isAudioRoute, isNavigationRequest, isStudyGuideRoute } from "@/lib/sw-routes";
import { AUDIO_CACHE_NAME, OFFLINE_SHELL_URL } from "@/lib/offline/constants";

// Ambient augmentation for the precache manifest that @serwist/next injects into this file at
// build time (via the `self.__SW_MANIFEST` injection point).
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  {
    // Audio blobs, served once per episode and replayed many times via the Web Audio engine
    // (see src/lib/audio/audioEngine.ts) — CacheFirst so repeat visits never re-fetch.
    // sameOrigin guard: the router runs matchers against every fetch from a controlled
    // client, cross-origin included — without it a request to any host whose path looks
    // like ours would be cached here.
    matcher: ({ url, sameOrigin }) => sameOrigin && isAudioRoute(url.pathname),
    method: "GET",
    handler: new CacheFirst({
      cacheName: AUDIO_CACHE_NAME,
      plugins: [
        // Only cache full (200) responses. The audio route can serve 206 Partial Content
        // for byte-range requests; caching a partial response would corrupt offline
        // playback (the decode-once AudioEngine expects the complete file). No
        // ExpirationPlugin here — this cache is intentionally unbounded. M2's download
        // registry owns eviction; an LRU cap here would silently evict episodes the user
        // explicitly downloaded for offline use.
        new CacheableResponsePlugin({ statuses: [200] }),
      ],
    }),
  },
  {
    // Study guides are lazy-generated and can change server-side (regeneration), so prefer
    // the network, but fall back to cache quickly when offline/slow rather than hanging.
    matcher: ({ url, sameOrigin }) => sameOrigin && isStudyGuideRoute(url.pathname),
    method: "GET",
    handler: new NetworkFirst({
      cacheName: "kiku-study-guides",
      networkTimeoutSeconds: 4,
    }),
  },
  {
    // App Router document navigations. Online this is a plain pass-through to
    // the real page (RSC/SSR unaffected). Offline the NetworkOnly strategy
    // errors, and the PrecacheFallbackPlugin that the `fallbacks` option below
    // attaches to every runtime strategy serves the precached /offline shell
    // (see the `offline-support` skill / D1). The shell then reads the
    // requested URL and hydrates from IndexedDB.
    matcher: ({ request, sameOrigin }) => sameOrigin && isNavigationRequest(request),
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching,
  // When a runtime strategy errors (offline navigation), serve the precached
  // /offline shell for document navigations. The shell must be precached for
  // this to resolve — next.config.ts adds it via `additionalPrecacheEntries`.
  fallbacks: {
    entries: [
      {
        url: OFFLINE_SHELL_URL,
        matcher: ({ request }) => isNavigationRequest(request),
      },
    ],
  },
});

serwist.addEventListeners();
