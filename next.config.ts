import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { OFFLINE_SHELL_URL } from "./src/lib/offline/constants";

// Passing `additionalPrecacheEntries` to @serwist/next REPLACES its default
// public-folder scan (which precaches e.g. public/soundtouch-processor.js — the
// pitch-correction worklet that offline speed control needs). To add the
// /offline shell without dropping those, replicate that scan here: glob the
// public dir (minus the generated worker outputs Serwist itself excludes) and
// hash each file for its revision, exactly as the default does.
function publicFolderPrecacheEntries(): { url: string; revision: string }[] {
  const publicDir = path.join(process.cwd(), "public");
  const isGeneratedWorker = (url: string) =>
    /^\/sw\.js(\.map)?$/.test(url) || /^\/swe-worker-.*\.js$/.test(url);

  return (readdirSync(publicDir, { recursive: true }) as string[])
    .map((rel) => ({ rel, abs: path.join(publicDir, rel) }))
    .filter(({ abs }) => statSync(abs).isFile())
    .map(({ rel, abs }) => ({ url: `/${rel.split(path.sep).join("/")}`, abs }))
    .filter(({ url }) => !isGeneratedWorker(url))
    .map(({ url, abs }) => ({
      url,
      revision: createHash("md5").update(readFileSync(abs)).digest("hex"),
    }));
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  // The segment route loads kuromoji's IPADIC dictionary from disk at runtime via a dynamic
  // dicPath, which Next's output file tracing cannot detect statically. Force the dictionary
  // files into that function's serverless bundle so they exist on Vercel. resolveDicPath() in
  // src/lib/api/furigana-tokenizer.ts reads them from process.cwd()/node_modules/kuromoji/dict.
  // NOTE: keys are globs — "[id]" would be read as a character class, so match the dynamic
  // segment with "*" instead.
  outputFileTracingIncludes: {
    "/api/episodes/*/segment": ["./node_modules/kuromoji/dict/**/*"],
  },
};

const isDevelopment = process.env.NODE_ENV === "development";

// Serwist's precache-manifest injection (__SW_MANIFEST) is a webpack plugin, but Next 16 builds
// with Turbopack by default. Verified empirically against Next 16.2.6: `next build` (Turbopack)
// fails outright once this webpack-based plugin is wired in ("This build is using Turbopack,
// with a `webpack` config and no `turbopack` config"). The `build` script in package.json was
// changed to `next build --webpack` to force the webpack builder so the manifest actually gets
// injected into public/sw.js. vercel.json pins Vercel's buildCommand to `npm run build` so
// deploys use the same flag instead of the framework preset's bare `next build`. In development,
// do not call withSerwistInit at all: `disable: true` prevents the worker from running, but the
// wrapper still adds the webpack hook that makes `next dev` (Turbopack) exit before startup.
const withSerwist = isDevelopment ? (config: NextConfig) => config : withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Precache the /offline app-shell so Serwist's fallback (src/app/sw.ts) can
  // resolve it for offline navigations. A build-scoped revision re-precaches a
  // fresh shell on every deploy, keeping it consistent with its build-hashed
  // chunks (which .next/static/** precaches alongside it) — the deploy-proof
  // approach (D1) instead of caching arbitrary rendered pages. The public
  // folder entries are replicated (see publicFolderPrecacheEntries) because
  // this option replaces the default public scan.
  additionalPrecacheEntries: [
    { url: OFFLINE_SHELL_URL, revision: process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString() },
    ...publicFolderPrecacheEntries(),
  ],
  // Serwist's default (true) force-reloads the page on every `online` event. On mobile,
  // wifi/cellular handoffs fire that event constantly, and a reload destroys in-memory
  // player state (current position, loop range) mid-playback. Offline UX handles
  // reconnection explicitly in M3/M4 instead.
  reloadOnOnline: false,
});

export default withSerwist(nextConfig);
