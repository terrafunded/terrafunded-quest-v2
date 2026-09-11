# PROGRESS — Quest v2 ("Exodus")

Branch `v2`. Snapshot of live Payments taken **2026-09-11 02:07 UTC** (`npm run snapshot`).
Last full verification (build · lint · 146 unit tests · 47 Playwright tests): **2026-09-11**.

Order of work, as requested: Phase 1 numbers verified → connection check → domain reproduces the
verified numbers → **Phase 2: Epic** (this section is at the end of the file).

## Payments connection check (`npm run check`, 2026-09-11 02:52 UTC)

`scripts/check-connection.ts` signed in as the viewer against `rruscfrrukagpgymifhq.supabase.co`
and ran `select count(*)` (HEAD request) on every table Quest reads:

| Table | Count | Expected | |
|---|---|---|---|
| `file_cases` | 71 | — | matches the 71 file cases on subdivided farms (OPEN_QUESTIONS #14) |
| `notes` | 56 | — | 56 with `is_test = false` (no test notes visible) |
| `properties` | 129 | — | 109 on subdivided farms + 20 on legacy/one-off farms |
| `farm_acquisitions` | 13 | 13 | ✓ |
| `investors` | 7 | 7 | ✓ |
| `investor_distributions` | 32 | 32 | ✓ |
| `property_costs` | 13 | 13 | ✓ |
| `note_sales` | 15 | 15 | ✓ |
| `clients` | 105 | — | 102 with `is_test = false` (3 test clients) |

**Read-only confirmed.** One dummy insert into `property_costs` (a real `farm_acquisition_id`,
amount 0.01, description `QUEST_CONNECTION_CHECK_DUMMY_ROW`) was **rejected** with Postgres
`42501 — new row violates row-level security policy for table "property_costs"`. Nothing was
written; no clean-up was needed; no red warning is required. This probe is the only write
attempt in the repository and lives in `scripts/`, never in `src/` (OPEN_QUESTIONS #22).

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
| `npm run test` ≥ 40 tests in `src/domain/**` incl. fixture tests | ✓ | **146** tests / 9 files; `fixture.test.ts` reproduces every row of the table above from `src/domain/__fixtures__/payments.json`; `epic_fixture.test.ts` pins every Phase 2 number below |
| `scripts/snapshot.ts` read-only fixture generator | ✓ | signs in as viewer, runs the app's own `select` queries, writes the fixture |
| `npm run e2e` logs in, counter > 0, ledger total $8,986,794.30 | ✓ | **47** Playwright tests pass (setup + desktop + mobile) |
| Phase 2 e2e: Debt counter and Oxygen score | ✓ | capital owed > 0, days left == days to 2027-12-31, per-day > 0 and < owed; Oxygen score == Σ ledger "days gained" (≥ 0) |
| 10 routes without console errors, desktop and 390px | ✓ | route smoke test per viewport, fails on any `console.error` / page error |
| Zero `select("*")`, key-like literals, mock data in `src/` | ✓ | grep audit (see below) |
| `README.md` | ✓ | setup, env vars, scripts, routes, domain rules in plain English |
| `PROGRESS.md`, `OPEN_QUESTIONS.md` | ✓ | this file; 31 assumptions listed |
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
- [x] Domain layer (`src/domain/`, pure TS): lot, interest, farm, goal, quality (15 issue kinds), events, investors, treasury, oracle, trophies (25), realm — plus the Phase 2 modules debt, oxygen, liberation, campaigns, streaks, futures, narrative, story, visits.
- [x] 146 unit tests, 30 + 17 of them fixture-based.
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

## Phase 2: Epic — status (as of 2026-09-11, every number from the fixture, pinned in `epic_fixture.test.ts`)

All nine items are computed in `src/domain/` from Payments data; nothing is hard-coded or
decorative. The pipeline in `buildRealm` runs: ledgers → lots → farms → goal → quality → investors
→ treasury → oracle defaults → liberation → events (+ liberation events) → debt → oxygen →
campaigns → streaks → futures → trophies → narrative → story.

| # | Item | Where | Computed today |
|---|---|---|---|
| 1 | **The Debt** | `debt.ts`, `DebtCountdown` on `/` | capital owed to investors **$3,579,399.48** (7 open positions; $790,000 of own capital shown separately) · **476** days to 2027-12-31 · **$16,234.65** net profit required per day vs **$6,762.81** actually earned per day since the first closing · interest accruing **$1,253/day** |
| 2 | **Oxygen** | `oxygen.ts`, `OxygenScore` on `/`, "Oxygen" column on `/quests` | 38 closed lots scored, **+547 days** in total · best: Lamar Lot 6 **+91 d** (2025-10-10) · latest: Promised Valley Lot 3 **+5 d** · pace today $8,644.24 net/day |
| 3 | **Investor liberation** | `liberation.ts`, `LiberationBoard` on `/sponsors` | 8 hostages (investor × farm), $4,197,648 capital, **$618,248.52 returned (14.7 %)** · **Lamar freed 2026-05-19** after 271 days ($175,741.94 paid on top) · Wichita 12.0 %, Townson/Lamar 37.0 % not yet freed · full-screen fanfare once, Liberated gallery, "Replay liberation" |
| 4 | **Farm campaigns** | `campaigns.ts`, territory borders + `CampaignPanel` on `/realm` | conquered: Lamar, Eastland, Freestone · under siege: Promised Valley (2 lots left), Titus (2), Wichita (3), Franklin 2 · losing ground (interest accruing, no closing in 60 days): Avery (5 lots left), Franklin |
| 5 | **Streaks** | `streaks.ts`, `StreaksPanel` + rarity badges on `/trophies` | current streak **0** weeks (last closing 2026-08-19, more than a week ago) · best **3** consecutive weeks · best week 2026-W22 (25 May): **7** closings, $553,411 net · best month 2026-05: **13** closings, $1,006,874 net · 25 trophies (17 earned) with common / rare / epic / legendary tiers |
| 6 | **Oracle: three futures** | `futures.ts`, "Three futures" on `/oracle` | current pace → **2029-03-11** · required pace (8.31 lots/month) → **2027-12-11**, hits the deadline · current pace + one more farm → **2028-11-11** (120 days earlier) |
| 7 | **Narrated chronicle** | `narrative.ts`, prose on `/chronicle` and the live chronicle on `/` | one template line per event kind; e.g. "On August 6, Diego Reyes claimed Lot 14 of Wichita for $137,780. The realm gained 3 days." · liberation events narrated too |
| 8 | **Cinematic intro** | `story.ts`, `CinematicIntro` | 6 cards from real numbers ("9 farms across 9 counties, cut into 109 lots.", "476 days left. $16,235 of net profit needed every single day.") · once per session, skipped under reduced motion |
| 9 | **Celebrations** | `visits.ts`, `SinceLastVisit` in the app shell | closings, note sales and liberations dated after `quest.lastVisit` are celebrated on open; ids remembered in `quest.celebrated`; first visit celebrates nothing |

Tests: `epic.test.ts` (33 synthetic) + `epic_fixture.test.ts` (17 fixture) cover every module.
Playwright adds the Debt and Oxygen checks the goal asks for, plus campaigns, hostages/gallery,
three futures, chronicle prose, rarity and streaks (47 tests, desktop + 390 px).

Assumptions introduced by Phase 2 are OPEN_QUESTIONS #23–#31.

## What I would do next

1. Confirm OPEN_QUESTIONS #2–#5 and #18 with Rodrigo — they move the headline number.
2. Get read access to the v1 repo and port the exact colour tokens and animations.
3. Review and apply `sql/proposed_views.sql` in Payments, then swap `fetchPaymentsSnapshot` to read the views (keeping the domain tests as a cross-check).
4. Add a Lighthouse / throttled-network budget check to CI for the "< 2 s first meaningful paint" target.
5. Add a `farm_acquisitions.is_subdivided` column so `LEGACY_FARM_NAMES` can go away.
