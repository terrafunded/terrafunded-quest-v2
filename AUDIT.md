# AUDIT.md — full numeric audit of Quest v2

Snapshot of Payments (read-only, anon key + viewer login): **2026-09-12T04:30:03Z**. Measurement date `asOf` = **2026-09-12**, horizon deadline **2027-12-31** unless stated. Every figure below was recomputed from raw rows by a script that does not import the domain functions it checks (`/tmp/audit/recompute.ts`, kept outside the repo); the domain layer was run once through `buildRealm` only to obtain the app's own figures for comparison.

This is a verification report, not a refactor. Classification used throughout:

- **BUG** — the code does not do what its own doc comment, test or obvious intent says → fixed in a separate PR with a regression test.
- **MODEL DECISION** — internally consistent, business definition debatable → not changed; alternatives and their effect on the headline numbers are written up here.
- **DATA ISSUE** — the figure is wrong because Payments contains something unexpected → not patched in the app; the rows and the query that finds them are documented.
- Verdicts per rendered figure: **PASS** (independent recomputation agrees to the cent / to the reported precision), **FAIL** (disagrees — every FAIL is a BUG finding), **FLAG** (agrees with the code, but a finding below applies to the definition or the data).

## 1. Method

### 1.1 Schema introspection (read-only)

`information_schema.columns` is **not reachable** through the Supabase PostgREST endpoint the app uses (`PGRST106: schema information_schema is not exposed`), and the GraphQL endpoint is disabled for the anon role. Instead every table the app touches was introspected by per-column probes (`select <column> limit 1` for each candidate column) and by reading the keys of the rows returned by the app's own selects. Exact columns confirmed on the live project:

| Table | Columns confirmed (rows visible to the viewer) |
|---|---|
| `farm_acquisitions` (14) | id, farm_name, county, closing_date, funding_date, total_lots, total_acres, investor_id, investor_capital, deal_type, annual_interest_rate, profit_share_pct, maturity_months, extension_months, ledger_start_date, created_at |
| `properties` (141) | id, name, lot_number, farm_acquisition_id, investor_id, county, state, acres, created_at |
| `file_cases` (71) | id, client_id, property_id, status, deal_type, business_line, asset_type, project_name, lot_number, sale_price, down_payment, monthly_payment, interest_rate, term_years, reservation_date, reservation_amount, closing_date, estimated_closing_date, note_buyer_destination, assigned_seller, current_stage_name, progress_pct, days_since_start, created_at, updated_at |
| `notes` (56) | id, client_id, property_id, note_code, original_amount, down_payment, financed_amount, interest_rate, term_months, monthly_payment, start_date, first_payment_date, status, current_upb, is_sold, is_historical, is_test, asset_type, business_line, commercial_status, created_at |
| `note_sales` (15) | id, note_id, buyer_id, buyer_name, sale_price, sale_date, discount_from_upb, servicing_retained, created_at |
| `investor_distributions` (32) | id, farm_acquisition_id, investor_id, distribution_date, amount, kind, payment_method, reference_number, notes, created_at |
| `property_costs` (24) | id, farm_acquisition_id, property_id, cost_date, amount, category, cost_class, description, created_at |
| `investors` (7) · `clients` (102) | id, name, contact, notes, created_at · id, full_name, is_test, created_at |
| RPC `lot_ledger` (6 farms) | property_id, lot_number, lot_capital, accrued_return, credits, lot_balance, floor_amount, released_at, residual, first_cost_date, credit_detail |

Only the statuses `completed` and `active` are visible on `file_cases` for the viewer role (71 rows). If cancelled cases exist they are hidden by RLS — see finding F14. Nothing was written to Payments at any point.

### 1.2 Independent recomputation

- 10 subdivided farms, 121 lots (38 sold = 24 closed + 14 note-sold, 33 reserved, 50 available) rebuilt from raw rows with the documented semantics (price = `notes.original_amount` else `file_cases.sale_price`; close date = `file_cases.closing_date` ?? `notes.start_date`; effective file case = non-cancelled, completed first, newest `created_at`; effective note = sold first, newest `start_date`).
- **276 checks** compared app figure vs independent figure on the live configuration; **268 pass**. Of the 8 that do not pass, seven are deliberate report-only checks that surface the findings below (R1, R2, CAMP2, EVT5, TRO3, TRO12, ORA15) and one is a genuine disagreement: TRO4, the `sponsor_repaid` trophy detail (finding F1).
- Tolerances: money to the cent ($0.005), lots to 0.005, percentages to 0.005 pt; War Plan / Exodus monthly rows are rendered rounded (cents, 0.01 lot) after cumulatives are computed unrounded, so the running-sum checks allow exactly the accumulated rounding slack (rows × half a display unit) and no more.
- Configurations run: asOf 2026-09-12 and 2026-09-11 × deadline 2027-12-31; asOf 2026-09-12 × 2028-12-31 and 2029-12-31 (all identical pass/fail pattern); plus past measurement dates 2026-03-01 and 2025-06-01 to exercise the `asOf` semantics (§4).

## 2. Headline cross-checks (to the cent)

| Identity | Left | Right | Residual | Verdict |
|---|---|---|---|---|
| Σ per-lot netProfit over sold lots == goal.netProfitToDate | 2,242,037.41 | 2,242,037.41 | 0 | PASS  |
| goal.netProfitToDate == last chronicle cumulativeNetProfit | 2,242,037.41 | 2,242,037.41 | 0 | PASS  |
| goal.netProfitToDate == Σ monthly history netProfit | 2,242,037.41 | 2,242,037.41 | 0 | PASS  |
| goal.remaining + goal.netProfitToDate == 10,000,000 | 10,000,000 | 10,000,000 | 0 | PASS  |
| lotsStillNeeded × avgNetProfitPerClosedLot vs remaining (residual reported) | 7,788,129.36 | 7,757,962.59 | 30,166.77 | PASS — residual $30,166.77 = the ceil() on 131.49 lots; 131 × 59,000.98 = $7,729,128.38 would fall $28,834.21 short |
| Oxygen: Σ per-lot days == headline | 533 | 533 | 0 | PASS  |
| Oxygen: topbar pill == Oxygen card (same realm.oxygen.totalDaysGained) | 533 | 533 | 0 | PASS  |
| Oxygen: provisional set ∩ confirmed set | 0 | 0 | 0 | PASS — 33 provisional reservations, 38 confirmed closings, no overlap |
| debt.requiredNetProfitPerDay × daysLeft vs remaining | 7,757,961.25 | 7,757,962.59 | -1.34 | PASS — residual $-1.34 is the cent rounding of the per-day figure × 475 days |
| Capital outstanding: rotation (captive hostages) == debt.capitalOwed | 4,116,355.48 | 4,116,355.48 | 0 | PASS  |
| Capital outstanding: War Plan ledger.capitalOwed == debt.capitalOwed | 4,116,355.48 | 4,116,355.48 | 0 | PASS  |
| Capital outstanding: goal.capitalOutstanding (all farms) − own capital == debt.capitalOwed | 4,116,355.48 | 4,116,355.48 | 0 | PASS  |
| Treasury cash in − goal.cashRealized == other note sales | 57,000 | 57,000 | 0 | PASS  |
| Treasury cash out == Σ investor_distributions.amount | 793,990.46 | 793,990.46 | 0 | PASS  |
| Pipeline: salePriceTrapped == Σ price over stuck reservations | 2,024,531 | 2,024,531 | 0 | PASS  |
| Pipeline: committed == Σ at stake × conversion | 1,651,000.97 | 1,651,000.97 | 0 | PASS — $2,201,334.57 × 75 % = $1,651,000.93 (app sums per-lot rounded cents) |
| Pipeline: netProfitTrapped derivable == Σ at stake over stuck | 1,103,911.15 | 1,103,911.15 | 0 | PASS  |
| Milestone track % (QuestTree) vs ring % vs remaining: milestones crossed == floor(net ÷ 1M) | 2 | 2 | 0 | PASS — ring 22.42 % = $2,242,037.41 ÷ 10M; next node 3M at 24 %; remaining $7,757,962.59 |

## 3. The nine known suspicions

**S1 — avgNetProfitPerClosedLot window.** The app uses every sold lot (no window): **$59,000.98** over 38 lots → 132 lots still needed, 8.46 lots/month. Alternatives, computed independently:

| Window | Lots | Average net | Lots still needed | Required lots/month (÷ 15.61) |
|---|---|---|---|---|
| All sold (app) | 38 | $59,000.98 | 132 | 8.46 |
| Last 6 months | 30 | $64,922.44 | 120 | 7.69 |
| Last 12 months | 38 | $59,000.98 | 132 | 8.46 |
| Since ERA_START 2026-03-01 | 30 | $64,922.44 | 120 | 7.69 |

All-sold and last-12-months coincide because the first closing was 2025-10-10 (< 12 months ago). Last-6-months and since-era coincide because the era started 6 months and 11 days ago. → **MODEL DECISION F4**.

**S2 — conversion 75.0 %, 36 of 48, “0.0 % cancelled”.** Cohort = reservations dated ≤ asOf − 90 days (2026-06-14): 48 = 36 closed + 12 still reserved + 0 cancelled. Denominator is *all matured reservations*, not resolved ones; resolved-only conversion = 36 ÷ 36 = **100 %** because no cancelled file case is visible to the viewer role (statuses seen: completed, active). If cancellations exist behind RLS they are missing from *every* cancellation figure (rate, incl.-cancellations %, chronicle, streak of reservations made). → **DATA ISSUE / OPEN QUESTION F14**.

**S3 — “Capital outstanding $4,116,355” with or without “+$800,000 own capital”.** Three definitions exist and are each used consistently: `debt.capitalOwed` = sponsor capital only = **$4,116,355.48** (Throne Room key-figure tile, Debt countdown, Rotation card, War Plan ledger, Sponsors); `debt.ownCapitalOutstanding` = **$800,000** shown as a separate hint; `goal.capitalOutstanding` = both blended = **$4,916,355.48** — rendered in exactly one place: the `sponsor_repaid` trophy detail (“still outstanding”) → **BUG F1**. The $800,000 is **not hard-coded**: it is `farm_acquisitions.investor_capital` of Promised Valley (deal_type `own_capital`, investor “Portafolio Diversificado”). Note that $4,116,355.48 includes **$824,400** of two farms whose closing dates are in the future (Lakeview 2026-10-22, Franklin 2 2026-10-02; `funding_date` null) — without them the figure is $3,291,955.48 → **F3**. OPEN_QUESTIONS #105 and the pinned fixture (`payments.json`, 2026-09-11 21:31 UTC) read **$4,145,355.48**: the $29,000 difference is a Payments change, not arithmetic — between that fixture and the 04:30 UTC snapshot `farm_acquisitions.investor_capital` moved 484,000 → 475,000 on Lamar and 1,217,000 → 1,197,000 on Wichita, leaving `property_costs` (484,000 / 1,217,000) untouched (→ **F16**). Re-read today (read-only probe): 14 farm rows, 32 distributions, Σ capital_return $618,248.52, capital owed $4,116,355.48 — unchanged since the snapshot.

**S4 — Treasury $2,213,494.30 in vs cash realized $2,156,494.30.** Gap = **$57,000.00** exactly = one `note_sales` row on a note that is not on a subdivided-farm lot: `CLE-L01` sold 2026-08-18 to Kevin Shortle for $57,000 (`note_sales.id` c69f0244…). Treasury counts every note sale (T9 = Σ `note_sales.sale_price` = $1,356,405.86); `goal.cashRealized` counts only lots of subdivided farms. The Treasury page discloses it as “other notes”. PASS, explained.

**S5 — “16 overdue ($827K)” vs “16 reservations waiting 60+ days · $2,024,531”.** Same 16 lots (set difference empty both ways). The two money figures are different measures of the same set: Σ sale price = **$2,024,531.00** (Pipeline panel), Σ net profit at stake = **$1,103,911.15**, and the Throne Room “overdue” figure is that net × 75 % conversion = **$827,933.39** (1,103,911.15 × 0.75 = 827,933.36; the app sums per-lot rounded values → 827,933.39). PASS; the labels say what they are.

**S6 — Rotation benchmark 220.5 days.** No farm funded in the era has been freed, so `computeRotation` falls back to the **median of projected cycles** of the captive era farms (Freestone 151 d, Wichita 201 d, Avery 240 d, Franklin 326 d → median (201+240)/2 = 220.5; “Avery” is named as the benchmark because it is the upper median) and labels it “projected”. Observation count of *completed* cycles in the era: **0**. The only completed cycle is Lamar (271 d, funded 2025-08-21, freed 2026-05-19), excluded by ERA_START. War Plan capital movement if Lamar were included: cycle 271 d / 8.9 mo — `capitalToRaise` **unchanged at $2,332,150**, recycled capital 0 in both cases because the first planned purchase (2027-04) + any cycle ≥ 4.24 months lands after the deadline month. → **MODEL DECISION F5**.

**S7 — Recycling in War Plan / Oracle.** Verified (W13): a planned farm's capital is returned in **one lump at purchase month + cycleMonths to the same sponsor**, and only then becomes `recycled` for a later purchase. No sponsor exit, partial return, interest or profit-share on planned farms is modelled. Sensitivity of `capitalToRaise` to cycleMonths: 4.24 → $2,332,150, 7.24 (real) → $2,332,150, 10.24 → $2,332,150, no rotation → $2,332,150 (turnsIncomplete 0 / 3 / 5). The Oracle uses a different capital model altogether (purchases every N months, no return at all). → written up under F13/F5.

**S8 — “Expected next month 4.5 closings from 6 reservations”.** The 6 are real live reservations whose expected close date (reservation_date + farm median days, realm median 61.5 d where the farm has fewer than the minimum closings) falls in 2026-10: Avery — Lot 12 (res. 2026-07-31, expected 2026-10-01, median 61.5 d), Avery — Lot 4 (res. 2026-08-26, expected 2026-10-27, median 61.5 d), Avery — Lot 8 (res. 2026-08-29, expected 2026-10-30, median 61.5 d), Eastland — Lot 9 (res. 2026-08-08, expected 2026-10-10, median 63 d), Lamar — Lot 1 (res. 2026-08-26, expected 2026-10-07, median 42 d), Wichita — Lot 7 (res. 2026-08-16, expected 2026-10-18, median 63 d). 6 × 75 % = 4.5. PASS.

**S9 — Trailing-90-day pace 4.73.** 14 closings dated in (2026-06-14, 2026-09-12] ÷ (90 ÷ 30.4375) = **4.73**. Straight count of closings in the last 90 calendar days: **14** (same 14). Calendar days, not business days — consistent with `TRAILING_WINDOW_DAYS = 90` and with every other window in the app. PASS.

## 4. `asOf` is a measurement date, not a knowledge cutoff

Running the same snapshot with an earlier `asOf` shows which figures look back in time and which do not:

| Uses only rows dated ≤ asOf | Uses every row regardless of asOf |
|---|---|
| history / Pulse charts, chronicle cumulative, streaks, pipeline windows & cohort, expected, oxygen (pace measured that day), seasonality | goal (closings, pace denominators use all sold lots), debt.capitalOwed (farms), trophies (events incl. future-dated), rotation, campaigns, farm cadence, War Plan start inventory, note inventory, **treasury (no bound at all)** |

In production `asOf` = now and there are **no closings or note sales dated in the future today**, so the only live effect is the two **future-dated farm rows** (Lakeview closing 2026-10-22, $495,000, Townson Family; Franklin 2 closing 2026-10-02, $329,400, Julio Arriola; both `funding_date` null): they add $824,400 to capital owed, 17 unbuilt lots to inventory (83 vs 66), 2 captive hostages (9 vs 7), tighten the farm cadence (1.26 vs 1.18 months), and earn the *Nine Realms* trophy today (10 farms vs 8 funded) → **F3**. The past-`asOf` runs also show that oxygen at a date with no closings in its trailing window is 0 for every lot (pace null), which is the documented behaviour, not a bug.

## 5. Every rendered figure

Columns: label as shown · file:line · domain function · Payments fields / formula · independent recomputation (check id: value) · verdict · evidence (check ids, ✓ pass / ✗ report-only fail). Check ids refer to §9. Multiple figures in one label share a row when they come from the same component line.

### Throne Room — 51 figures · 39 PASS · 12 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | as of {date} in title Throne Room · Net profit chronicled · as of … | `ThroneRoom.tsx:77` | buildRealm (realm.ts) | now — display of the measurement date | — | PASS (no arithmetic) | — |
| 2 | Hero net profit amount (large display) | `ThroneRoom.tsx:86 → FitMoney → AnimatedCounter` | computeGoal (goal.ts) | Σ over sold lots of netProfit = (notes.original_amount (else file_cases.sale_price) − farm_acquisitions.investor_capital ÷ total_lots) − investorTake[farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)] | G1: 2,242,037.41; C5: 2,242,037.41; C2: 2,242,037.41 | PASS | G1✓ C5✓ C2✓ C3✓ |
| 3 | of $X · $Y remaining · closings only | `ThroneRoom.tsx:89` | computeGoal (goal.ts); GOAL_NET_PROFIT constant (goal.ts) | 10,000,000 − netProfitToDate · constant 10,000,000 | G2: 7,757,962.59; C6: 10,000,000 | PASS | G2✓ C6✓ |
| 4 | Committed · N live reservation(s) | `ThroneRoom.tsx:100` | computeExpected (expected.ts) | reserved lots with a file_cases.reservation_date (status active/completed) | X1: 33; EXP6: 33 | PASS | X1✓ EXP6✓ |
| 5 | Committed net profit amount | `ThroneRoom.tsx:102 → FitMoney` | computeExpected (expected.ts) | Σ netProfit at stake × conversion (75%) | X2: 1,651,000.97 | PASS | X2✓ |
| 6 | Fallback: no reservation is waiting to close | `ThroneRoom.tsx:105–106` | copy (fallback) | — — shown only when liveReservations = 0 (33 today) | X1: 33 | PASS | X1✓ |
| 7 | $X at stake × Y% conversion = this figure | `ThroneRoom.tsx:109` | computeExpected (expected.ts); computePipeline → conversion.pct (pipeline.ts) | Σ netProfit over live reservations · closed ÷ cohort (reservations ≥ 90 days old) | X9: 2,201,334.57; X8: 75; P8: 75 | FLAG (F14) | X9✓ X8✓ P8✓ OXY8✓ |
| 8 | expected by {month} | `ThroneRoom.tsx:113` | computeExpected (expected.ts) | latest expected month (reservation + farm/realm median days) | EXP3: 2026-12 | PASS | EXP3✓ |
| 9 | N overdue ($compact) | `ThroneRoom.tsx:119` | computeExpected (expected.ts) | live reservations whose expected date < asOf · Σ at stake × conversion over overdue | X3: 16; X4: 827,933.39 | PASS | X3✓ X4✓ |
| 10 | Progress ring fill (visual %) | `ThroneRoom.tsx:135 → ProgressRing.tsx:18–19,35` | computeGoal (goal.ts) | netProfitToDate ÷ 10,000,000 | G16: 22.42 | PASS | G16✓ |
| 11 | X.X% inside ring | `ThroneRoom.tsx:136` | computeGoal (goal.ts) | netProfitToDate ÷ 10,000,000 | G16: 22.42 | PASS | G16✓ |
| 12 | Verdict sentence (embeds pace/lots numbers) | `ThroneRoom.tsx:141–143` | goalVerdict (goal.ts) | requiredLotsPerMonthToHitDeadline, closedLotsPerMonth | G31: You need 8.46 lots/month; you are doing 4.73.; G7: 8.46; G9: 4.73 | FLAG (F6) | G31✓ G7✓ G9✓ |
| 13 | Reserving N/month, closing M/month | `ThroneRoom.tsx:147–148` | computeExpected (expected.ts); computeExpected ← goal.closedLotsPerMonth | reservations made in the trailing window (live + closed since + cancelled) ÷ months [file_cases.reservation_date (status active/completed)] · same as goal.closedLotsPerMonth | EXP8: 7.1; EXP7: 21; X10: 4.73 | PASS | EXP8✓ EXP7✓ X10✓ |
| 14 | Pace window: {era.since} (N days) or trailing N days | `ThroneRoom.tsx:151` | computeExpected ← goal | same window as goal | EXP9: 14; PIPE9: 2026-06-15/90 | PASS | EXP9✓ PIPE9✓ |
| 15 | Need N reservations/month | `ThroneRoom.tsx:155` | computeExpected (expected.ts) | requiredClosingsPerMonth ÷ conversion | X7: 11.28 | PASS | X7✓ |
| 16 | N closings/month at Y% conversion from the ledger average | `ThroneRoom.tsx:158` | computePipeline → conversion.pct (pipeline.ts); computeExpected ← goal.requiredLotsPerMonthToHitDeadline | closed ÷ cohort (reservations ≥ 90 days old) · lotsStillNeeded ÷ monthsToDeadline | X8: 75; P8: 75; OXY8: 75 | FLAG (F14, F6) | X8✓ P8✓ OXY8✓ G7✓ |
| 17 | N days to {deadline date} | `ThroneRoom.tsx:166` | computeGoal (goal.ts); buildRealm option (realm.ts) ← useHorizon | deadline − asOf (calendar days) · `${horizon}-12-31` | G5: 475; D15: 2027-12-31 | PASS | G5✓ D15✓ |
| 18 | N lots still needed · M more farms | `ThroneRoom.tsx:170–171` | computeGoal (goal.ts) | ceil(remaining ÷ avgNetProfitPerClosedLot) · ceil(inventoryGap ÷ avgLotsPerFarm); avgLotsPerFarm = mean farm_acquisitions.total_lots | G4: 132; C7: 0; G24: 7 | FLAG (F4) | G4✓ C7✓ G24✓ G25✓ G23✓ |
| 19 | Reservations this month (dd) | `ThroneRoom.tsx:181–182` | computeExpected (expected.ts) | reservations/closings dated in the asOf month; expected reservations/closings in month [file_cases.reservation_date (status active/completed), file_cases.closing_date ?? notes.start_date] | EXP10: {"r":7,"c":0,"er":3,"ec":2.25,"en":205688.19} | PASS | EXP10✓ |
| 20 | pledged in {month} | `ThroneRoom.tsx:183` | computeExpected (expected.ts) | reservations/closings dated in the asOf month; expected reservations/closings in month [file_cases.reservation_date (status active/completed), file_cases.closing_date ?? notes.start_date] | EXP10: {"r":7,"c":0,"er":3,"ec":2.25,"en":205688.19} | PASS | EXP10✓ |
| 21 | Closings this month (dd) | `ThroneRoom.tsx:187–188` | computeExpected (expected.ts) | reservations/closings dated in the asOf month; expected reservations/closings in month [file_cases.reservation_date (status active/completed), file_cases.closing_date ?? notes.start_date] | EXP10: {"r":7,"c":0,"er":3,"ec":2.25,"en":205688.19} | PASS | EXP10✓ |
| 22 | N more expected to close by month end **or** closed in {month} | `ThroneRoom.tsx:191–193` | computeExpected (expected.ts) | reservations/closings dated in the asOf month; expected reservations/closings in month [file_cases.reservation_date (status active/completed), file_cases.closing_date ?? notes.start_date] | EXP10: {"r":7,"c":0,"er":3,"ec":2.25,"en":205688.19} | PASS | EXP10✓ |
| 23 | Expected next month closings | `ThroneRoom.tsx:198–199` | computeExpected (expected.ts) | live reservations whose expected date falls in asOf+1 month; × conversion | X5: 6; X6: 4.5; EXP11: {"r":0,"c":0,"er":6,"ec":4.5,"en":309724.44} | PASS | X5✓ X6✓ EXP11✓ |
| 24 | closings in {month} from N reservation(s) already made | `ThroneRoom.tsx:202` | computeExpected (expected.ts) | live reservations whose expected date falls in asOf+1 month; × conversion | X5: 6; X6: 4.5; EXP11: {"r":0,"c":0,"er":6,"ec":4.5,"en":309724.44} | PASS | X5✓ X6✓ EXP11✓ |
| 25 | Quest node labels 1M…10M | `ThroneRoom.tsx:44 → QuestTree.tsx:78` | QuestTree labels | MILESTONE_STEP 1,000,000 × (i+1) | C8: 2 | PASS | C8✓ |
| 26 | Quest next-node % text | `QuestTree.tsx:60` | QuestTree (component arithmetic) | within = (netProfitToDate − prevTarget) ÷ (target − prevTarget) | G1: 2,242,037.41; C8: 2; EVT7: ["1000000@2026-05-31","2000000@2026-07-17"] | PASS | G1✓ C8✓ EVT7✓ |
| 27 | Quest node title tooltip Reached {date} or N% toward $compact | `QuestTree.tsx:58` | QuestTree (component arithmetic) | within = (netProfitToDate − prevTarget) ÷ (target − prevTarget) | G1: 2,242,037.41; C8: 2; EVT7: ["1000000@2026-05-31","2000000@2026-07-17"] | PASS | G1✓ C8✓ EVT7✓ |
| 28 | Quest ring SVG strokeDasharray | `QuestTree.tsx:70` | QuestTree (component arithmetic) | within = (netProfitToDate − prevTarget) ÷ (target − prevTarget) | G1: 2,242,037.41; C8: 2; EVT7: ["1000000@2026-05-31","2000000@2026-07-17"] | PASS | G1✓ C8✓ EVT7✓ |
| 29 | Capital outstanding (Rotation) | `ThroneRoom.tsx:239` | computeRotation (liberation.ts) | Σ captive hostages capitalOutstanding | R4: 4,116,355.48; R5: 4,116,355.48 | PASS | R4✓ R5✓ |
| 30 | Benchmark turn N days | `ThroneRoom.tsx:246` | computeRotation (liberation.ts) | median cycle (funding → liberation) over era farms; projected when none freed | R1: null; R6: 220.5; R2: 0 | FLAG (F5) | R1✗ R6✓ R2✗ |
| 31 | Benchmark hint: {farm} · X.X months[, projected] | `ThroneRoom.tsx:249` | computeRotation (liberation.ts) | the farm at the median cycle (projected) | R6: 220.5; R1: null | FLAG (F5) | R6✓ R1✗ |
| 32 | farms funded {sinceLabel} (+ optional excluded farm names) | `ThroneRoom.tsx:250–254` | computeRotation (liberation.ts) | ERA_START label; freed farms funded before the era (Lamar 271 d) | R3: 1 | PASS | R3✓ |
| 33 | Turns completed | `ThroneRoom.tsx:262` | computeRotation (liberation.ts) | count freed hostages | L2: 1 | PASS | L2✓ |
| 34 | Turns still needed | `ThroneRoom.tsx:269` | planRotation (warplan.ts) | totalDeployed ÷ peakOutstanding | W28: 1 | PASS | W28✓ |
| 35 | Hint: $peak rotating across N farm(s) | `ThroneRoom.tsx:272` | planRotation (warplan.ts) | schedule of planned farm purchases | W9: 2,332,150; W16: 2,332,150; W17: 5 | PASS | W9✓ W16✓ W17✓ W13✓ |
| 36 | N not back by the deadline | `ThroneRoom.tsx:273` | planRotation (warplan.ts) | planned farms whose purchase + cycle > deadline month | W29: 3 | PASS | W29✓ |
| 37 | Next liberation farm name | `ThroneRoom.tsx:279` | computeRotation (liberation.ts) | captive farm with the earliest projected liberation (campaign lots left ÷ farm pace) | R6: 220.5; CAMP1: 0 | FLAG (F5) | R6✓ CAMP1✓ |
| 38 | % of capital still to return | `ThroneRoom.tsx:284` | computeRotation (liberation.ts) | captive farm with the earliest projected liberation (campaign lots left ÷ farm pace) | R6: 220.5; CAMP1: 0 | FLAG (F5) | R6✓ CAMP1✓ |
| 39 | lots covered, awaiting payout | `ThroneRoom.tsx:286` | copy | — — static copy under the next-liberation card | R6: 220.5 | FLAG (F5) | R6✓ |
| 40 | N days to go · {date} | `ThroneRoom.tsx:287` | computeRotation (liberation.ts) | captive farm with the earliest projected liberation (campaign lots left ÷ farm pace) | R6: 220.5; CAMP1: 0 | FLAG (F5) | R6✓ CAMP1✓ |
| 41 | Stat: Cash realized | `ThroneRoom.tsx:295 → Stat.tsx:17` | computeGoal (goal.ts) | file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price | G11: 2,156,494.3; T10: 57,000 | PASS | G11✓ T10✓ |
| 42 | Stat: Profit on paper | `ThroneRoom.tsx:296 → Stat` | computeGoal (goal.ts) | netProfitToDate − cashRealized | G18: 85,543.11 | PASS | G18✓ |
| 43 | Stat: Pipeline profit (value) | `ThroneRoom.tsx:298–299 → Stat` | computeGoal (goal.ts) | Σ netProfit over reserved lots [notes.original_amount (else file_cases.sale_price) from the active file case] | G15: 2,201,334.57; P14: 2,201,334.57; X9: 2,201,334.57 | PASS | G15✓ P14✓ X9✓ |
| 44 | Pipeline profit hint: N reserved lots… · $committed at Y% · $stuck stuck | `ThroneRoom.tsx:300` | computeGoal (goal.ts); computeExpected (expected.ts); computePipeline → conversion.pct (pipeline.ts); computePipeline (pipeline.ts) | count stage reserved [file_cases.reservation_date (status active/completed), no note] · Σ netProfit at stake × conversion (75%) · closed ÷ cohort (reservations ≥ 90 days old) · Σ netProfit at stake over reservations waiting ≥ 60 days | G20: 33; PIPE7: 33; X2: 1,651,000.97 | FLAG (F14) | G20✓ PIPE7✓ X2✓ X8✓ P8✓ OXY8✓ P3✓ |
| 45 | Stat: Capital outstanding (key figures) | `ThroneRoom.tsx:306–308` | computeDebt (debt.ts) | Σ over non-own farms (investor_capital − capital_return distributions) [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | D1: 4,116,355.48; R5: 4,116,355.48; W1: 4,116,355.48 | FLAG (F3) | D1✓ R5✓ W1✓ FARM3✓ |
| 46 | Hint: + $own capital tied up | `ThroneRoom.tsx:313–316` | computeDebt (debt.ts) | Σ over deal_type = own_capital farms (Promised Valley investor_capital 800,000) — the $800,000 is data (farm_acquisitions.investor_capital), not hard-coded | D2: 800,000 | PASS | D2✓ |
| 47 | Chronicle row amount | `ThroneRoom.tsx:353` | buildEvents (events.ts) | closing → lot netProfit; note_sale → sale_price; distribution → amount; farm_acquired → investor_capital | EVT6: true; EVT1: {"farm_acquired":14,"reservation":69,"cancellation":0,"closing":38,"note_sale":14,"dist… | PASS | EVT6✓ EVT1✓ |
| 48 | Quests link: N closed · M reserved · K available | `ThroneRoom.tsx:367` | computeGoal (goal.ts) | count stage closed (+ note_sold counted separately) · count stage reserved [file_cases.reservation_date (status active/completed), no note] · count stage available | G19: 38; G20: 33; PIPE7: 33 | PASS | G19✓ G20✓ PIPE7✓ G21✓ |
| 49 | Sponsors link: N sponsors funding M farms | `ThroneRoom.tsx:375` | computeInvestors (investors.ts); ThroneRoom link; buildRealm | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · investors with capitalDeployed > 0 · subdivided farms (total_lots > 1) | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ FARM0✓ |
| 50 | Treasury link: $in in · $out out | `ThroneRoom.tsx:383` | computeTreasury (treasury.ts) | Σ down payments + Σ all note_sales.sale_price [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price] · Σ investor_distributions.amount · footer totals | T4: 2,213,494.3; T10: 57,000; T11: 2,213,494.3 | PASS | T4✓ T10✓ T11✓ T7✓ T8✓ T1✓ T2✓ T3✓ T5✓ T6✓ TRE3✓ |
| 51 | Pulse horizonYear prop | `ThroneRoom.tsx:131` | ThroneRoom → Pulse horizonYear | goal.deadline year | D15: 2027-12-31 | PASS | D15✓ |

### Topbar (AppShell) — 4 figures · 2 PASS · 2 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 52 | Oxygen pill text +Nd / Nd / … | `AppShell.tsx:33–34,80` | computeOxygen (oxygen.ts) | Σ per closing: exit date before − after, at that day's ledger and pace [file_cases.closing_date ?? notes.start_date, netProfit] | O1: 533; O2: 533; O5: 0 | FLAG (F12) | O1✓ O2✓ O5✓ OXY7✓ |
| 53 | aria-label: Oxygen {oxygenLabel} / Oxygen loading | `AppShell.tsx:76` | computeOxygen (oxygen.ts) | Σ per closing: exit date before − after, at that day's ledger and pace [file_cases.closing_date ?? notes.start_date, netProfit] | O1: 533; O2: 533; O5: 0 | FLAG (F12) | O1✓ O2✓ O5✓ OXY7✓ |
| 54 | title: Oxygen — days gained toward the exit | `AppShell.tsx:75` | copy | — — static title | — | PASS (no arithmetic) | — |
| 55 | Brand: Quest · {horizon} | `AppShell.tsx:68` | useHorizon | selected horizon year | D15: 2027-12-31 | PASS | D15✓ |

### Throne Room · Pulse row — 3 figures · 3 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 56 | Producing amount | `Pulse.tsx:38` | computeOxygen (oxygen.ts) | closedLotsPerMonth × avgNetProfitPerClosedLot ÷ 30.4375 | O3: 9,168.78 | PASS | O3✓ |
| 57 | Needed amount | `Pulse.tsx:49` | computeDebt (debt.ts) | remaining ÷ daysLeft | D4: 16,332.55; D10: 7,757,962.59; D14: 7,757,962.59 | PASS | D4✓ D10✓ D14✓ |
| 58 | you are at N% of the pace the {year} horizon requires | `Pulse.tsx:56–57` | pulseRatioPct (pulse.ts) | producing ÷ needed × 100, rounded — independent: 9168.78 ÷ 16332.55 = 56% | O3: 9,168.78; D4: 16,332.55 | PASS | O3✓ D4✓ |

### Throne Room · Debt countdown — 7 figures · 6 PASS · 1 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 59 | Header: as of {d} · deadline {d} | `DebtCountdown.tsx:35` | computeDebt (debt.ts) | measurement date / horizon end | D15: 2027-12-31 | PASS | D15✓ |
| 60 | Capital still owed (counter) | `DebtCountdown.tsx:40 → AnimatedCounter` | computeDebt (debt.ts) | Σ over non-own farms (investor_capital − capital_return distributions) [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | D1: 4,116,355.48; R5: 4,116,355.48; W1: 4,116,355.48 | FLAG (F3) | D1✓ R5✓ W1✓ FARM3✓ |
| 61 | Hint: N open position(s) · $X of interest accrues per day | `DebtCountdown.tsx:39` | computeDebt (debt.ts) | non-own farms with capitalOutstanding > 0 · Σ fixed-interest farms capitalOutstanding × annual_interest_rate ÷ 365 | D11: 8; D8: 1,279.96 | PASS | D11✓ D8✓ |
| 62 | Days left | `DebtCountdown.tsx:46` | computeDebt (debt.ts) | deadline − asOf | D3: 475 | PASS | D3✓ |
| 63 | Net profit required per day | `DebtCountdown.tsx:51–58 → AnimatedCounter` | computeDebt (debt.ts) | remaining ÷ daysLeft | D4: 16,332.55; D10: 7,757,962.59; D14: 7,757,962.59 | PASS | D4✓ D10✓ D14✓ |
| 64 | Pace hint (Cell hint) | `DebtCountdown.tsx:17–23 → rendered :90–91` | computeDebt (debt.ts) | Σ netProfit of closings since ERA_START ÷ days since ERA_START · days since max(first closing, ERA_START) · netProfitToDate ÷ days since first closing · min file_cases.closing_date ?? notes.start_date over sold | D5: 9,988.07; D6: 1,947,673.19; D7: 195 | PASS | D5✓ D6✓ D7✓ D13✓ D12✓ D9✓ |
| 65 | Pace bar width % | `DebtCountdown.tsx:74` | DebtCountdown (component arithmetic) | min(100, actual ÷ required × 100) — independent: 9988.07 ÷ 16332.55 = 61.2% | D5: 9,988.07; D4: 16,332.55 | PASS | D5✓ D4✓ |

### Throne Room · Oxygen — 10 figures · 9 PASS · 1 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 66 | Main score N + days | `OxygenScore.tsx:36–37` | computeOxygen (oxygen.ts) | Σ per closing: exit date before − after, at that day's ledger and pace [file_cases.closing_date ?? notes.start_date, netProfit] | O1: 533; O2: 533; O5: 0 | FLAG (F12) | O1✓ O2✓ O5✓ OXY7✓ |
| 67 | +N provisional | `OxygenScore.tsx:47` | computeOxygen (oxygen.ts) | Σ round(daysIfClosed × conversion) over live reservations · live reservations with a reservation_date | OXY2: 339; O4: 0; OXY3: 33 | PASS | OXY2✓ O4✓ OXY3✓ OXY1✓ |
| 68 | Tooltip on provisional | `OxygenScore.tsx:44` | computeOxygen (oxygen.ts); computeOxygen ← pipeline.conversion.pct | live reservations with a reservation_date | OXY3: 33; OXY1: 0; O4: 0 | PASS | OXY3✓ OXY1✓ O4✓ OXY8✓ |
| 69 | N closings confirmed · M days in the trailing window | `OxygenScore.tsx:53` | computeOxygen (oxygen.ts) | one entry per dated closing · Σ daysGained over closings in the trailing 90 days | O5: 0; LOT4: true; OXY4: 53 | PASS | O5✓ LOT4✓ OXY4✓ |
| 70 | N reservation(s) provisional at Y% conversion | `OxygenScore.tsx:56` | computeOxygen (oxygen.ts); computeOxygen ← pipeline.conversion.pct | live reservations with a reservation_date | OXY3: 33; OXY1: 0; O4: 0 | PASS | OXY3✓ OXY1✓ O4✓ OXY8✓ |
| 71 | today the realm produces $X of net profit per day (or ES) | `OxygenScore.tsx:60–62` | computeOxygen (oxygen.ts) | closedLotsPerMonth × avgNetProfitPerClosedLot ÷ 30.4375 | O3: 9,168.78 | PASS | O3✓ |
| 72 | Latest breath: +{days}d | `OxygenScore.tsx:74` | computeOxygen (oxygen.ts) | most recent dated closing | OXY6: e3a45e57-b3b3-4ab6-88f5-7008f94a4b42 | PASS | OXY6✓ |
| 73 | Latest: {date} · net $X | `OxygenScore.tsx:77` | computeOxygen (oxygen.ts) | most recent dated closing | OXY6: e3a45e57-b3b3-4ab6-88f5-7008f94a4b42 | PASS | OXY6✓ |
| 74 | Deepest breath: +{days}d | `OxygenScore.tsx:86` | computeOxygen (oxygen.ts) | max daysGained (ties → latest) | OXY5: d2ff8a97-5a53-43f7-98ee-c3ad02f81195 | PASS | OXY5✓ |
| 75 | Deepest: {date} · when the realm earned $X a day | `OxygenScore.tsx:89` | computeOxygen (oxygen.ts) | max daysGained (ties → latest) | OXY5: d2ff8a97-5a53-43f7-98ee-c3ad02f81195 | PASS | OXY5✓ |

### Throne Room · Pulse charts — 12 figures · 9 PASS · 3 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 76 | Pace chart X ticks (month labels) | `PulseCharts.tsx:105` | computeHistory (history.ts) | per month reservations [file_cases.reservation_date (status active/completed)], closings and netProfit [file_cases.closing_date ?? notes.start_date] | HIST1: ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-…; HIST2: 0; C3: 2,242,037.41 | PASS | HIST1✓ HIST2✓ C3✓ C4✓ |
| 77 | Pace chart Y ticks (counts) | `PulseCharts.tsx:106–112` | PulseCharts axis domain | max(history counts, requiredClosings, requiredReservations) | HIST2: 0; G7: 8.46; X7: 11.28 | FLAG (F6) | HIST2✓ G7✓ X7✓ |
| 78 | Pace tooltip: Reservations N / Closings M (+ month label / partial) | `PulseCharts.tsx:41–47` | computeHistory (history.ts) | per month reservations [file_cases.reservation_date (status active/completed)], closings and netProfit [file_cases.closing_date ?? notes.start_date] | HIST1: ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-…; HIST2: 0; C3: 2,242,037.41 | PASS | HIST1✓ HIST2✓ C3✓ C4✓ |
| 79 | Reference line y = required reservations | `PulseCharts.tsx:115–122` | computeExpected (expected.ts) | requiredClosingsPerMonth ÷ conversion | X7: 11.28 | PASS | X7✓ |
| 80 | Reference line y = required closings | `PulseCharts.tsx:124–131` | computeGoal (goal.ts) | lotsStillNeeded ÷ monthsToDeadline | G7: 8.46 | FLAG (F6) | G7✓ |
| 81 | Bar series reservations / closings | `PulseCharts.tsx:133–141` | computeHistory (history.ts) | per month reservations [file_cases.reservation_date (status active/completed)], closings and netProfit [file_cases.closing_date ?? notes.start_date] | HIST1: ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-…; HIST2: 0; C3: 2,242,037.41 | PASS | HIST1✓ HIST2✓ C3✓ C4✓ |
| 82 | Profit chart Y ticks | `PulseCharts.tsx:159` | Recharts ticks | history.netProfit domain | HIST2: 0 | PASS | HIST2✓ |
| 83 | Profit tooltip: $netProfit | `PulseCharts.tsx:60` | computeHistory (history.ts) | per month reservations [file_cases.reservation_date (status active/completed)], closings and netProfit [file_cases.closing_date ?? notes.start_date] | HIST1: ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-…; HIST2: 0; C3: 2,242,037.41 | PASS | HIST1✓ HIST2✓ C3✓ C4✓ |
| 84 | Required profit reference line | `PulseCharts.tsx:166–173` | computeDebt (debt.ts); PulseCharts (component arithmetic) | remaining ÷ daysLeft · requiredNetProfitPerDay × 30.4375 | D4: 16,332.55; D10: 7,757,962.59; D14: 7,757,962.59 | PASS | D4✓ D10✓ D14✓ |
| 85 | Bar series net profit | `PulseCharts.tsx:175–178` | computeHistory (history.ts) | per month reservations [file_cases.reservation_date (status active/completed)], closings and netProfit [file_cases.closing_date ?? notes.start_date] | HIST1: ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-…; HIST2: 0; C3: 2,242,037.41 | PASS | HIST1✓ HIST2✓ C3✓ C4✓ |
| 86 | ChartCard data-required-closings / data-required-reservations / data-requir | `PulseCharts.tsx:214–216` | ChartCard data attributes | same values as the reference lines | G7: 8.46; X7: 11.28; D4: 16,332.55 | FLAG (F6) | G7✓ X7✓ D4✓ |
| 87 | Era note: … in {eraLabel} | `PulseCharts.tsx:186` | era label (era.ts) | ERA_START 2026-03-01 | G30: false | PASS | G30✓ |

### Throne Room · Pipeline panel — 10 figures · 8 PASS · 2 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 88 | Profit trapped (counter) | `PipelinePanel.tsx:36` | computePipeline (pipeline.ts) | Σ netProfit at stake over reservations waiting ≥ 60 days | P3: 1,103,911.15 | PASS | P3✓ |
| 89 | N reservations waiting M+ days · $sales of sales | `PipelinePanel.tsx:40–43` | computePipeline (pipeline.ts); STUCK_AFTER_DAYS constant (pipeline.ts) | reservations with asOf − reservation_date ≥ STUCK_AFTER_DAYS 60 [file_cases.reservation_date (status active/completed)] · constant 60 · Σ notes.original_amount (else file_cases.sale_price) over stuck reservations | P1: 16; P2: 2,024,531 | PASS | P1✓ P2✓ |
| 90 | Reservations / mo | `PipelinePanel.tsx:51` | computePipeline (pipeline.ts) | reservations dated in the trailing window (live lots) ÷ months [file_cases.reservation_date (status active/completed)] | P13: 7.1; P12: 21 | PASS | P13✓ P12✓ |
| 91 | Trailing hint: N since {month} (D days) or N in W days | `PipelinePanel.tsx:54` | computePipeline (pipeline.ts); computePipeline ← goal window | count of live reservations dated in the trailing window | P12: 21; PIPE9: 2026-06-15/90 | PASS | P12✓ PIPE9✓ |
| 92 | Closings / mo | `PipelinePanel.tsx:59` | computePipeline ← goal.closedLotsPerMonth | — | PIPE8: 4.73 | PASS | PIPE8✓ |
| 93 | Conversion % | `PipelinePanel.tsx:65` | computePipeline (pipeline.ts) | closed ÷ (closed + stillReserved) over reservations ≥ 90 days old | P8: 75; P4: 48; P5: 36 | FLAG (F14) | P8✓ P4✓ P5✓ |
| 94 | N of M reserved D+ days ago closed | `PipelinePanel.tsx:68` | computePipeline (pipeline.ts) | cohort = reservations with reservation_date ≤ asOf − 90 [file_cases.reservation_date (status active/completed)] | P4: 48; P5: 36; P6: 12 | PASS | P4✓ P5✓ P6✓ PIPE3✓ |
| 95 | Y% cancelled, Z% incl. cancellations | `PipelinePanel.tsx:72–75` | computePipeline (pipeline.ts) | cancelled file cases (status = cancelled) in the cohort — none visible to the viewer | P7: 0; P9: 75; PIPE4: 0 | FLAG (F14) | P7✓ P9✓ PIPE4✓ |
| 96 | Median to close Nd | `PipelinePanel.tsx:82` | computePipeline (pipeline.ts) | median(file_cases.closing_date ?? notes.start_date − reservation_date), closed lots with both dates | P10: 61.5; P11: 36 | PASS | P10✓ P11✓ |
| 97 | reservation → closing, N lots | `PipelinePanel.tsx:83` | computePipeline (pipeline.ts) | — | P11: 36 | PASS | P11✓ |

### Throne Room · Story (CinematicIntro) — 4 figures · 4 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 116 | Title subtitle: Ten million by the last day of {horizon} | `CinematicIntro.tsx:82` | copy | 'Ten million' hard-coded; horizon from useHorizon — GOAL_NET_PROFIT is 10,000,000 — copy matches the constant | C6: 10,000,000 | PASS | C6✓ |
| 117 | Card kicker | `CinematicIntro.tsx:93` | buildStory (story.ts) | farms, counties, lots, sponsor gold, owed, closed lots, net, %, oxygen, freed/captive, days left, per-day | STO1: 0; STO2: Since 2025 | PASS | STO1✓ STO2✓ |
| 118 | Card line (embeds counts/money/%/days) | `CinematicIntro.tsx:94` | buildStory (story.ts) | farms, counties, lots, sponsor gold, owed, closed lots, net, %, oxygen, freed/captive, days left, per-day | STO1: 0; STO2: Since 2025 | PASS | STO1✓ STO2✓ |
| 119 | Progress dots count | `CinematicIntro.tsx:99–100` | buildStory | story.cards.length — 6 cards (freed card omitted when no farm is freed) | STO1: 0 | PASS | STO1✓ |

### War Plan — 118 figures · 91 PASS · 27 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Subtitle: …rates and trends are measured ${real.eraSince}, when sales… | `WarPlan.tsx:154` | warPlanDefaults (warplan.ts) | ERA_START label | G30: false | PASS | G30✓ |
| 2 | Input **Target** (prefill) | `WarPlan.tsx:164` | warPlanDefaults prefill (warplan.ts) | 10,000,000 (profit mode) / LP capital (cash mode) | C6: 10,000,000 | PASS | C6✓ |
| 3 | real: ${money(real.target)} | `WarPlan.tsx:164` | warPlanDefaults (warplan.ts) | 10,000,000 (profit) / LP capital (cash) | C6: 10,000,000 | PASS | C6✓ |
| 4 | Input **Deadline** | `WarPlan.tsx:169` | warPlanDefaults prefill (warplan.ts) | horizon deadline | D15: 2027-12-31 | PASS | D15✓ |
| 5 | Hint: ${number(plan.monthsToDeadline)} months from today | `WarPlan.tsx:170` | solveWarPlan (warplan.ts) | calendar month grid from asOf to deadline month end | W35: 15.61 | FLAG (F6) | W35✓ |
| 6 | real: ${date(real.deadline)} | `WarPlan.tsx:170` | warPlanDefaults (warplan.ts) | horizon deadline | D15: 2027-12-31 | PASS | D15✓ |
| 7 | Target-mode real (cash): ${money(plan.ledger.cashKept)} kept, ${money(plan.ledg | `WarPlan.tsx:180` | warPlanLedger (warplan.ts) | cashKept = cashRealized − paid out; owedToday = capitalOwed + unpaid take [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | W1: 4,116,355.48; W2: 793,990.46; W3: 793,990.46 | PASS | W1✓ W2✓ W3✓ W4✓ W5✓ W34✓ |
| 8 | Target-mode real (profit): money(data.realm.goal.netProfitToDate) | `WarPlan.tsx:180` | computeGoal (goal.ts) | Σ over sold lots of netProfit = (notes.original_amount (else file_cases.sale_price) − farm_acquisitions.investor_capital ÷ total_lots) − investorTake[farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)] | G1: 2,242,037.41; C5: 2,242,037.41; C2: 2,242,037.41 | PASS | G1✓ C5✓ C2✓ C3✓ |
| 9 | Input **Lots per new farm** | `WarPlan.tsx:185` | warPlanDefaults prefill (warplan.ts) | WARPLAN_DEFAULT_LOTS_PER_FARM 10 (the brief), real mean total_lots shown beside it | W11: 466,430; G25: 12.1 | PASS | W11✓ G25✓ |
| 10 | real: ${number(real.lotsPerFarm)} (mean total_lots) or — | `WarPlan.tsx:191` | warPlanDefaults (warplan.ts) | mean farm_acquisitions.total_lots | G25: 12.1; ORA6: 12.1 | PASS | G25✓ ORA6✓ |
| 11 | Hint text “The brief's **10**; …” | `WarPlan.tsx:192` | copy | literal 10 (WARPLAN_DEFAULT_LOTS_PER_FARM) — copy matches the constant | — | PASS (no arithmetic) | — |
| 12 | Input **Farm cost** | `WarPlan.tsx:197` | warPlanDefaults (warplan.ts) | round(defaultLandCostPerLot × lotsPerFarm) | W11: 466,430 | PASS | W11✓ |
| 13 | Farm-cost real (no purchase): no purchase ${real.eraSince ?? "on record"} | `WarPlan.tsx:206–207` | warPlanDefaults (warplan.ts) | ERA_START label | G30: false | PASS | G30✓ |
| 14 | Farm-cost real: ${money(real.recentLandCostPerLot * inputs.lotsPerFarm)} recent | `WarPlan.tsx:208` | warPlanDefaults (warplan.ts); warPlanDefaults prefill (warplan.ts) | mean landCostPerLot of the 3 most recent era farms funded ≤ asOf · WARPLAN_DEFAULT_LOTS_PER_FARM 10 (the brief), real mean total_lots shown beside it | W36: 46,643; W11: 466,430; G25: 12.1 | PASS | W36✓ W11✓ G25✓ |
| 15 | Farm-cost real: , ${real.eraSince} | `WarPlan.tsx:208` | warPlanDefaults (warplan.ts) | ERA_START label | G30: false | PASS | G30✓ |
| 16 | Farm-cost real: (${real.recentFarms.join(", ")}: ${money(real.recentLandCostPer | `WarPlan.tsx:208` | warPlanDefaults (warplan.ts) | mean landCostPerLot of the 3 most recent era farms funded ≤ asOf | W36: 46,643 | PASS | W36✓ |
| 17 | Farm-cost real: · ${money(real.landCostPerLot * inputs.lotsPerFarm)} all-time ( | `WarPlan.tsx:209` | warPlanDefaults (warplan.ts); warPlanDefaults prefill (warplan.ts) | all-time mean landCostPerLot · WARPLAN_DEFAULT_LOTS_PER_FARM 10 (the brief), real mean total_lots shown beside it | ORA3: 48,918; W11: 466,430; G25: 12.1 | PASS | ORA3✓ W11✓ G25✓ |
| 18 | Hint: ${number(inputs.lotsPerFarm)} lots × … | `WarPlan.tsx:212` | warPlanDefaults prefill (warplan.ts) | WARPLAN_DEFAULT_LOTS_PER_FARM 10 (the brief), real mean total_lots shown beside it | W11: 466,430; G25: 12.1 | PASS | W11✓ G25✓ |
| 19 | Hint: ${real.recentFarms.length} most recent farms… | `WarPlan.tsx:212` | warPlanDefaults (warplan.ts) | mean landCostPerLot of the 3 most recent era farms funded ≤ asOf | W36: 46,643 | PASS | W36✓ |
| 20 | Input **Ad spend per closing** | `WarPlan.tsx:214` | warPlanDefaults prefill (warplan.ts) | AD_SPEND constant 2,500 | W7: 28,233.33 | PASS | W7✓ |
| 21 | Input **Reservation → closing conversion** | `WarPlan.tsx:218` | warPlanDefaults prefill ← pipeline.conversion.pct | closed ÷ cohort | P8: 75 | FLAG (F14) | P8✓ |
| 22 | Conversion real: ${pct(real.conversionWithCancellationsPct, 2)} incl. cancellat | `WarPlan.tsx:226–228` | computePipeline (pipeline.ts); warPlanDefaults ← pipeline.conversion | cohort = reservations with reservation_date ≤ asOf − 90 [file_cases.reservation_date (status active/completed)] | P4: 48; P5: 36; P6: 12 | FLAG (F14) | P4✓ P5✓ P6✓ PIPE3✓ P8✓ P9✓ PIPE4✓ P15✓ |
| 23 | Hint: Cancellation rate ${pct(real.cancellationRatePct, 1)} — ${number(…cancell | `WarPlan.tsx:231` | computePipeline (pipeline.ts); warPlanDefaults ← pipeline.conversion | cancelled file cases (status = cancelled) in the cohort — none visible to the viewer | P7: 0; P9: 75; PIPE4: 0 | FLAG (F14) | P7✓ P9✓ PIPE4✓ P8✓ P15✓ |
| 24 | Input **Farm purchase → first closing** | `WarPlan.tsx:236` | warPlanDefaults prefill (warplan.ts) | median(farm date → first closing) in months | W37: 2.63; W25: 3\|3 | PASS | W37✓ W25✓ |
| 25 | Real: ${number(real.farmToFirstCloseMonths)} mo (median of ${real.farmToFirstCl | `WarPlan.tsx:240` | warPlanDefaults (warplan.ts) | median(farm date → first closing) in months | W37: 2.63; W25: 3\|3 | PASS | W37✓ W25✓ |
| 26 | Hint: Plus ${number(real.medianDaysToClose)} median days… or — | `WarPlan.tsx:241` | warPlanDefaults ← pipeline.medianDaysToClose | — | P10: 61.5; W24: 2 | PASS | P10✓ W24✓ |
| 27 | Input **Note-sale lag** | `WarPlan.tsx:243` | warPlanDefaults prefill (warplan.ts) | mean(close → note sale) months | ORA4: 3.17; W25: 3\|3 | PASS | ORA4✓ W25✓ |
| 28 | Real: ${number(real.noteSaleLagMonths)} mo (closing → note sale) | `WarPlan.tsx:243` | warPlanDefaults (warplan.ts) | mean(close → note sale) months | ORA4: 3.17; W25: 3\|3 | PASS | ORA4✓ W25✓ |
| 29 | Input **Capital turn** | `WarPlan.tsx:256` | warPlanDefaults prefill ← rotation.cycleMonths | benchmark cycle ÷ 30.4375 | R1: null; R6: 220.5 | FLAG (F5) | R1✗ R6✓ |
| 30 | Cycle real: ${number(real.cycleDays)} days / ${real.cycleMonths.toFixed(1)} mo  | `WarPlan.tsx:271–273` | warPlanDefaults (warplan.ts); warPlanDefaults ← rotation | ERA_START label · cycleDays / cycleMonths / cycles / source | G30: false; R1: null; R6: 220.5 | FLAG (F5) | G30✓ R1✗ R6✓ R3✓ |
| 31 | Cycle real: · ${real.cycleExcludedFarms.join(", ")} freed before then… | `WarPlan.tsx:274` | computeRotation (liberation.ts) | freed farms funded before ERA_START (Lamar, 271 d) | R3: 1 | PASS | R3✓ |
| 32 | Seasonality real (not applied): ${seasonality.reason}: ${seasonality.monthsOfHi | `WarPlan.tsx:308–309` | computeSeasonality (seasonality.ts) | closings by calendar month since ERA_START; applied only with ≥ 12 months [file_cases.closing_date ?? notes.start_date] | SEAS1: {"m":6,"req":12,"applied":false,"reason":"not enough history for seasonality"}; SEAS2: 30\|8; SEAS3: flat | PASS | SEAS1✓ SEAS2✓ SEAS3✓ |
| 33 | Seasonality real (applied): ${number(seasonality.closings)} closings… · peak ${ | `WarPlan.tsx:312` | computeSeasonality (seasonality.ts) | closings by calendar month since ERA_START; applied only with ≥ 12 months [file_cases.closing_date ?? notes.start_date] | SEAS1: {"m":6,"req":12,"applied":false,"reason":"not enough history for seasonality"}; SEAS2: 30\|8; SEAS3: flat | PASS | SEAS1✓ SEAS2✓ SEAS3✓ |
| 34 | Saved scenario option: ${s.name} · ${date(s.savedAt)} | `WarPlan.tsx:345` | saved scenarios (localStorage) | timestamp — stored timestamp | — | PASS (no arithmetic) | — |
| 35 | Verdict paragraph: plan.verdict (domain string; may replace "lots/month" suf | `WarPlan.tsx:359–361` | warPlanVerdict (warplan.ts) | required pace, farms, capital | W22: 11.29\|8.47; W17: 5; W8: 2,332,150 | FLAG (F6) | W22✓ W17✓ W8✓ |
| 36 | Foot: ${number(plan.monthsToDeadline)} months to ${date(plan.goal.deadline)} | `WarPlan.tsx:364` | buildRealm option (realm.ts) ← useHorizon; solveWarPlan (warplan.ts) | `${horizon}-12-31` · calendar month grid from asOf to deadline month end | D15: 2027-12-31; W35: 15.61 | FLAG (F6) | D15✓ W35✓ |
| 37 | Foot: ${number(plan.startInventory)} lots in inventory today | `WarPlan.tsx:364` | solveWarPlan (warplan.ts) | available + reserved lots (incl. unbuilt lots of future-dated farms) | G20: 33; G21: 50 | PASS | G20✓ G21✓ |
| 38 | Foot: A new farm needs ${plan.landLag} month(s)… and ${plan.closeLag} more… | `WarPlan.tsx:364` | solveWarPlan (warplan.ts) | round(farmToFirstCloseMonths) / round(medianDaysToClose ÷ 30.4375) / round(noteSaleLagMonths) | W24: 2; W25: 3\|3 | PASS | W24✓ W25✓ |
| 39 | Foot (cash): then ${plan.noteLag} to sell the note | `WarPlan.tsx:365` | solveWarPlan (warplan.ts) | round(farmToFirstCloseMonths) / round(medianDaysToClose ÷ 30.4375) / round(noteSaleLagMonths) | W24: 2; W25: 3\|3 | PASS | W24✓ W25✓ |
| 40 | Foot: last useful purchase is ${warPlanMonthLabel(lastUsefulPurchase)} | `WarPlan.tsx:366` | solveWarPlan (warplan.ts) | k − landLag − closeLag (− noteLag in cash mode) | W23: true; EXO18: 2027-07-31 | PASS | W23✓ EXO18✓ |
| 41 | Foot (cash): kept ${money(plan.ledger.cashKept)} and owes ${money(plan.ledger.o | `WarPlan.tsx:370` | warPlanLedger (warplan.ts) | cashKept = cashRealized − Σ distributions; owedToday = capitalOwed + unpaid take; start = cashKept − owedToday — independent start = $-3,417,155.58 | W4: 1,362,503.84; W5: 4,779,659.42; W34: 663,303.94 | PASS | W4✓ W5✓ W34✓ |
| 42 | Rotation headline: r.headline | `WarPlan.tsx:401` | planRotation (warplan.ts) | — | W30: 2027-04-30\|2028-02-29 | PASS | W30✓ |
| 43 | Badge: ${r.turnsIncomplete} of ${r.farms} turn(s) cannot complete… | `WarPlan.tsx:406` | planRotation (warplan.ts) | schedule of planned farm purchases · planned farms whose purchase + cycle > deadline month | W9: 2,332,150; W16: 2,332,150; W17: 5 | PASS | W9✓ W16✓ W17✓ W13✓ W29✓ |
| 44 | Peak capital outstanding | `WarPlan.tsx:412` | planRotation (warplan.ts) | schedule of planned farm purchases | W9: 2,332,150; W16: 2,332,150; W17: 5 | PASS | W9✓ W16✓ W17✓ W13✓ |
| 45 | Total capital deployed (+ hint recycled) | `WarPlan.tsx:413` | planRotation (warplan.ts) | schedule of planned farm purchases | W9: 2,332,150; W16: 2,332,150; W17: 5 | PASS | W9✓ W16✓ W17✓ W13✓ |
| 46 | Turns needed | `WarPlan.tsx:414` | planRotation (warplan.ts) | totalDeployed ÷ peakOutstanding | W28: 1 | PASS | W28✓ |
| 47 | First turn must start by | `WarPlan.tsx:417` | planRotation (warplan.ts) | — | W30: 2027-04-30\|2028-02-29 | PASS | W30✓ |
| 48 | Per-investor turns | `WarPlan.tsx:431` | planRotation (warplan.ts); computeInvestors (investors.ts) | per sponsor: turns, peak outstanding, deployed, fresh · Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | W10: 2,332,150; W27: 2,332,150; INV1: 0 | PASS | W10✓ W27✓ INV1✓ INV2✓ INV3✓ |
| 49 | Per-investor: ${money(inv.peakOutstanding)} out at peak · ${money(inv.deployed) | `WarPlan.tsx:434` | planRotation (warplan.ts); computeInvestors (investors.ts) | per sponsor: turns, peak outstanding, deployed, fresh · Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | W10: 2,332,150; W27: 2,332,150; INV1: 0 | PASS | W10✓ W27✓ INV1✓ INV2✓ INV3✓ |
| 50 | Benchmark farm name (display) | `WarPlan.tsx:471` | computeRotation (liberation.ts) | the farm at the median cycle (projected) | R6: 220.5; R1: null | FLAG (F5) | R6✓ R1✗ |
| 51 | ${number(bench.days)} days · ${bench.months.toFixed(1)} months (+ optional “(p | `WarPlan.tsx:474` | computeRotation (liberation.ts) | the farm at the median cycle (projected) | R6: 220.5; R1: null | FLAG (F5) | R6✓ R1✗ |
| 52 | ${bench.investorName} funded ${date(bench.fundingDate)} → … ${date(bench.libera | `WarPlan.tsx:477` | computeRotation benchmark (liberation.ts) | farm_acquisitions.funding_date ?? closing_date; projected liberation date; investors.name | R6: 220.5; FARM2: true | FLAG (F5) | R6✓ FARM2✓ |
| 53 | · median of ${b.cycles.length} freed/projected cycles | `WarPlan.tsx:478` | computeRotation (liberation.ts) | freed or projected cycles in the era | R2: 0; R6: 220.5 | FLAG (F5) | R2✗ R6✓ |
| 54 | · farms funded ${b.sinceLabel} | `WarPlan.tsx:479` | computeRotation (liberation.ts) | ERA_START label; freed farms funded before the era (Lamar 271 d) | R3: 1 | PASS | R3✓ |
| 55 | Curve chips: d${p.day} · ${p.pct.toFixed(0)}% | `WarPlan.tsx:485` | computeRotation (liberation.ts) | benchmark % returned by day (distribution dates) | R6: 220.5; FARM1: 0 | FLAG (F5) | R6✓ FARM1✓ |
| 56 | Excluded cycles: ${farmName} (funded ${date}, freed ${date} in ${number(c.days) | `WarPlan.tsx:496` | computeRotation (liberation.ts) | ERA_START label; freed farms funded before the era (Lamar 271 d) | R3: 1 | PASS | R3✓ |
| 57 | Turns completed | `WarPlan.tsx:503` | computeRotation (liberation.ts) | count freed hostages | L2: 1 | PASS | L2✓ |
| 58 | Capital outstanding | `WarPlan.tsx:506` | computeRotation (liberation.ts) | Σ captive hostages capitalOutstanding | R4: 4,116,355.48; R5: 4,116,355.48 | PASS | R4✓ R5✓ |
| 59 | Next liberation: ${farmName} · ${days(b.nextLiberation.daysToGo)} | `WarPlan.tsx:508` | computeRotation (liberation.ts) | captive farm with the earliest projected liberation (campaign lots left ÷ farm pace) | R6: 220.5; CAMP1: 0 | FLAG (F5) | R6✓ CAMP1✓ |
| 60 | Grade: farm capital ${money(g.capital)} · ${date(g.fundingDate)} | `WarPlan.tsx:556–557` | gradeFarms (liberation.ts) | per farm: days since funding, pctReturned, benchmark % at same day, lots left [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county, investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; CAMP1: 0; R6: 220.5 | FLAG (F5) | FARM1✓ CAMP1✓ R6✓ |
| 61 | Days in | `WarPlan.tsx:561` | gradeFarms (liberation.ts) | per farm: days since funding, pctReturned, benchmark % at same day, lots left [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county, investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; CAMP1: 0; R6: 220.5 | FLAG (F5) | FARM1✓ CAMP1✓ R6✓ |
| 62 | Returned: ${pct(g.pctReturned, 1)} + ${money(g.capitalReturned)} | `WarPlan.tsx:564–565` | gradeFarms (liberation.ts) | per farm: days since funding, pctReturned, benchmark % at same day, lots left [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county, investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; CAMP1: 0; R6: 220.5 | FLAG (F5) | FARM1✓ CAMP1✓ R6✓ |
| 63 | Benchmark at same day | `WarPlan.tsx:568` | gradeFarms (liberation.ts) | per farm: days since funding, pctReturned, benchmark % at same day, lots left [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county, investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; CAMP1: 0; R6: 220.5 | FLAG (F5) | FARM1✓ CAMP1✓ R6✓ |
| 64 | vs benchmark: ${signed(g.pctVsBenchmark)} pts | `WarPlan.tsx:571` | gradeFarms (liberation.ts) | per farm: days since funding, pctReturned, benchmark % at same day, lots left [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county, investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; CAMP1: 0; R6: 220.5 | FLAG (F5) | FARM1✓ CAMP1✓ R6✓ |
| 65 | vs benchmark: ${days(g.daysVsBenchmark)} ahead or ${days(-g.daysVsBenchmark)} | `WarPlan.tsx:572` | gradeFarms (liberation.ts) | per farm: days since funding, pctReturned, benchmark % at same day, lots left [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county, investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; CAMP1: 0; R6: 220.5 | FLAG (F5) | FARM1✓ CAMP1✓ R6✓ |
| 66 | Liberation: freed ${date(…)} or ${date} · ${days(g.daysToGo)} | `WarPlan.tsx:575` | gradeFarms (liberation.ts) | per farm: days since funding, pctReturned, benchmark % at same day, lots left [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county, investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; CAMP1: 0; R6: 220.5 | FLAG (F5) | FARM1✓ CAMP1✓ R6✓ |
| 67 | covered, awaiting payout or ${number(g.lotsLeftToCover)} lots to cover | `WarPlan.tsx:576` | gradeFarms (liberation.ts) | per farm: days since funding, pctReturned, benchmark % at same day, lots left [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county, investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; CAMP1: 0; R6: 220.5 | FLAG (F5) | FARM1✓ CAMP1✓ R6✓ |
| 68 | Mix row funding order # | `WarPlan.tsx:687` | WarPlan mix row index | i + 1 — ordinal | — | PASS (no arithmetic) | — |
| 69 | Mix rate input | `WarPlan.tsx:709` | WarPlan sponsor mix (component state; WARPLAN_INVESTOR_PREFILL) | hard-coded prefill rates/capital per sponsor — prefill rates are constants (Rony Schumann 18% vs data 20%), documented in the page | W10: 2,332,150; W27: 2,332,150 | PASS | W10✓ W27✓ |
| 70 | Mix capital input | `WarPlan.tsx:726` | WarPlan sponsor mix (component state; WARPLAN_INVESTOR_PREFILL) | hard-coded prefill rates/capital per sponsor — prefill rates are constants (Rony Schumann 18% vs data 20%), documented in the page | W10: 2,332,150; W27: 2,332,150 | PASS | W10✓ W27✓ |
| 71 | Footer: ${mix.length} sponsor(s) in the mix | `WarPlan.tsx:751` | WarPlan mix | mix.length | W10: 2,332,150 | PASS | W10✓ |
| 72 | Mix total capital | `WarPlan.tsx:754` | WarPlan mix (component arithmetic) | Σ max(0, capital) over the mix | W10: 2,332,150; W27: 2,332,150 | PASS | W10✓ W27✓ |
| 73 | Add-sponsor defaults (when clicked): ratePct: 20, capital: 500_000, name Sp | `WarPlan.tsx:665` | WarPlan add-sponsor defaults | literals 20 %, 500,000 — UI defaults for a new mix row, not Payments figures | — | PASS (no arithmetic) | — |
| 74 | Column card exit date | `WarPlan.tsx:780` | solveWarPlan (warplan.ts) | Σ lotsClosed; last row inventory / cumulative | W19: 132.13; W20: 10,000,559.35; W12: true | PASS | W19✓ W20✓ W12✓ W29✓ W18✓ |
| 75 | Deadline reference in subtitle | `WarPlan.tsx:783` | buildRealm option (realm.ts) ← useHorizon | `${horizon}-12-31` | D15: 2027-12-31 | PASS | D15✓ |
| 76 | ${number(c.daysEarlierThanCurrent)} days earlier… or ${number(-c.daysEarlierT | `WarPlan.tsx:788` | solveWarPlan (warplan.ts) | Σ lotsClosed; last row inventory / cumulative | W19: 132.13; W20: 10,000,559.35; W12: true | PASS | W19✓ W20✓ W12✓ W29✓ W18✓ |
| 77 | Premise c.premise | `WarPlan.tsx:793` | solveWarPlan premise (warplan.ts) | column premise string (pace, farms, capital) | W22: 11.29\|8.47; W17: 5; W31: 13 | FLAG (F6) | W22✓ W17✓ W31✓ W33✓ |
| 78 | Lots / month | `WarPlan.tsx:798` | solveWarPlan required/current/buffer columns (warplan.ts) | bisection for the minimal pace reaching the target at the deadline | W21: true; W22: 11.29\|8.47; W31: 13 | FLAG (F6) | W21✓ W22✓ W31✓ |
| 79 | Farms to buy · last by month | `WarPlan.tsx:804–805` | solveWarPlan (warplan.ts) | farms needed to keep inventory ≥ pace | W17: 5; W23: true; W31: 13 | PASS | W17✓ W23✓ W31✓ W33✓ |
| 80 | Capital to raise | `WarPlan.tsx:809` | solveWarPlan (warplan.ts) | Σ(cost − recycled); funding split across the sponsor mix | W8: 2,332,150; W10: 2,332,150; W27: 2,332,150 | PASS | W8✓ W10✓ W27✓ W32✓ |
| 81 | Funding per investor ${f.name} → money(f.amount) | `WarPlan.tsx:814` | solveWarPlan (warplan.ts) | Σ(cost − recycled); funding split across the sponsor mix | W8: 2,332,150; W10: 2,332,150; W27: 2,332,150 | PASS | W8✓ W10✓ W27✓ W32✓ |
| 82 | Unfunded badge | `WarPlan.tsx:822` | solveWarPlan (warplan.ts) | Σ(cost − recycled); funding split across the sponsor mix | W8: 2,332,150; W10: 2,332,150; W27: 2,332,150 | PASS | W8✓ W10✓ W27✓ W32✓ |
| 83 | Peak outstanding | `WarPlan.tsx:831` | solveWarPlan (warplan.ts) | — | W9: 2,332,150; W16: 2,332,150; W28: 1 | PASS | W9✓ W16✓ W28✓ |
| 84 | Total deployed | `WarPlan.tsx:834` | solveWarPlan (warplan.ts) | — | W9: 2,332,150; W16: 2,332,150; W28: 1 | PASS | W9✓ W16✓ W28✓ |
| 85 | Reservations / month | `WarPlan.tsx:839` | solveWarPlan (warplan.ts) | pace ÷ conversion; × ad spend; pace | W6: 11.29; W7: 28,233.33; W22: 11.29\|8.47 | FLAG (F6) | W6✓ W7✓ W22✓ |
| 86 | Ad spend / month | `WarPlan.tsx:842` | solveWarPlan (warplan.ts) | pace ÷ conversion; × ad spend; pace | W6: 11.29; W7: 28,233.33; W22: 11.29\|8.47 | FLAG (F6) | W6✓ W7✓ W22✓ |
| 87 | Note sales / month | `WarPlan.tsx:844` | solveWarPlan (warplan.ts) | pace ÷ conversion; × ad spend; pace | W6: 11.29; W7: 28,233.33; W22: 11.29\|8.47 | FLAG (F6) | W6✓ W7✓ W22✓ |
| 88 | Lots closed by the deadline | `WarPlan.tsx:846` | solveWarPlan (warplan.ts) | Σ lotsClosed; last row inventory / cumulative | W19: 132.13; W20: 10,000,559.35; W12: true | PASS | W19✓ W20✓ W12✓ W29✓ W18✓ |
| 89 | Inventory at the deadline: ${number(c.inventoryAtDeadline)} lots | `WarPlan.tsx:848` | solveWarPlan (warplan.ts) | Σ lotsClosed; last row inventory / cumulative | W19: 132.13; W20: 10,000,559.35; W12: true | PASS | W19✓ W20✓ W12✓ W29✓ W18✓ |
| 90 | Cumulative {modeShort} at deadline | `WarPlan.tsx:850` | solveWarPlan (warplan.ts) | Σ lotsClosed; last row inventory / cumulative | W19: 132.13; W20: 10,000,559.35; W12: true | PASS | W19✓ W20✓ W12✓ W29✓ W18✓ |
| 91 | Turns not back: ${c.turnsIncomplete} of ${c.farmsToBuy} | `WarPlan.tsx:855` | solveWarPlan (warplan.ts) | farms needed to keep inventory ≥ pace · Σ lotsClosed; last row inventory / cumulative | W17: 5; W23: true; W31: 13 | PASS | W17✓ W23✓ W31✓ W33✓ W19✓ W20✓ W12✓ W29✓ W18✓ |
| 92 | Red flags: ${c.flaggedMonths} month(s) | `WarPlan.tsx:863` | solveWarPlan (warplan.ts) | Σ lotsClosed; last row inventory / cumulative | W19: 132.13; W20: 10,000,559.35; W12: true | PASS | W19✓ W20✓ W12✓ W29✓ W18✓ |
| 93 | Month column: warPlanMonthLabel(r.date) | `WarPlan.tsx:921` | solveWarPlan rows (warplan.ts) | calendar month labels from asOf | W35: 15.61 | PASS | W35✓ |
| 94 | First month: from ${date(plan.asOf)} | `WarPlan.tsx:922` | solveWarPlan rows (warplan.ts) | calendar month labels from asOf | W35: 15.61 | PASS | W35✓ |
| 95 | Farms bought | `WarPlan.tsx:925` | solveWarPlan rows (warplan.ts) | purchase schedule | W16: 2,332,150; W17: 5; W23: true | PASS | W16✓ W17✓ W23✓ |
| 96 | Capital deployed | `WarPlan.tsx:928` | solveWarPlan rows (warplan.ts) | purchase schedule | W16: 2,332,150; W17: 5; W23: true | PASS | W16✓ W17✓ W23✓ |
| 97 | Lots closed | `WarPlan.tsx:931` | solveWarPlan rows (warplan.ts) | pace × seasonal factor, bounded by inventory; deadline month prorated | W19: 132.13; W18: true; SEAS3: flat | PASS | W19✓ W18✓ SEAS3✓ |
| 98 | Seasonal factor: ×${r.seasonalFactor.toFixed(2)} | `WarPlan.tsx:932` | solveWarPlan rows (warplan.ts) | pace × seasonal factor, bounded by inventory; deadline month prorated | W19: 132.13; W18: true; SEAS3: flat | PASS | W19✓ W18✓ SEAS3✓ |
| 99 | Flat average | `WarPlan.tsx:936` | solveWarPlan rows (warplan.ts) | pace × seasonal factor, bounded by inventory; deadline month prorated | W19: 132.13; W18: true; SEAS3: flat | PASS | W19✓ W18✓ SEAS3✓ |
| 100 | Notes sold | `WarPlan.tsx:940` | solveWarPlan rows (warplan.ts) | lotsClosed[m − noteLag] | W15: true | PASS | W15✓ |
| 101 | Ad spend | `WarPlan.tsx:943` | solveWarPlan rows (warplan.ts) | lotsClosed ÷ conversion × adSpendPerClosing | W14: true | PASS | W14✓ |
| 102 | Cumulative {modeShort} | `WarPlan.tsx:946` | solveWarPlan rows (warplan.ts) | running Σ: pool lots × blended net + farm lots × (gross − own-deal take) | W26: true; W20: 10,000,559.35 | PASS | W26✓ W20✓ |
| 103 | Capital owed | `WarPlan.tsx:949` | solveWarPlan rows (warplan.ts) | owed after purchases and one-lump returns at purchase + cycleMonths | W13: true; W29: 3 | PASS | W13✓ W29✓ |
| 104 | Returned · {name} | `WarPlan.tsx:953` | solveWarPlan rows (warplan.ts); WarPlan sponsor mix (component state; WARPLAN_INVESTOR_PREFILL) | owed after purchases and one-lump returns at purchase + cycleMonths · hard-coded prefill rates/capital per sponsor — prefill rates are constants (Rony Schumann 18% vs data 20%), documented in the page | W13: true; W29: 3; W10: 2,332,150 | PASS | W13✓ W29✓ W10✓ W27✓ |
| 105 | Inventory | `WarPlan.tsx:957` | solveWarPlan rows (warplan.ts) | inv − closed + lots landing (purchase + landLag) | W18: true | PASS | W18✓ |
| 106 | Footer label: By ${date(plan.goal.deadline)} | `WarPlan.tsx:978` | buildRealm option (realm.ts) ← useHorizon | `${horizon}-12-31` | D15: 2027-12-31 | PASS | D15✓ |
| 107 | Footer farms sum | `WarPlan.tsx:981` | solveWarPlan rows (warplan.ts) | purchase schedule | W16: 2,332,150; W17: 5; W23: true | PASS | W16✓ W17✓ W23✓ |
| 108 | Footer capital deployed | `WarPlan.tsx:984` | solveWarPlan rows (warplan.ts) | purchase schedule | W16: 2,332,150; W17: 5; W23: true | PASS | W16✓ W17✓ W23✓ |
| 109 | Footer lots closed | `WarPlan.tsx:987` | solveWarPlan rows (warplan.ts) | pace × seasonal factor, bounded by inventory; deadline month prorated | W19: 132.13; W18: true; SEAS3: flat | PASS | W19✓ W18✓ SEAS3✓ |
| 110 | Footer flat lots | `WarPlan.tsx:991` | solveWarPlan rows (warplan.ts) | pace × seasonal factor, bounded by inventory; deadline month prorated | W19: 132.13; W18: true; SEAS3: flat | PASS | W19✓ W18✓ SEAS3✓ |
| 111 | Footer notes sold | `WarPlan.tsx:995` | solveWarPlan rows (warplan.ts) | lotsClosed[m − noteLag] | W15: true | PASS | W15✓ |
| 112 | Footer ad spend | `WarPlan.tsx:998` | solveWarPlan rows (warplan.ts) | lotsClosed ÷ conversion × adSpendPerClosing | W14: true | PASS | W14✓ |
| 113 | Footer cumulative | `WarPlan.tsx:1001` | solveWarPlan rows (warplan.ts) | running Σ: pool lots × blended net + farm lots × (gross − own-deal take) | W26: true; W20: 10,000,559.35 | PASS | W26✓ W20✓ |
| 114 | Footer capital owed | `WarPlan.tsx:1004` | solveWarPlan rows (warplan.ts) | owed after purchases and one-lump returns at purchase + cycleMonths | W13: true; W29: 3 | PASS | W13✓ W29✓ |
| 115 | Footer returned per investor | `WarPlan.tsx:1008` | solveWarPlan rows (warplan.ts); WarPlan sponsor mix (component state; WARPLAN_INVESTOR_PREFILL) | owed after purchases and one-lump returns at purchase + cycleMonths · hard-coded prefill rates/capital per sponsor — prefill rates are constants (Rony Schumann 18% vs data 20%), documented in the page | W13: true; W29: 3; W10: 2,332,150 | PASS | W13✓ W29✓ W10✓ W27✓ |
| 116 | Footer inventory | `WarPlan.tsx:1012` | solveWarPlan rows (warplan.ts) | inv − closed + lots landing (purchase + landLag) | W18: true | PASS | W18✓ |
| 117 | Footer flags: ${column.flaggedMonths} flagged | `WarPlan.tsx:1015` | solveWarPlan (warplan.ts) | Σ lotsClosed; last row inventory / cumulative | W19: 132.13; W20: 10,000,559.35; W12: true | PASS | W19✓ W20✓ W12✓ W29✓ W18✓ |
| 118 | Footnote: “floored at **25%** of the flat rate” | `WarPlan.tsx:1021` | copy | literal 25 % (SEASONALITY_FLOOR 0.25) — copy matches the constant | SEAS3: flat | PASS | SEAS3✓ |

### Exodus — 69 figures · 64 PASS · 5 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Page subtitle: Return the ${lp} the limited partners… | `Exodus.tsx:170` | exodusDefaults (exodus.ts) | LP_CAPITAL_TO_RETURN 10,000,000 | EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000} | PASS | EXO9✓ |
| 2 | Verdict sentence | `Exodus.tsx:180` | exodusVerdict / War Plan in cash mode (exodus.ts) | pace, farms, ad spend of the cash-mode War Plan | EXO14: true; EXO19: 1362503.84\|4779659.42 | PASS | EXO14✓ EXO19✓ |
| 3 | Verdict foot: ${months} months to ${deadline}. Production… ${closings} closings | `Exodus.tsx:183` | prepareExodus (exodus.ts); exodusVerdict / War Plan in cash mode (exodus.ts) | horizon deadline; calendar months · pace, farms, ad spend of the cash-mode War Plan | EXO18: 2027-07-31; W35: 15.61; EXO14: true | FLAG (F6) | EXO18✓ W35✓ EXO14✓ EXO19✓ |
| 4 | Latest viable: The latest month… is ${month}. or No farm bought now… | `Exodus.tsx:184` | prepareExodus (exodus.ts) | month end of k − landLag − closeLag | EXO18: 2027-07-31 | PASS | EXO18✓ |
| 5 | **Discount saved** tile | `Exodus.tsx:189` | versusCash (exodus.ts) | discountSaved = notesDelivered × (1 − ratio); lots not needed; months earlier | EXO15: 572,400; EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000} | PASS | EXO15✓ EXO9✓ |
| 6 | **Lots not needed** | `Exodus.tsx:192` | versusCash (exodus.ts) | discountSaved = notesDelivered × (1 − ratio); lots not needed; months earlier | EXO15: 572,400; EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000} | PASS | EXO15✓ EXO9✓ |
| 7 | **Months earlier** | `Exodus.tsx:200` | versusCash (exodus.ts) | discountSaved = notesDelivered × (1 − ratio); lots not needed; months earlier | EXO15: 572,400; EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000} | PASS | EXO15✓ EXO9✓ |
| 8 | Slider readout: ${Math.round(inputs.notesPct)}% | `Exodus.tsx:216` | prepareExodus / coverage scan (exodus.ts) | EXODUS_DEFAULT_NOTES_PCT 30, MAX 60; highest scanned % still covered | EXO16: 60; EXO17: 61\|0 | PASS | EXO16✓ EXO17✓ |
| 9 | Range input 0…EXODUS_NOTES_PCT_MAX (60) | `Exodus.tsx:221–231` | EXODUS_NOTES_PCT_MAX constant | 60 | EXO16: 60; EXO17: 61\|0 | PASS | EXO16✓ EXO17✓ |
| 10 | Max mark label: the inventory covers up to ${pct}% | `Exodus.tsx:233, 345–356` | prepareExodus / coverage scan (exodus.ts) | EXODUS_DEFAULT_NOTES_PCT 30, MAX 60; highest scanned % still covered | EXO16: 60; EXO17: 61\|0 | PASS | EXO16✓ EXO17✓ |
| 11 | Notes % number input | `Exodus.tsx:236` | prepareExodus / coverage scan (exodus.ts) | EXODUS_DEFAULT_NOTES_PCT 30, MAX 60; highest scanned % still covered | EXO16: 60; EXO17: 61\|0 | PASS | EXO16✓ EXO17✓ |
| 12 | Hint: of the LP capital: ${money(s.noteTarget)} of notes… | `Exodus.tsx:239` | runExodus (exodus.ts) | LP capital × notes %; delivered UPB | EXO8: true; EXO11: true; EXO21: true | PASS | EXO8✓ EXO11✓ EXO21✓ EXO20✓ |
| 13 | Real: ${real.noteSaleRatio.sales} note_sales · the inventory covers up to ${pla | `Exodus.tsx:239` | prepareExodus / coverage scan (exodus.ts); noteSaleRatio (exodus.ts) | EXODUS_DEFAULT_NOTES_PCT 30, MAX 60; highest scanned % still covered · combined: Σ sale_price ÷ Σ (financed or upb basis) over note_sales [note_sales.sale_price, sale_date, discount_from_upb, note_id; notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO16: 60; EXO17: 61\|0; EXO1: {"u":0.8092,"b":"combined","c":0.8092,"d":0.8275,"f":0.8045,"l":0.9998,"n":15,"nd":6,"n… | PASS | EXO16✓ EXO17✓ EXO1✓ |
| 14 | LP capital (read-only display) | `Exodus.tsx:246` | exodusDefaults (exodus.ts) | LP_CAPITAL_TO_RETURN 10,000,000 | EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000} | PASS | EXO9✓ |
| 15 | LP capital real: money(real.lpCapital) | `Exodus.tsx:247` | exodusDefaults (exodus.ts) | LP_CAPITAL_TO_RETURN 10,000,000 | EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000} | PASS | EXO9✓ |
| 16 | Deadline input | `Exodus.tsx:254` | prepareExodus (exodus.ts) | horizon deadline; calendar months | EXO18: 2027-07-31; W35: 15.61 | PASS | EXO18✓ W35✓ |
| 17 | Hint: ${number(plan.monthsToDeadline)} months from today | `Exodus.tsx:255` | prepareExodus (exodus.ts) | horizon deadline; calendar months | EXO18: 2027-07-31; W35: 15.61 | FLAG (F6) | EXO18✓ W35✓ |
| 18 | Real: date(real.deadline) | `Exodus.tsx:255` | prepareExodus (exodus.ts) | horizon deadline; calendar months | EXO18: 2027-07-31; W35: 15.61 | PASS | EXO18✓ W35✓ |
| 19 | Note sale ratio input (shown as percent) | `Exodus.tsx:262` | Exodus input | noteSaleRatio × 100 rounded to 2 dp | EXO1: {"u":0.8092,"b":"combined","c":0.8092,"d":0.8275,"f":0.8045,"l":0.9998,"n":15,"nd":6,"n… | PASS | EXO1✓ |
| 20 | Ratio real: ${ratioLabel(used)} (${basis}) … ${ratioLabel(discountBased)} ove | `Exodus.tsx:267–274` | noteSaleRatio (exodus.ts) | combined: Σ sale_price ÷ Σ (financed or upb basis) over note_sales [note_sales.sale_price, sale_date, discount_from_upb, note_id; notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO1: {"u":0.8092,"b":"combined","c":0.8092,"d":0.8275,"f":0.8045,"l":0.9998,"n":15,"nd":6,"n… | PASS | EXO1✓ |
| 21 | Starting cash input | `Exodus.tsx:302` | exodusDefaults ← War Plan ledger | cashKept / owedToday | EXO19: 1362503.84\|4779659.42; W4: 1,362,503.84; W5: 4,779,659.42 | PASS | EXO19✓ W4✓ W5✓ |
| 22 | Real: ${money(real.cashKeptToday)} kept…, ${money(real.owedToday)} owed… | `Exodus.tsx:303` | exodusDefaults ← War Plan ledger | cashKept / owedToday | EXO19: 1362503.84\|4779659.42; W4: 1,362,503.84; W5: 4,779,659.42 | PASS | EXO19✓ W4✓ W5✓ |
| 23 | Scenario option dates | `Exodus.tsx:326` | saved scenarios (localStorage) | timestamp — stored timestamp | — | PASS (no arithmetic) | — |
| 24 | Month label | `Exodus.tsx:465` | runExodus rows (exodus.ts) | calendar months from asOf | EXO18: 2027-07-31 | PASS | EXO18✓ |
| 25 | First row: from ${date(plan.asOf)} | `Exodus.tsx:466` | runExodus rows (exodus.ts) | calendar months from asOf | EXO18: 2027-07-31 | PASS | EXO18✓ |
| 26 | Lots closed | `Exodus.tsx:469` | runExodus rows (exodus.ts) | War Plan cash-mode closings | EXO14: true | PASS | EXO14✓ |
| 27 | Free notes available | `Exodus.tsx:472` | runExodus rows (exodus.ts) | note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO7: true; EXO8: true; EXO10: 10,024,599.81 | PASS | EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 28 | Notes delivered + value | `Exodus.tsx:477–478` | runExodus rows (exodus.ts) | note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO7: true; EXO8: true; EXO10: 10,024,599.81 | PASS | EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 29 | Partial releases + cost | `Exodus.tsx:487–488` | runExodus rows (exodus.ts) | note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO7: true; EXO8: true; EXO10: 10,024,599.81 | PASS | EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 30 | Cash farms + cost | `Exodus.tsx:497–498` | runExodus rows (exodus.ts) | note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO7: true; EXO8: true; EXO10: 10,024,599.81 | PASS | EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 31 | Notes sold + proceeds | `Exodus.tsx:507–508` | runExodus rows (exodus.ts) | note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO7: true; EXO8: true; EXO10: 10,024,599.81 | PASS | EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 32 | Portafolio cash in | `Exodus.tsx:515` | runExodus rows (exodus.ts) | note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO7: true; EXO8: true; EXO10: 10,024,599.81 | PASS | EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 33 | Ad spend | `Exodus.tsx:518` | runExodus rows (exodus.ts) | note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO7: true; EXO8: true; EXO10: 10,024,599.81 | PASS | EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 34 | Cash paid to LPs (+ carried if < 0) | `Exodus.tsx:521–522` | runExodus rows (exodus.ts) | note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO7: true; EXO8: true; EXO10: 10,024,599.81 | PASS | EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 35 | Returned in notes (cum) | `Exodus.tsx:525` | runExodus rows (exodus.ts) | running sums | EXO7: true; EXO8: true | PASS | EXO7✓ EXO8✓ |
| 36 | Returned in cash (cum) | `Exodus.tsx:528` | runExodus rows (exodus.ts) | running sums | EXO7: true; EXO8: true | PASS | EXO7✓ EXO8✓ |
| 37 | Returned in all (cum) | `Exodus.tsx:531` | runExodus rows (exodus.ts) | running sums | EXO7: true; EXO8: true | PASS | EXO7✓ EXO8✓ |
| 38 | Footer: By ${date(plan.deadline)} | `Exodus.tsx:539` | prepareExodus (exodus.ts) | horizon deadline; calendar months | EXO18: 2027-07-31; W35: 15.61 | PASS | EXO18✓ W35✓ |
| 39 | Footer lots | `Exodus.tsx:542` | runExodus rows (exodus.ts) | War Plan cash-mode closings · note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO14: true; EXO7: true; EXO8: true | PASS | EXO14✓ EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 40 | Footer delivered count + money(plan.scenario.notesDelivered) | `Exodus.tsx:548–549` | runExodus (exodus.ts); runExodus rows (exodus.ts) | LP capital × notes %; delivered UPB · note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO8: true; EXO11: true; EXO21: true | PASS | EXO8✓ EXO11✓ EXO21✓ EXO20✓ EXO7✓ EXO10✓ EXO2✓ EXO4✓ |
| 41 | Footer releases: units(plan.scenario.partialReleases.count) + cost | `Exodus.tsx:552–553` | runExodus scenario totals (exodus.ts) | partialReleases.count / .cost = Σ rows | EXO8: true; EXO4: 489,188.26 | PASS | EXO8✓ EXO4✓ |
| 42 | Footer cash farms count + cost | `Exodus.tsx:556–557` | runExodus scenario totals (exodus.ts) | cashFarms.count / .cost = Σ rows | EXO8: true | PASS | EXO8✓ |
| 43 | Footer notes sold count + proceeds | `Exodus.tsx:560–561` | runExodus scenario totals (exodus.ts) | notesSold.count / .proceeds = Σ rows | EXO8: true; EXO10: 10,024,599.81 | PASS | EXO8✓ EXO10✓ |
| 44 | Footer cash in sum | `Exodus.tsx:564` | runExodus rows (exodus.ts) | note inventory (free / needs release via RPC lot_balance), deliveries, cash flows [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb; note_sales.sale_price, sale_date, discount_from_upb, note_id] | EXO7: true; EXO8: true; EXO10: 10,024,599.81 | PASS | EXO7✓ EXO8✓ EXO10✓ EXO2✓ EXO4✓ |
| 45 | Footer ads | `Exodus.tsx:567` | runExodus scenario totals (exodus.ts) | Σ rows | EXO8: true; EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000}; EXO10: 10,024,599.81 | PASS | EXO8✓ EXO9✓ EXO10✓ |
| 46 | Footer cash paid to LPs | `Exodus.tsx:570` | runExodus scenario totals (exodus.ts) | Σ rows | EXO8: true; EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000}; EXO10: 10,024,599.81 | PASS | EXO8✓ EXO9✓ EXO10✓ |
| 47 | Footer cum notes / cash / total | `Exodus.tsx:573–579` | runExodus rows (exodus.ts) | running sums | EXO7: true; EXO8: true | PASS | EXO7✓ EXO8✓ |
| 48 | Inventory chips: ${statusShort} · ${c.notes} · ${moneyCompact(c.upb)} · ${extra | `Exodus.tsx:605–606` | noteInventory (exodus.ts) | status buckets, UPB, rate, term, remaining months, release cost (RPC lot_balance) [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO2: true; EXO3: {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact…; EXO4: 489,188.26 | PASS | EXO2✓ EXO3✓ EXO4✓ EXO6✓ |
| 49 | Per-note UPB | `Exodus.tsx:632` | noteInventory (exodus.ts) | status buckets, UPB, rate, term, remaining months, release cost (RPC lot_balance) [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO2: true; EXO3: {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact…; EXO4: 489,188.26 | PASS | EXO2✓ EXO3✓ EXO4✓ EXO6✓ |
| 50 | Per-note rate | `Exodus.tsx:635` | noteInventory (exodus.ts) | status buckets, UPB, rate, term, remaining months, release cost (RPC lot_balance) [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO2: true; EXO3: {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact…; EXO4: 489,188.26 | PASS | EXO2✓ EXO3✓ EXO4✓ EXO6✓ |
| 51 | Term months | `Exodus.tsx:638` | noteInventory (exodus.ts) | status buckets, UPB, rate, term, remaining months, release cost (RPC lot_balance) [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO2: true; EXO3: {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact…; EXO4: 489,188.26 | PASS | EXO2✓ EXO3✓ EXO4✓ EXO6✓ |
| 52 | Remaining: ${n} left | `Exodus.tsx:639` | noteInventory (exodus.ts) | status buckets, UPB, rate, term, remaining months, release cost (RPC lot_balance) [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO2: true; EXO3: {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact…; EXO4: 489,188.26 | PASS | EXO2✓ EXO3✓ EXO4✓ EXO6✓ |
| 53 | Release cost today | `Exodus.tsx:645` | noteInventory (exodus.ts) | status buckets, UPB, rate, term, remaining months, release cost (RPC lot_balance) [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO2: true; EXO3: {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact…; EXO4: 489,188.26 | PASS | EXO2✓ EXO3✓ EXO4✓ EXO6✓ |
| 54 | Settlement: ${r.settlementPerDollar.toFixed(2)}× | `Exodus.tsx:648` | noteInventory (exodus.ts) | status buckets, UPB, rate, term, remaining months, release cost (RPC lot_balance) [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO2: true; EXO3: {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact…; EXO4: 489,188.26 | PASS | EXO2✓ EXO3✓ EXO4✓ EXO6✓ |
| 55 | Inventory foot: ${sold} sold and ${inactive} not active are left out. | `Exodus.tsx:655` | noteInventory (exodus.ts) | status buckets, UPB, rate, term, remaining months, release cost (RPC lot_balance) [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO2: true; EXO3: {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact…; EXO4: 489,188.26 | PASS | EXO2✓ EXO3✓ EXO4✓ EXO6✓ |
| 56 | Package total UPB | `Exodus.tsx:679` | notePackage (exodus.ts) | Σ UPB, count, weighted averages over delivered notes (existing + projected) | EXO11: true; EXO5: {"f":117504.74,"r":0.0946,"t":140,"p":1388.87,"n":39} | PASS | EXO11✓ EXO5✓ |
| 57 | Package notes count | `Exodus.tsx:680` | notePackage (exodus.ts) | Σ UPB, count, weighted averages over delivered notes (existing + projected) | EXO11: true; EXO5: {"f":117504.74,"r":0.0946,"t":140,"p":1388.87,"n":39} | PASS | EXO11✓ EXO5✓ |
| 58 | Average rate | `Exodus.tsx:681` | notePackage (exodus.ts) | Σ UPB, count, weighted averages over delivered notes (existing + projected) | EXO11: true; EXO5: {"f":117504.74,"r":0.0946,"t":140,"p":1388.87,"n":39} | PASS | EXO11✓ EXO5✓ |
| 59 | Average term | `Exodus.tsx:682` | notePackage (exodus.ts) | Σ UPB, count, weighted averages over delivered notes (existing + projected) | EXO11: true; EXO5: {"f":117504.74,"r":0.0946,"t":140,"p":1388.87,"n":39} | PASS | EXO11✓ EXO5✓ |
| 60 | Average months left | `Exodus.tsx:683` | notePackage (exodus.ts) | Σ UPB, count, weighted averages over delivered notes (existing + projected) | EXO11: true; EXO5: {"f":117504.74,"r":0.0946,"t":140,"p":1388.87,"n":39} | PASS | EXO11✓ EXO5✓ |
| 61 | Package parts: ${n} note(s) · ${money(upb)} | `Exodus.tsx:690` | notePackage (exodus.ts) | Σ UPB, count, weighted averages over delivered notes (existing + projected) | EXO11: true; EXO5: {"f":117504.74,"r":0.0946,"t":140,"p":1388.87,"n":39} | PASS | EXO11✓ EXO5✓ |
| 62 | Sources production line | `Exodus.tsx:721` | reconcile (exodus.ts) | bridge from War Plan cash metric to baseline cash paid; replayDrift disclosed | EXO12: 12,427,399.17; EXO13: 10,010,410.7; EXO14: true | FLAG (F13) | EXO12✓ EXO13✓ EXO14✓ |
| 63 | Sources cash line | `Exodus.tsx:722` | reconcile (exodus.ts) | bridge from War Plan cash metric to baseline cash paid; replayDrift disclosed | EXO12: 12,427,399.17; EXO13: 10,010,410.7; EXO14: true | FLAG (F13) | EXO12✓ EXO13✓ EXO14✓ |
| 64 | Bridge lines (signed) | `Exodus.tsx:724–728` | reconcile (exodus.ts) | bridge from War Plan cash metric to baseline cash paid; replayDrift disclosed | EXO12: 12,427,399.17; EXO13: 10,010,410.7; EXO14: true | FLAG (F13) | EXO12✓ EXO13✓ EXO14✓ |
| 65 | Future note line | `Exodus.tsx:731` | futureNoteTerms (exodus.ts) | face = avgSalePrice × (1 − down%); mean rate and term of farm notes [notes.original_amount, financed_amount, interest_rate, term_months, start_date, is_sold, status, current_upb] | EXO5: {"f":117504.74,"r":0.0946,"t":140,"p":1388.87,"n":39} | PASS | EXO5✓ |
| 66 | Unsold lots line (if lots > 0) | `Exodus.tsx:732` | runExodus scenario totals (exodus.ts) | Σ rows | EXO8: true; EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000}; EXO10: 10,024,599.81 | PASS | EXO8✓ EXO9✓ EXO10✓ |
| 67 | Partner balance line | `Exodus.tsx:733` | runExodus scenario totals (exodus.ts) | Σ rows | EXO8: true; EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000}; EXO10: 10,024,599.81 | PASS | EXO8✓ EXO9✓ EXO10✓ |
| 68 | Release list: units · cost → upb · ratio× | `Exodus.tsx:745` | runExodus scenario totals (exodus.ts) | Σ rows | EXO8: true; EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000}; EXO10: 10,024,599.81 | PASS | EXO8✓ EXO9✓ EXO10✓ |
| 69 | Cash farm list: cost → freeNoteValue · settlement per dollar ratio× | `Exodus.tsx:762` | runExodus scenario totals (exodus.ts) | Σ rows | EXO8: true; EXO9: {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000}; EXO10: 10,024,599.81 | PASS | EXO8✓ EXO9✓ EXO10✓ |

### The Realm — 3 figures · 2 PASS · 1 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Stuck 60+ days (legend) | `RealmMap.tsx:126–127` | copy (RealmMap legend) | literal 60 (duplicates STUCK_AFTER_DAYS) — literal equals the constant today; would drift if STUCK_AFTER_DAYS changed | P1: 16 | PASS | P1✓ |
| 2 | {meta.label} · {n} pending / · {n} to cover | `RealmMap.tsx:186–188 via campaignTag :30–34` | computeCampaigns (campaigns.ts) | target = basis + accrued interest; recovered = Σ salePrice on sold lots; lots left = shortfall ÷ avg price | CAMP1: 0; CAMP2: (none) | FLAG (F7) | CAMP1✓ CAMP2✗ |
| 3 | {sold}/{total} closed · {pct} · {deal} | `RealmMap.tsx:195` | computeFarm (farm.ts) | sold lots ÷ total_lots | FARM1: 0 | PASS | FARM1✓ |

### The Realm (tooltip) — 10 figures · 10 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 4 | Sale price | `RealmMap.tsx:270` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 5 | Land cost | `RealmMap.tsx:271` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 6 | Gross | `RealmMap.tsx:272` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 7 | Investor take | `RealmMap.tsx:273` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 8 | Net | `RealmMap.tsx:274` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 9 | Cash realized | `RealmMap.tsx:275` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 10 | Note sold for | `RealmMap.tsx:276` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 11 | Reserved | `RealmMap.tsx:277` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 12 | Closed | `RealmMap.tsx:278` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 13 | Days in pipeline | `RealmMap.tsx:279` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |

### The Realm (sheet) — 17 figures · 14 PASS · 3 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 14 | Sheet description county · deal · investor | `RealmMap.tsx:247` | RealmMap sheet description | farm_acquisitions.county, deal_type; investors.name — labels, no arithmetic | FARM1: 0 | PASS | FARM1✓ |
| 15 | Capital deployed | `RealmMap.tsx:305` | computeFarm (farm.ts) | basis = Σ property_costs.amount (else investor_capital); ÷ total_lots | FARM1: 0; LOT2: true | PASS | FARM1✓ LOT2✓ |
| 16 | Land cost / lot | `RealmMap.tsx:306` | computeFarm (farm.ts) | basis = Σ property_costs.amount (else investor_capital); ÷ total_lots | FARM1: 0; LOT2: true | PASS | FARM1✓ LOT2✓ |
| 17 | Revenue | `RealmMap.tsx:307` | computeFarm (farm.ts) | Σ over the farm's sold lots | FARM1: 0 | PASS | FARM1✓ |
| 18 | Net profit | `RealmMap.tsx:308` | computeFarm (farm.ts) | Σ over the farm's sold lots | FARM1: 0 | PASS | FARM1✓ |
| 19 | Cash realized | `RealmMap.tsx:309` | computeFarm (farm.ts) | Σ over the farm's sold lots | FARM1: 0 | PASS | FARM1✓ |
| 20 | Capital outstanding | `RealmMap.tsx:310` | computeFarm (farm.ts) | investor_capital − Σ capital_return distributions [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; D1: 4,116,355.48 | PASS | FARM1✓ D1✓ |
| 21 | Interest accrued | `{rate}% @ RealmMap.tsx:311` | accrueInterest (interest.ts) | capital × annual_interest_rate × days ÷ 365 from funding_date (fixed-interest farms) | FARM1: 0; LOT3: true | FLAG (F8) | FARM1✓ LOT3✓ |
| 22 | Investor share | `{pct}% @ RealmMap.tsx:312` | computeFarm (farm.ts) | profit share: gross × profit_share_pct on sold lots; fixed interest: accrued split over lots, counted on sold | FARM1: 0; LOT3: true | FLAG (F8) | FARM1✓ LOT3✓ |
| 23 | Funded | `RealmMap.tsx:313` | computeFarm (farm.ts) | farm_acquisitions.funding_date ?? closing_date | FARM2: true; FARM3: 3,291,955.48 | FLAG (F3) | FARM2✓ FARM3✓ |
| 24 | Months since funding | `RealmMap.tsx:314` | computeFarm (farm.ts) | (asOf − funding date) ÷ 30.4375 | FARM1: 0 | PASS | FARM1✓ |
| 25 | {median} days (farm median) | `RealmMap.tsx:320–321` | computePipeline per farm (pipeline.ts) | per-farm median / reserved / stuck / trapped | PIPE1: 0 | PASS | PIPE1✓ |
| 26 | median over {n} closed lot(s) · realm {n}d | `RealmMap.tsx:323–326` | computePipeline per farm (pipeline.ts) | per-farm median / reserved / stuck / trapped | PIPE1: 0 | PASS | PIPE1✓ |
| 27 | {reserved} reserved · {stuck} stuck · {money} of profit trapped | `RealmMap.tsx:328–331` | computePipeline per farm (pipeline.ts); computeFarm (farm.ts) | per-farm median / reserved / stuck / trapped · Σ over the farm's sold lots | PIPE1: 0; FARM1: 0 | PASS | PIPE1✓ FARM1✓ |
| 28 | Stage badge counts | `RealmMap.tsx:336–338` | computeFarm (farm.ts) | count of lots per stage | FARM1: 0 | PASS | FARM1✓ |
| 29 | Lot {lotNumber} | `RealmMap.tsx:347` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 30 | Lot row net | `RealmMap.tsx:351` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |

### The Realm (campaign) — 7 figures · 0 PASS · 7 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 31 | {pct} covered | `RealmMap.tsx:367` | computeCampaigns (campaigns.ts) | target = basis + accrued interest; recovered = Σ salePrice on sold lots; lots left = shortfall ÷ avg price | CAMP1: 0; CAMP2: (none) | FLAG (F7) | CAMP1✓ CAMP2✗ |
| 32 | Goal (capital + interest) | `RealmMap.tsx:375` | computeCampaigns (campaigns.ts) | target = basis + accrued interest; recovered = Σ salePrice on sold lots; lots left = shortfall ÷ avg price | CAMP1: 0; CAMP2: (none) | FLAG (F7) | CAMP1✓ CAMP2✗ |
| 33 | Sold so far | `RealmMap.tsx:377` | computeCampaigns (campaigns.ts) | target = basis + accrued interest; recovered = Σ salePrice on sold lots; lots left = shortfall ÷ avg price | CAMP1: 0; CAMP2: (none) | FLAG (F7) | CAMP1✓ CAMP2✗ |
| 34 | {left} of {unsold} unsold ({short} short) | `RealmMap.tsx:379–381` | computeCampaigns (campaigns.ts) | target = basis + accrued interest; recovered = Σ salePrice on sold lots; lots left = shortfall ÷ avg price | CAMP1: 0; CAMP2: (none) | FLAG (F7) | CAMP1✓ CAMP2✗ |
| 35 | Reservations waiting | `RealmMap.tsx:384–385` | computeCampaigns (campaigns.ts) | target = basis + accrued interest; recovered = Σ salePrice on sold lots; lots left = shortfall ÷ avg price | CAMP1: 0; CAMP2: (none) | FLAG (F7) | CAMP1✓ CAMP2✗ |
| 36 | Last closing {date} · {n}d ago / none yet | `RealmMap.tsx:388` | computeCampaigns (campaigns.ts) | target = basis + accrued interest; recovered = Σ salePrice on sold lots; lots left = shortfall ÷ avg price | CAMP1: 0; CAMP2: (none) | FLAG (F7) | CAMP1✓ CAMP2✗ |
| 37 | Interest accrued | `RealmMap.tsx:392` | computeCampaigns (campaigns.ts) | target = basis + accrued interest; recovered = Σ salePrice on sold lots; lots left = shortfall ÷ avg price | CAMP1: 0; CAMP2: (none) | FLAG (F7) | CAMP1✓ CAMP2✗ |

### Quests — 26 figures · 25 PASS · 1 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 38 | Filter Stuck reservations ({n}+ days) | `Quests.tsx:156` | STUCK_AFTER_DAYS constant | 60 | P1: 16 | PASS | P1✓ |
| 39 | Filter Expected this month ({n}) | `Quests.tsx:157` | Quests filter | lots whose expected month is the asOf month | EXP10: {"r":7,"c":0,"er":3,"ec":2.25,"en":205688.19}; EXP1: 0 | PASS | EXP10✓ EXP1✓ |
| 40 | Buyer sub: Res. {date} | `Quests.tsx:224` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 41 | Buyer sub: Closed {date} | `Quests.tsx:225` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 42 | Contract price column | `Quests.tsx:231` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 43 | Sale price column | `Quests.tsx:232–233` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 44 | Land cost | `Quests.tsx:235` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 45 | Gross | `Quests.tsx:236` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 46 | Investor take | `Quests.tsx:237` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 47 | Net | `Quests.tsx:238` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 48 | Cash realized | `Quests.tsx:239` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 49 | Days | `Quests.tsx:242` | computeLot (lot.ts) | price notes.original_amount (else file_cases.sale_price); land farm_acquisitions.investor_capital ÷ total_lots; take [farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)]; cash [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price]; dates [file_cases.reservation_date (status active/completed); file_cases.closing_date ?? notes.start_date] | LOT0: true; LOT1: 0; LOT4: true | PASS | LOT0✓ LOT1✓ LOT4✓ |
| 50 | Expected close date | `Quests.tsx:309 (ExpectedCloseCell)` | computeExpected per lot (expected.ts) | reservation_date + median days (farm else realm); daysToExpectedClose = expected − asOf | EXP1: 0; EXP12: true | PASS | EXP1✓ EXP12✓ |
| 51 | {n}d late / today / in {n}d | `Quests.tsx:306` | computeExpected per lot (expected.ts) | reservation_date + median days (farm else realm); daysToExpectedClose = expected − asOf | EXP1: 0; EXP12: true | PASS | EXP1✓ EXP12✓ |
| 52 | {farm\ | `realm} median {n}d` | ExpectedCloseCell | median used (farm else realm) — expected.ts | EXP1: 0; PIPE1: 0 | PASS | EXP1✓ PIPE1✓ |
| 53 | Oxygen cell +{n}d / {n}d / ~+{n}d | `Quests.tsx:260` | computeOxygen per lot (oxygen.ts) | per-lot daysGained / provisionalDays | O5: 0; OXY1: 0 | PASS | O5✓ OXY1✓ |
| 54 | Totals · {n} lots | `Quests.tsx:267` | Quests (component arithmetic) | Σ of the per-lot columns over the filtered rows | LOT4: true | PASS | LOT4✓ |
| 55 | Totals contract price | `Quests.tsx:270–271` | Quests (component arithmetic) | Σ of the per-lot columns over the filtered rows | LOT4: true | PASS | LOT4✓ |
| 56 | Totals sale price | `Quests.tsx:273–274` | Quests (component arithmetic) | Σ of the per-lot columns over the filtered rows | LOT4: true | PASS | LOT4✓ |
| 57 | Totals land | `Quests.tsx:276` | Quests (component arithmetic) | Σ of the per-lot columns over the filtered rows | LOT4: true | PASS | LOT4✓ |
| 58 | Totals gross | `Quests.tsx:277` | Quests (component arithmetic) | Σ of the per-lot columns over the filtered rows | LOT4: true | PASS | LOT4✓ |
| 59 | Totals investor take | `Quests.tsx:278` | Quests (component arithmetic) | Σ investorTake over closed / note_sold rows only | LOT4: true; G13: 737,791; LOT3: true | FLAG (F8) | LOT4✓ G13✓ LOT3✓ |
| 60 | Totals net | `Quests.tsx:279–280` | Quests (component arithmetic) | Σ of the per-lot columns over the filtered rows | LOT4: true | PASS | LOT4✓ |
| 61 | Totals cash | `Quests.tsx:282–283` | Quests (component arithmetic) | Σ of the per-lot columns over the filtered rows | LOT4: true | PASS | LOT4✓ |
| 62 | {n} pending · {money} expected | `Quests.tsx:286–287` | Quests (component arithmetic) | Σ of the per-lot columns over the filtered rows | LOT4: true | PASS | LOT4✓ |
| 63 | Totals oxygen {+/-}{n}d | `Quests.tsx:289–291` | Quests (component arithmetic) | Σ of the per-lot columns over the filtered rows | LOT4: true | PASS | LOT4✓ |

### Pipeline — 23 figures · 18 PASS · 5 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 64 | Subtitle … after {n} days | `Pipeline.tsx:38` | STUCK_AFTER_DAYS constant (pipeline.ts) | constant 60 | P1: 16 | PASS | P1✓ |
| 65 | Stat Profit trapped in reservations | `Pipeline.tsx:57–58` | computePipeline (pipeline.ts) | Σ netProfit at stake over reservations waiting ≥ 60 days | P3: 1,103,911.15 | PASS | P3✓ |
| 66 | Hint {stuck} of {reserved} … {n}+ days · {sales} of sales | `Pipeline.tsx:59` | computePipeline (pipeline.ts); STUCK_AFTER_DAYS constant (pipeline.ts) | reservations with asOf − reservation_date ≥ STUCK_AFTER_DAYS 60 [file_cases.reservation_date (status active/completed)] · constant 60 · Σ notes.original_amount (else file_cases.sale_price) over stuck reservations · count reserved lots | P1: 16; P2: 2,024,531; PIPE7: 33 | PASS | P1✓ P2✓ PIPE7✓ |
| 67 | Stat Reservations vs closings / mo values | `Pipeline.tsx:67–68` | computePipeline (pipeline.ts); computePipeline ← goal.closedLotsPerMonth | reservations dated in the trailing window (live lots) ÷ months [file_cases.reservation_date (status active/completed)] | P13: 7.1; P12: 21; PIPE8: 4.73 | PASS | P13✓ P12✓ PIPE8✓ |
| 68 | Hint trailing window / days / counts | `Pipeline.tsx:71` | computePipeline (pipeline.ts); computePipeline ← goal window | count of live reservations dated in the trailing window · reservations made in window on non-available lots | P12: 21; PIPE9: 2026-06-15/90; PIPE5: 21 | PASS | P12✓ PIPE9✓ PIPE5✓ PIPE6✓ |
| 69 | Conversion % | `Pipeline.tsx:77` | computePipeline (pipeline.ts) | closed ÷ (closed + stillReserved) over reservations ≥ 90 days old | P8: 75; P4: 48; P5: 36 | FLAG (F14) | P8✓ P4✓ P5✓ |
| 70 | · {pct} incl. cancellations | `Pipeline.tsx:78` | computePipeline (pipeline.ts) | cancelled file cases (status = cancelled) in the cohort — none visible to the viewer | P7: 0; P9: 75; PIPE4: 0 | FLAG (F14) | P7✓ P9✓ PIPE4✓ |
| 71 | Conversion hint cohort / cutoff / still / cancelled | `Pipeline.tsx:81` | computePipeline (pipeline.ts) | cohort = reservations with reservation_date ≤ asOf − 90 [file_cases.reservation_date (status active/completed)] · cancelled file cases (status = cancelled) in the cohort — none visible to the viewer | P4: 48; P5: 36; P6: 12 | FLAG (F14) | P4✓ P5✓ P6✓ PIPE3✓ P7✓ P9✓ PIPE4✓ |
| 72 | Cancellation rate | `Pipeline.tsx:86` | computePipeline (pipeline.ts) | cancelled file cases (status = cancelled) in the cohort — none visible to the viewer | P7: 0; P9: 75; PIPE4: 0 | FLAG (F14) | P7✓ P9✓ PIPE4✓ |
| 73 | Cancellation hint counts | `Pipeline.tsx:87` | computePipeline (pipeline.ts) | cohort = reservations with reservation_date ≤ asOf − 90 [file_cases.reservation_date (status active/completed)] · cancelled file cases (status = cancelled) in the cohort — none visible to the viewer · cancelled file cases with a reservation_date | P4: 48; P5: 36; P6: 12 | FLAG (F14) | P4✓ P5✓ P6✓ PIPE3✓ P7✓ P9✓ PIPE4✓ P15✓ |
| 74 | Median days to close | `Pipeline.tsx:93` | computePipeline (pipeline.ts) | median(file_cases.closing_date ?? notes.start_date − reservation_date), closed lots with both dates | P10: 61.5; P11: 36 | PASS | P10✓ P11✓ |
| 75 | Median hint over {n} closed lots… | `Pipeline.tsx:94` | computePipeline (pipeline.ts) | — | P11: 36 | PASS | P11✓ |
| 76 | Per farm median {n}d | `Pipeline.tsx:105` | computePipeline per farm (pipeline.ts) | per-farm median / reserved / stuck / trapped | PIPE1: 0 | PASS | PIPE1✓ |
| 77 | Per farm {reserved} reserved · {stuck} stuck · {money} trapped | `Pipeline.tsx:107–109` | computePipeline per farm (pipeline.ts); computeFarm (farm.ts) | per-farm median / reserved / stuck / trapped · Σ over the farm's sold lots | PIPE1: 0; FARM1: 0 | PASS | PIPE1✓ FARM1✓ |
| 78 | Empty body stuck threshold | `Pipeline.tsx:117` | copy | STUCK_AFTER_DAYS 60 | P1: 16 | PASS | P1✓ |
| 79 | Stuck table Days waiting | `Pipeline.tsx:138` | computePipeline stuck rows (pipeline.ts) | daysWaiting = asOf − reservation_date; salePrice; netProfitAtStake; estimated_closing_date [file_cases.reservation_date (status active/completed), file_cases.estimated_closing_date] | PIPE2: true; P1: 16; P2: 2,024,531 | PASS | PIPE2✓ P1✓ P2✓ P3✓ |
| 80 | Reserved | `Pipeline.tsx:153` | computePipeline stuck rows (pipeline.ts) | daysWaiting = asOf − reservation_date; salePrice; netProfitAtStake; estimated_closing_date [file_cases.reservation_date (status active/completed), file_cases.estimated_closing_date] | PIPE2: true; P1: 16; P2: 2,024,531 | PASS | PIPE2✓ P1✓ P2✓ P3✓ |
| 81 | Est. closing | `Pipeline.tsx:154` | computePipeline stuck rows (pipeline.ts) | daysWaiting = asOf − reservation_date; salePrice; netProfitAtStake; estimated_closing_date [file_cases.reservation_date (status active/completed), file_cases.estimated_closing_date] | PIPE2: true; P1: 16; P2: 2,024,531 | PASS | PIPE2✓ P1✓ P2✓ P3✓ |
| 82 | Sale price | `Pipeline.tsx:155` | computePipeline stuck rows (pipeline.ts) | daysWaiting = asOf − reservation_date; salePrice; netProfitAtStake; estimated_closing_date [file_cases.reservation_date (status active/completed), file_cases.estimated_closing_date] | PIPE2: true; P1: 16; P2: 2,024,531 | PASS | PIPE2✓ P1✓ P2✓ P3✓ |
| 83 | Net profit at stake | `Pipeline.tsx:156` | computePipeline stuck rows (pipeline.ts) | daysWaiting = asOf − reservation_date; salePrice; netProfitAtStake; estimated_closing_date [file_cases.reservation_date (status active/completed), file_cases.estimated_closing_date] | PIPE2: true; P1: 16; P2: 2,024,531 | PASS | PIPE2✓ P1✓ P2✓ P3✓ |
| 84 | Totals · {n} stuck reservations | `Pipeline.tsx:163` | Pipeline page | stuck rows shown | P1: 16; PIPE2: true | PASS | P1✓ PIPE2✓ |
| 85 | Totals sale prices shown | `Pipeline.tsx:165` | Pipeline page (component arithmetic) | Σ salePrice over the stuck rows shown — independent Σ = 2,024,531 | P2: 2,024,531 | PASS | P2✓ |
| 86 | Totals net trapped shown | `Pipeline.tsx:166–167` | Pipeline page (component arithmetic) | Σ netProfitAtStake over the stuck rows shown — independent Σ = 1,103,911.15 | P3: 1,103,911.15 | PASS | P3✓ |

### Sponsors — 25 figures · 22 PASS · 3 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 87 | Liberation board header Hostages … · {n} | `Liberation.tsx:55` | computeLiberation (liberation.ts) | hostages with / without capital fully returned | L1: 9; L2: 1 | PASS | L1✓ L2✓ |
| 88 | {returned} of {capital} returned · {pct} | `Liberation.tsx:58` | computeLiberation (liberation.ts) | Σ returned / Σ capital | L3: 4,734,604; L4: 618,248.52 | PASS | L3✓ L4✓ |
| 89 | Hostage line {ret} of {cap} returned · … | `Liberation.tsx:29–31` | computeLiberation (liberation.ts) | capital = investor_capital; returned = Σ capital_return distributions; freedAt = date returned ≥ capital [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; L1: 9; L2: 1 | PASS | FARM1✓ L1✓ L2✓ L3✓ L4✓ |
| 90 | Hostage {pct} | `Liberation.tsx:34` | computeLiberation (liberation.ts) | capital = investor_capital; returned = Σ capital_return distributions; freedAt = date returned ≥ capital [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · Σ returned / Σ capital | FARM1: 0; L1: 9; L2: 1 | PASS | FARM1✓ L1✓ L2✓ L3✓ L4✓ |
| 91 | Liberated · {n} | `Liberation.tsx:75` | computeLiberation (liberation.ts) | hostages with / without capital fully returned | L1: 9; L2: 1 | PASS | L1✓ L2✓ |
| 92 | Celebration headline {n} things happened… | `Celebration.tsx:33` | Chronicle paging; sinceLastVisit (visits.ts) | events.length − limit · events dated after the stored last-visit timestamp — count of events since last visit; each amount is the event amount (EVT6) | EVT1: {"farm_acquired":14,"reservation":69,"cancellation":0,"closing":38,"note_sale":14,"dist…; EVT2: true | PASS | EVT1✓ EVT2✓ |
| 93 | Celebration {date} · {money} | `Celebration.tsx:83–84` | buildEvents (events.ts) | closing → lot netProfit; note_sale → sale_price; distribution → amount; farm_acquired → investor_capital · event date (closing/reservation/sale/distribution/farm) | EVT6: true; EVT1: {"farm_acquired":14,"reservation":69,"cancellation":0,"closing":38,"note_sale":14,"dist…; EVT2: true | PASS | EVT6✓ EVT1✓ EVT2✓ EVT4✓ |
| 94 | Capital deployed | `Sponsors.tsx:116` | computeInvestors (investors.ts) | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ |
| 95 | Capital returned | `Sponsors.tsx:117` | computeInvestors (investors.ts) | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ |
| 96 | Capital outstanding | `Sponsors.tsx:118` | computeInvestors (investors.ts) | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ |
| 97 | Profit share earned | `Sponsors.tsx:121` | computeInvestors (investors.ts) | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ |
| 98 | Profit share paid | `Sponsors.tsx:122` | computeInvestors (investors.ts) | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ |
| 99 | Unpaid share | `Sponsors.tsx:123` | computeInvestors (investors.ts) | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ |
| 100 | Interest accrued | `Sponsors.tsx:127` | computeInvestors (investors.ts) | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ |
| 101 | Interest paid | `Sponsors.tsx:128` | computeInvestors (investors.ts) | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ |
| 102 | Unpaid interest | `Sponsors.tsx:129` | computeInvestors (investors.ts) | Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; INV2: true; INV3: 4,916,355.48 | PASS | INV1✓ INV2✓ INV3✓ |
| 103 | Farm funding date (mobile + desktop) | `Sponsors.tsx:140, :191` | computeInvestors (investors.ts); computeFarm (farm.ts) | per farm position [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · farm_acquisitions.funding_date ?? closing_date | INV1: 0; FARM1: 0; INV2: true | FLAG (F3) | INV1✓ FARM1✓ INV2✓ INV3✓ FARM2✓ FARM3✓ |
| 104 | Farm Capital | `Sponsors.tsx:145, :193` | computeInvestors (investors.ts); computeFarm (farm.ts) | per farm position [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · basis = Σ property_costs.amount (else investor_capital); ÷ total_lots | INV1: 0; FARM1: 0; INV2: true | PASS | INV1✓ FARM1✓ INV2✓ INV3✓ LOT2✓ |
| 105 | Farm terms {pct} share / {pct} / yr / own | `Sponsors.tsx:150–154, :195–199` | computeInvestors (investors.ts); accrueInterest (interest.ts); computeFarm (farm.ts) | per farm position [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · capital × annual_interest_rate × days ÷ 365 from funding_date (fixed-interest farms) · profit share: gross × profit_share_pct on sold lots; fixed interest: accrued split over lots, counted on sold | INV1: 0; FARM1: 0; INV2: true | FLAG (F8) | INV1✓ FARM1✓ INV2✓ INV3✓ LOT3✓ |
| 106 | Farm Lots {sold}/{total} | `Sponsors.tsx:160, :202` | computeInvestors (investors.ts); computeFarm (farm.ts) | per farm position [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · sold lots ÷ total_lots | INV1: 0; FARM1: 0; INV2: true | PASS | INV1✓ FARM1✓ INV2✓ INV3✓ |
| 107 | Farm Share earned / Accrued | `Sponsors.tsx:165, :204` | computeInvestors (investors.ts); computeFarm (farm.ts) | profit share on sold lots / interest accrued on the farm (fixed-interest) · per farm position [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · profit share: gross × profit_share_pct on sold lots; fixed interest: accrued split over lots, counted on sold | INV1: 0; FARM1: 0; LOT3: true | FLAG (F8) | INV1✓ FARM1✓ LOT3✓ INV2✓ INV3✓ |
| 108 | Farm Outstanding | `Sponsors.tsx:169, :205` | computeInvestors (investors.ts); computeFarm (farm.ts) | per farm position [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] · investor_capital − Σ capital_return distributions [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | INV1: 0; FARM1: 0; INV2: true | PASS | INV1✓ FARM1✓ INV2✓ INV3✓ D1✓ |
| 109 | Distributions summary {n} · {money} | `Sponsors.tsx:213` | computeInvestors (investors.ts) | raw investor_distributions rows (distribution_date, amount) · Σ farm positions: deployed, returned, outstanding, accrued, paid, PS earned/paid [farm_acquisitions.funding_date ?? closing_date, total_lots, investor_capital, deal_type, investor_id, county; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | T8: 793,990.46; INV1: 0; INV2: true | PASS | T8✓ INV1✓ INV2✓ INV3✓ |
| 110 | Distribution date | `Sponsors.tsx:222` | raw row passthrough | investor_distributions.distribution_date | T8: 793,990.46 | PASS | T8✓ |
| 111 | Distribution amount | `Sponsors.tsx:226` | raw row passthrough | investor_distributions.amount | T8: 793,990.46; T7: 793,990.46 | PASS | T8✓ T7✓ |

### Sponsors · Liberation board — 9 figures · 9 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 107 | $returned of $capital returned | `Liberation.tsx:29` | computeLiberation (liberation.ts) | capital = investor_capital; returned = Σ capital_return distributions; freedAt = date returned ≥ capital [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; L1: 9; L2: 1 | PASS | FARM1✓ L1✓ L2✓ L3✓ L4✓ |
| 108 | freed {date} after N days or $outstanding to go | `Liberation.tsx:30` | computeLiberation (liberation.ts) | capital = investor_capital; returned = Σ capital_return distributions; freedAt = date returned ≥ capital [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; L1: 9; L2: 1 | PASS | FARM1✓ L1✓ L2✓ L3✓ L4✓ |
| 109 | $paidOnTop paid on top | `Liberation.tsx:31` | computeLiberation (liberation.ts) | capital = investor_capital; returned = Σ capital_return distributions; freedAt = date returned ≥ capital [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; L1: 9; L2: 1 | PASS | FARM1✓ L1✓ L2✓ L3✓ L4✓ |
| 110 | pctReturned badge | `Liberation.tsx:34` | computeLiberation (liberation.ts) | capital = investor_capital; returned = Σ capital_return distributions; freedAt = date returned ≥ capital [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; L1: 9; L2: 1 | PASS | FARM1✓ L1✓ L2✓ L3✓ L4✓ |
| 111 | Progress bar width % | `Liberation.tsx:40` | computeLiberation (liberation.ts) | capital = investor_capital; returned = Σ capital_return distributions; freedAt = date returned ≥ capital [investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | FARM1: 0; L1: 9; L2: 1 | PASS | FARM1✓ L1✓ L2✓ L3✓ L4✓ |
| 112 | Header: Hostages… · {captive count} | `Liberation.tsx:55` | computeLiberation (liberation.ts) | hostages with / without capital fully returned | L1: 9; L2: 1 | PASS | L1✓ L2✓ |
| 113 | Totals: $returned of $total · Y% | `Liberation.tsx:58` | computeLiberation (liberation.ts) | Σ returned / Σ capital | L3: 4,734,604; L4: 618,248.52 | PASS | L3✓ L4✓ |
| 114 | Liberated · {freed count} | `Liberation.tsx:75` | computeLiberation (liberation.ts) | hostages with / without capital fully returned | L1: 9; L2: 1 | PASS | L1✓ L2✓ |
| 115 | Gallery copy mentions 100% | `Liberation.tsx:78` | copy | literal 100% in the empty-gallery copy — copy only | — | PASS (no arithmetic) | — |

### Treasury — 22 figures · 22 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 112 | Stat Cash in | `Treasury.tsx:28` | computeTreasury (treasury.ts) | Σ down payments + Σ all note_sales.sale_price [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price] · footer totals | T4: 2,213,494.3; T10: 57,000; T11: 2,213,494.3 | PASS | T4✓ T10✓ T11✓ T1✓ T2✓ T3✓ T5✓ T6✓ T7✓ TRE3✓ |
| 113 | Hint Down payments … · notes … | `Treasury.tsx:28` | computeTreasury (treasury.ts) | Σ down payments (cash deals: full price) · Σ note_sales.sale_price (all notes) · footer totals | T1: 857,088.44; T9: 1,356,405.86; T2: 1,299,405.86 | PASS | T1✓ T9✓ T2✓ T3✓ T4✓ T5✓ T6✓ T7✓ TRE3✓ |
| 114 | Stat Cash out to sponsors | `Treasury.tsx:29` | computeTreasury (treasury.ts) | Σ investor_distributions.amount · footer totals | T7: 793,990.46; T8: 793,990.46; T1: 857,088.44 | PASS | T7✓ T8✓ T1✓ T2✓ T3✓ T4✓ T5✓ T6✓ TRE3✓ |
| 115 | Hint capital / profit share | `Treasury.tsx:29` | computeTreasury (treasury.ts) | Σ distributions kind = capital_return · Σ distributions kind ≠ capital_return · footer totals | T5: 618,248.52; T6: 175,741.94; T1: 857,088.44 | PASS | T5✓ T6✓ T1✓ T2✓ T3✓ T4✓ T7✓ TRE3✓ |
| 116 | Stat Net cash | `Treasury.tsx:30` | computeTreasury (treasury.ts) | totalCashIn − totalCashOut | TRE3: 1,419,503.84 | PASS | TRE3✓ |
| 117 | Stat Note sales, all | `Treasury.tsx:31` | computeTreasury (treasury.ts) | Σ note_sales.sale_price (all notes) | T9: 1,356,405.86 | PASS | T9✓ |
| 118 | Note sales hint other notes | `Treasury.tsx:31` | computeTreasury (treasury.ts) | Σ note_sales.sale_price on other notes (CLE-L01 $57,000) · footer totals | T3: 57,000; T1: 857,088.44; T2: 1,299,405.86 | PASS | T3✓ T1✓ T2✓ T4✓ T5✓ T6✓ T7✓ TRE3✓ |
| 119 | Chart Y ticks / tooltips (monthly) | `Treasury.tsx:45, :48` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 120 | Chart month labels | `Treasury.tsx:44 via label` | monthLabel (format) | treasury.months.month | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-… | PASS | TRE1✓ |
| 121 | Cumulative chart bars | `Treasury.tsx:69, :72, :76–77` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 122 | Table month | `Treasury.tsx:102` | monthLabel (format) | treasury.months.month | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-… | PASS | TRE1✓ |
| 123 | Down payments | `Treasury.tsx:103` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 124 | Note sales | `Treasury.tsx:104` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 125 | Other notes | `Treasury.tsx:105` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 126 | Cash in | `Treasury.tsx:106` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 127 | Capital returned | `Treasury.tsx:107` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 128 | Profit shared | `Treasury.tsx:108` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 129 | Cash out | `Treasury.tsx:109` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 130 | Net | `Treasury.tsx:110` | computeTreasury (treasury.ts) | totalCashIn − totalCashOut · per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE3: 1,419,503.84; TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0 | PASS | TRE3✓ TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 131 | Cumulative | `Treasury.tsx:111` | computeTreasury (treasury.ts) | per month: down payments, note sales, other notes, capital returns, profit shares, cumulative [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price; investor_distributions.amount, distribution_date, kind, investor_id, farm_acquisition_id] | TRE1: ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-…; TRE2: 0; T11: 2,213,494.3 | PASS | TRE1✓ TRE2✓ T11✓ TRE4✓ |
| 132 | Undated closings row | `Treasury.tsx:117` | computeTreasury (treasury.ts) | cash of sold lots without a close date | T11: 2,213,494.3 | PASS | T11✓ |
| 133 | Footer totals (9 money cells) | `Treasury.tsx:127–134` | computeTreasury (treasury.ts) | Σ down payments + Σ all note_sales.sale_price [file_cases.down_payment / notes.down_payment; note_sales.sale_price; deal_type cash → full price] · Σ down payments (cash deals: full price) · Σ note_sales.sale_price on subdivided-farm lots · Σ note_sales.sale_price on other notes (CLE-L01 $57,000) · Σ investor_distributions.amount · Σ distributions kind = capital_return · Σ distributions kind ≠ capital_return · totalCashIn − totalCashOut · footer totals | T4: 2,213,494.3; T10: 57,000; T11: 2,213,494.3 | PASS | T4✓ T10✓ T11✓ T1✓ T2✓ T3✓ T7✓ T8✓ T5✓ T6✓ TRE3✓ |

### Oracle — 34 figures · 26 PASS · 8 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 134 | Future card exit date | `Oracle.tsx:216` | computeFutures (futures.ts) | four futures: closings only, current pace, required pace, one more farm | FUT1: 59,000.95; FUT2: 132; FUT3: 2029-01-12 | PASS | FUT1✓ FUT2✓ FUT3✓ FUT5✓ FUT6✓ FUT9✓ FUT11✓ FUT12✓ FUT13✓ |
| 135 | before/after the {deadline} deadline | `Oracle.tsx:219` | computeFutures (futures.ts) | result.deadline = goal.deadline | FUT12: false,true,false,false; D15: 2027-12-31 | PASS | FUT12✓ D15✓ |
| 136 | {n} days earlier / later / same day | `Oracle.tsx:224` | computeFutures (futures.ts) | four futures: closings only, current pace, required pace, one more farm | FUT1: 59,000.95; FUT2: 132; FUT3: 2029-01-12 | PASS | FUT1✓ FUT2✓ FUT3✓ FUT5✓ FUT6✓ FUT9✓ FUT11✓ FUT12✓ FUT13✓ |
| 137 | Future premise (may embed pace figures) | `Oracle.tsx:230–232` | computeFutures (futures.ts) | four futures: closings only, current pace, required pace, one more farm | FUT1: 59,000.95; FUT2: 132; FUT3: 2029-01-12 | PASS | FUT1✓ FUT2✓ FUT3✓ FUT5✓ FUT6✓ FUT9✓ FUT11✓ FUT12✓ FUT13✓ |
| 138 | Reservations scheduled {n} → {closings} closings | `Oracle.tsx:239` | computeFutures (futures.ts) | four futures: closings only, current pace, required pace, one more farm | FUT1: 59,000.95; FUT2: 132; FUT3: 2029-01-12 | PASS | FUT1✓ FUT2✓ FUT3✓ FUT5✓ FUT6✓ FUT9✓ FUT11✓ FUT12✓ FUT13✓ |
| 139 | Lots / month | `Oracle.tsx:245` | Oracle page seed ← futures.current.params | reservationsPerMonth × conversion (5.32); real: trailing 90-day pace 4.73 | ORA15: 4.73; ORA1: 4.73; FUT4: 5.32 | FLAG (F9) | ORA15✗ ORA1✓ FUT4✓ |
| 140 | Farm every {n} mo | `Oracle.tsx:250` | Oracle page seed ← futures.current.params (farm cadence) | mean gap between farm dates ≥ ERA_START, future-dated farms included | ORA5: 1.26; ORA10: {"n":6,"dates":["2026-04-14","2026-04-15","2026-06-16","2026-07-31","2026-10-02","2026-… | FLAG (F3) | ORA5✓ ORA10✓ |
| 141 | Inventory today {n} lots | `Oracle.tsx:253` | computeFutures (futures.ts) | four futures: closings only, current pace, required pace, one more farm | FUT1: 59,000.95; FUT2: 132; FUT3: 2029-01-12 | PASS | FUT1✓ FUT2✓ FUT3✓ FUT5✓ FUT6✓ FUT9✓ FUT11✓ FUT12✓ FUT13✓ |
| 142 | Net at deadline | `Oracle.tsx:255` | runOracle (oracle.ts) | cumulative net after the last whole month ≤ monthsToDeadline | ORA13: 7,963,081.3 | PASS | ORA13✓ |
| 143 | Toggle With the {n} live reservations | `Oracle.tsx:118` | computeExpected (expected.ts) | reserved lots with a file_cases.reservation_date (status active/completed) | X1: 33; EXP6: 33 | PASS | X1✓ EXP6✓ |
| 144 | Stat Goal reached | `Oracle.tsx:124` | runOracle (oracle.ts) | month loop: inventory, farms every N months, scheduled reservations, steady pace after the lag | ORA11: 22\|2028-07-12 | PASS | ORA11✓ |
| 145 | Goal hint deadline + reservations | `Oracle.tsx:126–128` | buildRealm option (realm.ts) ← useHorizon; computeExpected (expected.ts) | `${horizon}-12-31` · reserved lots with a file_cases.reservation_date (status active/completed) | D15: 2027-12-31; X1: 33; EXP6: 33 | PASS | D15✓ X1✓ EXP6✓ |
| 146 | Months to goal | `Oracle.tsx:132` | runOracle (oracle.ts) | month loop: inventory, farms every N months, scheduled reservations, steady pace after the lag | ORA11: 22\|2028-07-12 | PASS | ORA11✓ |
| 147 | Hint {n} months left | `Oracle.tsx:132` | computeGoal (goal.ts) | daysToDeadline ÷ 30.4375 | G6: 15.61; W35: 15.61 | FLAG (F6) | G6✓ W35✓ |
| 148 | Net profit per lot | `Oracle.tsx:133` | runOracle (oracle.ts) | (avgSalePrice − avgLandCost) × (1 − take%) | ORA14: 132\|59000.95; FUT1: 59,000.95 | PASS | ORA14✓ FUT1✓ |
| 149 | Hint {n} lots still needed | `Oracle.tsx:133` | runOracle (oracle.ts) | ceil(remaining ÷ netProfitPerLot) | ORA14: 132\|59000.95; FUT2: 132 | PASS | ORA14✓ FUT2✓ |
| 150 | Net at deadline | `Oracle.tsx:134` | runOracle (oracle.ts) | cumulative net after the last whole month ≤ monthsToDeadline | ORA13: 7,963,081.3 | PASS | ORA13✓ |
| 151 | Hint {n} farms bought… | `Oracle.tsx:134` | runOracle (oracle.ts) | farms bought through the month the loop stops | ORA12: 18 | FLAG (F10) | ORA12✓ |
| 152 | Slider value Lots closed per month | `Oracle.tsx:145` | Oracle page seed ← futures.current.params | reservationsPerMonth × conversion (5.32); real: trailing 90-day pace 4.73 | ORA15: 4.73; ORA1: 4.73; FUT4: 5.32 | FLAG (F9) | ORA15✗ ORA1✓ FUT4✓ |
| 153 | Slider Average sale price | `Oracle.tsx:145` | Oracle page seed ← oracleDefaults (oracle.ts) | means over closed lots / farms | ORA2: 127,335; ORA3: 48,918; ORA4: 3.17 | PASS | ORA2✓ ORA3✓ ORA4✓ ORA6✓ ORA7✓ |
| 154 | Slider Average land cost per lot | `Oracle.tsx:145` | Oracle page seed ← oracleDefaults (oracle.ts) | means over closed lots / farms | ORA2: 127,335; ORA3: 48,918; ORA4: 3.17 | PASS | ORA2✓ ORA3✓ ORA4✓ ORA6✓ ORA7✓ |
| 155 | Slider Months to sell a note {v} mo | `Oracle.tsx:145` | Oracle page seed ← oracleDefaults (oracle.ts) | means over closed lots / farms | ORA2: 127,335; ORA3: 48,918; ORA4: 3.17 | PASS | ORA2✓ ORA3✓ ORA4✓ ORA6✓ ORA7✓ |
| 156 | Slider New farm every N months | `Oracle.tsx:145` | Oracle page seed ← futures.current.params (farm cadence) | mean gap between farm dates ≥ ERA_START, future-dated farms included | ORA5: 1.26; ORA10: {"n":6,"dates":["2026-04-14","2026-04-15","2026-06-16","2026-07-31","2026-10-02","2026-… | FLAG (F3) | ORA5✓ ORA10✓ |
| 157 | Cadence hint {n} funding(s), {n} earlier left out | `Oracle.tsx:76` | computeFarmCadence (oracle.ts) | mean gap between farm dates ≥ ERA_START (future-dated farms included) | ORA10: {"n":6,"dates":["2026-04-14","2026-04-15","2026-06-16","2026-07-31","2026-10-02","2026-…; ORA5: 1.26 | FLAG (F3) | ORA10✓ ORA5✓ |
| 158 | Slider Lots per new farm | `Oracle.tsx:145` | Oracle page seed ← oracleDefaults (oracle.ts) | means over closed lots / farms | ORA2: 127,335; ORA3: 48,918; ORA4: 3.17 | PASS | ORA2✓ ORA3✓ ORA4✓ ORA6✓ ORA7✓ |
| 159 | Slider Investor take (% of gross) {v}% | `Oracle.tsx:145` | Oracle page seed ← oracleDefaults (oracle.ts) | means over closed lots / farms | ORA2: 127,335; ORA3: 48,918; ORA4: 3.17 | PASS | ORA2✓ ORA3✓ ORA4✓ ORA6✓ ORA7✓ |
| 160 | Chart series cumulativeNetProfit / cumulativeCash | `Oracle.tsx:180, :187–188` | runOracle series (oracle.ts) | monthly cumulativeNetProfit / cumulativeCash, shown to max(24, monthsToGoal + 3) months | ORA11: 22\|2028-07-12; ORA13: 7,963,081.3 | PASS | ORA11✓ ORA13✓ |
| 161 | Chart X tick YYYY-MM | `Oracle.tsx:176` | Oracle chart ticks | series month labels | ORA11: 22\|2028-07-12 | PASS | ORA11✓ |
| 162 | Reference label $10M | `Oracle.tsx:183` | Oracle chart reference | GOAL_NET_PROFIT 10,000,000 | C6: 10,000,000 | PASS | C6✓ |
| 163 | Deadline reference line | `Oracle.tsx:184–185` | Oracle chart reference | first series point ≥ goal.deadline | D15: 2027-12-31; ORA11: 22\|2028-07-12 | PASS | D15✓ ORA11✓ |
| 164 | Prose Starts at {money} net and {n} lots… | `Oracle.tsx:193` | computeGoal (goal.ts); Oracle prose | Σ over sold lots of netProfit = (notes.original_amount (else file_cases.sale_price) − farm_acquisitions.investor_capital ÷ total_lots) − investorTake[farm_acquisitions.deal_type, annual_interest_rate, profit_share_pct, funding_date; property_costs.amount (basis)] · count stage reserved [file_cases.reservation_date (status active/completed), no note] · count stage available · inventory today | G1: 2,242,037.41; C5: 2,242,037.41; C2: 2,242,037.41 | PASS | G1✓ C5✓ C2✓ C3✓ G20✓ PIPE7✓ G21✓ |
| 165 | Prose reservations / conversion / lag | `Oracle.tsx:195` | computeExpected (expected.ts); computePipeline → conversion.pct (pipeline.ts); computePipeline (pipeline.ts) | reserved lots with a file_cases.reservation_date (status active/completed) · closed ÷ cohort (reservations ≥ 90 days old) · median(file_cases.closing_date ?? notes.start_date − reservation_date) over closed lots with both dates | X1: 33; EXP6: 33; X8: 75 | FLAG (F14) | X1✓ EXP6✓ X8✓ P8✓ OXY8✓ P10✓ P11✓ |
| 166 | Prose cash split {down}% … {note}% … {months} months later | `Oracle.tsx:197` | oracleDefaults (oracle.ts); Oracle page seed ← oracleDefaults (oracle.ts) | mean down ÷ price over financed sold lots; mean sale ÷ financed_amount · means over closed lots / farms | ORA8: 7.72; ORA9: 80.21; ORA2: 127,335 | PASS | ORA8✓ ORA9✓ ORA2✓ ORA3✓ ORA4✓ ORA6✓ ORA7✓ |
| 167 | runOracle lag arg | `Oracle.tsx:61` | Oracle page | round(expected.medianDaysToClose) → paceLagDays | ORA11: 22\|2028-07-12; P10: 61.5 | PASS | ORA11✓ P10✓ |

### Chronicle — 7 figures · 6 PASS · 1 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 168 | Milestone amount | `MilestoneCelebration.tsx:32 via Chronicle.tsx:64` | buildEvents (events.ts) | day the running Σ crossed each $1M | EVT7: ["1000000@2026-05-31","2000000@2026-07-17"]; C8: 2 | PASS | EVT7✓ C8✓ |
| 169 | Milestone Milestone · {date} | `MilestoneCelebration.tsx:31` | buildEvents (events.ts) | event date (closing/reservation/sale/distribution/farm) | EVT2: true; EVT4: true | PASS | EVT2✓ EVT4✓ |
| 170 | Event row date | `Chronicle.tsx:93` | buildEvents (events.ts) | event date (closing/reservation/sale/distribution/farm) | EVT2: true; EVT4: true; EVT5: (none) | FLAG (F3) | EVT2✓ EVT4✓ EVT5✗ |
| 171 | Chronicle prose (embeds per narrative.ts) | `Chronicle.tsx:98–99` | narrateAll (narrative.ts) | per event prose: price, days from reservation, oxygen days, provisional days, amounts | NAR1: 0 | PASS | NAR1✓ |
| 172 | Event amount | `Chronicle.tsx:107` | buildEvents (events.ts) | closing → lot netProfit; note_sale → sale_price; distribution → amount; farm_acquired → investor_capital | EVT6: true; EVT1: {"farm_acquired":14,"reservation":69,"cancellation":0,"closing":38,"note_sale":14,"dist… | PASS | EVT6✓ EVT1✓ |
| 173 | net to date {money} | `Chronicle.tsx:108` | buildEvents (events.ts) | running Σ of past closing amounts | EVT3: true; C1: 2,242,037.41; C2: 2,242,037.41 | PASS | EVT3✓ C1✓ C2✓ |
| 174 | Show older ({n} more) | `Chronicle.tsx:75` | Chronicle paging | events.length − limit | EVT1: {"farm_acquired":14,"reservation":69,"cancellation":0,"closing":38,"note_sale":14,"dist… | PASS | EVT1✓ |

### Chronicle · Milestone — 2 figures · 2 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 120 | Milestone · {date} | `MilestoneCelebration.tsx:31` | buildEvents (events.ts) | event date (closing/reservation/sale/distribution/farm) | EVT2: true; EVT4: true | PASS | EVT2✓ EVT4✓ |
| 121 | Amount display | `MilestoneCelebration.tsx:32` | buildEvents (events.ts) | day the running Σ crossed each $1M | EVT7: ["1000000@2026-05-31","2000000@2026-07-17"]; C8: 2 | PASS | EVT7✓ C8✓ |

### Data Quality — 15 figures · 8 PASS · 7 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 175 | Summary lots with issues | `Quality.tsx:121` | computeQualitySummary (quality.ts) | lots with ≥ 1 issue | QUA5: 14/3; QUA1: ["error:down_payment_mismatch:Eastland:Eastland — Lot 3","error:down_payment_mismatch:L… | FLAG (F2) | QUA5✓ QUA1✓ |
| 176 | and {n} farm(s) | `Quality.tsx:122` | computeQualitySummary (quality.ts) | farms with ≥ 1 issue | QUA5: 14/3 | PASS | QUA5✓ |
| 177 | Totals line under lots card | `Quality.tsx:124` | Quality page grouping | cards = lots/farms with issues; summary.issues | QUA4: 24; QUA5: 14/3 | PASS | QUA4✓ QUA5✓ |
| 178 | Profit affected dollars | `Quality.tsx:129` | computeQualitySummary (quality.ts) | Σ \|file_cases.sale_price − notes.original_amount\| over price mismatches | QUA2: 19,999.5 | PASS | QUA2✓ |
| 179 | Profit hint mismatch count | `Quality.tsx:131` | computeQualitySummary (quality.ts) | count price_mismatch issues | QUA3: 4 | PASS | QUA3✓ |
| 180 | Oldest issue days · since date | `Quality.tsx:139` | computeQualitySummary (quality.ts) | oldest issue since / days | QUA6: 2024-07-30/774 | PASS | QUA6✓ |
| 181 | Filter All {n} | `Quality.tsx:146` | computeQualitySummary (quality.ts) | issues count | QUA4: 24 | PASS | QUA4✓ |
| 182 | Filter severity counts | `Quality.tsx:150` | Quality page | issues grouped by severity | QUA1: ["error:down_payment_mismatch:Eastland:Eastland — Lot 3","error:down_payment_mismatch:L… | FLAG (F2) | QUA1✓ |
| 183 | Reviewed toggle · {n} | `Quality.tsx:155` | Quality page (localStorage reviewed set) | — — UI state, not a Payments figure | — | PASS (no arithmetic) | — |
| 184 | Visible count line | `Quality.tsx:164` | Quality page filter | visible cards / issues after filters | QUA4: 24 | PASS | QUA4✓ |
| 185 | Card {n} issues · {done} of {total} reviewed | `Quality.tsx:210` | Quality page | card.issues.length; reviewed count | QUA1: ["error:down_payment_mismatch:Eastland:Eastland — Lot 3","error:down_payment_mismatch:L… | FLAG (F2) | QUA1✓ |
| 186 | Issue since {date} | `Quality.tsx:251` | computeQuality (quality.ts) | issue.since = latest relevant date | QUA6: 2024-07-30/774; QUA1: ["error:down_payment_mismatch:Eastland:Eastland — Lot 3","error:down_payment_mismatch:L… | FLAG (F2) | QUA6✓ QUA1✓ |
| 187 | Value boxes left/right | `Quality.tsx:257–258` | computeQuality / qualityReview (quality_human.ts) | left/right values (e.g. file_cases.sale_price vs notes.original_amount) | QUA1: ["error:down_payment_mismatch:Eastland:Eastland — Lot 3","error:down_payment_mismatch:L…; QUA2: 19,999.5 | FLAG (F2) | QUA1✓ QUA2✓ |
| 188 | Issue using line (may embed money/counts) | `Quality.tsx:271` | qualityReview (quality_human.ts) | 'using' line (which value Quest uses) — quality.ts:194 compares the file case with notes[0], not pickNote — see finding F2 | QUA1: ["error:down_payment_mismatch:Eastland:Eastland — Lot 3","error:down_payment_mismatch:L… | FLAG (F2) | QUA1✓ |
| 189 | Technical details [k,v] | `Quality.tsx:321–324` | computeQuality (quality.ts) | technical details of the issue | QUA1: ["error:down_payment_mismatch:Eastland:Eastland — Lot 3","error:down_payment_mismatch:L… | FLAG (F2) | QUA1✓ |

### Trophies — 14 figures · 12 PASS · 1 FLAG · 1 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 190 | Subtitle {earned} of {total} … {e}/{t} rarity… | `TrophiesPage.tsx:22` | TrophiesPage | earned count / total 29 / by rarity | TRO1: 0; TRO2: 29 | PASS | TRO1✓ TRO2✓ |
| 191 | Streaks Current streak {n} week(s) | `StreaksPanel.tsx:55` | computeStreaks (streaks.ts) | ISO weeks / months with ≥ 1 closing (or reservation) since ERA_START [file_cases.closing_date ?? notes.start_date; file_cases.reservation_date (status active/completed)] | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK1✓ STRK4✓ |
| 192 | Streak hint days left / lit | `StreaksPanel.tsx:58` | computeStreaks (streaks.ts) | ISO weeks / months with ≥ 1 closing (or reservation) since ERA_START [file_cases.closing_date ?? notes.start_date; file_cases.reservation_date (status active/completed)] | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK1✓ STRK4✓ |
| 193 | Best streak {n} week(s) | `StreaksPanel.tsx:62` | computeStreaks (streaks.ts) | ISO weeks / months with ≥ 1 closing (or reservation) since ERA_START [file_cases.closing_date ?? notes.start_date; file_cases.reservation_date (status active/completed)] · week with most closings (ties → net) | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17}; STRK2: {"w":"2026-W22","c":7,"n":543210.09} | PASS | STRK1✓ STRK4✓ STRK2✓ |
| 194 | Best week value {count} closing(s)/reservation(s) | `StreaksPanel.tsx:65` | computeStreaks (streaks.ts) | week with most closings (ties → net) | STRK2: {"w":"2026-W22","c":7,"n":543210.09}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK2✓ STRK4✓ |
| 195 | Best week hint date · money | `StreaksPanel.tsx:66` | computeStreaks (streaks.ts) | week with most closings (ties → net) | STRK2: {"w":"2026-W22","c":7,"n":543210.09}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK2✓ STRK4✓ |
| 196 | Best month value {count} … | `StreaksPanel.tsx:72` | computeStreaks (streaks.ts) | month with most closings; pre-era months left out | STRK3: {"m":"2026-05","c":13,"n":986989.34}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK3✓ STRK4✓ |
| 197 | Best month hint month · money · best run · excluded | `StreaksPanel.tsx:75` | computeStreaks (streaks.ts) | ISO weeks / months with ≥ 1 closing (or reservation) since ERA_START [file_cases.closing_date ?? notes.start_date; file_cases.reservation_date (status active/completed)] · month with most closings; pre-era months left out | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17}; STRK3: {"m":"2026-05","c":13,"n":986989.34} | PASS | STRK1✓ STRK4✓ STRK3✓ |
| 198 | Last {n} weeks with a … | `StreaksPanel.tsx:88` | computeStreaks (streaks.ts) | last 12 weeks with activity | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK1✓ STRK4✓ |
| 199 | Week chip date + count | `StreaksPanel.tsx:92` | computeStreaks (streaks.ts) | last 12 weeks with activity | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK1✓ STRK4✓ |
| 200 | Section Earned · {n} / Still to earn · {n} | `Trophies.tsx:74, :86` | Trophies page | earned.length / locked.length | TRO1: 0; TRO2: 29 | PASS | TRO1✓ TRO2✓ |
| 201 | Progress bar % | `Trophies.tsx:55` | computeTrophies progress | per-trophy % formula | TRO11: 0; TRO12: 88.89 | FLAG (F3) | TRO11✓ TRO12✗ |
| 202 | Detail line | `Trophies.tsx:60` | computeTrophies detail | per-trophy detail string | TRO4: $4,116,355 still outstanding; TRO5: Eastland — Lot 1: $160,888; TRO6: 2026-05: 13 closings, $986,989 net | FAIL (BUG F1) | TRO4✗ TRO5✓ TRO6✓ TRO7✓ TRO8✓ TRO9✓ TRO10✓ TRO3✗ |
| 203 | Earned {date} | `Trophies.tsx:61` | computeTrophies earnedAt | date the threshold was crossed | TRO1: 0; EVT7: ["1000000@2026-05-31","2000000@2026-07-17"] | PASS | TRO1✓ EVT7✓ |

### Trophies · Streaks panel — 9 figures · 9 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 98 | Current streak N week(s) | `StreaksPanel.tsx:55` | computeStreaks (streaks.ts) | ISO weeks / months with ≥ 1 closing (or reservation) since ERA_START [file_cases.closing_date ?? notes.start_date; file_cases.reservation_date (status active/completed)] | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK1✓ STRK4✓ |
| 99 | Hint: N day(s) left this week… / lit / none | `StreaksPanel.tsx:58` | computeStreaks (streaks.ts) | ISO weeks / months with ≥ 1 closing (or reservation) since ERA_START [file_cases.closing_date ?? notes.start_date; file_cases.reservation_date (status active/completed)] | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK1✓ STRK4✓ |
| 100 | Best streak N week(s) | `StreaksPanel.tsx:62` | computeStreaks (streaks.ts) | ISO weeks / months with ≥ 1 closing (or reservation) since ERA_START [file_cases.closing_date ?? notes.start_date; file_cases.reservation_date (status active/completed)] · week with most closings (ties → net) | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17}; STRK2: {"w":"2026-W22","c":7,"n":543210.09} | PASS | STRK1✓ STRK4✓ STRK2✓ |
| 101 | Best week count N closing(s)/reservation(s) | `StreaksPanel.tsx:65` | computeStreaks (streaks.ts) | week with most closings (ties → net) | STRK2: {"w":"2026-W22","c":7,"n":543210.09}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK2✓ STRK4✓ |
| 102 | Best week hint: week of {date} · $X net[ at stake] | `StreaksPanel.tsx:66` | computeStreaks (streaks.ts) | week with most closings (ties → net) | STRK2: {"w":"2026-W22","c":7,"n":543210.09}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK2✓ STRK4✓ |
| 103 | Best month count | `StreaksPanel.tsx:72` | computeStreaks (streaks.ts) | month with most closings; pre-era months left out | STRK3: {"m":"2026-05","c":13,"n":986989.34}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK3✓ STRK4✓ |
| 104 | Best month hint: {month} · $X … · best run N months · [M earlier … left out] | `StreaksPanel.tsx:75` | computeStreaks (streaks.ts) | ISO weeks / months with ≥ 1 closing (or reservation) since ERA_START [file_cases.closing_date ?? notes.start_date; file_cases.reservation_date (status active/completed)] · month with most closings; pre-era months left out | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17}; STRK3: {"m":"2026-05","c":13,"n":986989.34} | PASS | STRK1✓ STRK4✓ STRK3✓ |
| 105 | Last N weeks with a {noun} | `StreaksPanel.tsx:87` | StreaksPanel | streaks.weeks.slice(-12).length — 15 weeks with a closing → 12 shown | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8} | PASS | STRK1✓ |
| 106 | Week chip: short date + count; title $net | `StreaksPanel.tsx:91–92` | computeStreaks (streaks.ts) | last 12 weeks with activity | STRK1: {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8}; STRK4: {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | PASS | STRK1✓ STRK4✓ |

### Since-last-visit (Celebration) — 2 figures · 2 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 122 | Headline: N things happened since your last visit | `Celebration.tsx:33,70` | Chronicle paging; sinceLastVisit (visits.ts) | events.length − limit · events dated after the stored last-visit timestamp — count of events since last visit; each amount is the event amount (EVT6) | EVT1: {"farm_acquired":14,"reservation":69,"cancellation":0,"closing":38,"note_sale":14,"dist…; EVT2: true | PASS | EVT1✓ EVT2✓ |
| 123 | Per-event {date} · $amount | `Celebration.tsx:83–84` | buildEvents (events.ts) | closing → lot netProfit; note_sale → sale_price; distribution → amount; farm_acquired → investor_capital · event date (closing/reservation/sale/distribution/farm) | EVT6: true; EVT1: {"farm_acquired":14,"reservation":69,"cancellation":0,"closing":38,"note_sale":14,"dist…; EVT2: true | PASS | EVT6✓ EVT1✓ EVT2✓ EVT4✓ |

### Nav drawer — 2 figures · 2 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 204 | Horizon year buttons 2027/2028/2029 | `NavDrawer.tsx:202` | EXIT_HORIZONS | 2027 / 2028 / 2029 — constants | D15: 2027-12-31 | PASS | D15✓ |
| 205 | Caption … Dec 31, {horizon} / 31 dic {horizon} | `NavDrawer.tsx:207–209` | useHorizon | Dec 31 of the selected horizon | D15: 2027-12-31 | PASS | D15✓ |

### Primitives — 3 figures · 3 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 125 | AnimatedCounter live text | `AnimatedCounter.tsx:62` | primitive (renders the parent's value) | — — display primitive; the value is audited at its source row | — | PASS (no arithmetic) | — |
| 126 | FitMoney full value in title/aria-label | `FitMoney.tsx:45` | primitive (renders the parent's value) | — — display primitive; the value is audited at its source row | — | PASS (no arithmetic) | — |
| 127 | Stat value/hint | `Stat.tsx:17–18` | primitive (renders the parent's value) | — — display primitive; the value is audited at its source row | — | PASS (no arithmetic) | — |

### GrowthBurst — 1 figures · 1 PASS · 0 FLAG · 0 FAIL

| # | Label as shown | File:line | Domain function | Payments fields / formula | Independent recomputation | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| 124 | — (no user-facing numeric text) | `GrowthBurst.tsx` | — | — — no numeric text | — | PASS (no arithmetic) | — |

**Total: 519 rendered figures audited** — 428 PASS, 90 FLAG, 1 FAIL.

## 6. Findings, ordered by impact

### F1 · BUG · Trophy *Debt of Honor* (`sponsor_repaid`) blends Terrafunded's own capital into a sponsor figure

`trophies.ts:185–197`. The detail reads “$4,916,355 still outstanding” using `goal.capitalOutstanding` (all farms incl. the own-capital farm Promised Valley), while `debt.ts` documents own capital as “shown separately, never blended” and every other screen shows sponsor capital owed = $4,116,355.48. The `repaid` filter and the progress “best sponsor” also admit the own-capital investor (Portafolio Diversificado), so selling out Promised Valley would award “Return all capital to a sponsor” for repaying ourselves.

**Recommended action:** Fixed in PR `cursor/fix-sponsor-repaid-own-capital-7eee`: exclude `dealType === "own_capital"` investors from `repaid` and from the progress candidate, and compute “still outstanding” over sponsor investors only (= debt.capitalOwed, $4,116,355). Regression test with an own-capital investor fully repaid and a sponsor still owed. No headline number changes; the trophy detail moves from $4,916,355 to $4,116,355.

**Who decides:** Engineering (done, awaiting review).

### F2 · BUG (latent) · Data Quality compares the file case with `notes[0]` instead of the note Quest actually uses

`quality.ts:194` `const note = notes[0]` — the price / down-payment / reservation-date / active-case checks say “Quest uses the note” but pick the first note in query order, whereas `computeLot` uses `pickNote` (sold first, newest `start_date`). On a lot with two notes the flagged mismatch (and `summary.priceMismatchDollars`) can be computed against the wrong note. No such lot exists today (every lot with a file case has exactly one note; the multi-note lots are legacy farms without file cases), so no rendered figure is currently wrong.

**Recommended action:** Fixed in PR `cursor/fix-quality-picknote-7eee`: use `pickNote(notes)`; regression test with two notes on one lot where only the non-picked note mismatches. Today's figures unchanged.

**Who decides:** Engineering (done, awaiting review).

### F3 · MODEL DECISION · Farms dated in the future count as owned, owed and funded today

Two `farm_acquisitions` rows have `closing_date` in the future and `funding_date` null: Lakeview (2026-10-22, $495,000, 12 lots) and Franklin 2 (2026-10-02, $329,400, 5 lots). `computeFarm` uses `funding_date ?? closing_date` and nothing filters on asOf, so today: debt.capitalOwed $4,116,355.48 (without them $3,291,955.48); liberation shows 9 hostages (7); War Plan/Oracle start inventory 83 lots incl. 17 not yet owned (66); farm cadence 1.26 mo over 6 fundings (1.18 over 4); *Nine Realms* trophy earned with 10 farms (8 → not earned); chronicle shows two `farm_acquired` events flagged `future`; the story card says “10 farms … 12 counties”. The chronicle marks them as future, so the code is consistent; the question is whether a signed-but-unfunded farm is “in the realm”.

**Recommended action:** Alternatives: (a) keep (today's behaviour — commitments count from signing); (b) count farms only from `funding_date ?? closing_date` ≤ asOf — capital owed −$824,400, inventory −17 lots, hostages −2, cadence 1.18, Nine Realms not yet earned, War Plan farmsToBuy unchanged (5) because the two farms land in month 1–2 either way; (c) count them but label them “pending” on the Realm map and exclude them from the trophy. Recommendation: (c). Query: `select farm_name, closing_date, funding_date, investor_capital from farm_acquisitions where coalesce(funding_date, closing_date) > current_date;`

**Who decides:** Founder (business definition). Written up as OPEN_QUESTIONS #111.

### F4 · MODEL DECISION · Average net profit per closed lot uses every sold lot, including the pre-era, cheaper Lamar/Eastland/Titus closings

$59,000.98 over 38 lots (app) vs $64,922.44 over the 30 era closings. Effect on the headline: lots still needed 132 → 120; required pace 8.46 → 7.69 lots/month; Oracle netProfitPerLot (computed from mean price − mean land cost) is $59,000.95, effectively the all-sold definition too. The Debt countdown already measures *actual* pace since the era only ($9,988.07/day), so the numerator and the denominator of “are we on pace” use different windows.

**Recommended action:** Alternatives: all-sold (current), since ERA_START, trailing 12 months (identical to all-sold until 2026-10-10), trailing 6 months (identical to since-era until 2026-09-01+). Recommendation: keep all-sold for the goal arithmetic (conservative), but show the since-era average next to it. Not changed.

**Who decides:** Founder. OPEN_QUESTIONS #112.

### F5 · MODEL DECISION · Rotation benchmark 220.5 days is a median of *projected* cycles with zero completed observations in the era

Projected cycles: Freestone 151 d, Wichita 201 d, Avery 240 d, Franklin 326 d (lots left ÷ farm pace share; Freestone's is its campaign-conquered date). Lamar, the only farm ever freed (271 d), is excluded by ERA_START. The card says “projected” in the hint and the War Plan says “median of 4 freed/projected cycles”, so the code is honest; but a benchmark with n = 0 real observations grades every farm against a forecast of itself. Capital effect: none today (recycled capital 0 either way, see S6); turnsIncomplete 3 of 5 at 7.24 mo vs 4 at 8.9 mo (Lamar).

**Recommended action:** Alternatives: (a) keep projected median; (b) use Lamar 271 d as the only real cycle (era rule relaxed for the benchmark); (c) show “no completed cycle since the era” and grade against Lamar with an explicit ‘pre-era’ tag. Recommendation: (c). Not changed.

**Who decides:** Founder. OPEN_QUESTIONS #113.

### F6 · MODEL DECISION · Three “required pace” figures and two “months to deadline” figures coexist

Throne Room / Pulse charts: 8.46 lots/month = 132 ÷ 15.61 (days ÷ 30.4375). Oracle *required pace* future: 8.8 = 132 ÷ 15 whole months. War Plan: 8.47 lots/month from a bisection on the calendar-month grid (15.6 months, reaching exactly $10,000,559 at the deadline month end). Each is correct for its own time grid; a reader sees 8.46, 8.8 and 8.47 on three screens.

**Recommended action:** Alternatives: unify on the calendar grid (War Plan) or on days ÷ 30.4375 (goal). Recommendation: keep, but add a one-line footnote on the Oracle and War Plan explaining the grid. Not changed.

**Who decides:** Founder / product. OPEN_QUESTIONS #114.

### F7 · MODEL DECISION · A campaign is “conquered” when Σ sale price of sold lots ≥ capital + interest, even though most of that price is still paper (notes)

`campaigns.ts` documents recovered = “Σ salePrice on closed / note_sold lots”. Eastland: recovered $1,097,950.80 vs target $683,572.60 → conquered, yet capital outstanding is **$565,000** (0 % returned) and cash recovered only $517,001.54. Freestone: conquered with $373,520 outstanding. Lamar is the only conquered farm whose capital is actually back.

**Recommended action:** Alternatives: (a) keep (contract value — the farm has *sold* enough); (b) recovered = cash realized (down payments + note sales) → Eastland 75.6 %, Freestone 63.5 %, Wichita 11.5 % covered; (c) two bars: sold vs cashed. Recommendation: (c). Not changed.

**Who decides:** Founder. OPEN_QUESTIONS #115.

### F8 · MODEL DECISION · Fixed-interest farms: interest is accrued on the whole farm but only the sold lots' share is counted as investor take

`computeLot` spreads accrued interest evenly over the farm's lots and `computeGoal/Farm` count the take on sold lots only. Accrued vs counted today: Eastland $118,572.60 vs $97,013.97; Titus $64,425.19 vs $21,475.06; Freestone $30,904.94 vs $30,904.93; Avery $25,234.45 vs $0.00; Franklin $11,511.66 vs $0.00. The unsold lots' share ($101,254.88) is a real liability (it is in `ledger.owedToday` via unpaidTake) but not in netProfitToDate or investorTakeToDate.

**Recommended action:** Alternatives: (a) keep (take follows the lot when it sells); (b) count all accrued interest against net profit now (netProfitToDate −$100,000 approx, pctComplete −1 pt); (c) keep but show “interest accruing on unsold lots” on the farm sheet. Recommendation: (c). Not changed.

**Who decides:** Founder / accounting. OPEN_QUESTIONS #116.

### F9 · FLAG · Oracle sliders are seeded from the *current-pace* future (5.32 lots/month) while the row shows “Trailing 90-day pace · real: 4.73”

`Oracle.tsx:53` seeds `params` from `futures.current.params` (reservations 7.1/mo × 75 % = 5.32) since the futures feature; the hint and the `real:` figure describe `oracleDefaults.lotsPerMonth` (4.73). Both values are correct; the page does not say why the slider starts above “real”.

**Recommended action:** Recommendation: add “seeded from the current-pace future” to the hint or seed from `oracleDefaults`. Not changed (judgement call).

**Who decides:** Product. OPEN_QUESTIONS #117.

### F10 · FLAG · Oracle “18 farms bought along the way” counts purchases through the month the simulation stops, not through the goal or the deadline

`runOracle` runs to max(floor(monthsToDeadline)+2, monthsToGoal+1) = month 23 and reports farms bought so far (18). By the goal month (22) it would be 17; by the deadline (15 months) 12. The figure sits under “Net at deadline”.

**Recommended action:** Recommendation: count farms bought through the goal month (or the deadline, matching the tile). Not changed (definition to be chosen).

**Who decides:** Product. OPEN_QUESTIONS #118.

### F11 · FLAG · Trophy *War Chest* (`cash_1m`) says “cash realized” but uses treasury cash in, which includes the $57,000 CLE-L01 note sale

$2,213,494.30 vs goal.cashRealized $2,156,494.30; both exceed $1,000,000, so earned/earnedAt are unaffected today. The description's parenthesis “(down payments + note sales)” matches the treasury definition.

**Recommended action:** Recommendation: none required; if “cash realized” is meant, use goal.cashRealized. Not changed.

**Who decides:** Product.

### F12 · MODEL DECISION · Oxygen days for a past closing are computed with that day's ledger but today's per-lot net values

`computeOxygen` replays each closing at its date (lots needed and pace as of that day) but uses the lot's current netProfit, so a later price correction in Payments rewrites the oxygen of an old closing. Deterministic and documented in the code; noted for completeness.

**Recommended action:** No action recommended.

**Who decides:** —

### F13 · FLAG · Exodus reconciliation shows a `replayDrift` line; War Plan and Exodus rows are rounded after unrounded cumulatives

The bridge's drift ($0.00 at 2027; up to ~$430 in other horizons) equals the accumulated half-cent / 0.005-lot display rounding of the monthly rows and is disclosed as such. Every running sum was re-verified within exactly that slack.

**Recommended action:** No action; the disclosure is correct.

**Who decides:** —

### F14 · DATA ISSUE / OPEN QUESTION · No cancelled file case is visible to the viewer role

71 `file_cases` rows, statuses `completed` and `active` only. Every cancellation figure (rate 0.0 %, conversion incl. cancellations 75.0 %, cancelled reservations 0, cancellation chronicle events 0, reservation streaks) is therefore computed over a set that may be filtered by RLS rather than empty. Query to run as an admin: `select status, count(*) from file_cases group by status;` — if it returns `cancelled` rows the viewer policy needs to expose them read-only.

**Recommended action:** Do not patch in the app. Confirm with the Payments admin.

**Who decides:** Payments admin. OPEN_QUESTIONS #119.

### F15 · DATA ISSUE · `note_sales.discount_from_upb` = −0.99 on TIT-L01

Sale 2026-05-06 for $136,990 on a UPB of $135,646.93 (sold above par). The Exodus `noteSaleRatio` treats `discount_from_upb` as a percent when |value| < 100; −0.99 % is consistent with the prices, so the combined ratio (0.8092) is unaffected, but a negative discount is unexpected. Query: `select id, note_id, sale_price, discount_from_upb from note_sales where discount_from_upb < 0;`

**Recommended action:** Confirm the sign convention with whoever entered it.

**Who decides:** Payments admin.

### F16 · DATA ISSUE · `property_costs` exceed `investor_capital` on Lamar (+$9,000) and Wichita (+$20,000)

Lamar costs $484,000 vs capital $475,000; Wichita $1,217,000 vs $1,197,000. The app uses `investor_capital` as the capital basis (documented) and land cost per lot from that basis, so the extra costs are not in any figure. The gap is recent: the pinned fixture (2026-09-11 21:31 UTC) still had `investor_capital` **equal** to the costs on both farms (484,000 / 1,217,000) and the live page read capital owed $4,145,355.48 (OPEN_QUESTIONS #105); by the 2026-09-12 04:30 UTC snapshot both rows had been reduced by exactly the $9,000 / $20,000, moving capital owed to $4,116,355.48 and raising gross on those farms by the same $29,000 (Lamar +$1,000 per lot, Wichita +$625 per lot). `farm_acquisitions` has no `updated_at`, so who changed it and why is not visible to Quest. Query: `select fa.farm_name, fa.investor_capital, sum(pc.amount) from farm_acquisitions fa join property_costs pc on pc.farm_acquisition_id = fa.id group by 1,2 having sum(pc.amount) <> fa.investor_capital;`

**Recommended action:** Confirm with the Payments admin that the 2026-09-11/12 reduction of `investor_capital` was intentional (closing costs out of the capital basis) — if it was, `property_costs` is now the only place those $29,000 live, and the app's basis is right; if it was not, capital owed is understated by $29,000 and gross overstated by the same.

**Who decides:** Founder / accounting. OPEN_QUESTIONS #120.

### F17 · DATA ISSUE · Price / down-payment mismatches between `file_cases` and `notes` on 4 lots ($19,999.50)

Eastland Lot 3 and Lamar Lots 5–7: `file_cases.sale_price` ≠ `notes.original_amount` (Σ |Δ| = $19,999.50) plus down-payment mismatches; Quest uses the note, the Data Quality page lists them. Also: `farm_capital_null` on Ben White and Sharps Rd (legacy farms, excluded from every figure), multiple notes on legacy lots. Query: `select fc.property_id, fc.sale_price, n.original_amount from file_cases fc join notes n on n.property_id = fc.property_id where fc.status <> 'cancelled' and abs(fc.sale_price - n.original_amount) > 0.005;`

**Recommended action:** Fix in Payments, not in the app.

**Who decides:** Payments admin.

### F18 · FLAG · `WARPLAN_INVESTOR_PREFILL` hard-codes sponsor rates and capital for the War Plan mix

Rony Schumann prefilled at 18 % while `farm_acquisitions.annual_interest_rate` is 20 %; the page labels the mix as editable prefill, and no realm figure depends on it (only the planned-funding split). Documented in the page.

**Recommended action:** Consider deriving the prefill from the sponsors' latest deal terms.

**Who decides:** Product.

### F19 · MODEL DECISION · Oxygen re-scores earlier lots when a closing is entered out of order (backdated or same-day)

`oxygen.ts:13–20` defines the pace on a closing's day as measured on “closings dated on or before it” and then says the score “is fixed at the closing date, so the chronicle line never changes later”. Both are true only when closings are entered in date order: the ledger of day D is built from *every* row dated ≤ D, including rows created later, so a backdated closing changes the pace of every later-dated lot and a second closing on the same day changes the first one's score. Evidence (`audit_properties.test.ts`, “F19 evidence”): three closings scoring [90, 48, 14] = 152 days become [90, 17, 16, 7] = 130 when a $300,000 closing dated between them is added; a $100,000 closing alone scores 90 days, with a $10,000 closing on the same day it scores 81 (81 + 8 = 89). Corollaries: any lone closing scores 90 days regardless of size (365.25 ÷ (0.34 × 12) = 89.5, because one closing in the window is 0.34 lots/month); the invariant “adding a closing never decreases oxygen” holds only for closings dated after every existing one, and the property test is scoped that way. Live: 18 of the 37 closings with a file case were entered after a later-dated closing already existed (the 2026-04-15 initial load and the 2026-09-05..08 back-entry of 2025 Lamar/Eastland closings), and 21 closings share a close date with another. Today's headline 533 days is deterministic from the rows and the independent replay reproduces it (O2), so no rendered figure is wrong — but a past chronicle line can move when Payments back-fills history. Related: F12 (today's net values).

**Recommended action:** Alternatives: (a) keep — the score is a pure function of the rows and anyone can reproduce it; (b) freeze each lot's score at first computation — needs a write store Quest does not have and breaks reproducibility; (c) measure the day's pace on rows by `created_at` order — not reproducible after a re-import and `file_cases.created_at` already reflects two bulk loads. Recommendation: (a) and amend the doc comment to say the score is fixed *given the rows*, not fixed in time. Not changed.

**Who decides:** Product (definition); engineering for the comment. OPEN_QUESTIONS #123.

## 7. Sensitivity

| Change | Effect |
|---|---|
| War Plan cycle 4.24 | capitalToRaise $2,332,150, farms 5, pace 8.47, turnsIncomplete 0, recycled $0 |
| War Plan cycle 7.24 | capitalToRaise $2,332,150, farms 5, pace 8.47, turnsIncomplete 3, recycled $0 |
| War Plan cycle 10.24 | capitalToRaise $2,332,150, farms 5, pace 8.47, turnsIncomplete 5, recycled $0 |
| War Plan cycle null (no rotation) | capitalToRaise $2,332,150, farms 5, pace 8.47, turnsIncomplete —, recycled $0 |
| War Plan benchmark all farms (Lamar included) | capitalToRaise $2,332,150, farms 5, cycle 271 d / 8.9 mo (Lamar:271d), recycled $0 |
| Horizon 2028-12-31 | daysToDeadline 841, required 4.78 lots/month, required per day $9,224.69; War Plan pace 4.47, farms 5, capitalToRaise $1,865,720 |
| Horizon 2029-12-31 | daysToDeadline 1206, required 3.33 lots/month, required per day $6,432.80; War Plan pace 3.04, farms 4, capitalToRaise $932,860 |

## 8. Test coverage added with this audit

See `src/domain/__tests__/audit_coverage.test.ts` (every exported domain function with hand-computed expectations and the listed edge cases: zero closings, single closing, null netProfit, reservation without reservationDate, farm without funding date, asOf before the first event, asOf after the deadline, horizon in the past) and `src/domain/__tests__/audit_properties.test.ts` (property tests over 200 seeded random ledgers: a longer horizon never increases `requiredLotsPerMonth` (goal and Oracle required-pace future); adding a closing never decreases `netProfitToDate`; adding a closing dated after every existing one never decreases oxygen or any existing lot's score — the unrestricted statement is false, see F19, and the two counter-examples are pinned as tests). Every exported function in `src/domain` is now exercised by at least one test; `npm test` runs 23 files / 468 tests.

## 9. Appendix — all checks (asOf 2026-09-12, deadline 2027-12-31)

| Id | Check | App | Independent | Result |
|---|---|---|---|---|
| G1 | goal.netProfitToDate | 2,242,037.41 | 2,242,037.41 | pass |
| G2 | goal.remaining | 7,757,962.59 | 7,757,962.59 | pass |
| G3 | goal.avgNetProfitPerClosedLot | 59,000.98 | 59,000.98 | pass |
| G4 | goal.lotsStillNeeded | 132 | 132 | pass |
| G5 | goal.daysToDeadline | 475 | 475 | pass |
| G6 | goal.monthsToDeadline | 15.61 | 15.61 | pass |
| G7 | goal.requiredLotsPerMonthToHitDeadline | 8.46 | 8.46 | pass |
| G8 | goal.closedLotsTrailing | 14 | 14 | pass |
| G9 | goal.closedLotsPerMonth | 4.73 | 4.73 | pass |
| G10 | goal.monthsAtCurrentPace | 27.91 | 27.91 | pass |
| G11 | goal.cashRealized | 2,156,494.3 | 2,156,494.3 | pass |
| G12 | goal.grossProfitToDate | 2,979,828.41 | 2,979,828.41 | pass |
| G13 | goal.investorTakeToDate | 737,791 | 737,791 | pass |
| G14 | goal.revenueToDate | 4,838,711.8 | 4,838,711.8 | pass |
| G15 | goal.netProfitInPipeline | 2,201,334.57 | 2,201,334.57 | pass |
| G16 | goal.pctComplete | 22.42 | 22.42 | pass |
| G17 | goal.capitalOutstanding (all subdivided farms incl. own capital) | 4,916,355.48 | 4,916,355.48 | pass |
| G18 | goal.profitOnPaper | 85,543.11 | 85,543.11 | pass |
| G19 | goal.closedLots | 38 | 38 | pass |
| G20 | goal.reservedLots | 33 | 33 | pass |
| G21 | goal.availableLots | 50 | 50 | pass |
| G22 | goal.noteSoldLots | 14 | 14 | pass |
| G23 | goal.inventoryGap | 82 | 82 | pass |
| G24 | goal.farmsStillNeeded | 7 | 7 | pass |
| G25 | goal.avgLotsPerFarm | 12.1 | 12.1 | pass |
| G26 | goal.trailingDays | 90 | 90 | pass |
| G27 | goal.trailingSince | 2026-06-15 | 2026-06-15 | pass |
| D1 | debt.capitalOwed | 4,116,355.48 | 4,116,355.48 | pass |
| D2 | debt.ownCapitalOutstanding | 800,000 | 800,000 | pass |
| D3 | debt.daysLeft | 475 | 475 | pass |
| D4 | debt.requiredNetProfitPerDay | 16,332.55 | 16,332.55 | pass |
| D5 | debt.actualNetProfitPerDay | 9,988.07 | 9,988.07 | pass |
| D6 | debt.actualNetProfit | 1,947,673.19 | 1,947,673.19 | pass |
| D7 | debt.actualDays | 195 | 195 | pass |
| D8 | debt.interestPerDay | 1,279.96 | 1,279.96 | pass |
| D9 | debt.firstCloseDate | 2025-10-10 | 2025-10-10 | pass |
| D10 | debt.requiredNetProfitPerDay × daysLeft ≈ remaining (residual ≤ daysLeft × $0.005) | 7,757,961.25 | 7,757,962.59 | pass |
| O1 | oxygen.totalDaysGained | 533 | 533 | pass |
| O2 | oxygen Σ ranked daysGained == totalDaysGained | 533 | 533 | pass |
| O3 | oxygen.netProfitPerDayAtPace | 9,168.78 | 9,168.78 | pass |
| O4 | oxygen.provisional never in confirmed set | 0 | 0 | pass |
| O5 | oxygen per-lot daysGained all equal | 0 | 0 | pass |
| P1 | pipeline.stuckCount | 16 | 16 | pass |
| P2 | pipeline.salePriceTrapped | 2,024,531 | 2,024,531 | pass |
| P3 | pipeline.netProfitTrapped | 1,103,911.15 | 1,103,911.15 | pass |
| P4 | pipeline.conversion.cohort | 48 | 48 | pass |
| P5 | pipeline.conversion.closed | 36 | 36 | pass |
| P6 | pipeline.conversion.stillReserved | 12 | 12 | pass |
| P7 | pipeline.conversion.cancelled | 0 | 0 | pass |
| P8 | pipeline.conversion.pct | 75 | 75 | pass |
| P9 | pipeline.conversion.pctWithCancellations | 75 | 75 | pass |
| P10 | pipeline.medianDaysToClose | 61.5 | 61.5 | pass |
| P11 | pipeline.closedWithBothDates | 36 | 36 | pass |
| P12 | pipeline.newReservationsTrailing | 21 | 21 | pass |
| P13 | pipeline.reservationsPerMonth | 7.1 | 7.1 | pass |
| P14 | pipeline.pipelineNetProfit == goal.netProfitInPipeline | 2,201,334.57 | 2,201,334.57 | pass |
| P15 | pipeline.cancelledReservations | 0 | 0 | pass |
| X1 | expected.liveReservations | 33 | 33 | pass |
| X2 | expected.committedNetProfit | 1,651,000.97 | 1,651,000.97 | pass |
| X3 | expected.overdueCount | 16 | 16 | pass |
| X4 | expected.overdueNetProfit | 827,933.39 | 827,933.39 | pass |
| X5 | expected.nextMonth.expectedReservations | 6 | 6 | pass |
| X6 | expected.nextMonth.expectedClosings | 4.5 | 4.5 | pass |
| X7 | expected.requiredReservationsPerMonth | 11.28 | 11.28 | pass |
| X8 | expected.conversionPct | 75 | 75 | pass |
| X9 | expected.netProfitAtStake == pipeline.pipelineNetProfit | 2,201,334.57 | 2,201,334.57 | pass |
| X10 | expected.closingsPerMonth == goal.closedLotsPerMonth | 4.73 | 4.73 | pass |
| T1 | treasury.totalDownPayments (incl. undated) | 857,088.44 | 857,088.44 | pass |
| T2 | treasury.totalNoteSales (lots) | 1,299,405.86 | 1,299,405.86 | pass |
| T3 | treasury.totalOtherNoteSales | 57,000 | 57,000 | pass |
| T4 | treasury.totalCashIn | 2,213,494.3 | 2,213,494.3 | pass |
| T5 | treasury.totalCapitalReturns | 618,248.52 | 618,248.52 | pass |
| T6 | treasury.totalProfitShares | 175,741.94 | 175,741.94 | pass |
| T7 | treasury.totalCashOut | 793,990.46 | 793,990.46 | pass |
| T8 | treasury.totalCashOut == Σ investor_distributions.amount | 793,990.46 | 793,990.46 | pass |
| T9 | treasury.totalAllNoteSales == Σ note_sales.sale_price | 1,356,405.86 | 1,356,405.86 | pass |
| T10 | treasury.totalCashIn − goal.cashRealized == otherNoteSales | 57,000 | 57,000 | pass |
| T11 | Σ months cashIn == totalCashIn − undated | 2,213,494.3 | 2,213,494.3 | pass |
| L1 | liberation.hostages | 9 | 9 | pass |
| L2 | liberation.freedHostages | 1 | 1 | pass |
| L3 | liberation.totalCapital | 4,734,604 | 4,734,604 | pass |
| L4 | liberation.totalReturned | 618,248.52 | 618,248.52 | pass |
| R1 | rotation.cycleDays (era-scoped median) | 220.5 | null | report-only |
| R2 | rotation.cycles count | 4 | 0 | report-only |
| R3 | rotation.excludedCycles count | 1 | 1 | pass |
| R4 | rotation.capitalOutstanding (captive hostages) | 4,116,355.48 | 4,116,355.48 | pass |
| R5 | rotation.capitalOutstanding == debt.capitalOwed | 4,116,355.48 | 4,116,355.48 | pass |
| C1 | chronicle last cumulativeNetProfit == Σ dated closings ≤ asOf | 2,242,037.41 | 2,242,037.41 | pass |
| C2 | chronicle last cumulative == goal.netProfitToDate | 2,242,037.41 | 2,242,037.41 | pass |
| C3 | Σ history.netProfit == goal.netProfitToDate | 2,242,037.41 | 2,242,037.41 | pass |
| C4 | Σ history.netProfit == independent monthly Σ | 2,242,037.41 | 2,242,037.41 | pass |
| C5 | Σ per-lot netProfit over sold == goal.netProfitToDate | 2,242,037.41 | 2,242,037.41 | pass |
| C6 | goal.remaining + netProfitToDate == 10,000,000 | 10,000,000 | 10,000,000 | pass |
| C7 | lotsStillNeeded × avg − remaining (residual, report only) | 30,166.77 | 0 | pass |
| C8 | milestones count == floor(netProfitToDate / 1M) | 2 | 2 | pass |
| W1 | warPlan.ledger.capitalOwed == debt.capitalOwed | 4,116,355.48 | 4,116,355.48 | pass |
| W2 | warPlan.ledger.paidOut == Σ investor_distributions (via investors) | 793,990.46 | 793,990.46 | pass |
| W3 | warPlan.ledger.paidOut == Σ all investor_distributions | 793,990.46 | 793,990.46 | pass |
| W4 | warPlan.ledger.cashKept == goal.cashRealized − paidOut | 1,362,503.84 | 1,362,503.84 | pass |
| W5 | warPlan.ledger.owedToday == capitalOwed + unpaidTake | 4,779,659.42 | 4,779,659.42 | pass |
| W6 | required.reservationsPerMonth == pace ÷ conversion | 11.29 | 11.29 | pass |
| W7 | required.adSpendPerMonth == reservations × adSpendPerClosing | 28,233.33 | 28,233.33 | pass |
| W8 | required.capitalToRaise == Σ(cost − recycled) over schedule | 2,332,150 | 2,332,150 | pass |
| W9 | required.totalDeployed == Σ cost | 2,332,150 | 2,332,150 | pass |
| W10 | required.capitalToRaise == Σ funding.amount + unfunded | 2,332,150 | 2,332,150 | pass |
| W11 | inputs.farmCost == round(defaultLandCostPerLot × lotsPerFarm) | 466,430 | 466,430 | pass |
| W12 | required.targetAtDeadline ≥ goal when feasible | true | true | pass |
| W13 | recycled capital only from farms whose turn completed (purchase + cycleMonths ≤ this purchase) | true | true | pass |
| LOT0 | lots: same property set | true | true | pass |
| LOT1 | per-lot fields (stage, price, land, gross, take, net, cash, dates, buyer, daysInPipeline) | 0 | 0 | pass |
| LOT2 | Σ lot.landCost per farm == capital basis (rounding only, ≤ $0.005 × lots) | true | true | pass |
| LOT3 | fixed-interest farms: Σ lot.investorTake over all lots == interest accrued (± $0.005 × lots) | true | true | pass |
| FARM0 | farms: same set of subdivided farms | true | true | pass |
| FARM1 | per-farm fields (capital, land/lot, revenue, gross, take, net, cash, returns, interest, months, stages) | 0 | 0 | pass |
| FARM2 | farms sorted by funding date (else closing date) | true | true | pass |
| FARM3 | debt.capitalOwed without farms dated after asOf (report only) | 4,116,355.48 | 3,291,955.48 | pass |
| INV1 | per-investor fields (deployed, returned, outstanding, accrued, paid, PS earned/paid, paid out) | 0 | 0 | pass |
| INV2 | investors sorted by capitalDeployed desc | true | true | pass |
| INV3 | Σ investors.capitalOutstanding == goal.capitalOutstanding (all farms have an investor) | 4,916,355.48 | 4,916,355.48 | pass |
| CAMP1 | per-farm campaign fields (state machine, target, recovered, pct, lots left/short, dates, accruing) | 0 | 0 | pass |
| CAMP2 | campaigns 'conquered' while capital still outstanding (report only) | Lamar: recovered(sale price) $979717 vs cash $819330.86, outstanding $5.820766091346741… | (none) | report-only — recovered is Σ sale price (notes included), not cash — a farm can be 'conquered' with its capital 100% outstanding |
| PIPE1 | pipeline per-farm (median, n, reserved, stuck, trapped) | 0 | 0 | pass |
| PIPE2 | stuck rows (daysWaiting, atStake, salePrice, est. date) and ordering by daysWaiting desc | true | true | pass |
| PIPE3 | pipeline.conversion.cutoff == asOf − 90 days | 2026-06-14 | 2026-06-14 | pass |
| PIPE4 | pipeline.conversion.cancellationRatePct | 0 | 0 | pass |
| PIPE5 | pipeline.reservationsMadeTrailing (non-available lots reserved in window) | 21 | 21 | pass |
| PIPE6 | pipeline.reservationsMadePerMonth | 7.1 | 7.1 | pass |
| PIPE7 | pipeline.reserved == goal.reservedLots | 33 | 33 | pass |
| PIPE8 | pipeline.closedLotsPerMonth == goal.closedLotsPerMonth | 4.73 | 4.73 | pass |
| PIPE9 | pipeline.trailingSince/trailingDays == goal's | 2026-06-15/90 | 2026-06-15/90 | pass |
| EXP1 | expected per-lot fields (expected date, days, median source, overdue, at stake, expected net) | 0 | 0 | pass |
| EXP2 | expected.expectedByMonth (count, Σ expected net, Σ at stake, count×conv, past flag) | true | true | pass |
| EXP3 | expected.landsBy == latest expected month | 2026-12 | 2026-12 | pass |
| EXP4 | expected.peakMonth == month ≥ this month with max Σ expected net | 2026-11 | 2026-11 | pass |
| EXP5 | expected.undatedCount (live reservations with no expected date) | 0 | 0 | pass |
| EXP6 | expected.liveReservations vs goal.reservedLots (reserved lots without a reservation date are not 'live') | 33 | 33 | pass |
| EXP7 | expected.reservationsTrailing (made: live + closed since + cancelled) | 21 | 21 | pass |
| EXP8 | expected.reservationsPerMonth | 7.1 | 7.1 | pass |
| EXP9 | expected.closingsTrailing == goal.closedLotsTrailing | 14 | 14 | pass |
| EXP10 | expected.thisMonth activity | {"r":7,"c":0,"er":3,"ec":2.25,"en":205688.19} | {"r":7,"c":0,"er":3,"ec":2.25,"en":205688.19} | pass |
| EXP11 | expected.nextMonth activity | {"r":0,"c":0,"er":6,"ec":4.5,"en":309724.44} | {"r":0,"c":0,"er":6,"ec":4.5,"en":309724.44} | pass |
| EXP12 | expected.lots sorted by expected date, then reservation date | true | true | pass |
| OXY1 | oxygen provisional per-lot (measuredOn, pace that day, daysIfClosed, provisionalDays = round(days × conv)) | 0 | 0 | pass |
| OXY2 | oxygen.provisionalDaysGained == Σ provisional | 339 | 339 | pass |
| OXY3 | oxygen.provisional count == reserved lots with a reservation date | 33 | 33 | pass |
| OXY4 | oxygen.trailingDaysGained == Σ days over closings dated > asOf − 90 (nominal window) | 53 | 53 | pass |
| OXY5 | oxygen.best == max daysGained (ties: latest close) | d2ff8a97-5a53-43f7-98ee-c3ad02f81195 | d2ff8a97-5a53-43f7-98ee-c3ad02f81195 | pass |
| OXY6 | oxygen.latest == most recent dated closing | e3a45e57-b3b3-4ab6-88f5-7008f94a4b42 | e3a45e57-b3b3-4ab6-88f5-7008f94a4b42 | pass |
| OXY7 | oxygen per-lot projectedBefore/After (that day's ledger, addMonths(day, lotsNeeded ÷ pace)) | 0 | 0 | pass |
| OXY8 | oxygen.conversionPct == expected.conversionPct | 75 | 75 | pass |
| OXY9 | oxygen.ranked sorted by daysGained desc | true | true | pass |
| G28 | goal.projectedDate == addMonths(asOf, monthsAtCurrentPace) | 2029-01-09 | 2029-01-09 | pass |
| G29 | goal.onTrack == projectedDate ≤ deadline | false | false | pass |
| G30 | goal.trailingEraClipped | false | false | pass |
| G31 | goal.verdict names the required and current pace | You need 8.46 lots/month; you are doing 4.73. | You need 8.46 lots/month; you are doing 4.73. | pass |
| D11 | debt.openPositions == non-own farms with outstanding > $0.005 (Lamar's raw residual is 5.8e-11) | 8 | 8 | pass |
| D12 | debt.actualNetProfitPerDayAllTime == netProfitToDate ÷ days since first closing | 6,652.93 | 6,652.93 | pass |
| D13 | debt.actualEraClipped == first closing before era | true | true | pass |
| D14 | debt.remainingNetProfit == goal.remaining | 7,757,962.59 | 7,757,962.59 | pass |
| D15 | debt.deadline == goal.deadline | 2027-12-31 | 2027-12-31 | pass |
| TRE1 | treasury.months keys == months with any cash movement | ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-… | ["2025-10","2025-11","2025-12","2026-01","2026-04","2026-05","2026-06","2026-07","2026-… | pass |
| TRE2 | treasury per-month fields and cumulative sums | 0 | 0 | pass |
| TRE3 | treasury.net == totalCashIn − totalCashOut | 1,419,503.84 | 1,419,503.84 | pass |
| TRE4 | treasury has no asOf bound: months after asOf (report only) | (none) | (none) | pass |
| HIST1 | history months: first month with a reservation/closing through asOf month (≤ 24) | ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-… | ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-… | pass |
| HIST2 | history per-month reservations/closings/netProfit/beforeEra/partial | 0 | 0 | pass |
| STRK1 | streaks (closings): currentWeeks/bestWeeks/currentMonths/bestMonths/closedThisWeek/daysToKeepStreak | {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8} | {"cw":0,"bw":3,"cm":5,"bm":5,"tw":false,"dk":1,"end":"2026-07-19","ex":8,"w":15,"m":8} | pass |
| STRK2 | streaks.bestWeek (era-scoped, most closings, then net) | {"w":"2026-W22","c":7,"n":543210.09} | {"w":"2026-W22","c":7,"n":543210.09} | pass |
| STRK3 | streaks.bestMonth (era-scoped) | {"m":"2026-05","c":13,"n":986989.34} | {"m":"2026-05","c":13,"n":986989.34} | pass |
| STRK4 | reservationStreaks (made incl. cancelled): current/best weeks & months, bestWeek, bestMonth | {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | {"cw":3,"bw":6,"cm":8,"bm":8,"bwk":"2026-W22","bwc":7,"bmm":"2026-05","bmc":17} | pass |
| EVT1 | events count by kind (farm_acquired counts every farm incl. legacy) | {"farm_acquired":14,"reservation":69,"cancellation":0,"closing":38,"note_sale":14,"dist… | {"farm_acquired":14,"reservation":69,"cancellation":0,"closing":38,"note_sale":14,"dist… | pass |
| EVT2 | events sorted by date ascending | true | true | pass |
| EVT3 | events.cumulativeNetProfit is the running Σ of past closing amounts | true | true | pass |
| EVT4 | events.future == date > asOf | true | true | pass |
| EVT5 | future events (report only) | farm_acquired:Franklin 2 joins the realm:2026-10-02; farm_acquired:Lakeview joins the r… | (none) | report-only — future-dated rows shown in the chronicle as upcoming |
| EVT6 | closing event amount == lot netProfit | true | true | pass |
| EVT7 | milestone dates == day the running Σ crossed each $1M | ["1000000@2026-05-31","2000000@2026-07-17"] | ["1000000@2026-05-31","2000000@2026-07-17"] | pass |
| TRO1 | trophies earned flags (29) from raw-derived values | 0 | 0 | pass |
| TRO2 | trophies count | 29 | 29 | pass |
| TRO3 | nine_realms counts farms funded on or before asOf (report only) | 10 farms | 8 farms | report-only — app counts 10 farms incl. 2 dated after asOf |
| TRO4 | sponsor_repaid detail 'still outstanding' == sponsor capital owed (debt.capitalOwed) | $4,916,355 still outstanding | $4,116,355 still outstanding | FAIL — app uses goal.capitalOutstanding which includes Terrafunded's own $800,000 |
| TRO5 | golden_lot detail names the best lot and its net | Eastland — Lot 1: $160,888 | Eastland — Lot 1: $160,888 | pass |
| TRO6 | best_month_5 detail | 2026-05: 13 closings, $986,989 net | 2026-05: 13 closings, $986,989 net | pass |
| TRO7 | cash_1m detail uses treasury.totalCashIn (incl. non-farm note sales), description says 'cash realized' | $2,213,494 / $1,000,000 | $2,213,494 / $1,000,000 | pass |
| TRO8 | fifty_lots / hundred_lots / ten_notes details | 38 / 50\|38 / 100\|14 / 10 | 38 / 50\|38 / 100\|14 / 10 | pass |
| TRO9 | pace_keeper detail | 4.73 / 8.46 lots per month | 4.73 / 8.46 lots per month | pass |
| TRO10 | swift_sword detail == fastest reservation→close | Eastland — Lot 8: 0 days | Eastland — Lot 8: 0 days | pass |
| QUA1 | quality issues: same multiset of severity:kind:farm:lot (independent uses the effective note) | ["error:down_payment_mismatch:Eastland:Eastland — Lot 3","error:down_payment_mismatch:L… | ["error:down_payment_mismatch:Eastland:Eastland — Lot 3","error:down_payment_mismatch:L… | pass |
| QUA2 | quality summary.priceMismatchDollars == Σ \|file case price − note price\| | 19,999.5 | 19,999.5 | pass |
| QUA3 | quality summary.priceMismatches | 4 | 4 | pass |
| QUA4 | quality summary.issues == quality.length | 24 | 24 | pass |
| QUA5 | quality summary lotsWithIssues / farmsWithIssues | 14/3 | 14/3 | pass |
| QUA6 | quality summary.oldest since/days | 2024-07-30/774 | 2024-07-30/774 | pass |
| ORA1 | oracleDefaults.lotsPerMonth == goal.closedLotsPerMonth | 4.73 | 4.73 | pass |
| ORA2 | oracleDefaults.avgSalePrice == round(mean sale price of sold lots) | 127,335 | 127,335 | pass |
| ORA3 | oracleDefaults.avgLandCost == round(mean landCost of sold lots) | 48,918 | 48,918 | pass |
| ORA4 | oracleDefaults.avgMonthsToSellNote == mean(close → note sale) months | 3.17 | 3.17 | pass |
| ORA5 | oracleDefaults.newFarmEveryMonths == mean gap between farm dates ≥ era (future dates included) | 1.26 | 1.26 | pass |
| ORA6 | oracleDefaults.avgLotsPerFarm == mean total_lots | 12.1 | 12.1 | pass |
| ORA7 | oracleDefaults.investorTakePct == take ÷ gross × 100 | 24.76 | 24.76 | pass |
| ORA8 | oracleDefaults.downPaymentPct == mean(down ÷ price) over financed sold lots | 7.72 | 7.72 | pass |
| ORA9 | oracleDefaults.noteSalePct == mean(note sale price ÷ financed amount) | 80.21 | 80.21 | pass |
| ORA10 | farmCadence.farms/fundingDates/excluded | {"n":6,"dates":["2026-04-14","2026-04-15","2026-06-16","2026-07-31","2026-10-02","2026-… | {"n":6,"dates":["2026-04-14","2026-04-15","2026-06-16","2026-07-31","2026-10-02","2026-… | pass |
| FUT1 | oracle netProfitPerLot == (avgSalePrice − avgLandCost) × (1 − take%) | 59,000.95 | 59,000.95 | pass |
| FUT2 | closings_only lotsNeeded == ceil((10M − netProfitToDate) ÷ netProfitPerLot) | 132 | 132 | pass |
| FUT3 | closings_only exit date (independent month loop, whole months from asOf) | 2029-01-12 | 2029-01-12 | pass |
| FUT4 | current_pace steadyPace == round2(expected.reservationsPerMonth × conversion) | 5.32 | 5.32 | pass |
| FUT5 | current_pace exit date (scheduled reservations on expected dates + steady pace after the lag) | 2028-07-12 | 2028-07-12 | pass |
| FUT6 | current_pace scheduled count == live reservations with an expected date | 33 | 33 | pass |
| FUT7 | required_pace == lotsNeeded ÷ floor(monthsToDeadline) | 8.8 | 8.8 | pass |
| FUT8 | required_pace farm cadence == min(real cadence, lotsPerFarm ÷ pace) | 1.26 | 1.26 | pass |
| FUT9 | required_pace exit date (independent loop) | 2027-12-12 | 2027-12-12 | pass |
| FUT10 | one_more_farm pace == steady + steady ÷ activeFarms | 6.08 | 6.08 | pass |
| FUT11 | one_more_farm exit date (independent loop) | 2028-05-12 | 2028-05-12 | pass |
| FUT12 | futures hitsDeadline == exit ≤ deadline | false,true,false,false | false,true,false,false | pass |
| FUT13 | daysEarlierThanCurrent == current exit − exit | 0,213,61,-184 | 0,213,61,-184 | pass |
| W14 | rows.adSpend == lotsClosed ÷ conv × adSpendPerClosing (within the 0.005-lot display rounding) | true | true | pass |
| W15 | rows.notesSold[m] == lotsClosed[m − noteLag] | true | true | pass |
| W16 | Σ rows.capitalDeployed == required.totalDeployed | 2,332,150 | 2,332,150 | pass |
| W17 | Σ rows.farmsBought == farmsToBuy | 5 | 5 | pass |
| W18 | rows.inventory recurrence: inv − closed + lots of farms landing (purchase + landLag) | true | true | pass |
| W19 | required.lotsNeeded == Σ lotsClosed (deadline month prorated) | 132.13 | 132.13 | pass |
| W20 | required.targetAtDeadline == last row cumulativeNet (deadline = month end) | 10,000,559.35 | 10,000,559.35 | pass |
| W21 | required.targetAtDeadline ≥ 10M and within the bisection step of it (minimal pace: 0.01 lot/month × k months) | true | true | pass |
| W22 | required.reservationsPerMonth == pace ÷ conv; noteSalesPerMonth == pace | 11.29\|8.47 | 11.29\|8.47 | pass |
| W23 | schedule purchase months ≤ maxPurchaseMonth and ≥ 1 | true | true | pass |
| W24 | closeLag == round(medianDaysToClose ÷ 30.4375) | 2 | 2 | pass |
| W25 | landLag == round(farmToFirstCloseMonths); noteLag == round(noteSaleLagMonths) | 3\|3 | 3\|3 | pass |
| W26 | rows.cumulativeNet month deltas == pool lots × blended net + farm lots × (gross − own-deal take) (within 0.005-lot display rounding) | true | true | pass |
| W27 | required.funding Σ amount + unfunded == capitalToRaise | 2,332,150 | 2,332,150 | pass |
| W28 | rotation.turnsNeeded == totalDeployed ÷ peakOutstanding | 1 | 1 | pass |
| W29 | rotation.turnsIncomplete == planned farms with purchase + round(cycle) > k | 3 | 3 | pass |
| W30 | rotation.firstTurnStartBy == month end of first purchase; lastTurnCompletes == month end of max(purchase + cycle) | 2027-04-30\|2028-02-29 | 2027-04-30\|2028-02-29 | pass |
| W31 | current column: farms bought at the real cadence up to the deadline month | 13 | 13 | pass |
| W32 | current column capitalToRaise == farms × farmCost − recycled | 2,798,580 | 2,798,580 | pass |
| W33 | buffer column == required farms + 1 at the last purchase month | 6\|11 | 6\|11 | pass |
| W34 | ledger.unpaidTake == Σ max(0, accrued − interest paid) + max(0, PS earned − PS paid) per investor | 663,303.94 | 663,303.94 | pass |
| W35 | warPlan.monthsToDeadline (calendar grid) vs goal.monthsToDeadline (days ÷ 30.4375) | 15.6 | 15.61 | pass |
| W36 | real.recentLandCostPerLot == mean landCost of 3 most recent farms funded ≤ asOf and ≥ era | 46,643 | 46,643 | pass |
| W37 | real.farmToFirstCloseMonths == median(acquisition → first closing) in months | 2.63 | 2.63 | pass |
| R6 | rotation benchmark when no freed farm is in the era: median of PROJECTED cycles (campaign lots left ÷ pace share) | 220.5 | 220.5 | pass |
| EXO1 | noteSaleRatio combined/discountBased/financedBased/literal/counts (raw note_sales) | {"u":0.8092,"b":"combined","c":0.8092,"d":0.8275,"f":0.8045,"l":0.9998,"n":15,"nd":6,"n… | {"u":0.8092,"b":"combined","c":0.8092,"d":0.8275,"f":0.8045,"l":0.9998,"n":15,"nd":6,"n… | pass |
| EXO2 | note inventory rows (status, upb, rate, term, remaining, release cost vs RPC lot_balance) | true | true | pass |
| EXO3 | note inventory buckets (counts/upb) + sold/inactive | {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact… | {"free":9,"fu":671227.84,"nr":9,"nru":1220481.78,"ps":6,"ex":1,"nf":13,"sold":15,"inact… | pass |
| EXO4 | needsRelease.costToday == Σ RPC lot_balance over needs_release notes | 489,188.24 | 489,188.26 | pass |
| EXO5 | futureNoteTerms (face = avgSalePrice × (1 − down%), mean rate & term of farm notes incl. legacy farms, level payment) | {"f":117504.74,"r":0.0946,"t":140,"p":1388.87,"n":39} | {"f":117504.74,"r":0.0946,"t":140,"p":1388.87,"n":39} | pass |
| EXO6 | notes.interest_rate stored as a fraction (all farm notes < 1) | true | true | pass |
| EXO7 | exodus rows: cumulativeNotes/Cash/Returned are running sums (returned = notes + cash), within per-row cent rounding | true | true | pass |
| EXO8 | scenario totals == Σ rows (notes delivered, cash to LPs, releases, cash farms, note proceeds, ad spend, lots), within per-row cent rounding | true | true | pass |
| EXO9 | scenario.totalReturned == notes + cash; shortfall == max(0, LP − returned); feasible/notesCovered flags | {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000} | {"t":13024599.81,"s":0,"f":true,"nc":true,"nt":3000000} | pass |
| EXO10 | flows identity: cash to LPs == start + receipts − partners − releases − cash farms − ads − carry | 10,024,599.81 | 10,024,599.81 | pass |
| EXO11 | package.totalUpb == notesDelivered == Σ deliveries == Σ buckets (within cent rounding of the parts) | true | true | pass |
| EXO12 | reconciliation bridge sums to baseline cash paid (residual 0) | 12,427,399.17 | 12,427,399.17 | pass |
| EXO13 | reconciliation: replayed War Plan cash metric == War Plan targetAtDeadline within the rounded-row slack (drift is a disclosed bridge line) | 10,010,410.7 | 10,010,410.7 | pass |
| EXO14 | reconciliation.production closings match the War Plan rows; lots == War Plan lotsNeeded | true | true | pass |
| EXO15 | versusCash.discountSaved == notesDelivered × (1 − ratio) | 572,400 | 572,400 | pass |
| EXO16 | maxNotesPct == highest scanned pct with notesCovered | 60 | 60 | pass |
| EXO17 | coverage has 61 points (0..60) and pct 0 has no notes delivered | 61\|0 | 61\|0 | pass |
| EXO18 | latestViablePurchaseDate == month end of k − landLag − closeLag | 2027-07-31 | 2027-07-31 | pass |
| EXO19 | exodus.warPlan ledger figures == realm War Plan ledger (cash kept, owed today) | 1362503.84\|4779659.42 | 1362503.84\|4779659.42 | pass |
| EXO20 | baseline (0 % notes) delivers no notes | 0 | 0 | pass |
| EXO21 | delivered notes ≤ note target + one note (delivery stops at the target) | true | true | pass |
| SEAS1 | seasonality.monthsOfHistory == whole months era start → asOf; monthsRequired 12; applied iff ≥ 12 | {"m":6,"req":12,"applied":false,"reason":"not enough history for seasonality"} | {"m":6,"req":12,"applied":false,"reason":"not enough history for seasonality"} | pass |
| SEAS2 | seasonality.closings (dated, since era, ≤ asOf) / excluded (pre-era) | 30\|8 | 30\|8 | pass |
| SEAS3 | seasonality factors all 1 while not applied (nothing seasonal reaches the War Plan) | flat | flat | pass |
| STO1 | story cards: every line rebuilt from independent figures (farms, counties, lots, sponsor gold, owed, closed lots, net, %, oxygen, freed/capt | 0 | 0 | pass |
| STO2 | story kicker 'Since {year}' == year of the earliest farm funding/closing date | Since 2025 | Since 2025 | pass |
| NAR1 | chronicle prose: money and day figures spoken per event == independent per-event values (170 narrated events) | 0 | 0 | pass |
| TRO11 | trophy progress % for the formula trophies (net_profit_*, fifty/hundred lots, ten notes, nine realms, cash 1m, best month, first blood) | 0 | 0 | pass |
| TRO12 | nine_realms progress with funded-only farms (report only) | 100 | 88.89 | report-only — app counts 10 farms; 8 are funded/closed on or before asOf |
| LOT4 | Quests totals (no filter): Σ contract, sale, land, gross, take (closed), net, cash, oxygen over all lots | true | true | pass |
| ORA11 | Oracle page default result (current-pace params + scheduled reservations): monthsToGoal / goalDate | 22\|2028-07-12 | 22\|2028-07-12 | pass |
| ORA12 | Oracle page 'farms bought along the way' == purchases through the month the loop stops (max(floor(monthsToDeadline)+2, monthsToGoal+1)) — re | 18 | 18 | pass |
| ORA13 | Oracle page netProfitAtDeadline == cumulative net after the last whole month ≤ monthsToDeadline | 7,963,081.25 | 7,963,081.3 | pass |
| ORA14 | Oracle page lotsNeeded / netProfitPerLot == ceil(remaining ÷ per-lot) / (price − land) × (1 − take) | 132\|59000.95 | 132\|59000.95 | pass |
| ORA15 | Oracle page seeds the sliders from futures.current.params, but the lots slider hint reads 'Trailing 90-day pace' (report: seeded value vs tr | 5.32 | 4.73 | report-only — seeded 5.32 (reservations × conversion) vs trailing 90-day pace 4.73 |

