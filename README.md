# Kiku (聴く)

A Japanese podcast study app. Upload an MP3, get a furigana-annotated transcript chunked into study segments, with on-demand translations and grammar drill-downs. Includes a spaced repetition review queue.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Drizzle ORM · Vercel Postgres (Neon) · Vercel Blob · ElevenLabs Scribe v2 · Anthropic Claude

---

## Development

### Prerequisites

- Node.js 18+
- A `.env.local` file (see below)

### Setup

```bash
npm install
npm run dev
```

### Environment variables

```
# Database
KIKU_APP_DATABASE_URL=          # pooled connection (app runtime)
KIKU_APP_DATABASE_URL_UNPOOLED= # direct connection (Drizzle migrations)

# Storage
BLOB_READ_WRITE_TOKEN=

# External APIs
ELEVENLABS_API_KEY=
ANTHROPIC_API_KEY=

# Dev
USE_MOCKS=true   # skip real API calls; use fixtures in /fixtures/
```

### Mocks

Set `USE_MOCKS=true` in `.env.local` to avoid API costs. API wrappers return canned responses from `/fixtures/`:

| File | Contents |
|------|----------|
| `elevenlabs-transcript.json` | Real ElevenLabs response |
| `chunks.json` | Claude chunking output |
| `furigana.json` | Furigana annotations |
| `drilldown.json` | Drill-down content |

---

## Testing

```bash
npm test                # run once
npm run test:watch      # watch mode
npm run test:coverage   # with coverage report
```

Tests use **Vitest**. Target: 80% coverage. Follow TDD — write the test first, then the implementation.

---

## Database

Schema lives in `src/db/schema.ts`. Migrations output to `drizzle/migrations/`.

### Common Drizzle commands

```bash
# Generate a migration after changing schema.ts
npx drizzle-kit generate

# Apply pending migrations to the database
npx drizzle-kit migrate

# Open Drizzle Studio (browser-based DB explorer)
npx drizzle-kit studio
```

Drizzle Kit reads `.env.local` automatically (via `drizzle.config.ts`) and connects using `KIKU_APP_DATABASE_URL_UNPOOLED`.

### Schema overview

| Table | Purpose |
|-------|---------|
| `podcasts` | Top-level podcast feeds |
| `episodes` | Individual episodes; tracks `status` and `study_status` |
| `raw_transcripts` | Raw ElevenLabs JSONB payload (stored to avoid re-calling API) |
| `chunks` | Study segments with furigana HTML (`<ruby>` tags) |
| `drilldowns` | Lazy-generated per-chunk translations + grammar analysis |
| `review_log` | Spaced repetition history |

Episode statuses: `uploaded → transcribing → chunking → ready | error`

---

## Common commands

```bash
npm run dev         # start dev server
npm run build       # production build
npm run lint        # ESLint
```
