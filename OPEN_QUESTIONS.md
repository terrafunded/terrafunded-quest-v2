# OPEN_QUESTIONS — assumptions made while building Quest v2

Every ambiguity met during the build, the interpretation chosen (always the most
conservative one), and what a human should confirm. Ordered roughly by impact.

## 1. The v1 reference repo was not reachable

`terrafunded/quest-realm-conquer` returns 404 both anonymously and with the authenticated
`gh` client (the org's visible repos are `terrafunded-quest-v2`, `casted`, `ari`,
`cyberlots01`, ...). `/reference/quest-v1/` is therefore empty. The visual language
(Cinzel / Cinzel Decorative, dark medieval palette) and the named components
(`AnimatedCounter`, `ProgressRing`, `MilestoneCelebration`, `GrowthBurst`, `QuestTree`,
`CinematicIntro`, `Trophies`) were rebuilt from scratch from their descriptions.
**Action:** make the v1 repo readable (or drop it in `/reference/quest-v1/`) for a
second pass that copies the original tokens exactly.

## 2. "101 lots across 9 farms" does not add up — the data says 109

GOAL.md lists Eastland 11, Wichita 32, Lamar 9, Avery 14, Franklin 6, Franklin 2 5,
Freestone 7, Titus 6, Promised Valley 19. Those sum to **109**, and live Payments has exactly
those per-farm counts (109 `properties` rows). The tests assert 109 and the per-farm
breakdown; "101" is treated as an arithmetic slip in the spec.

## 3. Red River 1 has `total_lots = 2` but is documented as "no lot subdivision"

The rule "`farm_acquisitions.total_lots > 1` ⇒ subdivided farm" would include Red River 1
(2 property rows, 3 `cyberlots` notes dated 2025-06/07, i.e. *before* the farm's
2026-09-02 closing, and no file cases). `payments_schema.md` explicitly calls it a legacy
one-off, and the verified numbers describe 9 farms. Chosen: an explicit, versioned
exclusion list `LEGACY_FARM_NAMES = ["Ben White", "Sharps Rd", "Olney", "Red River 1"]`
in `src/config/goal.ts`. The Data Quality panel surfaces Red River 1
(`legacy_farm_with_lots`, `multiple_notes_on_lot`, `note_before_farm_purchase`).
**Action:** confirm Red River 1 should stay out, or remove it from the list.

## 4. Eastland Lot 3's buyer is a test client, but the sale is real

`file_cases` → `clients` for Eastland Lot 3 points at a client with `is_test = true`,
while the file case, the note (`is_test = false`) and the note sale are real and are part
of the verified $8,986,794.30 / 15 note sales. Chosen: `clients.is_test = false` filters
the **clients** table (names), not the file cases. The lot is counted, the buyer name is
withheld, and the quality panel flags `test_client_on_real_case`.

## 5. Cash deals and `cashRealized`

GOAL.md defines `cashRealized = downPayment + note_sales.sale_price`. Five of the seven
cash deals have `down_payment = NULL` (and Lamar Lot 2 has `0` while the distributions
show the full $100,000 was received). Chosen: for `deal_type = 'cash'` lots in stage
`closed`, `cashRealized = salePrice`. Financed lots follow the spec formula. Down payments
are only counted once a lot is closed (stage `closed`/`note_sold`), not while `reserved`.

## 6. Effective close date

`closeDate = file_cases.closing_date ?? notes.start_date`. Two completed file cases have
no `closing_date` (Eastland Lots 2 and 6). Lot 2 has a note, so its start date is used.
Lot 6 (cash) has neither: it counts toward totals and appears in the Treasury as
`undatedCashIn` ($90,000) but cannot be bucketed by month or count toward the trailing
90-day pace. Flagged as `completed_without_closing_date`.

## 7. Six lots have a note while the file case is still `active`

Lamar 5/6/7, Eastland 4/8, Promised Valley 3. Per the stage rule a note ⇒ `closed`
(or `note_sold`). They are treated as closed and flagged `active_file_case_with_note`.

## 8. Interest allocation to unsold lots

For `fixed_interest` farms, accrued interest is allocated pro-rata by `landCost` to **all**
lots (sold or not) as the spec says. Consequence: a sold lot on a farm with many unsold
lots carries only 1/N of the accrued interest; the rest is visible at farm level
(`interest.accruedToDate`) and on the Sponsors page. Farm-level `investorTake` and
`netProfit` sum only sold lots.

## 9. Rate units

`farm_acquisitions.annual_interest_rate` is stored as a percent (`20`, `25`), while
`file_cases.interest_rate` and `notes.interest_rate` are fractions (`0.0699`). The domain
normalizes any rate `> 1` as a percent and `<= 1` as a fraction (`toPercent`).

## 10. "Interest paid to date" for fixed-interest sponsors

There are no `investor_distributions` rows for any fixed-interest farm yet. `paidToDate`
= Σ distributions on the farm with `kind != 'capital_return'`. The raw list is shown on
the Sponsors page as instructed.

## 11. Trailing pace window

`closedLotsPerMonth` = lots with `closeDate` in the last 90 days ÷ (90 / 30.4375).
Lots closed without a `closeDate` are excluded from pace but included in totals.

## 12. Franklin 2 has not closed yet

`funding_date = NULL`, `closing_date = 2026-10-15` (future). It is included as a farm
(5 lots, 1 reserved, 4 available), accrues no interest until 2026-10-15, and its
acquisition shows in the chronicle as an upcoming event.

## 13. Note sales not on a subdivided farm

One of the 15 note sales ($57,000, 14601 Benwood Ave, Cleveland — a house) is not on any
farm lot. It is excluded from lot/goal economics but surfaced in the Treasury as
`otherNoteSales` so the page still reconciles to $1,356,405.86.

## 14. `file_cases` row count

`payments_schema.md` says 128 file cases exist; the viewer login sees exactly 71 (all on
subdivided farms). Either RLS scopes the viewer to Terrafunded land cases, or the other
rows were removed. Not an error for Quest, but worth knowing.

## 15. Oracle assumptions

The Oracle simulates month by month: inventory = available + reserved lots; a new farm of
`avgLotsPerFarm` lots lands every `newFarmEveryMonths`; each closed lot recognizes
`(avgSalePrice − avgLandCost) × (1 − blendedInvestorTakePct)`; cash arrives as the
average down-payment % at closing and `noteSalePct` of the financed amount
`avgMonthsToSellNote` later. All defaults are trailing averages from the real lots.

## 16. Treasury scope

Monthly buyer collections are out of scope per GOAL.md. Cash in = down payments (or the
full price for cash deals) at close + note sales; cash out = `investor_distributions`.

## 17. Views that exist in Payments

None of `v_note_summary`, `v_portfolio_dashboard`, `v_monthly_cash_flow`,
`v_file_case_summary`, `v_outbound_summary`, `v_tape_export` were used; their columns were
not introspected. Proposed replacements for the heaviest computations are in
`sql/proposed_views.sql` (not applied).

## 18. Ledger totals row: contract price vs. rule-based price

GOAL.md says the ledger totals row "must equal the verified numbers", i.e. Σ
`file_cases.sale_price` = $8,986,794.30. But the lot-economics `salePrice` rule prefers
`notes.original_amount`, and on the five `price_mismatch` lots (Titus 6, Lamar 5/6/7,
Eastland 3) the note is lower — the rule-based total is $8,964,992.80, i.e. **−$21,801.50**.
Chosen: the ledger has a **Contract price** column (file case) whose total is the verified
$8,986,794.30, and a **Sale price** column (rule-based) used for gross/net profit. Both totals
are shown. **Action:** decide which one Rodrigo wants as "revenue".

## 19. Days in pipeline when the reservation is dated after the close

`daysInPipeline = closeDate − reservation_date`. Lamar Lot 5's reservation is dated after
its note start, which would give a negative (or clamped 0-day) pipeline and wrongly earn the
"Swift Sword" (fastest close) trophy. Chosen: negative values become `null` ("unknown"); the
lot still appears in the ledger and the quality panel flags `reservation_after_note_start`.

## 20. Trophies

GOAL.md names four trophies and asks for "at least 15". Twenty are implemented in
`src/domain/trophies.ts`; the thresholds (e.g. "Swift Sword" = a lot closed within 30 days of
reservation, "Treasury month" = $100k cash in one month, "Best month" = 5 closings in one
calendar month, "Streak" = 3 consecutive months with a closing) are ours, editable in one
file, and covered by tests. Unearned trophies show the progress toward the threshold when it
can be expressed as a number.

## 21. Playwright uses the viewer login

`npm run e2e` signs in with `QUEST_TEST_EMAIL` / `QUEST_TEST_PASSWORD` once (a setup project
stores the session in `playwright/.auth/`, git-ignored) and then runs the desktop and mobile
projects against the production build on port 4173. If the viewer's RLS scope changes, the
counts asserted in `e2e/quest.spec.ts` (109 tiles, $8,986,794.30) and in the fixture tests
will need to be regenerated with `npm run snapshot`.

## 22. The one deliberate write attempt (`scripts/check-connection.ts`)

GOAL.md forbids any write to Payments. At Rodrigo's explicit request the connection check
script attempts a single dummy `insert` into `property_costs` **in order to prove the viewer
login cannot write**, and deletes the row immediately if the insert were ever to succeed. On
2026-09-11 the insert was rejected by RLS (`42501`), so nothing was written. The probe lives
in `scripts/`, not `src/`, and is not part of `build`, `test` or `e2e`. **Action:** if the
viewer's RLS policies are ever loosened, `npm run check` exits with code 3 and prints a
warning; treat that as a production incident, not a Quest bug.

## 23. The Debt excludes own capital

"Capital still owed to investors" (`src/domain/debt.ts`) sums `capitalOutstanding` over the
subdivided farms whose `capital_basis_source` is `investor_capital`. Farms bought with
`own_capital` (Red River 1 / Franklin, $790,000 outstanding) are not a debt to anyone and are
shown separately as "own capital tied up". The required net profit per day is
`(10,000,000 − net profit to date) ÷ days to 2027-12-31`, i.e. it tracks the $10M goal, not the
debt — the debt counter tells you what is owed, the per-day figure tells you what it takes to
reach the exit. Once the deadline passes the per-day figure is `null` ("the day has come").

## 24. Oxygen = days gained, measured on the closing day

A closed lot's "days gained" (`src/domain/oxygen.ts`) is `round(netProfit ÷ netProfitPerDay
at pace)`, where the pace is the one the realm had **on that closing date** (average net profit
per closed lot × closed lots per month, using only closings up to and including that day). The
score is therefore fixed the day the lot closes and never changes afterwards. A naive
"recompute today's projected exit date with and without this lot" was tried first and rejected:
because the projection depends on the average profit per lot, a profitable but below-average
lot came out with *negative* days, which no seller would accept as a score. Undated closings
are measured at the as-of date. The first closings, when the realm had almost no history,
score high (Lamar Lot 6 = 91 days) — that is the cold-start effect, not a bug.

## 25. Liberation is per sponsor position, not per sponsor

A hostage is one investor × one farm funded with `investor_capital`. It is freed when
`Σ investor_distributions (capital_return)` for that farm reaches the capital lent (within one
cent); the liberation date is the date of the distribution that crossed the line. A sponsor is
"freed" when all of their positions are. Townson Family's Lamar position is free (2026-05-19);
their Wichita position is not, so the sponsor card still shows chains. Own-capital farms have no
hostage.

## 26. Farm campaign target, recovery and the 60-day rule

`src/domain/campaigns.ts`: the target is capital deployed + interest accrued to date
(fixed-interest farms only; profit-share farms accrue none). "Recovered" is the farm's gross
revenue, Σ sale price of sold lots (contract price, not net) — the question a campaign answers is
"how many more lots must sell to give the sponsor their money back", not "how much profit did we
make". Lots left = `ceil(shortfall ÷ average sale price on this farm)`, falling back to the realm
average when the farm has no sale yet (Avery). States: **conquered** when the shortfall is zero
or every lot is sold; **losing ground** when interest is still accruing on outstanding capital and
there has been no closing in the last `LOSING_GROUND_DAYS = 60`; **under siege** otherwise.

## 27. Streaks use ISO weeks

Consecutive weeks with ≥ 1 closing are counted on ISO weeks (Monday start, ISO week-numbering
year, so 2026-W22 is the week of 25 May). A streak is "current" only if it reaches the present
or the previous ISO week; otherwise the current streak is 0 even if the best streak was recent.
Best week / best month are the calendar buckets with the most closings, ties broken by net
profit. Trophy rarity is derived from the existing tier (bronze → common, silver → rare, gold →
epic, legendary → legendary) so the 20 Phase 1 trophies did not need re-tuning; five streak /
liberation trophies were added.

## 28. The three futures

`src/domain/futures.ts` reuses the Oracle simulator. **Current pace** is the trailing-90-day
defaults. **Required pace** is `lots still needed ÷ whole months to the deadline` with the farm
cadence tightened so inventory never blocks it — it lands on 2027-12-11, the last simulated
month before the deadline, by construction. **One more farm** was first modelled as "one extra
farm of inventory", which produced the same exit date as the current pace because inventory is
not the bottleneck today; it is therefore modelled as one more *sales stream*: pace × (1 + 1 ÷
active farms) and one farm's worth of extra inventory. That reading is ours.

## 29. Celebrations and localStorage

`quest.lastVisit` (ISO timestamp) and `quest.celebrated` (up to 300 event ids) live in
`localStorage`; `quest.liberations.seen` (Sponsors fanfare) and `quest.intro.seen`
(`sessionStorage`) as well. On the very first visit nothing is celebrated — otherwise every new
browser would replay three years of closings — but the ids of today's qualifying events are
remembered so they are not celebrated later either. Clearing site data resets all of it. Nothing
about visits is written to Payments.

## 30. Narrative templates

Every chronicle line comes from a TypeScript template in `src/domain/narrative.ts` (one per
event kind, with variants for cash deals, own-capital farms and liberations). There is no
external API and no randomness, so the same event always produces the same sentence and the
templates are unit-tested. Prose dates omit the year when the event is in the current year.

## 31. Intro story

`src/domain/story.ts` builds the six intro cards from the realm: farms / counties / lots,
capital lent vs owed, closings and net profit vs the goal, total days gained, liberations, and
the countdown with the required daily profit. Cards with no data (e.g. no liberation yet) are
dropped rather than shown with zeros.
