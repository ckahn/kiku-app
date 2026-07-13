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
// injected into public/sw.js. The Vercel project's build command will need the same
// `--webpack` flag (or an updated `build` script, which is what we rely on here) — do not
// change Vercel settings from this repo; that's an operator action.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
