# PROGRESS — Quest v2 ("Exodus")

Branch `v2`. Snapshot of live Payments taken **2026-09-11 02:07 UTC** (`npm run snapshot`).

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
| Quality panel | Titus 6, Lamar 5/6/7, Eastland 3 | all five listed as `price_mismatch` (+ Lamar 5 date) | ✓ |

No drift detected. The ledger totals row shows the contract-price total ($8,986,794.30).

## Done

- [x] Repo scaffold: Vite 6 + React 18 + TS strict + Tailwind 3 + shadcn-style primitives + TanStack Query + Router v6 + Recharts + Framer Motion + Vitest + Playwright; `.env.example`; ESLint 9 flat config with a rule that keeps `src/domain` free of React/Supabase imports.
- [x] `scripts/snapshot.ts` (read-only; signs in as the viewer, runs the app's own `select` queries, writes `src/domain/__fixtures__/payments.json`).
- [x] Data layer: `src/data/queries/` with explicit column lists, `notes.is_test = false`, `clients.is_test = false`, never `ssn_itin_encrypted`, per-table error collection.
- [x] Domain layer (`src/domain/`, pure TS): `lot.ts`, `interest.ts`, `farm.ts`, `goal.ts`, `quality.ts`, `events.ts`, `investors.ts`, `treasury.ts`, `oracle.ts`, `trophies.ts`, `realm.ts`.
- [x] 95 unit tests (`npm run test`), including 30 fixture-based tests asserting the table above.

## In progress

- [ ] Auth + app shell + Throne Room + Ledger.

## Not started

- [ ] `/realm`, `/sponsors`, `/treasury`, `/oracle`, `/chronicle`, `/trophies`, `/quality`.
- [ ] Playwright e2e.
- [ ] README, `sql/proposed_views.sql`.

## Computed headline (as of 2026-09-11, from the fixture)

- Net profit to date **$2,272,304.32** (22.7 % of $10M) · pipeline **$2,222,188.97** · cash realized **$2,156,494.30**.
- 38 closed (14 with note sold) · 33 reserved · 38 available.
- Trailing-90-day pace **4.4 lots/month**; required **8.31 lots/month**; ~130 lots still needed → inventory gap 92 lots ≈ 8 more farms at 12.1 lots/farm.

## What I would do next

1. Confirm OPEN_QUESTIONS #2–#5 with Rodrigo (they move the headline number).
2. Get read access to the v1 repo and port the exact color tokens/animations.
3. Apply `sql/proposed_views.sql` in Payments so the browser does less arithmetic.
