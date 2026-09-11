# GOAL — Terrafunded Quest v2 ("Exodus")

You are building a brand-new web app from scratch in this repo. Work autonomously until every
item under **Definition of Done** passes. When something is ambiguous, write the question in
`OPEN_QUESTIONS.md`, pick the most conservative interpretation, and keep going. Never stop to ask.

## What this is

Terrafunded buys rural Texas farms with investor capital, subdivides them into ~10-acre lots,
sells the lots with seller financing, and then sells the resulting promissory notes to note buyers
for cash. The founder (Rodrigo) has ONE goal: generate **$10,000,000 of net profit by 2027-12-31**
to pay out the limited partners of his fund and close it.

Quest v2 is the founder's **gamified war room** for that goal. Medieval-fantasy tone
("realm", "quests", "sponsors", "treasury", "chronicle") is kept from v1, but every number is
**real money from the Payments database**, not projections entered by hand.

Reference material in `/reference/quest-v1/` is the previous version (built in Lovable). Reuse its
visual language, fonts (Cinzel / Cinzel Decorative), color tokens, and these components after
adapting them: `AnimatedCounter`, `ProgressRing`, `MilestoneCelebration`, `GrowthBurst`,
`QuestTree`, `CinematicIntro`, `Trophies`. Do NOT reuse any of its data hooks, tables, or
`lib/forecast.ts`, `lib/profit.ts`, `lib/interest.ts` logic verbatim; v1 read from its own
database (`quest_*` tables) which no longer exists for us. `lib/interest.ts` is worth reading for
the accrual model (interest accrues from capital deployment until the note is sold).

## Hard constraints

1. **Read-only against Payments.** The only credentials you have are `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY` and a login (`QUEST_TEST_EMAIL` / `QUEST_TEST_PASSWORD`, role
   `viewer`). Every query is a `select`. No `insert`, `update`, `delete`, `rpc` that writes, no
   migrations, no edge functions deployed. If you think a Postgres view would make something
   cleaner, write the SQL to `sql/proposed_views.sql` for a human to review; do not apply it.
2. **Schema discipline.** `docs/payments_schema.md` lists every column that exists. Never
   reference a column that is not in that file. Every Supabase query lives in `src/data/queries/`
   with explicit `.select("col1, col2, ...")` lists, never `select("*")`. Never select
   `clients.ssn_itin_encrypted`.
3. **Exclude test data.** Filter `notes.is_test = false` and `clients.is_test = false`.
4. **No secrets in source.** Read env with `import.meta.env`. Commit `.env.example` only.
   No API keys of any kind hard-coded (v1 did this; it is a bug, not a pattern).
5. **All business math in `src/domain/`**, pure TypeScript, fully unit-tested, no React imports.
   Pages only render what `src/domain/` computes.
6. Stack: Vite + React 18 + TypeScript strict + Tailwind + shadcn/ui + TanStack Query +
   React Router v6 + Recharts (or D3 for the map) + Framer Motion + Vitest + Playwright.
   Keep the dependency list small.

## The domain model (compute this, in this order)

### Lot economics (`src/domain/lot.ts`)
For each `properties` row that belongs to a subdivided farm (`farm_acquisitions.total_lots > 1`):
- `landCost = farm.investor_capital / farm.total_lots` (fall back to
  `sum(property_costs.amount where farm_acquisition_id = farm.id) / total_lots` when
  `investor_capital` is NULL).
- `salePrice` rule: if the lot has a `notes` row (`is_test=false`) → `notes.original_amount`;
  else if it has a `file_cases` row with status `active` or `completed` → `file_cases.sale_price`;
  else `null` (unsold).
- `downPayment` follows the same source as `salePrice`.
- `stage`: `available` (no file case) → `reserved` (file_case active, no closing_date) →
  `closed` (file_case completed or closing_date set, or a note exists) → `note_sold`
  (`notes.is_sold = true` or a `note_sales` row exists) → `cash` deals go straight to `closed`.
- `grossProfit = salePrice − landCost` (null when unsold).
- `investorTake`:
  - `profit_share` farm → `grossProfit × farm.profit_share_pct / 100`
  - `fixed_interest` farm → this lot's share of accrued interest (below)
  - `own_capital` → 0
- `netProfit = grossProfit − investorTake` (marketing is handled at farm level, see below).
- `cashRealized`: `downPayment` + (`note_sales.sale_price` if the note was sold). This is
  actual money in the door.

### Interest accrual (`src/domain/interest.ts`)
For `fixed_interest` farms: capital accrues daily at `annual_interest_rate / 365` on
`investor_capital` from `funding_date` (fallback `closing_date`) until principal is returned.
Principal returned = `sum(investor_distributions.amount where kind='capital_return' and
farm_acquisition_id = farm.id)`. Allocate accrued interest to lots pro-rata by `landCost`.
Show both "accrued to date" and "paid to date" (`kind='profit_share'` rows are payments to
Townson Family; interest payments may be recorded under either kind — surface the raw list).

### Farm economics (`src/domain/farm.ts`)
Roll lots up per farm: capital deployed, lots available/reserved/closed/note_sold, revenue,
gross profit, investor take, net profit, cash realized, capital returned, **capital still
outstanding** (`investor_capital − capital_return distributions`), months since funding.

### The Goal (`src/domain/goal.ts`)
- `GOAL_NET_PROFIT = 10_000_000`, `GOAL_DEADLINE = 2027-12-31` (constants in `src/config/goal.ts`,
  editable, versioned in git).
- `netProfitToDate = Σ netProfit over lots in stage closed/note_sold`.
- `netProfitInPipeline = Σ netProfit over lots in stage reserved`.
- `remaining = GOAL − netProfitToDate`.
- `avgNetProfitPerClosedLot`, `closedLotsPerMonth` over the trailing 90 days, and from those:
  **`lotsStillNeeded`** and **`monthsAtCurrentPace`** and **`requiredLotsPerMonthToHitDeadline`**.
- **`inventoryGap`** = `lotsStillNeeded − lots currently available` → how many more farms
  (at the trailing-average lots-per-farm) must be bought.

### Data quality (`src/domain/quality.ts`)
Produce a list of every lot where `file_cases` and `notes` disagree on `sale_price` or
`down_payment`, or where a `file_cases.reservation_date` is after a `notes.start_date`, or
where a farm has `investor_capital` NULL, or a sold note has no `note_sales` row. Never hide
these. Never "correct" them.

## The experience (pages)

Every page is real data. No mock data anywhere in `src/`. Loading and empty states everywhere.

1. **`/` — The Throne Room (dashboard).** Full-screen hero: a single giant animated counter of
   `netProfitToDate` climbing toward $10M, with the remaining amount, the deadline countdown in
   days, and one sentence of verdict: "At the current pace of X lots/month you reach the goal on
   <date>" or "You need Y lots/month; you are doing X." Below it: cash realized vs. profit on
   paper, pipeline profit, capital outstanding to investors, and the 5 most recent events
   (reservations, closings, note sales, distributions) as a live chronicle.
2. **`/realm` — The Map.** One interactive SVG/D3 map (does not need real geography; a stylized
   realm) with a territory per farm, sized by lots, colored by % closed, showing lots as tiles
   that light up by stage (available / reserved / closed / note_sold). Hover a lot → its full
   economics. Click a territory → farm detail drawer.
3. **`/quests` — Sales ledger.** Every lot sale as a card/row: buyer, farm, lot, stage, sale price,
   land cost, gross, investor take, net, cash realized, days in pipeline. Filters by farm, stage,
   investor. Sortable. Totals row that must equal the verified numbers below.
4. **`/sponsors` — Investors.** One card per investor: capital deployed by farm, deal type, rate or
   share, interest accrued vs. paid, capital returned vs. outstanding, and a timeline of
   `investor_distributions`. Townson Family (profit share) gets a visibly different treatment
   from the fixed-interest sponsors; do not blend the two metrics.
5. **`/treasury` — Cash.** Real cash in (down payments + note sales + monthly collections are out
   of scope) vs. cash out to investors (`investor_distributions`), by month. Chart + table.
6. **`/oracle` — What-if.** Sliders: lots/month, avg sale price, avg land cost per lot, avg months
   to sell a note, new farm every N months. Recompute the goal date live. Starts from real
   trailing averages, not hand-typed defaults.
7. **`/chronicle`** — Timeline of every real event (reservation, closing, note sale, distribution,
   farm acquisition) derived from the tables, newest first, with milestone celebrations
   (`MilestoneCelebration`) when cumulative net profit crosses each $1M.
8. **`/trophies`** — Achievements computed from real data (first $1M, first farm fully sold,
   fastest reservation-to-close, best month, etc.). At least 15 trophies with earned/unearned.
9. **`/quality`** — Data Quality panel from `src/domain/quality.ts`.
10. **`/login`** — Supabase auth against Payments. Any authenticated user may view; there is no
    write surface, so no roles inside Quest.

Mobile-usable (Rodrigo checks this on his phone). Dark theme only. Cinematic but fast:
first meaningful paint under 2s on a throttled connection; prefer CSS/Framer transitions over
heavy canvases.

## Verified numbers (2026-09-10) — your tests must assert these

From live Payments data at the time this spec was written. If live numbers have moved by a
small amount when you run, note it in PROGRESS.md; a large gap means your query is wrong.

- Lots on subdivided farms: **101** across 9 farms (Eastland 11, Wichita 32, Lamar 9, Avery 14,
  Franklin 6, Franklin 2 5, Freestone 7, Titus 6, Promised Valley 19).
- File cases on those lots: **71**, Σ `sale_price` = **$8,986,794.30**, **32** completed,
  **39** active, **7** cash, **64** financed.
- Notes sold: **15**, Σ `note_sales.sale_price` = **$1,356,405.86**.
- Investor distributions: **32** rows, Σ = **$793,990.46**.
- Farm purchase costs (`property_costs`): 13 rows, Σ = **$5,797,147.50**.
- Only one `profit_share` investor: **Townson Family** (Wichita and Lamar).
- Data-quality panel must list at minimum: Titus Lot 6, Lamar Lots 5/6/7, Eastland Lot 3.

## Definition of Done (all must be true; verify them yourself before declaring done)

- [ ] `npm run build` succeeds with zero TypeScript errors (strict mode).
- [ ] `npm run lint` is clean.
- [ ] `npm run test` passes with ≥ 40 unit tests in `src/domain/**`, including fixture-based
      tests that reproduce the verified numbers above from a JSON fixture in `src/domain/__fixtures__/`
      that you generate from live data at the start of the run (a script `scripts/snapshot.ts`
      that selects the tables and writes the fixture, read-only).
- [ ] `npm run e2e` (Playwright, headless) logs in with the env credentials, opens `/`, and
      asserts the net-profit counter renders a dollar amount > 0 and the ledger totals row shows
      $8,986,794.30 (± what PROGRESS.md documents if live data moved).
- [ ] Every one of the 10 routes renders without console errors, on desktop and at 390px width.
- [ ] Zero occurrences of `select("*")`, zero string literals that look like keys/tokens,
      zero mock/sample data in `src/`.
- [ ] `README.md` explains setup, env vars, scripts, and the domain rules above in plain English.
- [ ] `PROGRESS.md` is up to date: what is done, what is partial, what you would do next.
- [ ] `OPEN_QUESTIONS.md` lists every assumption you had to make.
- [ ] `sql/proposed_views.sql` contains the Postgres views that would replace the heaviest
      `src/domain/` computations, with comments, for human review. Not applied.

## Working style

- Branch `v2`, small commits, English, conventional prefixes (`feat:`, `fix:`, `chore:`, `test:`).
- Build the domain layer and its tests FIRST, then the data layer against live Payments, then the
  Throne Room, then the ledger, then everything else. A correct, boring app beats a pretty,
  wrong one; the epic visuals come after the numbers reconcile.
- If Supabase returns a permission error on any table, record the exact table and error in
  OPEN_QUESTIONS.md and keep working with the fixture so the rest of the app progresses.
- Do not touch `/reference/quest-v1/` beyond reading and copying components.

## Phase 2: Epic

Only after the connection check passes and the domain layer reproduces the verified numbers.
Everything below is computed from real Payments data in `src/domain/`; nothing is decorative,
nothing is hard-coded, and every module has unit tests. Numbers first, epic second.

1. **THE DEBT** (`src/domain/debt.ts`) — on the Throne Room, a permanent countdown of
   - capital still owed to investors (`investor_capital − capital_return distributions`, over
     subdivided farms whose deal is not `own_capital`),
   - days left to `GOAL_DEADLINE`,
   - required net profit **per day** from today: `remaining ÷ daysLeft`. It takes `asOf` as an
     input so it recomputes every day without a deploy.
2. **OXYGEN** (`src/domain/oxygen.ts`) — every closed lot is scored as **days gained** toward the
   exit date: the shift of the projected goal date computed with the ledger *without* that closing
   versus *with* it (same `asOf`, same trailing window, so pace and remaining both move). Shown on
   each sale row and, summed, as the primary score of the game on the Throne Room.
3. **INVESTOR LIBERATION** (`src/domain/liberation.ts`) — each sponsor is a hostage of the realm
   with a capital-returned bar from `investor_distributions` (`kind = 'capital_return'`). When a
   farm has returned 100 % of its capital, that position is *freed* (full-screen animation the
   first time it is seen, then a Liberated gallery). A sponsor with every position freed is a free
   sponsor.
4. **FARM CAMPAIGNS** (`src/domain/campaigns.ts`) — each territory on the map has its own goal:
   lots left to sell to cover `investor_capital` plus accrued interest (at the farm's average sale
   price, falling back to the realm average), and a state: `conquered` (covered or sold out),
   `losing_ground` (interest accruing on outstanding capital with no closing in 60 days),
   otherwise `under_siege`.
5. **STREAKS** (`src/domain/streaks.ts`) — consecutive ISO weeks with at least one closing from
   real closing dates (current and best), best week and best month; trophies gain rarity tiers
   (`common`, `rare`, `epic`, `legendary`).
6. **ORACLE** — three futures side by side, all starting from the real 90-day averages: current
   pace, required pace, and current pace plus one more farm; each with its exit date.
7. **NARRATED CHRONICLE** (`src/domain/narrative.ts`) — every real event gets one line of
   medieval-chronicle prose from templates in code (no external API), e.g. "On May 30, Diego Reyes
   claimed Lot 14 of Wichita for $137,780. The realm gained 9 days."
8. **CINEMATIC INTRO** — `CinematicIntro` tells the real story with real numbers (farms, lots,
   net profit, days gained, days left) computed by `src/domain/story.ts`.
9. **CELEBRATIONS** — on app open, if any closing or note sale is dated on or after the last visit
   (a `localStorage` timestamp) and has not been celebrated yet, celebrate it. First visit only
   records the timestamp.

Definition of Done additions:

- [ ] `npm run e2e` also asserts the Debt counter (capital owed > 0, days left > 0, per-day > 0)
      and the Oxygen score (a number of days ≥ 0 that equals the sum of the ledger rows).
- [ ] Every Phase 2 module in `src/domain/` has tests, including fixture-based ones.

## Phase 2b: Pipeline layer

A "Pipeline" layer sits alongside the closings-based numbers. **Closings remain the only source
of net profit and pace for the $10M goal**; nothing below changes `netProfitToDate`, the pace,
oxygen or the goal date. All of it lives in `src/domain/pipeline.ts` and is computed from real
`file_cases` dates.

1. **Reservations per month** over the trailing 90 days — reservations (`file_cases.reservation_date`,
   status `active`, no `closing_date`, no note) — shown on the Throne Room next to closings per
   month as the leading indicator.
2. **Reservation-to-closing conversion** — of reservations made 90+ days ago, the share that has
   closed, from real dates.
3. **Stuck pipeline** — every reserved lot with no closing after 60 days, with days waiting, buyer,
   farm, lot, sale price and net profit at stake; total dollars stuck; sorted by days waiting. The
   total is its own Throne Room counter ("profit trapped in reservations"); the full list is on
   `/quests` behind a filter and on a dedicated `/pipeline` route.
4. **Median days from reservation to closing** for closed lots, overall and per farm, shown on the
   farm drawer of the map.
5. A **reserved ring** on the map tiles, distinct from closed.

Definition of Done additions:

- [ ] Unit tests with the fixture for every pipeline number.
- [ ] `npm run e2e` asserts the stuck-pipeline counter renders.
