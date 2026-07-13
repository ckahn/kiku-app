import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheableResponsePlugin, CacheFirst, NetworkFirst, Serwist } from "serwist";
import { isAudioRoute, isStudyGuideRoute } from "@/lib/sw-routes";

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
      cacheName: "kiku-audio",
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
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching,
});

serwist.addEventListeners();
