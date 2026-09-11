# PROGRESS — Quest v2 ("Exodus")

Branch `v2`. Snapshot of live Payments taken **2026-09-11 02:07 UTC** (`npm run snapshot`).
Last full verification (build · lint · 96 unit tests · 35 Playwright tests): **2026-09-11**.

## Live vs. verified numbers (2026-09-10 spec)

| Metric | Spec | Live snapshot | Status |
|---|---|---|---|
| Lots on subdivided farms | 101 (per-farm list sums to 109) | **109** across 9 farms, per-farm counts identical | see OPEN_QUESTIONS #2 |
| File cases on those lots | 71 | **71** | ✓ |
| Σ `file_cases.sale_price` | $8,986,794.30 | **$8,986,794.30** | ✓ |
| Completed / active | 32 / 39 | **32 / 39** | ✓ |
| Cash / financed | 7 / 64 | **7 / 64** | ✓ |
| Notes sold / Σ `note_sales.sale_price` | 15 / $1,356,405.86 | **15 / $1,356,405.86** | ✓ |
| Investor distributions | 32 / $793,990.46 | **32 / $793,990.46** | ✓ |
| `property_costs` | 13 / $5,797,147.50 | **13 / $5,797,147.50** | ✓ |
| Profit-share investor | Townson Family (Wichita, Lamar) | **Townson Family (Wichita, Lamar)** | ✓ |
| Quality panel | Titus 6, Lamar 5/6/7, Eastland 3 | all five listed as `price_mismatch` (+ Lamar 5 date, Eastland 3 test client) | ✓ |

No drift detected between the spec date and the snapshot. The ledger totals row shows the
contract-price total ($8,986,794.30) — the Playwright suite asserts that exact string.

## Definition of Done — status

| Item | Status | Evidence |
|---|---|---|
| `npm run build` zero TS errors (strict) | ✓ | `tsc -b && vite build` clean; largest chunk is Recharts (553 kB, gzip 157 kB) |
| `npm run lint` clean | ✓ | ESLint 9, zero warnings |
| `npm run test` ≥ 40 tests in `src/domain/**` incl. fixture tests | ✓ | **96** tests / 7 files; `fixture.test.ts` reproduces every row of the table above from `src/domain/__fixtures__/payments.json` |
| `scripts/snapshot.ts` read-only fixture generator | ✓ | signs in as viewer, runs the app's own `select` queries, writes the fixture |
| `npm run e2e` logs in, counter > 0, ledger total $8,986,794.30 | ✓ | **35** Playwright tests pass (setup + desktop + mobile) |
| 10 routes without console errors, desktop and 390px | ✓ | route smoke test per viewport, fails on any `console.error` / page error |
| Zero `select("*")`, key-like literals, mock data in `src/` | ✓ | grep audit (see below) |
| `README.md` | ✓ | setup, env vars, scripts, routes, domain rules in plain English |
| `PROGRESS.md`, `OPEN_QUESTIONS.md` | ✓ | this file; 20 assumptions listed |
| `sql/proposed_views.sql` | ✓ | 6 commented views, not applied |

### Audit commands used
```
rg 'select\("\*"\)|select\(\s*"\*"' src          # 0 hits
rg -i 'eyJ[a-zA-Z0-9_-]{20,}|sk_live|service_role|apikey' src   # 0 hits
rg -il 'mock|sample|dummy|faker|lorem' src       # 0 hits
```
The only JSON under `src/` is `src/domain/__fixtures__/payments.json`, the live snapshot.

## Done

- [x] Repo scaffold: Vite 6 + React 18 + TS strict + Tailwind 3 + shadcn-style primitives + TanStack Query + Router v6 + Recharts + Framer Motion + Vitest + Playwright; `.env.example`; ESLint flat config with a rule that keeps `src/domain` free of React/Supabase imports.
- [x] `scripts/snapshot.ts` (read-only).
- [x] Data layer: `src/data/queries/` with explicit column lists, `notes.is_test = false`, `clients.is_test = false`, never `ssn_itin_encrypted`, per-table error collection surfaced as a banner.
- [x] Domain layer (`src/domain/`, pure TS): lot, interest, farm, goal, quality (15 issue kinds), events, investors, treasury, oracle, trophies (20), realm.
- [x] 96 unit tests, 30 of them fixture-based.
- [x] Auth (`/login`), app shell with sidebar + mobile bottom nav, `RequireAuth`.
- [x] All 10 routes: Throne Room, Realm map (SVG, hover tooltip, farm drawer), Quests ledger (filters, sort, totals), Sponsors, Treasury (chart + table), Oracle (sliders seeded from trailing averages), Chronicle (milestone celebrations), Trophies, Quality.
- [x] v1 components rebuilt from their descriptions: `AnimatedCounter`, `ProgressRing`, `MilestoneCelebration`, `GrowthBurst`, `QuestTree`, `CinematicIntro`, `Trophies`.
- [x] Playwright suite, desktop and 390px.
- [x] README, `sql/proposed_views.sql`.

## Partial / known limitations

- The v1 repo was unreachable, so colours, easing curves and exact component behaviour are
  reconstructed, not ported (OPEN_QUESTIONS #1).
- `CinematicIntro` plays once per browser session (stored in `sessionStorage`); it is skipped
  when `prefers-reduced-motion` is set.
- Performance: first paint is a small `index` chunk; Recharts, Framer Motion and Supabase are
  split into their own chunks and the pages are lazy routes. No throttled-connection measurement
  was taken in this environment.
- Payments views (`v_note_summary`, …) were not introspected or used.

## Computed headline (as of 2026-09-11, from the fixture)

- Net profit to date **$2,272,304.32** (22.7 % of $10M) · pipeline **$2,222,188.97** · cash realized **$2,156,494.30** · capital outstanding to investors **$4,369,399.48**.
- 38 closed (14 with note sold) · 33 reserved · 38 available.
- Trailing-90-day pace **4.4 lots/month**; required **8.31 lots/month**; ~130 lots still needed → inventory gap 92 lots ≈ 8 more farms at 12.1 lots/farm.

## What I would do next

1. Confirm OPEN_QUESTIONS #2–#5 and #18 with Rodrigo — they move the headline number.
2. Get read access to the v1 repo and port the exact colour tokens and animations.
3. Review and apply `sql/proposed_views.sql` in Payments, then swap `fetchPaymentsSnapshot` to read the views (keeping the domain tests as a cross-check).
4. Add a Lighthouse / throttled-network budget check to CI for the "< 2 s first meaningful paint" target.
5. Add a `farm_acquisitions.is_subdivided` column so `LEGACY_FARM_NAMES` can go away.
