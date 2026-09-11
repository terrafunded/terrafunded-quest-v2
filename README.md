# Terrafunded Quest v2 — "Exodus"

A read-only, cinematic dashboard that tracks Terrafunded's quest to reach **$10,000,000 of net
profit from subdivided farm lots by 2027-12-31**. Every number on screen is computed from the live
**Payments** Supabase database; nothing is typed in by hand and nothing is ever written back.

- **Stack:** Vite 6 · React 18 · TypeScript (strict) · Tailwind · shadcn-style primitives ·
  TanStack Query · React Router v6 · Recharts · Framer Motion · Vitest · Playwright.
- **Read-only:** the app only ever runs `select`. There is no write surface, so there are no roles
  inside Quest — any authenticated Payments user may view.
- **Math lives in one place:** `src/domain/` is pure TypeScript with no React or Supabase imports
  (enforced by ESLint) and is covered by 96 unit tests. Pages only render what the domain computes.

---

## 1. Setup

```bash
npm install
cp .env.example .env      # then fill in the four values below
npm run dev               # http://localhost:5173
```

Node 20+ is expected. Playwright needs its browser once: `npx playwright install chromium`.

## 2. Environment variables

Only `.env.example` is committed. Never commit `.env`; never paste a key into source.

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | browser, scripts, e2e | Payments project URL |
| `VITE_SUPABASE_ANON_KEY` | browser, scripts, e2e | Payments anon (public) key; RLS still applies |
| `QUEST_TEST_EMAIL` | `npm run snapshot`, `npm run e2e` | A Payments login with the `viewer` role |
| `QUEST_TEST_PASSWORD` | `npm run snapshot`, `npm run e2e` | Its password |

The browser reads its two variables through `import.meta.env`; Node scripts read them from `.env`
via `dotenv`. If the two `VITE_` values are missing the app shows a configuration error instead
of a login form.

## 3. Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b` (strict type-check of app, scripts and tests) then `vite build` → `dist/` |
| `npm run preview` | Serves `dist/` on port 4173 (what the e2e suite runs against) |
| `npm run lint` | ESLint 9 flat config, including the "no React/Supabase in `src/domain`" rule |
| `npm run test` | Vitest — 96 unit tests under `src/domain/__tests__/` |
| `npm run test:watch` | Same, in watch mode |
| `npm run e2e` | Playwright, headless. Builds, serves, logs in with the env credentials and runs the suite on a 1280×800 desktop and a 390×844 phone viewport |
| `npm run snapshot` | **Read-only.** Signs in as the viewer, runs exactly the app's `select` queries and writes `src/domain/__fixtures__/payments.json`. Re-run it whenever you want the fixture tests to reflect current data |
| `npm run check` | Connection check: signs in, prints `count(*)` for every table Quest reads against the expected counts, then proves the login is read-only by attempting one dummy insert into `property_costs` and asserting RLS rejects it (exit 3 and a loud warning if it does not) |

## 4. Project layout

```
src/
  config/goal.ts          GOAL_NET_PROFIT, GOAL_DEADLINE, trailing window, legacy farm list
  data/
    client.ts             Supabase client from import.meta.env
    auth.tsx              AuthProvider / useAuth
    queries/columns.ts    the explicit column list for every table (no "*", no ssn)
    queries/index.ts      one fetch function per table + fetchPaymentsSnapshot()
    useRealm.ts           TanStack Query hook: snapshot → buildRealm()
  domain/                 pure TypeScript, unit-tested, no React
    types.ts  dates.ts  math.ts
    lot.ts  interest.ts  farm.ts  goal.ts  quality.ts
    events.ts  investors.ts  treasury.ts  oracle.ts  trophies.ts
    realm.ts              buildRealm(snapshot, now) — runs the pipeline in order
    __fixtures__/         payments.json written by scripts/snapshot.ts
    __tests__/            Vitest suites (fixture-based + synthetic builders)
  components/
    ui/                   shadcn-style primitives (button, card, sheet, slider, table, …)
    realm/                AnimatedCounter, ProgressRing, GrowthBurst, MilestoneCelebration,
                          QuestTree, CinematicIntro, Trophies, StageBadge, PageStates
    layout/               AppShell (sidebar + mobile bottom nav), RequireAuth
  pages/                  one file per route
  routes.tsx  main.tsx  index.css
scripts/snapshot.ts       read-only fixture generator
e2e/                      Playwright: auth.setup.ts + quest.spec.ts
sql/proposed_views.sql    proposed Postgres views — NOT applied
GOAL.md  payments_schema.md  PROGRESS.md  OPEN_QUESTIONS.md
```

## 5. Routes

| Route | Page |
|---|---|
| `/` | **Throne Room** — giant animated net-profit counter, remaining amount, days to deadline, verdict sentence, cash vs. paper, pipeline, capital outstanding, 5 latest events |
| `/realm` | **The Map** — stylized SVG realm; one territory per farm sized by lots and colored by % closed; lot tiles lit by stage; hover for economics, click for the farm drawer |
| `/quests` | **Sales ledger** — every lot as a row with buyer, farm, stage, prices, gross, investor take, net, cash realized, days in pipeline; filters by farm/stage/investor; sortable; totals row |
| `/sponsors` | **Investors** — one card per sponsor; Townson Family (profit share) is styled and measured differently from fixed-interest sponsors; distribution timeline |
| `/treasury` | **Cash** — cash in (down payments + note sales) vs. cash out (distributions) by month; chart + table |
| `/oracle` | **What-if** — sliders seeded from real trailing averages; goal date recomputed live |
| `/chronicle` | **Timeline** — every real event newest first, with a celebration each time cumulative net profit crosses $1M |
| `/trophies` | **Achievements** — 20 trophies computed from real data, earned/unearned |
| `/quality` | **Data quality** — every disagreement between tables, never hidden, never "corrected" |
| `/login` | Supabase email/password auth against Payments |

## 6. The domain rules, in plain English

These are the rules `src/domain/` implements. The spec is `GOAL.md`; the assumptions we had to
make on top of it are in `OPEN_QUESTIONS.md`.

### Which lots count
A farm is **subdivided** when `farm_acquisitions.total_lots > 1` and it is not in the legacy
list in `src/config/goal.ts` (Ben White, Sharps Rd, Olney, Red River 1). Every `properties`
row on such a farm is a **lot**. Today that is 109 lots on 9 farms.

### What a lot costs
`landCost = investor_capital ÷ total_lots`. If the farm has no `investor_capital`, we use the
sum of its `property_costs` instead.

### What a lot sold for
If the lot has a real note (`notes.is_test = false`), the price is `notes.original_amount` and
the down payment is `notes.down_payment`. Otherwise, if it has an `active` or `completed` file
case, we use `file_cases.sale_price` / `down_payment`. Otherwise the lot is unsold and has no
price. When the lot has several file cases we ignore cancelled ones and prefer the completed one;
when it has several notes we prefer the one already sold, then the newest.

### Where a lot is in the journey
- **available** — no file case.
- **reserved** — an active file case with no closing date.
- **closed** — the file case is completed or has a closing date, **or** a note exists. Cash
  deals go straight here.
- **note_sold** — the note is flagged sold, or a `note_sales` row exists.

### Profit
`grossProfit = salePrice − landCost`. The **investor take** depends on the farm's deal:
- `profit_share` → `grossProfit × profit_share_pct / 100` (Townson Family).
- `fixed_interest` → this lot's equal share (1 ÷ total_lots) of the interest accrued on the
  farm so far.
- `own_capital` → nothing.

`netProfit = grossProfit − investorTake`. **Net profit to date** sums lots that are closed or
note_sold; **pipeline** sums reserved lots.

### Interest
Fixed-interest capital accrues simple interest daily at `annual_interest_rate ÷ 365` from
`funding_date` (or `closing_date`) on the balance still outstanding; every `capital_return`
distribution steps the balance down. Rates stored as `20` mean 20 %; rates stored as `0.0699`
mean 6.99 %. "Paid to date" is every distribution that is not a capital return.

### Cash actually received
For a **closed or note_sold** lot: cash deals count the full sale price; financed deals count
the down payment plus the `note_sales.sale_price` if the note was sold. Reserved lots count
nothing yet. Monthly buyer payments are out of scope.

### The goal
`remaining = $10M − netProfitToDate`. Over the trailing 90 days we measure closed lots per
month and the average net profit per closed lot, and derive: lots still needed, months at the
current pace, the projected date, the lots per month required to hit 2027-12-31, and the
**inventory gap** (lots still needed minus lots currently available) expressed as how many more
farms of average size must be bought.

### Data quality
We list — never fix — every lot where the file case and note disagree on price or down
payment, where a reservation is dated after the note started, where a farm has no
`investor_capital`, where a sold note has no sale row, plus a handful of other disagreements
described in `src/domain/quality.ts`.

## 7. Hard constraints (and where they are enforced)

| Constraint | Enforcement |
|---|---|
| Read-only | only `.select()` calls exist in `src/`, all in `src/data/queries/index.ts`; the snapshot script reuses them. The single deliberate write probe in `scripts/check-connection.ts` exists to prove RLS rejects writes (OPEN_QUESTIONS #22) |
| Explicit columns, never `select("*")` | `src/data/queries/columns.ts`; verified by grep in the DoD audit |
| Never select `clients.ssn_itin_encrypted` | not present in `CLIENT_COLUMNS` |
| Exclude test data | `.eq("is_test", false)` on `notes` and `clients` |
| No secrets in source | env via `import.meta.env` / `dotenv`; `.env*` git-ignored except `.env.example` |
| Business math only in `src/domain/` | ESLint `no-restricted-imports` blocks react / supabase / data / components there |
| No mock data in `src/` | the only JSON under `src/` is the live snapshot fixture used by tests |

## 8. Verifying the Definition of Done

```bash
npm run build && npm run lint && npm run test && npm run e2e
```

The e2e suite logs in with the env credentials, checks that the Throne Room counter shows a
dollar amount greater than zero, that the ledger totals row shows **$8,986,794.30**, that all
ten routes render on desktop and at 390px without console errors, and a few page-specific
assertions (109 lot tiles, the documented quality issues, Townson Family as the only
profit-share sponsor, at least 15 trophies).
