import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

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

// Serwist's precache-manifest injection (__SW_MANIFEST) is a webpack plugin, but Next 16 builds
// with Turbopack by default. Verified empirically against Next 16.2.6: `next build` (Turbopack)
// fails outright once this webpack-based plugin is wired in ("This build is using Turbopack,
// with a `webpack` config and no `turbopack` config"). The `build` script in package.json was
// changed to `next build --webpack` to force the webpack builder so the manifest actually gets
// injected into public/sw.js. vercel.json pins Vercel's buildCommand to `npm run build` so
// deploys use the same flag instead of the framework preset's bare `next build`.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Serwist's default (true) force-reloads the page on every `online` event. On mobile,
  // wifi/cellular handoffs fire that event constantly, and a reload destroys in-memory
  // player state (current position, loop range) mid-playback. Offline UX handles
  // reconnection explicitly in M3/M4 instead.
  reloadOnOnline: false,
});

export default withSerwist(nextConfig);
