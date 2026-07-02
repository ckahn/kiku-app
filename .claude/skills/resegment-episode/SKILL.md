---
name: resegment-episode
description: Use when re-segmenting or reprocessing an episode without re-transcribing — "re-segment episode X", "reprocess this episode", "apply the new segmentation/furigana logic to existing episodes", or after changing MINIMUM_SEGMENT_CHARACTERS, the segmentation strategy, or furigana logic. Covers the delete-segments → status-reset → POST sequence and its ordering constraints.
---

# Re-segment an episode without re-transcribing

The raw ElevenLabs transcript is stored in `raw_transcripts.payload` (JSONB), so
segmentation + furigana can be re-run without paying for another transcription.
With the current defaults (`TRANSCRIPT_SEGMENTATION_STRATEGY = 'deterministic'`,
`FURIGANA_STRATEGY = 'tokenizer'` in `src/lib/constants.ts`) re-segmenting makes
**zero external API calls**. If either constant has been switched to the Claude
branch, re-segmenting costs Anthropic tokens — check before running.

## Before you start — data-loss check (stop conditions)

Deleting an episode's `segments` rows **cascades** to `study_guides` and
`review_log` (FK `onDelete: 'cascade'` in `src/db/schema.ts`). It also destroys
per-segment `study_status` / `learned_at`. Check first:

```sql
SELECT study_status, count(*) FROM segments WHERE episode_id = <ID> GROUP BY 1;
SELECT count(*) FROM study_guides sg JOIN segments s ON sg.segment_id = s.id WHERE s.episode_id = <ID>;
```

- Any segment not `'new'`, or any study guides exist → **stop and ask the user**
  before deleting. Study guides are regenerated lazily later, but each
  regeneration is a paid Claude call, and study progress is unrecoverable.
- No row in `raw_transcripts` for the episode → re-segmenting is impossible;
  the only path is a full re-transcription (paid ElevenLabs call). **Stop and
  ask.** Check: `SELECT id FROM raw_transcripts WHERE episode_id = <ID>;`

## Procedure (order matters)

Run SQL via `npm run db:studio` (Drizzle Studio) or any Postgres client pointed
at the DB in `.env.local` (`KIKU_APP_DATABASE_URL`).

1. **Delete the old segments** (must happen before step 3 — `insertSegments`
   in `src/db/segments.ts` violates `UNIQUE(episode_id, segment_index)` if old
   rows remain, which flips the episode to `error`):

   ```sql
   DELETE FROM segments WHERE episode_id = <ID>;
   ```

2. **Reset the episode status** — the segment route returns
   `409 "episode is <status>"` unless status is exactly `'segmenting'`
   (guard at the top of `src/app/api/episodes/[id]/segment/route.ts`):

   ```sql
   UPDATE episodes
   SET status = 'segmenting', error_message = NULL, updated_at = now()
   WHERE id = <ID>;
   ```

3. **Trigger the segment route:**

   ```bash
   curl -X POST http://localhost:3000/api/episodes/<ID>/segment
   ```

   Alternative: just open the episode page
   (`/podcasts/[slug]/episodes/[number]`) in the browser —
   `EpisodeStatusPoller` auto-POSTs to `/segment` when it sees status
   `'segmenting'`. The curl is more predictable for scripted use.

The route reads the stored transcript (`getRawTranscript`), runs segmentation +
furigana by the strategy constants, inserts segments, and sets status `'ready'`.
On any failure it sets status `'error'` with the message in `error_message`.

## Verify

- Response is `{"success":true,"data":{"status":"ready"}}`.
- `SELECT count(*), count(*) FILTER (WHERE furigana_status = 'suspect') FROM segments WHERE episode_id = <ID>;`
  — sane segment count, ideally zero suspect.
- Open the episode page; segments render with furigana and play at the right
  timestamps.

## Failure modes

- **409 from POST** → status isn't `'segmenting'`; you skipped step 2, or the
  poller already ran it (check status — it may already be `ready`).
- **Status `error` after POST** → read `episodes.error_message` and the
  `[segment]`-prefixed server logs. A unique-violation error means step 1 was
  skipped. Fix the cause, then repeat from step 1 (idempotent).
- **Local dev with `USE_MOCKS=true`**: segmentation input is the real stored
  transcript (deterministic path ignores mocks), but tokenizer furigana returns
  `fixtures/furigana.json` instead of real annotations — segment texts and
  furigana will not match. Unset `USE_MOCKS` for a real re-segment (still free
  with default strategies).
