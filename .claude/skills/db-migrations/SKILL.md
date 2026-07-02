---
name: db-migrations
description: Use when changing the database schema — adding a column, table, or enum value, "add a field to segments/episodes", generating or applying Drizzle migrations, or debugging drizzle-kit errors. Covers the db:generate → db:migrate ordering and the end-to-end add-a-column recipe.
---

# Drizzle schema changes and migrations

The schema is defined **only** in `src/db/schema.ts`. Migrations live in
`drizzle/migrations/` (SQL files + `meta/` snapshots + `_journal.json`).
Config: `drizzle.config.ts`, which loads `.env.local` and connects with
`KIKU_APP_DATABASE_URL_UNPOOLED` (Neon **direct** connection — migrations must
not go through the pooler). The app runtime uses the separate pooled
`KIKU_APP_DATABASE_URL` via `neon-http` in `src/db/index.ts`. If
`db:migrate` fails to connect, it's the UNPOOLED var that's missing.

## Workflow (strict order)

1. Edit `src/db/schema.ts`. Enums (`pgEnum`) must be declared **before** the
   tables that use them (top of the file).
2. `npm run db:generate` — diffs schema against `drizzle/migrations/meta/`
   snapshots and writes a new numbered SQL file. Needs no DB connection.
   For a readable filename: `npm run db:generate -- --name=<slug>`
   (see `0002_rename_chunks_to_segments.sql` for the convention).
3. **Read the generated SQL before applying.** drizzle-kit sometimes expresses
   a rename as DROP + ADD (data loss) and will prompt interactively for
   ambiguous renames — verify it generated what you meant.
4. `npm run db:migrate` — applies pending migrations to whatever DB
   `.env.local` points at.

**Before running `db:migrate`, check which database `.env.local` points at.**
There is one Neon database serving the deployed app; if the local env has the
production URL, a migration here is a production migration. For destructive SQL
(DROP, type changes) against a DB with real data: **stop and ask the user**.

Never hand-edit an applied migration file or anything under
`drizzle/migrations/meta/` — the snapshots are how drizzle-kit computes diffs;
editing them desynchronizes generate from reality. To change something, write a
new migration. Adding a value to an existing `pgEnum` generates
`ALTER TYPE ... ADD VALUE` (fine); **removing or renaming** an enum value has no
clean Postgres path — stop and ask.

## Recipe: add a column end-to-end

Example to imitate: the per-segment SRS columns (`studyStatus`, `learnedAt`,
`nextReview` on `segments` — migration `0003_closed_beast.sql`, PR #28), which
touched schema, db helpers, API route, and UI in one change. Note how the
NOT NULL column ships with `DEFAULT 'new'`.

1. **Schema:** add the column in `src/db/schema.ts`. For a NOT NULL column on
   a table with existing rows, include `.default(...)` or the migration fails.
2. **Generate → review → migrate** (workflow above).
3. **Types:** nothing to do — `Podcast`/`Episode`/`Segment`/`StudyGuide` are
   `$inferSelect` types at the bottom of `schema.ts` and pick up the column.
4. **Write path:** if inserts must populate it, update the helper in
   `src/db/` (e.g. `insertSegments` in `src/db/segments.ts`). Routes go through
   these helpers, not inline drizzle.
5. **API:** if clients may set it, add it to the route's Zod schema (see
   `updateStudyStatusSchema` in `src/app/api/segments/[id]/study/route.ts`);
   reads need nothing — routes return whole rows.
6. **Tests:** update the mocked-helper expectations in the colocated
   `__tests__/route.test.ts` files and any `src/db/__tests__/` tests.
7. **Docs:** update the Database Schema section of `CLAUDE.md` if the shape of
   a core table changed.

## Verify

- `npm run db:generate` again → `No schema changes, nothing to migrate 😴`
  (schema and snapshots agree).
- `npm run db:studio` → inspect the table, confirm the column and defaults.
- `npm run test` and `npm run build` pass.

## Failure modes

- `db:generate` produced an empty/no migration → your schema edit didn't change
  anything drizzle tracks (e.g. only a TS type), or a stale snapshot already
  contains it — inspect `meta/` journal before forcing anything.
- Migration applied but app errors with "column does not exist" → app is
  connected to a different database than the one migrated (pooled vs unpooled
  URLs pointing at different branches/projects). Compare the two env vars.
