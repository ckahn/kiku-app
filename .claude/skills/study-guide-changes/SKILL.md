---
name: study-guide-changes
description: Use when changing the study-guide prompt, content schema, model, caching/regeneration behavior — "improve the study guide", "add a field to study guides", "why isn't my prompt change showing up", or running the study-guide eval.
---

# Recipe: change the study-guide prompt or schema

## How generation works (the chain you're editing)

`GET /api/segments/[id]/study-guide` is **lazy**: it returns the cached
`study_guides` row (one per segment, `UNIQUE(segment_id)`) only if
`version === STUDY_GUIDE_CURRENT_VERSION` **and** the content still passes
`parseStudyGuideContent`; otherwise it regenerates in-place.
`POST .../study-guide/regenerate` forces regeneration.

Both call `generateAndSaveStudyGuide` (`src/lib/api/study-guide-service.ts`):

1. `buildStudyGuideContext` — the **last** `STUDY_GUIDE_CONTEXT_SEGMENTS` (10)
   segments of the episode, regardless of which segment is studied. For early
   segments the context comes from *later* in the episode — intentional; the
   prompt labels it "episode context", not "preceding context". Don't change
   this to a window centered on the segment without reading the comments in
   `study-guide-service.ts` and the study-guide GET route.
2. `generateStudyGuideFromProvider` (`src/lib/api/study-guide-provider.ts`) —
   the prompt lives in `buildStudyGuidePrompt` here (not in any docs file);
   `generateObject` with `studyGuideContentSchema`, model
   `CLAUDE_STUDY_GUIDE_MODEL` (constants.ts), `temperature: 0`.
3. `parseStudyGuideContent` (`src/lib/api/study-guide.ts`) — Zod parse, then
   sanitization: drops non-Japanese vocabulary/structure/breakdown items,
   dedupes vocabulary by `dictionaryForm`, renumbers `breakdown.order`.
4. `normalizeStudyGuideVocabularySurfaces` — kana-surface normalization.
5. `saveStudyGuideForSegmentId` — upsert; writes `version: content.version`.

## Changing the schema (content shape)

1. Update the interfaces in `src/lib/api/types.ts` and the Zod schemas in
   `src/lib/api/study-guide.ts`. Note `version: z.literal(2)` — the literal
   must match the new version.
2. **Bump `STUDY_GUIDE_CURRENT_VERSION` in `src/lib/constants.ts`.** This is
   the cache-invalidation mechanism: cached guides with an older version
   auto-regenerate on next view. Skipping the bump means old guides are served
   forever (Zod may also reject them, which forces regeneration — but don't
   rely on that).
3. Update `fixtures/study-guide.json` to the new shape/version —
   `src/lib/api/__tests__/fixtures.test.ts` enforces it (including
   `partOfSpeech` on every vocabulary item).
4. Update the prompt's "Output requirements" in `study-guide-provider.ts` to
   describe the new fields (the version line interpolates the constant
   automatically).
5. Update the renderer: `src/components/study/StudyScreen.tsx`.
6. Update the `StudyGuideContent` description in `CLAUDE.md`.

## Changing only the prompt (same shape)

No version bump mechanism exists for prompt-quality changes — cached guides
keep the old output. Options: bump the version anyway (regenerates **every**
guide lazily, one paid Claude call per segment viewed), or leave old guides and
let users hit per-segment regenerate. State the cost tradeoff to the user
rather than choosing silently.

## Cost warnings

Every regeneration is a real Anthropic call (unless `USE_MOCKS=true`, which
returns the fixture). A version bump on a well-used database schedules a
regeneration per viewed segment. Never loop over segments calling
regenerate — ask the user first.

## The eval

```bash
npx tsx evals/eval-study-guide-completeness.ts
```

LLM-as-judge (judge model is intentionally a different model family
than the generator — keep it that way if you update model IDs). Requires
`KIKU_APP_DATABASE_URL` + `ANTHROPIC_API_KEY` in `.env.local` and `USE_MOCKS`
**not** `'true'`; it hits the real DB and makes real generator + judge calls.
**Costs money — ask the user before running.** Fixture paths inside the script
reference specific podcast episodes that must exist in the connected DB.

## Verify

`npx vitest run src/lib/api/__tests__/study-guide.test.ts
src/lib/api/__tests__/study-guide-provider.test.ts
src/lib/api/__tests__/study-guide-service.test.ts
src/lib/api/__tests__/fixtures.test.ts`, then view a segment study page under
`USE_MOCKS=true` to confirm rendering.
