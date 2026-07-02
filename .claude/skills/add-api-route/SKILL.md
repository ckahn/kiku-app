---
name: add-api-route
description: Use when adding a new API route or endpoint under src/app/api, or modifying request validation / response shape / error handling in an existing route. Covers the response envelope, Zod validation at the boundary, Next 16 async params, and the colocated route-test pattern.
---

# Recipe: add an API route

## Pattern files to copy

- **Simple mutation with body validation:**
  `src/app/api/segments/[id]/study/route.ts` (PATCH)
- **Param coercion + lazy generation + 404/500 split:**
  `src/app/api/segments/[id]/study-guide/route.ts` (GET)
- **Create with unique-violation handling:**
  `src/app/api/podcasts/[id]/episodes/route.ts` (POST)

## Rules the existing routes all follow

1. **Response envelope, always.** `apiOk(data, status?)` / `apiErr(message, status)`
   from `src/lib/api-response.ts` — every response is
   `{ success, data?, error?, meta? }`. Never bare `NextResponse.json` (the one
   exception is `src/app/api/blob/upload/route.ts`, which must return the
   `@vercel/blob` `handleUpload` payload verbatim).
2. **Next 16 async params.** The second handler argument is
   `{ params }: { params: Promise<{ id: string }> }` — you must `await params`.
   Forgetting the `Promise` type compiles against stale examples but fails the
   build.
3. **Validate at the boundary with Zod.** Params:
   `z.object({ id: z.coerce.number().int().positive() })` + `safeParse` →
   `apiErr('invalid segment id', 400)`. Body: `const body: unknown = await
   request.json()` then a schema; on failure return
   `result.error.issues[0].message` with 400.
4. **Status codes in use:** 400 invalid input · 404 row not found · 409
   state conflict (status guards, unique violations — Postgres code `'23505'`,
   see `isUniqueViolation` in the episodes route) · 500 via
   `getErrorMessage(error)` from `src/lib/utils.ts` inside a
   `catch (error: unknown)`.
5. **DB through helpers.** Routes call functions in `src/db/`
   (`getSegmentById`, `updateSegmentStudyStatus`, …), not inline drizzle
   queries, when a helper exists — add new helpers there so route tests can
   mock the module boundary.
6. **`export const maxDuration = 60`** only on routes that call external APIs
   (transcribe, segment, study-guide). Plain CRUD routes omit it.
7. Server-side logging with a bracketed prefix:
   `console.error('[study-guide] segment ${id} failed', error)`.

## Test pattern (colocated `__tests__/route.test.ts`)

Copy `src/app/api/segments/[id]/study/__tests__/route.test.ts`:

- `vi.mock('@/db/segments', () => ({ ... }))` with `vi.fn()`s hoisted above.
- `beforeEach`: `vi.resetModules()` + reset each mock.
- Import the handler **dynamically after resetModules**:
  `const { PATCH } = await import('../route');`
- Build a plain `new Request('http://localhost/...', { method, body })` and
  pass `{ params: Promise.resolve({ id }) }`.
- Assert on `response.status` and the parsed envelope (`json.data`,
  `json.error`).

Cover at minimum: happy path, invalid id (400), invalid body (400), not found
(404), and the helper throwing (500).

## Checklist

1. Create `src/app/api/<path>/route.ts` following the rules above.
2. Add/extend the `src/db/` helper it needs.
3. Write the colocated route test.
4. Add the route to the **API Routes table in `CLAUDE.md`** — it is the
   canonical route inventory and goes stale silently.
5. Verify: `npx vitest run src/app/api/<path>/__tests__/route.test.ts`, then
   `npm run test` and `npm run lint`. If the client calls it, type the fetch
   result as `ApiResponse<T>` (imported from `@/lib/api-response`) — see
   `StudyScreen.tsx` for the pattern.
