# Deck USAGE charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense ◷ USAGE section with a context meter + braille trail (option 9) and a 5h braille line chart (option 1).

**Architecture:** A pure `brailleLine` renderer and pure series helpers live in `hooks/deck-core.ts` (unit-tested). `hooks/deck.tsx` records samples at turn end (context) and in `deckMeasure` (5h) and passes them through `view()`. `deck()` draws the new section.

**Tech Stack:** TypeScript plugin hooks, `claude-code/testing` (`expect`, `test`), run by `make test` (`claude plugin test .`).

**Spec:** `docs/superpowers/specs/2026-11-22-usage-charts-design.md`, plus the task contract in `.claude/helm/task.md`. Reference mock-up: `docs/usage-chart-options.html` (options 9 and 1).

## Global Constraints

- Scope: `hooks/deck-core.ts`, `hooks/deck.tsx`, `hooks/deck.test.tsx`, `types/index.d.ts` only.
- No new dependencies. No frame animation. Series come only from `deckMeasure` (5h) and turn end (context).
- Theme colour names only (`claude`/`success`/`warning`/`error`/`suggestion`/`subtle`). The tone is `level(pct)`.
- Series cap: 120 samples (`SERIES_CAP = 120`). Fixed y range: 0–100.
- No line wider than `w`. USAGE has at most 8 lines at w=46 with both series present.
- Conventional Commits (`/helm:commit` style, no attribution lines).

## Review Focus

1. A 5h `resetsAt` that re-serializes with a few seconds of jitter must not reset the series. Treat it as the same window when the two reset times are within 60 s of each other (test in Task 2).
2. `deckMeasure` fires many times a minute, so keep at most one 5h sample per 60 s; a newer one within 60 s replaces the last (test in Task 2).
3. Non-finite or >100 percentages: `brailleLine` clamps values to [0, max], and the series helpers skip `NaN`/`undefined` (tests in Tasks 1 and 2).
4. An account with no 5h limit in `rateLimits` (API key) gets no 5h block and no crash (test in Task 3).
5. A compaction drop in the context series draws downward, with no gap (the `[100, 0]` case in Task 1).

---

### Task 1: `brailleLine` renderer

**Files:**
- Modify: `hooks/deck-core.ts` (add it near `bar`/`meter`, ~line 175)
- Test: `hooks/deck.test.tsx`

**Interfaces:**
- Produces: `export function brailleLine(values: number[], w: number, h: number, max = 100): string[]`. It returns `h` strings of exactly `w` chars each, top row first; an empty cell is `' '`.

Algorithm (port of `canvas()` in the mock-up): pixel grid `pw = 2w`, `ph = 4h`. Take `v = values.slice(-pw)` and right-align it (`x0 = pw - v.length`). `y(p) = ph-1 - Math.round(clamp(p,0,max)/max*(ph-1))`. Plot the first point. For each next point, step `n = max(|dx|,|dy|,1)` times from the previous point and set `(Math.round(x), Math.round(y))`. Dot bits: left column `[0x01,0x02,0x04,0x40]`, right column `[0x08,0x10,0x20,0x80]` by `y & 3`. A cell is `String.fromCharCode(0x2800 + bits)`, or `' '` when its bits are 0.

- [ ] **Step 1: Write the failing test** `brailleLine: exact cells for flat, rising, drop, multi-row, partial and clamped`

```ts
expect(brailleLine([50, 50, 50, 50], 2, 1)).toEqual(['⠒⠒'])
expect(brailleLine([0, 100], 1, 1)).toEqual(['⡜'])
expect(brailleLine([100, 0], 1, 1)).toEqual(['⢣'])          // compaction / reset drop
expect(brailleLine([0, 100], 1, 2)).toEqual(['⢸', '⡇'])
expect(brailleLine([0, 100], 2, 1)).toEqual([' ⡜'])          // newest at the right edge
expect(brailleLine([], 2, 1)).toEqual(['  '])
expect(brailleLine([150, 150], 1, 1)).toEqual(['⠉'])         // clamped to max
expect(brailleLine([0, 10, 20, 30, 40, 50, 60, 70, 80, 90], 3, 1)).toEqual(['⠔⠒⠊']) // last 2·w only
```
Add `brailleLine` to the import on `hooks/deck.test.tsx:2`.

- [ ] **Step 2:** Run `make test`. Expected: FAIL (`brailleLine` is not exported).
- [ ] **Step 3:** Implement `brailleLine` in `hooks/deck-core.ts` as above.
- [ ] **Step 4:** Run `make test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(deck): add braille line renderer`.

### Task 2: Usage series in state

**Files:**
- Modify: `hooks/deck-core.ts:14-39` (`DeckData`), plus new helpers
- Modify: `types/index.d.ts:25-46` (`DeckState`)
- Modify: `hooks/deck.tsx`: turn end `:197-203`, `deckMeasure` `:225-227`, reset `:344`
- Test: `hooks/deck.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (in `hooks/deck-core.ts`):
  - `export const SERIES_CAP = 120`
  - `export function addCtx(series: number[] | undefined, pct: number | undefined): number[]`: appends a finite pct; drops the oldest past the cap; returns the series unchanged (or `[]`) for a non-finite pct.
  - `export type FiveSample = { at: number; pct: number }`
  - `export function addFive(series: FiveSample[] | undefined, windowAt: number | undefined, pct: number | undefined, resetsAt: string | number | undefined, at: number): { fiveSeries: FiveSample[]; fiveAt?: number }`. It starts a new series when `resetMs(resetsAt)` differs from `windowAt` by more than 60 000 ms. Within 60 s of the last sample it replaces that sample. It caps at `SERIES_CAP` and skips a non-finite pct.
  - New fields on both `DeckData` and `DeckState`: `ctxSeries?: number[]`, `fiveSeries?: FiveSample[]`, `fiveAt?: number` (the current window's reset time in ms).

- [ ] **Step 1: Write the failing tests** `series: context per turn, capped` and `series: 5h per minute, resets with its window`

```ts
let c: number[] = []
for (let i = 0; i < 130; i++) c = addCtx(c, i % 100)
expect(c.length).toBe(120)
expect(c.at(-1)).toBe(29)
expect(addCtx([5], NaN)).toEqual([5])

const R = 10 * 3.6e6
let f = addFive(undefined, undefined, 10, R, 0)
f = addFive(f.fiveSeries, f.fiveAt, 11, R + 2000, 30_000)         // jitter, same minute: replaced
expect(f.fiveSeries).toEqual([{ at: 30_000, pct: 11 }])
f = addFive(f.fiveSeries, f.fiveAt, 12, R, 90_000)                 // a new minute: appended
expect(f.fiveSeries.map(x => x.pct)).toEqual([11, 12])
f = addFive(f.fiveSeries, f.fiveAt, 1, R + 5 * 3.6e6, 200_000)     // a new window: reset
expect(f.fiveSeries).toEqual([{ at: 200_000, pct: 1 }])
let g = { fiveSeries: [] as FiveSample[], fiveAt: R as number | undefined }
for (let i = 0; i < 130; i++) g = addFive(g.fiveSeries, g.fiveAt, i % 100, R, i * 60_000)
expect(g.fiveSeries.length).toBe(120)
expect(addFive([{ at: 0, pct: 3 }], R, undefined, R, 120_000).fiveSeries).toEqual([{ at: 0, pct: 3 }])
```

- [ ] **Step 2:** Run `make test`. Expected: FAIL (the helpers are not exported).
- [ ] **Step 3:** Implement `SERIES_CAP`, `addCtx`, `FiveSample` and `addFive` in `hooks/deck-core.ts` (reuse `resetMs`). Add the fields to `DeckData` and to `DeckState` in `types/index.d.ts`.
- [ ] **Step 4:** Wire them up in `hooks/deck.tsx`:
  - Turn end (both returns at `:200` and `:203`): `ctxSeries: addCtx(s.ctxSeries, ctxPct(s))`, where `ctxPct` is the expression already used in `view()` at `:69` (extract it into a local helper).
  - `deckMeasure`: find the five-hour limit with the same `/five|5h/i` test `deck()` uses, then spread `addFive(s.fiveSeries, s.fiveAt, l?.percentUsed, l?.resetsAt, await $.clock.now())` into the state. Read the clock before `set`.
  - Reset `:344`: keep `fiveSeries` and `fiveAt` (account-wide); drop `ctxSeries`.
  - `view()` already spreads `s`, so the fields pass through.
- [ ] **Step 5:** Run `make test`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(deck): record context and 5h usage series`.

### Task 3: New USAGE section

**Files:**
- Modify: `hooks/deck-core.ts:182-207` (`meter`, `stackBar`, `PART_TONES`) and `:300-333` (usage)
- Modify: `hooks/deck.tsx:45-53` (the `ctxParts` breakdown fetch) and `types/index.d.ts:46` (`ctxParts`)
- Test: `hooks/deck.test.tsx:41`, `:46-48`, `:61-73`, `:84`, `:139`, `:326-334`

**Interfaces:**
- Consumes: `brailleLine` (Task 1); `ctxSeries`, `fiveSeries` on `DeckData` (Task 2).
- Produces: `meter(label, p, w, c, value, mark?, trail?: string)`. When `trail` is given, the bar shrinks by `trail.length + 1` and the line ends with `' ' + trail` in tone `c`. The `stack` parameter is removed.

Layout (`narrow = w < 40`, `tw = Math.floor(w * 0.3)`):
1. `context` row: `meter('context', p/100, w, level(p), [pct, ⟲…], undefined, ctxSeries.length >= 2 ? brailleLine(ctxSeries, tw, 1)[0] : undefined)`.
2. 5h, when the limit exists and `fiveSeries.length >= 2`: a header line `[{ t: '5h'.padEnd(narrow ? 5 : 8), d: true }, { t: pct%, c: level, b: true }, ...(narrow ? [] : [{ t: '  ↻' + fmtDur(r - now), d: true }])]`, then `brailleLine(pcts, w, narrow ? 2 : 3)` rows, each one segment in `level(pct)`. Otherwise fall back to the existing `limit('5h', five)` meter.
3. The week meter, unchanged.
4. One dim line `$4.80 · 4.0k tok`, built from `d.cost` and `tokenSplit(tk).total`. Show each part only when known (cost defined, total > 0), joined by ` · `.

- [ ] **Step 1: Update the tests first**
  - `:41`: drop `'cache 82%'` from the contains list; add `expect(t).not.toContain('cache')` and `expect(t).not.toContain('■')`.
  - `:46-48`: check bar alignment for `context` and `week`. Use a `data()` that has a `seven_day` limit and no series, so the plain meters show.
  - `:61-70`: replace the token-split expectations with `expect(t).toContain('$4.80 · 4.0k tok')`, keep the `/h` and `rate ` negatives, and `expect(big).not.toContain('1.4M')`.
  - `:84`, `:139`: remove `ctxParts: PARTS`. Delete the `PARTS` const and the stackBar/legend test at `:326-334`. Remove `stackBar` from the import.
  - New test `usage: context trail and 5h braille chart`:

```ts
const ser = { ctxSeries: [20, 30, 45, 59], fiveSeries: [0, 10, 20, 30, 42].map((pct, i) => ({ at: i * 60_000, pct })) }
const rows = (w: number, x = {}) => deck(data({ ...ser, ...x }), w, 0, 3.6e6).find(s => s.id === 'usage')!.body.map(l => l.map(s => s.t).join(''))
const B = /[⠁-⣿]/
const u = rows(46)
expect(u[0]).toMatch(/^context .*59%.*[⠁-⣿]/)
expect(u[1]).toMatch(/^5h +42% +↻/)
expect(u.slice(2, 5).every(r => r.length === 46)).toBe(true)
expect(u.slice(2, 5).some(r => B.test(r))).toBe(true)
expect(u.length).toBeLessThanOrEqual(8)
for (const r of u) expect([...r].length).toBeLessThanOrEqual(46)
const n = rows(32)
expect(n[1]).not.toContain('↻')
expect(n.slice(2).filter(r => B.test(r)).length).toBe(2)
for (const r of n) expect([...r].length).toBeLessThanOrEqual(32)
// fewer than 2 samples: plain meters, no braille
const few = rows(46, { ctxSeries: [59], fiveSeries: [{ at: 0, pct: 42 }] })
expect(few.some(r => B.test(r))).toBe(false)
expect(few.some(r => /^5h .*42%/.test(r))).toBe(true)
// no 5h limit (API key): no 5h block
expect(rows(46, { limits: [] }).some(r => r.startsWith('5h'))).toBe(false)
```

- [ ] **Step 2:** Run `make test`. Expected: FAIL on the new test and the changed lines.
- [ ] **Step 3:** Change `meter` (add `trail`, remove `stack`). Delete `stackBar` and `PART_TONES`. Rewrite the usage block at `:300-333` to the layout above.
- [ ] **Step 4:** Remove the `ctxParts` breakdown fetch in `hooks/deck.tsx:45-53`, and `ctxParts` from `DeckData`/`DeckState`. Keep `tokenSplit` (used by `totalTok`).
- [ ] **Step 5:** Run `make test`. Expected: PASS. Then run `make validate`. Expected: exit 0.
- [ ] **Step 6:** Print a sample render for the report: in a scratch test, log `layout` of `deck(data(ser), w, 0, 3.6e6)` at w=46 and w=32, then delete the scratch test.
- [ ] **Step 7:** Commit `feat(deck): lighter usage section with braille charts`.
