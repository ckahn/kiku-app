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
- **Loop enforcement lives in the engine, on the audio rendering thread.**
  `usePlayer` projects `loopRange` down to a time-domain
  `PlaybackBoundary` — `{ kind: 'loop', startSec, endSec }` — via
  `audioEngine.setBoundary()`, and the engine sets the source node's native
  `loop`/`loopStart`/`loopEnd`. That is a one-way push, like
  `setPlaybackRate`: the engine knows nothing about segments, and `loopRange`
  is still the only loop state.
  **Never move the boundary check back into a `currentTime` effect.** A hidden
  page — a locked phone screen — stops being serviced `requestAnimationFrame`,
  so `currentTime` freezes while the audio graph plays on, and the loop runs
  straight past its end until the screen wakes. rAF is now a paint loop only;
  correctness does not depend on it.
  `subscribeToEnd` remains as a safety net for a range the engine rejected as
  degenerate — a natively looping source never ends on its own.
- The engine is a **module-level singleton**, and the boundary is owned by
  whichever consumer is mounted — it is **not** cleared on unmount. React
  mounts the incoming page before unmounting the outgoing one (see the note in
  `EpisodePlayer.tsx`), so a clear-on-unmount runs *after* the next page has
  pushed its boundary and strips it, leaving the engine unbounded for that
  whole visit. Each consumer establishes the boundary on mount instead; only
  `pause()` happens on unmount.
- `currentTime` is wrap-aware: the linear clock keeps counting past `loopEnd`,
  so the getter folds it back into the range. This is what makes the progress
  bar resume at the right position after the page was hidden for many
  iterations, instead of jumping.
- `StudyScreen` uses the same mechanism for its single segment:
  `{ kind: 'loop', … }` when looping, and `{ kind: 'stop', endSec }` when not —
  the "stop at the segment end" behaviour is a scheduled `source.stop()`, also
  immune to a hidden page. A scheduled stop cannot be cancelled, so clearing or
  re-timing one restarts the source node.
- `RandomSegmentCard.tsx` is the third `audioEngine` consumer and uses the same
  `{ kind: 'stop', endSec }` boundary to end its preview at the segment end.
  Any new consumer must push a boundary too — the engine is a singleton and an
  unset boundary means "play to the end of the file".
- `seekToSegment` clears the boundary **before** it seeks when the target
  segment is outside the current range: `play()` pulls a start offset at or
  past `loopEnd` back to `loopStart`, so seeking first would land in the old
  range instead of the tapped segment.
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
src/components/player/__tests__/playerReducer.test.ts
src/lib/audio/audioEngine.test.ts` plus
`src/components/__tests__/audioPlayerFlow.test.tsx` for integration. For real
playback behavior (looping across the boundary, rate change pitch), test in the
browser — the engine is mocked in unit tests
(`src/lib/audio/__tests__/mockAudioEngine.ts`), and the mock's clock is
deliberately linear so those tests cannot accidentally re-prove a React-side
wrap.

jsdom cannot catch a hidden-page regression at all: there is no audio rendering
thread and no page-visibility model. Verify looping-while-locked on a real
device against a **deployed HTTPS build** — `audioWorklet` and service-worker
registration are both secure-context only, so over `http://<lan-ip>:3000` the
SoundTouch worklet silently no-ops and the speed path is not exercised. On the
**episode page**, set a loop, play, lock the screen for a minute: the same range
must still be repeating on unlock, with no jump-back seek.
