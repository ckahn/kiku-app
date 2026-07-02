---
name: player-state-model
description: Use when touching audio playback, looping, usePlayer, playerReducer, AudioEngine, or the StudyScreen player — and especially when tempted to add an isLooping boolean, a second audio element, per-seek fetching, an external state library, or to share player state between the episode page and the study page.
---

# Player state model and audio engine invariants

## The audio engine (why it is the way it is)

`src/lib/audio/audioEngine.ts` exports a **module-level singleton**
`audioEngine` (Web Audio API). It fetches the audio file **once**, decodes the
whole thing into an `AudioBuffer` (~210 MB for 20 min mono — deliberate), and
caches exactly **one** buffer; playback-rate changes go through a SoundTouch
worklet for pitch correction (`postinstall` copies `soundtouch-processor.js`
into `public/`).

**Why:** the migration off `<audio>` (PR #23) was driven by **Vercel Blob
egress limits** — an `<audio>` element re-requests byte ranges on every seek,
and looped study means constant seeking. One full fetch, then free in-memory
seeks. Do not reintroduce an `<audio>` element, per-seek fetching, or audio
slicing. Audio responses are also cached 30 days (PR #30) for the same reason.

React talks to the engine through `useAudioEngine(url)`
(`src/hooks/useAudioEngine.ts`), which subscribes to engine notifications.

## Loop state invariants

```ts
type PlayerState = { isPlaying: boolean; loopRange: LoopRange | null; currentTime: number };
type LoopRange = { firstSegmentId: number; lastSegmentId: number };
```

- **`loopRange` is the only loop state.** `isLooping` is derived at the UI
  boundary as `loopRange !== null` — never store a boolean next to it; the two
  will drift.
- A length-1 range (`firstSegmentId === lastSegmentId`) *is* the
  single-segment loop; there is no separate mode.
- Loop enforcement is not in the engine: an effect in `usePlayer`
  (`src/components/player/usePlayer.ts`) watches `engine.currentTime` and, on
  crossing the last segment's `endMs`, calls `audioEngine.play()` at the first
  segment's start with **no pause beat**. A second effect handles the
  end-of-file edge case via `subscribeToEnd`.
- Segment seeks start 0.1s early (`SEGMENT_PLAYBACK_OFFSET_SEC`, applied by
  `segmentStartSec` in `segmentUtils.ts`) — intentional pre-roll, keep it.
- Stale ranges are dropped, not repaired: an effect runs
  `validateRange(segments, range)` when segments change and nulls the range if
  endpoints vanished or the range is non-contiguous.
- The range-loop UI exists (added in PR #36 after an earlier version was
  removed — ignore older references saying it's deferred): `loopRange.ts`
  exports `makeAnchor`, `validateRange`, `isInRange`, `setEndpoint`, and
  `usePlayer` exposes `toggleLoop`, `seekToSegment`, `setLoopEndpoint`,
  `shiftLoopEndpoint` (drag handling in `GutterCell.tsx` / `useLoopDrag.ts`).

## Two loop contexts — intentionally isolated

1. **Episode page** — `usePlayer` + `playerReducer` + `PlayerState.loopRange`.
2. **Per-segment study page** — `StudyScreen.tsx` keeps a local
   `useState` looping flag and drives `audioEngine` / `useAudioEngine`
   **directly**.

`StudyScreen.tsx` must **not** import `usePlayer`, `playerReducer`, or
`PlayerControls`. Its loop is always one segment with known bounds; pulling in
the episode player's range machinery couples the two pages and reintroduces the
shared-state bugs the split was made to avoid. Sharing the `audioEngine`
singleton is fine — only one page is mounted at a time, and the buffer cache
carries over between them (that's a feature).

`loopRange` is not persisted. When persistence is added, copy the localStorage
pattern in `src/components/player/studyNavigation.ts` (which already persists
the "return to segment" focus state across the two pages).

## Working in usePlayer

State management is `useState`/`useReducer` only — **no external state
library**. `usePlayer` mirrors `state` and `segments` into refs
(`stateRef`, `segmentsRef`) so effects and callbacks read current values
without listing them as dependencies. Follow that pattern for new controls;
"fixing" the exhaustive-deps lint by adding `state` to the time-sync effect's
deps re-runs it every tick and causes seek loops.

## Verify

`npx vitest run src/components/player/__tests__/usePlayer.test.ts
src/components/player/__tests__/loopRange.test.ts
src/components/player/__tests__/playerReducer.test.ts` plus
`src/components/__tests__/audioPlayerFlow.test.tsx` for integration. For real
playback behavior (looping across the boundary, rate change pitch), test in the
browser — the engine is mocked in unit tests
(`src/lib/audio/__tests__/mockAudioEngine.ts`).
