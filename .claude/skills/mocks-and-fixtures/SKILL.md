---
name: mocks-and-fixtures
description: Use when running the app or pipeline without spending API money, working with USE_MOCKS or files in fixtures/, updating a fixture, or when transcription/study guides keep returning the same canned data. Covers which code paths check USE_MOCKS, fixture cross-consistency rules, and the capture script.
---

# USE_MOCKS and the fixtures/ files

`USE_MOCKS=true` in `.env.local` makes the external-API wrappers return fixture
data instead of calling paid APIs. It is read at **call time** via
`process.env.USE_MOCKS === 'true'` in exactly four places:

| Wrapper | Function | Fixture returned |
|---|---|---|
| `src/lib/api/elevenlabs.ts` | `transcribe` | `fixtures/elevenlabs-transcript.json` |
| `src/lib/api/claude.ts` | `segmentTranscript` | `fixtures/segments.json` |
| `src/lib/api/claude.ts` + `src/lib/api/furigana-tokenizer.ts` | `addFurigana` / `addFuriganaWithTokenizer` | `fixtures/furigana.json` |
| `src/lib/api/study-guide-provider.ts` | `generateStudyGuideFromProvider` | `fixtures/study-guide.json` |

Not affected by USE_MOCKS: the **deterministic segmenter**
(`src/lib/transcript-segmentation.ts`, the current default strategy — it's free
and always runs real logic), all DB access (real Neon connection even in dev),
and Vercel Blob uploads.

## What costs money if mocks are off

- **ElevenLabs**: one transcription per `POST /api/episodes/[id]/transcribe`,
  billed by audio length.
- **Anthropic**: study guides — generated lazily on **first view of each
  segment's study page** and on every `POST .../study-guide/regenerate`; plus
  the dormant Claude segmenting/furigana branches if the strategy constants in
  `src/lib/constants.ts` have been switched away from
  `'deterministic'`/`'tokenizer'`.

Never flip `USE_MOCKS` to false and trigger pipeline steps just to test
something — ask the user first.

## Fixture consistency invariants

`src/lib/api/__tests__/fixtures.test.ts` enforces cross-file consistency; if
you edit one fixture, run `npm run test` and expect to fix the others:

- `segments.json` word indices must be in-bounds for
  `elevenlabs-transcript.json`'s `segments` array, and each segment's `text`
  must equal the concatenation of its word range.
- `furigana.json` entries pair with `segments.json` by index; `text_furigana`
  must contain `<ruby>` markup consistent with `text`.
- `study-guide.json` must satisfy `studyGuideContentSchema`
  (`src/lib/api/study-guide.ts`) including `version` =
  `STUDY_GUIDE_CURRENT_VERSION` and `partOfSpeech` present on every
  vocabulary item.

## Recapturing the transcript fixture

```bash
npx tsx scripts/capture-elevenlabs-fixture.ts <path-to-audio.mp3>
```

This makes a **real, paid ElevenLabs call** (needs `ELEVENLABS_API_KEY` in
`.env.local`) and **overwrites** `fixtures/elevenlabs-transcript.json`. Confirm
with the user before running. Afterwards run `npm run test` —
`fixtures.test.ts` will point at every place `segments.json`/`furigana.json`
now disagree; update those by hand (they are hand-written fixtures).

## Known dev-mode weirdness (expected, don't "fix")

- Under mocks every uploaded episode "transcribes" to the same fixture content
  regardless of the actual audio — playback audio won't match the transcript.
- Re-running the segment step on a **real** episode with `USE_MOCKS=true` can
  fail or mismatch: furigana comes from the fixture whose word indices refer to
  the fixture transcript, not the episode's real one.
- Mock furigana segments always get `furigana_status: 'ok'` (the mock mappers
  in both furigana wrappers hardcode it).

## Verify

After changing anything here: `npm run test` (fixtures + wrapper tests), then
`npm run dev` with `USE_MOCKS=true`, upload any small mp3 to a podcast, and
watch it reach `ready` without external calls.
