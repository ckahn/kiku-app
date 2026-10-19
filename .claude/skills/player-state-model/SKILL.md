---
name: player-state-model
description: Use when touching audio playback, looping, usePlayer, playerReducer, AudioEngine, or the StudyScreen player — and especially when tempted to add an isLooping boolean, a second audio element, per-seek fetching, an external state library, or to share player state between the episode page and the study page.
---

# Player state model and audio engine invariants

## The audio engine (why it is the way it is)

`src/lib/audio/audioEngine.ts` exports a **module-level singleton**
`audioEngine`, typed as `PlaybackEngine`. `AUDIO_ENGINE_STRATEGY` in
`src/lib/constants.ts` picks the implementation:

- **`'media-element'` (default)** — `MediaElementEngine`
  (`mediaElementEngine.ts`). Fetches the file **once** in full, turns the Blob
  into an object URL, and plays it on one native `<audio>` element. Seeks read
  local bytes; only the compressed file is in memory. Speed is the element's
  pitch-preserving `playbackRate` (no worklet; `workletReady` is always true).
- **`'web-audio'` (fallback)** — `AudioEngine`. Fetches once, decodes into one
  `AudioBuffer` (~210 MB per 20 min mono), speed through a SoundTouch worklet
  (`postinstall` copies `soundtouch-processor.js` into `public/`). Kept until
  the media-element engine is proven on device; delete it and SoundTouch
  together.

**Why it is this way:** the original `<audio>` element *streamed* from the
audio route, and every seek became a new range request against Vercel Blob
egress limits. PR #23 fixed that with the Web Audio engine, but Web Audio has
no OS media controls, unreliable screen-off playback, and two-stage
resample + SoundTouch slowdown that sounds bad. The media-element engine keeps
the one-full-fetch property and gets those back. **The rule is "one full fetch
per episode", not "no `<audio>`"**: never point an element at the network URL
(`/api/episodes/<id>/audio`) — that brings back per-seek range requests. No
per-seek fetching, no audio slicing. Audio responses are also cached 30 days
(PR #30) for the same reason.

**Seek accuracy depends on the file format with the media-element engine.**
MP3 has no time→byte index, so Chrome estimates seek positions from the
bitrate; VBR files can land far off target and report a wrong `currentTime`.
AAC in an M4A (MP4) container has exact sample tables. If segment starts are
audibly off, convert the audio rather than changing the engine.

The element's own `play`/`pause`/`ended` events are the source of truth for
`isPlaying` — the OS (media notification, headphones, audio focus) can pause it
without the engine asking.

**OS media controls** come from `useMediaSession` (`src/hooks/useMediaSession.ts`
over `src/lib/audio/mediaSession.ts`). Each page that plays audio registers
handlers: the episode page maps previous/next to the adjacent segment
(`findAdjacentSegmentId`); `StudyScreen` and `RandomSegmentCard` map play to
"restart the segment", because after a stop boundary the engine has rewound to
0:00 and the element's default play would start the episode from the top.
Like the boundary, handlers are not stripped on unmount — `claimMediaSession`
hands back a release that only clears handlers it still owns.

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
- **Loop enforcement lives in the engine.**
  `usePlayer` projects `loopRange` down to a time-domain
  `PlaybackBoundary` (`playbackBoundary.ts`) — `{ kind: 'loop', startSec, endSec }` — via
  `audioEngine.setBoundary()`. The media-element engine aims a `setTimeout`
  at the boundary (re-armed on play, seek, `seeked`, rate change; re-checked
  if it fires early; `timeupdate` as a backup) — Chrome does not throttle
  timers in an audible tab. Wraps land within tens of ms with a short gap.
  The Web Audio engine sets the source node's native
  `loop`/`loopStart`/`loopEnd` (sample-accurate, gapless). That is a one-way push, like
  `setPlaybackRate`: the engine knows nothing about segments, and `loopRange`
  is still the only loop state.
  **Never move the boundary check back into a `currentTime` effect.** A hidden
  page — a locked phone screen — stops being serviced `requestAnimationFrame`,
  so `currentTime` freezes while the audio graph plays on, and the loop runs
  straight past its end until the screen wakes. rAF is now a paint loop only;
  correctness does not depend on it.
  `subscribeToEnd` remains as a safety net for a range the engine rejected as
  degenerate — a looping engine never ends on its own.
- The engine is a **module-level singleton**, and the boundary is owned by
  whichever consumer is mounted — it is **not** cleared on unmount. React
  mounts the incoming page before unmounting the outgoing one (see the note in
  `EpisodePlayer.tsx`), so a clear-on-unmount runs *after* the next page has
  pushed its boundary and strips it, leaving the engine unbounded for that
  whole visit. Each consumer establishes the boundary on mount instead; only
  `pause()` happens on unmount.
- `currentTime` is wrap-aware. The media-element engine reads the element's
  real position, so this is automatic; the Web Audio engine's linear clock
  keeps counting past `loopEnd`, so its getter folds it back into the range. This is what makes the progress
  bar resume at the right position after the page was hidden for many
  iterations, instead of jumping.
- `StudyScreen` uses the same mechanism for its single segment:
  `{ kind: 'loop', … }` when looping, and `{ kind: 'stop', endSec }` when not —
  the "stop at the segment end" behaviour is the engine's stop boundary (a
  timer on the media-element engine, a scheduled `source.stop()` on Web
  Audio), also immune to a hidden page. On Web Audio a scheduled stop cannot be
  cancelled, so clearing or re-timing one restarts the source node.
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
src/lib/audio/mediaElementEngine.test.ts src/lib/audio/mediaSession.test.ts
src/lib/audio/audioEngine.test.ts` plus
`src/components/__tests__/audioPlayerFlow.test.tsx` for integration. For real
playback behavior (looping across the boundary, rate change pitch), test in the
browser — the engine is mocked in unit tests
(`src/lib/audio/__tests__/mockAudioEngine.ts`), and the mock's clock is
deliberately linear so those tests cannot accidentally re-prove a React-side
wrap.

jsdom cannot catch a hidden-page regression at all: there is no media
playback, no audio rendering thread and no page-visibility model
(`mediaElementEngine.test.ts` drives a fake element and fake timers). Verify on
a real device against a **deployed HTTPS build** — the Media Session API,
`audioWorklet` and service-worker registration are secure-context only, so
`http://<lan-ip>:3000` does not exercise them. Check:

- **Screen-off loop:** on the episode page, set a loop, play, lock the screen
  for a minute — the same range must still be repeating on unlock.
- **Media controls:** the notification shows play/pause and previous/next;
  next moves playback (and an active loop) to the following segment.
- **Seek accuracy:** tap segments deep into a long episode — each must start
  on its first word. Drift here means the file format (VBR MP3), not the engine.
- **Speed:** 0.75× should sound natural, not warbly.
