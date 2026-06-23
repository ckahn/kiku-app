import type { NextConfig } from "next";

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

export default nextConfig;
