---
name: verify-changes
description: Use when verifying that a change works in this repo — running tests or coverage, checking what the 80% threshold actually covers, validating the UI touch-target/cursor rules, or manually exercising the app without spending API credits.
---

# Verifying changes in kiku-app

## Test commands (all verified working)

```bash
npm run test                                   # full suite, ~5s
npx vitest run src/path/to/file.test.ts        # single file (multiple paths OK)
npm run test:watch                             # watch mode
npm run test:coverage                          # coverage + threshold gate
npm run lint                                   # eslint (no output = clean)
npm run build                                  # catches route/config/type issues tests miss
```

## What the 80% coverage gate actually covers

Per `vitest.config.ts`, thresholds (80% lines/functions/branches) apply
**only** to `src/lib/api/**/*.ts` and `src/components/ui/**/*.tsx`
(excluding tests, `types.ts`, `index.ts`). New code in those two trees must
ship with tests or `npm run test:coverage` fails. Code elsewhere
(routes, player, db helpers) has extensive tests by convention but is not
threshold-gated — don't burn effort chasing a global 80% number, and don't
add files to the coverage `include` list without being asked.

Test environment is `node` by default; component tests opt into the DOM with a
`// @vitest-environment jsdom` pragma as the **first line** of the file
(see any test in `src/components/__tests__/`). Forgetting the pragma gives
"document is not defined". `.claude/worktrees/**` is excluded from discovery,
so a dirty worktree won't produce duplicate test runs.

There is no test database — DB helpers are mocked at the module boundary with
`vi.mock('@/db/…')`. Never write a test that connects to Neon.

## UI rules and how to check them

Every clickable region: ≥44×44px touch target and `cursor: pointer` on hover.

- **Never assert these via CSS utility classes in unit tests** (e.g.
  `expect(el.className).toContain('min-h-11')`). This was tried and reverted
  (commit `ee5bc71` "remove brittle touch target assertions"); CLAUDE.md
  forbids it.
- Check at the browser level instead: computed `getBoundingClientRect()` ≥44px
  and computed `cursor` style, via the preview/browser tooling or manual
  inspection. In practice most targets use Tailwind `min-h-11`-style classes —
  fine to *write*, just not to *assert on*.

## Exercising the app without API costs

1. Ensure `.env.local` has `USE_MOCKS=true` plus real `KIKU_APP_DATABASE_URL`
   and `BLOB_READ_WRITE_TOKEN` — the database and blob store are real even in
   mock mode; only ElevenLabs/Anthropic calls are mocked (see the
   `mocks-and-fixtures` skill for exactly what's mocked).
2. `npm run dev`, open `http://localhost:3000`.
3. Full-pipeline check: create a podcast → add an episode with any small mp3 →
   watch the status badge go `uploaded → transcribing → segmenting → ready`
   (the transcript will be the fixture content, not your audio — expected).
4. Study-guide check: open a segment's study page — the guide is the fixture.
5. The processing pipeline only advances while a page with the status poller
   is open (see the `processing-pipeline` skill).

## Suggested order for a typical change

1. Targeted test file(s) with `npx vitest run …` while iterating.
2. `npm run test` — the whole suite is fast; always run it.
3. `npm run lint`.
4. `npm run test:coverage` if you touched `src/lib/api/**` or
   `src/components/ui/**`.
5. `npm run build` if you touched routes, `next.config.ts`, or anything
   import-graph-shaped.
6. Browser pass under mocks for UI/pipeline changes (touch targets, cursor,
   real interaction).

Report actual results — if a step fails, quote the failure rather than
summarizing it away.
