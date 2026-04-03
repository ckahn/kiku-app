# Milestone 1.5: Design Foundation

## Context

Before building the transcript/study UI (M2+), we need a coherent visual language. Right now the app uses default Tailwind colors and ad-hoc inline styles with no reusable components. The risk: building M2-M5 screens that look inconsistent and need a full redesign pass later. This milestone front-loads that work.

**Current baseline:**
- Tailwind CSS v4 (PostCSS plugin, CSS-based config in `globals.css`)
- No custom theme tokens — raw Tailwind color names hardcoded throughout
- No shared UI primitives — buttons, inputs, badges all inline
- Font: Geist Sans (configured) but body falls back to Arial
- All pages are `max-w-2xl mx-auto p-6` shells — no shared layout component
- No mobile-specific styling (this is primarily a listening app used on phones)

**Critical files:**
- `src/app/globals.css` — Tailwind v4 theme via `@theme inline`
- `src/app/layout.tsx` — root layout, font setup
- `src/components/` — existing components to refactor
- `src/app/page.tsx`, `src/app/podcasts/[slug]/page.tsx`, `src/app/podcasts/[slug]/episodes/[number]/page.tsx`

---

## Step 1: Typography — Noto Sans JP + Latin fallback

**Goal:** Japanese text renders beautifully everywhere in M2+.

**Changes:**
- Add `next/font/google` import for `Noto_Sans_JP` (weights: 400, 500, 700; subset: `latin`, `latin-ext`)
- Keep a Latin fallback — swap Geist Sans for `Inter` (better Latin complement to Noto)
- Update `layout.tsx` to load both fonts and set CSS variables: `--font-jp`, `--font-latin`
- Update `globals.css` `@theme inline` to wire `font-sans` to `var(--font-latin)` and add `font-jp` utility
- Update `<body>` to use `font-sans` (via Tailwind) — eliminate the Arial hardcode
- Smoke test: verify Japanese characters render with Noto glyphs in dev

**Files touched:** `src/app/layout.tsx`, `src/app/globals.css`

**Commit:** `feat: load Noto Sans JP + Inter fonts, wire Tailwind font-sans`

---

## Step 2: Design tokens — color palette and spacing scale

**Goal:** A semantic color system and consistent spacing so future components use named tokens, not raw Tailwind values.

**Changes:**
- In `globals.css` `@theme inline`, define:
  - **Surface colors:** `--color-bg`, `--color-surface`, `--color-border`, `--color-border-subtle`
  - **Brand colors:** `--color-primary` (a warm ink color — not generic blue-600), `--color-primary-hover`
  - **Text:** `--color-text`, `--color-text-muted`, `--color-text-disabled`
  - **Status semantic colors:** `--color-success`, `--color-warning`, `--color-error`, `--color-info` (maps status to named tokens, not `green-100` etc.)
  - Dark mode counterparts via `@media (prefers-color-scheme: dark)` block
- Map Tailwind utilities to these tokens (e.g., `bg-surface`, `text-muted`, `border-subtle`)
- Update `src/lib/constants.ts` `STATUS_COLORS` to use new token-based classes
- No visual changes to existing screens yet — tokens just replace existing values

**Files touched:** `src/app/globals.css`, `src/lib/constants.ts`

**Commit:** `feat: define semantic color tokens in Tailwind v4 theme`

---

## Step 3: UI primitives — Button, Input, Badge

**Goal:** Eliminate repeated inline styling; give future screens consistent interactive elements.

**New files:**
- `src/components/ui/Button.tsx` — variants: `primary`, `secondary`, `ghost`; sizes: `sm`, `md`; loading + disabled states
- `src/components/ui/Input.tsx` — text input wrapper with label, error message slot; uses token colors
- `src/components/ui/Badge.tsx` — small status pill; accepts `variant` prop (`success | warning | error | info | neutral`)
- `src/components/ui/index.ts` — barrel export

**Refactor existing components** to use these primitives:
- `PodcastCreateForm.tsx` — use `<Button>` and `<Input>`
- `EpisodeUploadForm.tsx` — use `<Button>` and `<Input>`
- `EpisodeList.tsx` — use `<Badge>` for status

**Tests:** Unit tests for each primitive (renders correct variant classes, passes through HTML props, shows error state).

**Files touched:** `src/components/ui/` (new), `src/components/PodcastCreateForm.tsx`, `src/components/EpisodeUploadForm.tsx`, `src/components/EpisodeList.tsx`

**Commit:** `feat: add Button, Input, Badge primitives; refactor forms to use them`

---

## Step 4: Page layout shell

**Goal:** A shared `PageShell` component so all pages have consistent structure — no more copy-pasted `max-w-2xl mx-auto p-6` in every file.

**New files:**
- `src/components/layout/PageShell.tsx` — wraps page content; handles max-width, horizontal padding, vertical rhythm; accepts optional `title`, `backHref`/`backLabel` for breadcrumb
- `src/components/layout/index.ts` — barrel export

**Refactor existing pages** to use `PageShell`:
- `src/app/page.tsx`
- `src/app/podcasts/[slug]/page.tsx`
- `src/app/podcasts/[slug]/episodes/[number]/page.tsx`

Also update root `layout.tsx`: add a minimal site header (app name + nav link) as a sticky top bar, since M4 will add a global audio player bar at the bottom.

**Files touched:** `src/components/layout/` (new), all three page files, `src/app/layout.tsx`

**Commit:** `feat: add PageShell layout component, refactor all pages to use it`

---

## Step 5: Polish — podcast list page

**Goal:** The home page (podcast list + create form) looks intentional and production-quality.

**Changes:**
- Podcast cards: give each card more visual weight — readable heading, description truncation, episode count, subtle hover transition
- Create form: improve spacing, label positions, placeholder text
- Empty state: a friendly message when there are no podcasts yet
- Mobile: full-width cards, comfortable tap targets (min 44px height)

**Files touched:** `src/app/page.tsx`, `src/components/PodcastList.tsx`, `src/components/PodcastCreateForm.tsx`

**Commit:** `feat: polish podcast list page`

---

## Step 6: Polish — podcast detail page

**Goal:** The podcast detail page (metadata + episode list + upload form) looks production-quality.

**Changes:**
- Page header: podcast name as large heading, description with proper text wrap, consistent spacing from back link
- Upload form: clear section heading, compact layout; success feedback after upload
- Episode list: episode number + title in each card, status badge positioned consistently, `duration_ms` formatted as `MM:SS` if available
- Empty state for episode list
- Mobile: upload form fields stack cleanly on narrow screens

**Files touched:** `src/app/podcasts/[slug]/page.tsx`, `src/components/EpisodeList.tsx`, `src/components/EpisodeUploadForm.tsx`

**Commit:** `feat: polish podcast detail page`

---

## Step 7: Polish — episode detail page

**Goal:** The episode detail page (metadata + status) looks production-quality and is ready for M2 to layer transcript content onto. Also validates Japanese typography by rendering a static sample.

**Changes:**
- Status badge prominent at top; `error_message` shown inline when status is `error`
- Episode metadata displayed in a clean definition-list layout (duration, created date, audio link)
- **Static Japanese typography sample** — a hardcoded chunk from `fixtures/chunks.json` rendered in the transcript area, so the font, line height, and furigana sizing are reviewable before M3 wires up real data. Clearly marked with a `<!-- TODO(M3): replace with real chunks -->` comment and a visible "Sample — transcript pending" label in the UI.
- Mobile: all metadata readable at small sizes

> **Cleanup required in M3** (Milestone 3: Chunking + Furigana): when real chunks are rendered, remove the static sample block from this page.

**Files touched:** `src/app/podcasts/[slug]/episodes/[number]/page.tsx`

**Commit:** `feat: polish episode detail page`

---

## Verification

After all steps:

1. `npm run dev` — visually inspect all three pages at mobile (375px) and desktop (1280px) widths
2. `npm run lint` — no ESLint errors
3. `npm run test` — all existing 37 fixture tests pass; new primitive tests pass; coverage ≥ 80%
4. `npm run build` — production build succeeds with no type errors
5. Check Japanese text renders: navigate to any page, paste a Japanese string in the podcast name field — confirm Noto Sans JP glyphs appear (not Arial boxes)
