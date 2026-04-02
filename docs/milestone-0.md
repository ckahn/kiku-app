# Milestone 0 — Foundation (Skeleton + Upload + Storage)

**Goal:** Create a podcast, upload an MP3 episode to it, see it listed. End-to-end flow deployed to Vercel.

---

## Subtasks

1. ~~Bootstrap the Next.js project~~ ✓
2. [Provision Vercel Postgres + Blob](#2-provision-vercel-storage)
3. [Write the Drizzle schema (all 6 tables)](#3-drizzle-schema)
4. [Configure Drizzle and run the migration](#4-migration)
5. [Write the DB client](#5-db-client)
6. [Implement API routes](#6-api-routes)
7. [Build pages and components](#7-pages-and-components)
8. [Deploy to Vercel](#8-deploy)

---

## 1. Bootstrap ✓

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

npm install drizzle-orm @neondatabase/serverless @vercel/blob
npm install -D drizzle-kit
```

Choices: App Router, `src/` directory, `@/*` alias. No `--eslint` flag needed — create-next-app includes it by default.

> **Note:** `@vercel/postgres` is deprecated. Vercel Postgres databases were migrated to Neon. Use `@neondatabase/serverless` instead. The Drizzle adapter changes from `drizzle-orm/vercel-postgres` to `drizzle-orm/neon-http`, and the env var is `DATABASE_URL` (see sections 2 and 5).

Versions installed: Next.js 16.2.2, React 19, Drizzle ORM 0.45, drizzle-kit 0.31, Tailwind 4, TypeScript 5.

---

## 2. Provision Vercel Storage

Do this in the Vercel dashboard before writing any code that touches the DB.

1. Create a Vercel project linked to the repo (or `vercel link`).
2. **Storage → Add Store → Neon Postgres** — Vercel injects `DATABASE_URL` (and optionally `DATABASE_URL_UNPOOLED` for direct connections).
3. **Storage → Add Store → Blob** — injects `BLOB_READ_WRITE_TOKEN`
4. Pull to local:

```bash
vercel env pull .env.local
```

Create `.env.example` with all keys present but empty values, and commit it. Never commit `.env.local`.

```bash
# .env.example
DATABASE_URL=            # Neon pooled connection string (runtime queries)
DATABASE_URL_UNPOOLED=   # Neon direct connection string (migrations)
BLOB_READ_WRITE_TOKEN=

# Future milestones
ELEVENLABS_API_KEY=
ANTHROPIC_API_KEY=
USE_MOCKS=true
```

---

## 3. Drizzle Schema

Define all 6 tables and 3 enums upfront in one file. This is the single migration for the entire project — later milestones just start querying tables that are already there.

**`src/db/schema.ts`**

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// Enums must be declared before the tables that use them
export const episodeStatusEnum = pgEnum('episode_status', [
  'uploaded', 'transcribing', 'chunking', 'ready', 'error',
]);
export const studyStatusEnum = pgEnum('study_status', ['new', 'studying', 'learned']);
export const reviewOutcomeEnum = pgEnum('review_outcome', ['comfortable', 'needs_work']);

export const podcasts = pgTable('podcasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const episodes = pgTable('episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  podcastId: uuid('podcast_id')
    .notNull()
    .references(() => podcasts.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  episodeNumber: integer('episode_number'),
  audioUrl: text('audio_url').notNull(),
  durationMs: integer('duration_ms'),
  status: episodeStatusEnum('status').notNull().default('uploaded'),
  studyStatus: studyStatusEnum('study_status').notNull().default('new'),
  learnedAt: timestamp('learned_at', { withTimezone: true }),
  nextReview: timestamp('next_review', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const rawTranscripts = pgTable('raw_transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  episodeId: uuid('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const chunks = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  episodeId: uuid('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  textRaw: text('text_raw').notNull(),
  textFurigana: text('text_furigana').notNull(),
  startMs: integer('start_ms').notNull(),
  endMs: integer('end_ms').notNull(),
  sentences: jsonb('sentences').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [unique().on(table.episodeId, table.chunkIndex)]);

export const drilldowns = pgTable('drilldowns', {
  id: uuid('id').primaryKey().defaultRandom(),
  chunkId: uuid('chunk_id')
    .notNull()
    .references(() => chunks.id, { onDelete: 'cascade' }),
  content: jsonb('content').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [unique().on(table.chunkId)]);

export const reviewLog = pgTable('review_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  episodeId: uuid('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).defaultNow(),
  outcome: reviewOutcomeEnum('outcome').notNull(),
});

// Useful inferred types for use in components and API routes
export type Podcast = typeof podcasts.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Drilldown = typeof drilldowns.$inferSelect;
```

---

## 4. Migration

**`drizzle.config.ts`** (project root):

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
});
```

> **Why `DATABASE_URL_UNPOOLED`?** Neon's pooled connection string routes through a connection pooler that cannot run DDL statements (`CREATE TYPE`, `CREATE TABLE`) reliably. Always use the direct/unpooled URL for migrations.

Run:

```bash
npx drizzle-kit generate   # writes drizzle/migrations/0000_initial.sql
npx drizzle-kit migrate    # applies SQL to the database
```

Commit the generated `drizzle/migrations/` directory. Do **not** add `drizzle-kit migrate` to the Vercel build step — run it manually once per environment:

```bash
# Production
vercel env pull .env.local && npx drizzle-kit migrate
```

---

## 5. DB Client

**`src/db/index.ts`**:

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

Import `db` from `@/db` everywhere. Never instantiate Drizzle more than once.

---

## 6. API Routes

> **Next.js 15 gotcha:** `params` in route handlers is `Promise<{ id: string }>`. Always `await params` before destructuring.

### `src/app/api/podcasts/route.ts`

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { podcasts } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  const rows = await db.select().from(podcasts).orderBy(desc(podcasts.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const { name, description } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const [podcast] = await db
    .insert(podcasts)
    .values({ name, description })
    .returning();
  return NextResponse.json(podcast, { status: 201 });
}
```

### `src/app/api/podcasts/[id]/route.ts`

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { podcasts, episodes } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, id));
  if (!podcast) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const episodeRows = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, id))
    .orderBy(desc(episodes.createdAt));

  return NextResponse.json({ ...podcast, episodes: episodeRows });
}
```

### `src/app/api/podcasts/[id]/episodes/route.ts`

```ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db } from '@/db';
import { episodes } from '@/db/schema';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podcastId } = await params;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const title = formData.get('title') as string | null;

  if (!file || !title?.trim()) {
    return NextResponse.json({ error: 'file and title are required' }, { status: 400 });
  }

  const blob = await put(file.name, file, {
    access: 'public',
    contentType: file.type || 'audio/mpeg', // required for <audio> streaming
  });

  const [episode] = await db
    .insert(episodes)
    .values({ podcastId, title, audioUrl: blob.url })
    .returning();

  return NextResponse.json(episode, { status: 201 });
}
```

> **Body size limit:** Vercel Hobby plan caps serverless function request bodies at ~4.5MB. This is fine for M0 test files. Before M2 (transcription with real podcast MP3s), switch to Vercel Blob's client-side upload pattern (`handleUpload` + `upload` from `@vercel/blob/client`), which bypasses the function body limit by uploading directly from the browser to Blob.

### `src/app/api/episodes/[id]/route.ts`

```ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, id));
  if (!episode) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(episode);
}
```

---

## 7. Pages and Components

Server components query the DB directly — no HTTP round-trip to your own API routes. Client components (`"use client"`) handle form submissions and call `router.refresh()` after mutations to re-render server data.

### `src/app/layout.tsx`

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '聴く',
  description: 'Japanese podcast study app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
```

### `src/app/page.tsx` — Podcast list

```tsx
import { db } from '@/db';
import { podcasts } from '@/db/schema';
import { desc } from 'drizzle-orm';
import PodcastCreateForm from '@/components/PodcastCreateForm';
import PodcastList from '@/components/PodcastList';

export default async function HomePage() {
  const podcastList = await db.select().from(podcasts).orderBy(desc(podcasts.createdAt));
  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">聴く</h1>
      <PodcastCreateForm />
      <PodcastList podcasts={podcastList} />
    </main>
  );
}
```

### `src/components/PodcastCreateForm.tsx`

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PodcastCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/podcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    setName('');
    setDescription('');
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Podcast name"
        required
        className="border rounded px-3 py-2 w-full"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="border rounded px-3 py-2 w-full"
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Add Podcast'}
      </button>
    </form>
  );
}
```

### `src/components/PodcastList.tsx`

```tsx
import Link from 'next/link';
import type { Podcast } from '@/db/schema';

export default function PodcastList({ podcasts }: { podcasts: Podcast[] }) {
  if (podcasts.length === 0) {
    return <p className="text-gray-500">No podcasts yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {podcasts.map((p) => (
        <li key={p.id}>
          <Link href={`/podcasts/${p.id}`} className="block border rounded p-4 hover:bg-gray-50">
            <p className="font-medium">{p.name}</p>
            {p.description && <p className="text-sm text-gray-500">{p.description}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

### `src/app/podcasts/[id]/page.tsx` — Podcast detail

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { podcasts, episodes } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import EpisodeList from '@/components/EpisodeList';
import EpisodeUploadForm from '@/components/EpisodeUploadForm';

export default async function PodcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [podcast] = await db.select().from(podcasts).where(eq(podcasts.id, id));
  if (!podcast) notFound();

  const episodeList = await db
    .select()
    .from(episodes)
    .where(eq(episodes.podcastId, id))
    .orderBy(desc(episodes.createdAt));

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">{podcast.name}</h1>
      {podcast.description && (
        <p className="text-gray-500 mb-6">{podcast.description}</p>
      )}
      <h2 className="text-lg font-semibold mb-2">Upload episode</h2>
      <EpisodeUploadForm podcastId={id} />
      <h2 className="text-lg font-semibold mt-8 mb-2">Episodes</h2>
      <EpisodeList episodes={episodeList} podcastId={id} />
    </main>
  );
}
```

### `src/components/EpisodeUploadForm.tsx`

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EpisodeUploadForm({ podcastId }: { podcastId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    const body = new FormData();
    body.append('title', title);
    body.append('file', file);
    await fetch(`/api/podcasts/${podcastId}/episodes`, { method: 'POST', body });
    setTitle('');
    setFile(null);
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 mb-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Episode title"
        required
        className="border rounded px-3 py-2 w-full"
      />
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        required
        className="block"
      />
      <button
        type="submit"
        disabled={loading || !file}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Uploading…' : 'Upload'}
      </button>
      {loading && <p className="text-sm text-gray-500">Uploading audio… this may take a moment.</p>}
    </form>
  );
}
```

### `src/components/EpisodeList.tsx`

```tsx
import Link from 'next/link';
import type { Episode } from '@/db/schema';

const STATUS_COLORS: Record<string, string> = {
  uploaded:     'bg-blue-100 text-blue-800',
  transcribing: 'bg-yellow-100 text-yellow-800',
  chunking:     'bg-yellow-100 text-yellow-800',
  ready:        'bg-green-100 text-green-800',
  error:        'bg-red-100 text-red-800',
};

export default function EpisodeList({
  episodes,
  podcastId,
}: {
  episodes: Episode[];
  podcastId: string;
}) {
  if (episodes.length === 0) {
    return <p className="text-gray-500">No episodes yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {episodes.map((ep) => (
        <li key={ep.id}>
          <Link
            href={`/podcasts/${podcastId}/episodes/${ep.id}`}
            className="block border rounded p-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">{ep.title}</p>
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[ep.status]}`}
              >
                {ep.status}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

### `src/app/podcasts/[id]/episodes/[episodeId]/page.tsx` — Episode detail

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';

const STATUS_COLORS: Record<string, string> = {
  uploaded:     'bg-blue-100 text-blue-800',
  transcribing: 'bg-yellow-100 text-yellow-800',
  chunking:     'bg-yellow-100 text-yellow-800',
  ready:        'bg-green-100 text-green-800',
  error:        'bg-red-100 text-red-800',
};

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string; episodeId: string }>;
}) {
  const { episodeId } = await params;
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
  if (!episode) notFound();

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">{episode.title}</h1>
      <span
        className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[episode.status]}`}
      >
        {episode.status}
      </span>

      <dl className="mt-6 space-y-2 text-sm">
        {episode.durationMs && (
          <>
            <dt className="text-gray-500">Duration</dt>
            <dd>{Math.round(episode.durationMs / 1000)}s</dd>
          </>
        )}
        <dt className="text-gray-500">Audio</dt>
        <dd>
          <a href={episode.audioUrl} className="text-blue-600 underline" target="_blank" rel="noreferrer">
            Open audio
          </a>
        </dd>
        <dt className="text-gray-500">Created</dt>
        <dd>{episode.createdAt?.toLocaleString()}</dd>
      </dl>
    </main>
  );
}
```

---

## 8. Deploy

```bash
git add -A
git commit -m "Milestone 0: foundation — podcasts, episode upload, Vercel Blob + Postgres"
git push
```

Vercel auto-deploys on push. Then run the migration against production:

```bash
vercel env pull .env.local  # pulls production credentials
npx drizzle-kit migrate
```

### Verification checklist

- [ ] `npm run dev` — no TypeScript or ESLint errors
- [ ] Create a podcast via the form → appears in the list
- [ ] Navigate to podcast → upload a small MP3 (< 4MB for M0) with a title → episode appears with status `uploaded`
- [ ] Navigate to episode detail → title, status badge, audio link visible
- [ ] Click audio link → browser plays the file (confirms Vercel Blob `content-type` is correct)
- [ ] Repeat on the Vercel production URL

---

## Notes for Future Milestones

- **M1 (Dev mocks):** Add `USE_MOCKS=true` to `.env.local` and fixture files under `/fixtures/`. No schema changes needed.
- **M2 (Transcription):** Switch the episode upload to client-side Blob upload (`handleUpload`/`upload` from `@vercel/blob/client`) to handle files > 4MB. Chain ElevenLabs API call after upload in a separate `/api/episodes/[id]/process` endpoint that the frontend polls.
- **M3+ (Chunking, furigana, drilldowns):** All tables already exist. Just start inserting rows.
