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

## 32. "Reservations per month" counts reservations that are still waiting

The request defines the leading indicator as reservations from `file_cases.reservation_date`
with status `active`, no `closing_date` and no note — i.e. lots that are *still* reserved. A
reservation made 80 days ago that already closed is therefore not in the 21 / 7.1 per month
figure, though it is in `reservationsMadeTrailing` (22 / 7.44 per month), which the `/pipeline`
page shows next to it. If the intended reading is "all reservations signed in the window", swap
the two fields in `PipelinePanel`; both are computed and tested.

## 33. Conversion cohort and maturity

Conversion = closed ÷ (closed + still reserved) over lots whose reservation is dated on or
before `asOf − 90 days` (`CONVERSION_MATURITY_DAYS`). Lots whose only file case is cancelled
have no reservation in Quest (they are `available`) and so are neither a success nor a failure
here; cancellations would need their own metric ("of reservations made, how many were
cancelled") if that question matters. The 90-day maturity is ours: younger reservations have
not had a fair chance to close, given the 63-day median.

## 34. Stuck = 60 days, net profit at stake = the goal's pipeline formula

`STUCK_AFTER_DAYS = 60` follows the request and matches the campaign "losing ground" rule. "Net
profit at stake" is `grossProfit − investorTake` at today's prices and today's accrued interest —
exactly what `computeGoal` sums into `netProfitInPipeline`, so the two layers reconcile
($2,222,188.97). Because a reserved lot's interest share keeps accruing on fixed-interest farms,
the trapped figure drifts down slowly the longer a lot waits. All 33 reserved lots have a
reservation date today; a reserved lot without one would be excluded from the stuck list and the
quality panel would be the place to surface it.

## 35. Median days to close ignores negative durations

A closed lot whose reservation is dated after its closing (a disagreement the quality panel
flags) is left out of the median, not clamped to 0, matching `daysInPipeline` (#19). Farms with
no closed lot (Avery, Franklin, Franklin 2) show "—" on the drawer and the realm median next to
it. The per-farm median uses the file case's `closing_date`, or the note's `start_date` when the
case has none, as everywhere else in Quest (#6).

## 36. Default theme and where the switcher lives

The brief asks for the menu on `/login`; Iron Crown is the default for a first visit (it ranked
first in `PROGRESS.md`). I also put the three swatches in the nav drawer (and the full picker on /login)
so a signed-in user does not have to sign out to change skin — an addition beyond the spec, easy
to remove (the drawer hosts the full `ThemeMenu`). The choice is per browser
(`localStorage`), not per Payments user; syncing it to a profile would be a write, which Quest
never does.

## 37. Type pairings and self-hosting

The brief named the character of each pairing, not the faces. I chose Cinzel + Crimson Pro
(Iron), Cinzel Decorative + Cormorant Garamond + EB Garamond (Gilded) and Orbitron + Rajdhani +
Inter + JetBrains Mono (Neon), all under the SIL Open Font License, self-hosted as latin subsets via
`@fontsource` so the app has no third-party request at runtime and the e2e/perf runs are
deterministic offline. Only the active theme's faces download (fonts are fetched lazily by the
browser; the build injects preloads for the current theme's first-screen faces).

## 38. Touch sizing changes the layout on phones

Under `@media (pointer: coarse)` every button, input, select, nav item, slider thumb and swatch is
at least 44 px, and inline text links get a 44 px hit box via negative block margins. The desktop
screenshots (fine pointer) do not show this; the 390 px screenshots in `docs/screenshots` are taken
with `hasTouch: true` and do. The touch-target rules for slider thumbs and inline links landed after
the last POLISH pass, so those two details differ slightly from the committed phone screenshots;
`scripts/perf.ts` audits the touch version and reports zero targets under 40 px on every route.

## 39. Reduced motion and the "AAA" layer

With `prefers-reduced-motion: reduce` the particle canvas is not rendered, the shimmer and card
transitions are off, Framer Motion animations are disabled through `MotionConfig
reducedMotion="user"`, and counters jump to their value. Hover glows still apply (no motion).
The stone/parchment/grid textures stay: they are static images, not motion.

## 40. Performance numbers are from Lighthouse "slow 4G", not devtools "Fast 4G"

`scripts/perf.ts` throttles to 1.6 Mbps down / 750 Kbps up / 150 ms RTT with a 4× CPU slowdown,
which is harsher than the brief's "throttled 4G". First paint is 0.76–0.78 s on every theme; the
signed-in Throne Room's LCP (≈3.4 s) is the hero counter waiting for Supabase on that link. A
cached last snapshot would bring it under a second (PROGRESS.md, "What I would do next").

## 41. War Plan: 8.44 lots/month, not 8.3, because new lots pay their own farm's deal

The brief pins "closings per month required ≈ 8.3 and lots still needed ≈ 130" on the fixture. With
the **blended** investor take (24.41 %, what the Oracle uses) the War Plan reproduces it exactly:
8.27 lots/month and 129.29 lots (`epic_fixture.test.ts`, "with the blended take the brief's 8.3 /
130 come back"). With the brief's own rule that "the investor take of each new lot follows that
farm's deal", the second farm in the funding order is Townson Family at a **50 % profit share**, so
its lots net half as much as a blended lot and the plan needs **8.44 lots/month and 131.95 lots**
(7 farms, $3.4M). Both are pinned; the tests assert 8.3 / 130 to the precision the brief gave
(`toBeCloseTo(8.3, 0)`, `toBeCloseTo(130, -1)`) and the exact 8.44 / 131.95 next to them. The
fixture's live counterpart (2026-09-11 15:00 UTC) says 8.6 lots/month and 7 farms: the
`investor_capital` of ten farms was raised after the snapshot (#50).

## 42. War Plan: the purchase deadline counts both lags, which double counts the first lot

The latest useful purchase month is `deadline − farmToFirstCloseMonths − median days to close`
(− the note-sale lag in cash mode), as the brief specifies. `farmToFirstCloseMonths` (median 2.63
months over the 6 farms with both an acquisition date and a closing) already contains the time the
first lot took to close, so adding the 63-day median again is conservative by roughly two months
for the first lot of a farm — but not for its other nine, which still have to be reserved and
closed. Chosen: follow the brief. On the fixture the last useful purchase is **Jul 2027** in profit
mode (month 11 of 16) and **Apr 2027** in cash mode (month 8). Dropping the double count would move
those to Sep and Jun 2027 and change no other number.

## 43. War Plan: what "cash in the bank" means

In cash mode the target is measured as `cash kept today + cash from new closings and note sales −
capital deployed on new farms − investor take generated by the new closings − everything owed to
sponsors today`. "Owed today" is capital outstanding on sponsor-funded farms ($3,579,399.48) plus
accrued interest and earned profit share not yet distributed ($656,397.99); "cash kept" is cash
realized on lots minus the $793,990.46 already paid out ($1,362,503.84). So the plan starts at
−$2.87M and must hand every sponsor their capital and take before a dollar counts. Alternatives
that would move the answer: excluding unpaid take (owed becomes $3.58M), or counting buyer
collections (out of scope per GOAL.md, #16). The month table also shows *capital returned per
investor*; that is display accounting (existing debt is repaid pro rata as today's lots close; a
new farm's debt as its own lots close) and does not feed the metric, whose meaning is "could the
fund pay everyone out at the deadline", however it schedules the payouts.

## 44. War Plan: the unfunded share of a farm is charged the blended take

When the investor mix runs out, the remainder of a farm is flagged "unfunded" and its lots are
still simulated — otherwise the plan could not say how many farms are needed. Their gross is
charged the blended 24.41 % take, i.e. the plan assumes that money will be raised on roughly
today's average terms. The verdict names the gap ("unfunded $0.9M") so nobody mistakes it for
capital in hand. The cash-mode fixture needs 19 farms and $9.2M against a $4.2M mix, hence
"unfunded $5.0M" — the honest answer is that the mix cannot carry a cash-out by 2027-12-31.

## 45. War Plan: the buffer farm costs its price in cash mode

The third column adds one farm bought alongside the last planned one, consumed only after every
planned lot. In profit mode it changes nothing at the deadline (its lots are never needed) and
buys inventory against lots that do not sell. In cash mode land is not cash, so the cushion shows
up as exactly −`farmCost` at the deadline (`buffer.targetAtDeadline = required − 482,320`). The
column says so in its premise rather than hiding the cost.

## 46. War Plan: the current-pace column exits later than the Oracle's "current pace" future

The Oracle's current-pace future lands on 2029-03-11; the War Plan's current-pace column, same
pace and cadence, lands on 2029-04-22. Three deliberate differences: the War Plan simulates
calendar months (the first row is the 19 remaining days of September, the Oracle uses whole months
from today); new farms are funded from the investor mix in order and their lots pay that deal
instead of the blended take; and a farm's lots can only close `farmToFirstCloseMonths` after it is
bought (the Oracle adds the lots the month the farm lands). The Oracle's three futures are
untouched (2029-03-11 / 2027-12-11 / 2028-11-11 still pinned).

## 47. War Plan: the investor prefill follows the brief, not the last deal

The brief lists Rony Schumann at 18 % and Kevin Concua at 20 %. In `farm_acquisitions` Rony's
Freestone note is **20 %** and Kevin's latest (Franklin 2) is **25 %**. The prefill uses the
brief's rates because they read as the terms for *new* money; every rate is editable in the mix
table. Sponsors not named in the brief but holding a position (none in the fixture) are appended
with their latest deal. The `capital` column is prefilled with each sponsor's **historical capital
deployed** (Kevin $1,398,628, Townson $1,672,000, …), since Payments records no "willing to
invest" figure; it is the size of cheque each has written before, which is the best available
proxy for what they might write again. The funding order is the brief's order.

## 48. War Plan: ad spend per closing has no data source

Payments has no marketing table, so $2,500 per closing is the brief's figure, a plain constant
(`WARPLAN_DEFAULT_AD_SPEND_PER_CLOSING`), and the "real" hint next to it says so. Ad spend per
month = closings per month ÷ conversion × ad spend per closing, with conversion from
`pipeline.ts` (74.47 % on the fixture: 35 of 47 mature reservations, #33).

## 49. War Plan: "minimum closings per month" is a constant pace, and 60 is the ceiling

The solver searches for the smallest constant pace from today to the deadline (prorated for the
partial first month) that reaches the target, buying farms just in time as that pace exhausts
inventory; a front-loaded or seasonal plan could hit the same target with a different shape. The
search is a 40-step bisection on [0, 60] lots/month, then rounded up to the cent of a lot and
bumped until the target is met, so the answer is minimal to ±0.01. Above **60 lots/month** (14×
today's pace) the plan is declared unreachable and the verdict reports the pace beyond which more
closings no longer help — e.g. a $10M cash-out by 2027-03-31 "lands at $860K" because no lot
closed after December 2026 could sell its note in time.

## 50. Live data drifted from the fixture during the day; one e2e assertion pinned it

Between the snapshot (2026-09-11 02:07 UTC) and the War Plan deploy (15:00 UTC) Payments changed:
`farm_acquisitions.investor_capital` was raised on ten farms (Lamar 475,000 → 484,000, Eastland
550,000 → 565,000, Wichita 1,197,000 → 1,217,000, …; distributions unchanged) and `property_costs`
grew from 13 to 24 rows ($5,797,147.50 → $5,901,906). Consequences: Lamar is 98.14 % returned, so
**nobody is freed** on the live `/sponsors` (the fixture and its tests, which say Townson was freed
of Lamar on 2026-05-19, are still correct for the snapshot they pin), and the live War Plan verdict
reads 8.6 lots/month, 7 farms, $3.4M (fixture: 8.4). The e2e test that required a freed hostage
now accepts either the freed cards or the gallery's explicit empty state; nothing in the domain
changed. The fixture was **not** refreshed, so every pinned number in `epic_fixture.test.ts`
keeps reproducing the verified 2026-09-10 spec; a new `npm run snapshot` would re-pin ~20 of them.

**Refreshed 2026-09-11 19:17 UTC** (Exodus, step 0): the fixture was regenerated and 60 tests
re-pinned — the full list of moved numbers with reasons is PROGRESS.md "Snapshot 2026-09-11
refresh". The fixture and the live site now describe the same data.

## 51. Rotation: Lamar's cycle is 271 days, not the brief's 261

The brief defines the cycle as "days from `farm_acquisitions.funding_date` to the date cumulative
`capital_return` distributions on that farm reach 100 %" and quotes Lamar as 2025-09-01 →
2026-05-19, 261 days, 8.6 months. In the fixture Lamar's `funding_date` is **2025-08-21** (its
`closing_date` is also 2025-08-21), and the capital_return distributions reach $475,000 on
2026-05-19 — exactly the liberation date `liberation.ts` already reports. 2025-08-21 → 2026-05-19
is **271 days, 8.9 months**. Nothing in Payments carries 2025-09-01 for Lamar (no acquisition,
distribution, reservation or closing on that day), and 261 days from 2025-08-21 would land on
2026-05-09, when nothing happened either. Chosen: reproduce the definition from the data
(`epic_fixture.test.ts` pins 271 / 8.9 / `freed_farms`) rather than the quoted figure. The
projected 8.6 months would need a funding date eleven days later than the one recorded.

## 52. Rotation: on live data nobody is freed, so the benchmark is a projection

Per #50, live `investor_capital` on Lamar was raised to $484,000 after the snapshot, so Lamar is
98.14 % returned and no farm is freed on the deployed site. The brief forbids a hard-coded
fallback, so when no farm is freed the cycle is the **median of every captive farm's projected
liberation** (campaigns.ts `lotsLeftToCover` ÷ (realm pace × that farm's share of unsold lots),
in months of 30.44 days). On the 2026-09-11 16:00 UTC live data that is Franklin, 325 days /
10.7 months, over 7 captive farms; the Throne Room strip then reads "turns completed 0" and the
grading table marks every farm "unrated" because a projected benchmark has no real
capital-returned curve to compare against. The fixture still says Lamar 271 days, 1 turn
completed. The page states which of the two it is showing ("(projected)" and an explanatory
note); the first real liberation switches it to a measured cycle with no code change. Farms whose
campaign already covers their capital but whose payout has not been booked (Eastland, Freestone
on the fixture; Lamar live) project to "today" with 0 days to go and are shown as "covered,
awaiting payout" rather than pretending a future date.

**Refreshed 2026-09-11 19:17 UTC:** the fixture now says the same as live — Lamar 98.14 %, no farm
freed, all-time cycle projected on Franklin (325 days / 10.68 months over 7 captive farms, nothing
graded), era cycle 219.5 days / 7.21 months on Avery; `epic_fixture.test.ts` pins these. Lamar is
the next liberation ($9,000 covered by its sales, payout not booked).

## 53. Rotation: peak capital outstanding equals total deployed on the fixture's own plan

"Peak capital outstanding" is the most land capital out at any single moment ≤ the deadline —
what actually has to be raised — and `turns needed = total deployed ÷ peak`. A dollar can only be
reused when a farm's turn completes (`round(cycle)` months after purchase) **before** a later
farm is bought. With the 2027-12-31 deadline the required plan buys its 6 farms between Mar and
Jul 2027 with a 9-month cycle, so no dollar comes back in time to buy another farm: peak = total
= $2,760,480, 1 turn, and 5 of the 6 turns are flagged as not completing before the deadline
(only the March farm's capital is back by December). Moving the deadline to 2028-12-31 spreads
the purchases out and the same engine shows peak $2,300,400 against $2,760,480 deployed, 1.2
turns. The unit test pins "peak < total whenever a turn completes before a later purchase"
(synthetic realm) and "peak = total when the cycle is longer than the plan" — the fixture's own
plan is the second case. The number the founder asked for is therefore honest but blunt: by the
current deadline the capital does not rotate, it has to be raised once and stays out.

## 54. Rotation: recycled capital in the funding schedule vs. "capital returned" in the month table

Two different things carry the word "returned". The **rotation engine** returns a farm's whole
cost to its funder `round(cycleMonths)` months after purchase and lets the same money buy the next
farm; that is what drives peak outstanding, turns and the `turn_incomplete` flag. The month
table's **capital returned per investor** is the display accounting from #43 (today's positions
repaid pro rata as existing lots close, a new farm's as its lots close) and is unchanged. In cash
mode the target still counts every dollar of new farm cost as an outlay and every dollar of
investor take as owed; recycling changes who brings the cash and when, not the plan's profit or
cash arithmetic. "Capital to raise" on each column is now the *fresh* money (Σ farm cost −
recycled) and the column also shows total deployed and peak outstanding.

## 55. Seasonality: the profile is built from 37 closings and applied only to the required pace

The month-of-year profile counts sold lots by the UTC calendar month of their closing date
(fixture: Jan 1, Apr 1, May 13, Jun 2, Jul 9, Aug 4, Oct 4, Nov 3, none in Feb/Mar/Sep/Dec — 37
closings), smooths with a circular [¼, ½, ¼] kernel, converts shares to multipliers on the flat
pace (mean 1) and floors them at 25 % of the flat rate, renormalising so the year still averages 1
(May ×2.27, Jan–Mar ×0.25). Thirty-seven closings over roughly one selling season is a thin
basis — a single month with 13 closings sets the whole peak — so the toggle defaults to seasonal
(as the brief asks) but the flat average is always shown next to it and one click removes it. The factors
are normalised again over the plan's own closing months so the solved flat pace stays the plan's
average; the current-pace column is never shaped (it is the trailing average, by definition
flat). The required plan therefore asks 20.2 lots of May 2027 and 2.2 of January, against a flat
8.2 — and a farm's `too_late` and `shortfall` checks now run against that shaped month.

## 56. Land cost: the three most recent purchases exclude Franklin 2

The farm-cost input defaults to `lots per farm × the average per-lot cost of the three most
recent farms by closing/funding date on or before today`: Franklin, Avery and Wichita, **$46,008
per lot** ($460,080 for 10 lots) against the all-time $48,232 ($482,320). Franklin 2 closes on
2026-10-15, after the snapshot, so it is not yet a purchase and is left out; once its date passes
it becomes the most recent and Wichita drops off. Both figures sit under the input so the drift
is visible; every downstream number that used the all-time cost (verdict capital, #45's buffer
cost) moved with it and was re-pinned.

## 57. Cancellations: the data has none, so the rate is 0 %

A lot whose file cases are all in a non-active, non-completed status (cancelled, withdrawn…) is
`available` again with a `cancelledReservationDate`; matured ones join the conversion cohort as
failures and the War Plan spends ad dollars against `conversion including cancellations`. Both
the fixture and the live database hold **zero** such lots, so `pctWithCancellations` equals the
plain 74.47 % (75 % live), the cancellation rate is 0.0 % on /pipeline and /warplan, and the
reservations-per-month requirement is unchanged. The synthetic unit test carries the case the
data lacks (cohort 6, closed 4, cancelled 1: 66.67 % → 57.14 %, rate 14.29 %). Reservations
that were cancelled and then re-reserved (an active case exists) are not counted as failures,
which understates churn if that pattern appears.

## 58. Rotation: turn length rounds to whole months inside the plan

The plan runs on calendar months, so the real cycle (8.9 months on the fixture, 10.7 live) is
rounded to the nearest whole month (9, 11) when deciding which month a farm's capital comes back;
the headline and inputs keep the decimal. A farm bought in the last month before a turn would
complete is therefore judged a month early or late at most.

## 59. Data Quality: live Payments has already fixed seven of the fixture's issues

The fixture (snapshot 2026-09-11 02:07 UTC) carries **33 issues on 18 lots and 3 farms**; the
live database that evening shows **26 on 15 lots and 3 farms**. The team has completed or corrected
the Eastland Lot 4, 6 and 8 cases (`active_file_case_with_note` ×2, `completed_without_closing_date`)
and closed the Lamar Lot 5/6/7 active cases, which also removed Lamar Lot 5's reservation-after-note
warning. The five price mismatches with their five down-payment mismatches, the $21,801.50, the
three farm cards and Ben White as the oldest open issue are identical on both. The e2e therefore
pins the mismatches, the dollars and the oldest issue, and checks the lot count only for shape
(and against the number of cards); the exact 18 / 33 live in `fixture.test.ts`. Regenerating the
fixture (`npm run snapshot`) would move dozens of pinned numbers elsewhere and is left for a
deliberate refresh.

**Refreshed 2026-09-11 19:17 UTC:** done. `fixture.test.ts` now pins **26 issues on 15 lots and 3
farms**, the seven cleared issues by name, no undated issue, and Lamar Lot 5's corrected
reservation date (2025-09-07).

## 60. Data Quality: "since" is the latest business date on the records, not `created_at`

The summary's "oldest unresolved issue" needs a date per issue. Every `created_at` in the
snapshot is the September 2026 import time, so it says nothing about when the disagreement began.
Each issue therefore carries `since` = the **latest** business date on the records involved (the
first day both sides were on file): reservation/closing/note-start for a price or down-payment
mismatch, the farm's closing or funding date for a blank capital, the note start for a sold note
without a sale, and so on. Ben White's blank `investor_capital` dates from its 2024-07-30 closing
(773 days at the snapshot). Eastland Lot 6's completed case has no reservation, closing or note
date, so its `since` is null and it can never be "the oldest"; the card shows it without a date.
"Oldest" is computed among issues not marked *Revisado* in this browser.

## 61. Data Quality: the Payments screen and field names stay in English in both languages

The brief's examples ("Notes → LAM-L05 → Original amount", "File Cases → Lamar Lot 5 → Sale
price") are what the operations user sees on the Payments screens, so the *path* is kept exactly
as Payments labels it in both Spanish and English; only the sentence around it is translated
("Corregir en Payments: File Cases → Lamar Lot 5 → Sale price"). The lot is named the way
Payments lists it ("Lamar Lot 5", no dash). If Payments is ever localised, only the dictionary in
`src/domain/quality_human.ts` changes.

## 62. Data Quality: review state is per lot **and** issue kind (and per note where a kind repeats)

*Revisado* and *Nota* are stored in `localStorage` (`quest.quality.review`) keyed by
`<lot name>::<kind>` as asked; four kinds can appear twice on one lot with different notes
(`sold_note_without_sale`, `sale_without_sold_flag`, `note_without_file_case`,
`note_before_farm_purchase`), so those keys also carry the note code. Farm-level issues use
`farm:<farm name>` in place of the lot. The state is per browser and never reaches Payments; a
card shows "k de N revisados" and is hidden by "Ocultar revisados" only when every issue on it is
reviewed. Clearing site data resets it.

## 63. Data Quality: the WhatsApp message is always Spanish, and the language toggle affects this page only

The copy buttons produce the Spanish message regardless of the ES/EN toggle, because the message is
for the operations team; the toggle (drawer, `quest.lang`, default Spanish) changes the on-screen
text of `/quality` only — the rest of Quest, the drawer labels and the summary's technical
`kind`/`id` block stay in English. The message uses WhatsApp's `*bold*` for the lot line and
nothing else.

## 64. Data Quality: the summary's dollars count price mismatches only

"Ganancia afectada por diferencias de precio" is the sum of |file-case sale price − note original
amount| over the price mismatches (**$21,801.50 on five lots**, fixture and live: Lamar 5 and 6
$4,999.75 each, Lamar 7 $5,000, Eastland 3 $5,000, Titus 6 $1,802). The same five lots also
disagree on the down payment ($1,000 on each Lamar lot, $5,000 on Eastland 3, $2,090.10 on Titus
6); a down payment moves the cash timing, not the net profit, so those are listed on the cards but
left out of the headline dollar. A blank farm capital or a missing closing date has no dollar to
add. Two different properties in Payments are both named "Red River 1", so
two lot cards share that title (they are keyed by property id, not by name).

## 65. Reservations: Payments records no cancellation date, and the data holds no cancellation

A cancelled file case keeps its `reservation_date` but nothing says *when* the buyer withdrew.
`Lot.cancellations` therefore dates the cancellation by the case's `updated_at`, falling back to
`created_at` and then to the reservation date itself; the Chronicle's "withdrew the pledge …
after N days" and the day a provisional oxygen figure disappears both rest on that
approximation. Every `created_at` in the snapshot is the import time (#60), so on the fixture the
approximation would be wrong by months — but the fixture and the live database hold **zero**
cancelled cases (#57), so no cancellation event, prose line or forfeited provisional day is
rendered anywhere from real data. The behaviour lives in the synthetic tests only
(`expected.test.ts`: two cancelled cases, one lot re-reserved after its cancellation). If Payments
ever adds a cancellation timestamp, `computeLots` is the one place to read it.

## 66. Expected: 16 of the 33 live reservations are already past their expected date

The realm's median reservation → closing lag is 63 days (per farm where the farm has closings:
Titus 73, Lamar 41.5, Promised Valley 90, Freestone 70, Eastland 63, Wichita 63; Avery, Franklin
and Franklin 2 have none and use 63). Sixteen live reservations — exactly the "stuck 60+ days"
set — are past that date, with $831,727.63 of expected net profit between them. The model does
not decay them: each is still worth `netProfitAtStake × 74.47 %`, and the Oracle's current pace
books all sixteen in its **first** month (21 reservations × 74.47 % = 15.64 closings scheduled
there: the sixteen overdue plus the five due by 11 October). That is the optimistic reading of the brief
("schedules every live reservation to close on its expected date"); a per-lot decay with age
would move the current-pace exit later than 2028-06-11 and is not in the data — the cohort
conversion already includes reservations that waited this long and closed.

## 67. Oxygen: provisional days are measured at the pace of the reservation day

Confirmed oxygen values a closing at the realm's pace on the closing day; provisional oxygen does
the same on the reservation day, so a reservation made when the realm was closing slowly is worth
many more days than one made now. Titus Lot 2 (reserved 2026-05-02, $61,723 at stake) is worth
**153 days if closed → 114 provisional** at that day's $403/day, while Wichita Lot 26 (reserved
2026-09-03, $40,097) is worth **5 → 4** at today's $8,644/day. The +342 provisional total is
therefore dominated by the May reservations, the same way the 547 confirmed days are dominated by
early closings. Measuring every reservation at today's pace would give a flatter figure
(≈ 2,222,189 ÷ 8,644 × 74.47 % ≈ 191 days) but would break the symmetry "the closing converts the
same days it was promised". A reservation older than the first closing has no pace to measure and
uses today's.

## 68. Paces: a "reservation made" counts whatever became of it

`reservationsPerMonth` counts every reservation dated inside the trailing 90 days — still live,
closed since, or cancelled — because the question it answers is "how fast are we signing", and a
reservation that closed within the window is a success, not a non-event. Fixture: **22 → 7.44 per
month**, identical to `pipeline.reservationsMadePerMonth`; the 21 still-waiting reservations in
the same window would give 7.10. `closingsPerMonth` (13 → 4.4) is the goal's own trailing pace,
so the two lines on the Throne Room and the verdict never disagree. The required line divides the
goal's required closings by the conversion (8.31 ÷ 0.7447 = **11.16 reservations per month**),
and the Oracle's steady pace after the lag is the reverse product (7.44 × 0.7447 = 5.54).

## 69. September 2026 has eight reservations, one of them on a lot sold in 2025

The "Reservations this month" figure is 8: seven live reservations (Wichita 26, 12, 13, Titus 4,
5, Franklin 2 Lot 11, Promised Valley 14) plus **Lamar Lot 5**, whose file case is dated
2026-09-07 although its note was sold on 2025-11-05 — the `reservation_after_note_start` issue
already on `/quality`. The count follows the data as recorded rather than guessing which date is
wrong; live Payments has since closed that case (#59), so the deployed site shows **7** for
September. Nothing else moves: the lot is `note_sold`, so it carries no expected close, no
provisional oxygen and no committed dollar.

**Refreshed 2026-09-11 19:17 UTC:** Payments corrected the date to **2025-09-07**; the fixture now
counts **7** September 2026 reservations, Lamar Lot 5 joins the conversion cohort (48 / 36 = 75 %)
and the median (59 days), and leaves the trailing 90-day pledge count (21, 7.1/month).

## 70. Oracle: the steady pace waits out the median lag

In the reservation-aware current pace, a reservation signed today cannot close before the median
lag has passed, so the flat `reservationsPerMonth × conversion` pace starts only after
`asOf + 63 days` (prorated inside the month it starts: December 2026 books 2.98 scheduled + 5.17
flat = 8.15). Until then only the scheduled reservations close. On the fixture every month still
beats the "if no reservation ever closed" line (15.64, 5.96, 8.15, then 5.54 against a flat 4.4)
because of the backlog; a realm with few live reservations would show *fewer* closings than the
closings-only line during the lag, which is the honest reading — nothing signed today closes
tomorrow. The War Plan keeps its own closings-only solver (#46) and is untouched.

## 71. Expected months move with the live data; the e2e checks shape, not counts

`expectedByMonth`, "Expected this month (n)", "closings expected next month" and the landing
month all depend on today's date and on which reservations are live in Payments. The fixture
says 3 due in September and 6 in October 2026; the live database drifts daily (#50, #59), and on
2026-10-01 the whole strip shifts a month. The unit tests pin the fixture at `ASOF = 2026-09-11`;
the e2e asserts every reservation carries an ISO expected date, that the filter keeps only rows
whose `data-month` is the browser's current month, and that the counters are non-negative numbers
— never the fixture values.

## 72. The Era: Lamar's real turn is on record, so the benchmark is a projection and nothing is graded

`ERA_START = 2026-03-01` scopes the War Plan's cycle length to farms funded on or after that day.
The only farm ever freed, **Lamar (funded 2025-08-21, freed 2026-05-19, 271 days)**, predates it,
so its turn moves to `rotation.excludedCycles` — shown as "freed earlier, on record only" — and
the cycle is the median of the four captive era farms' projected liberations at the current pace:
Freestone 150, Wichita 204, Avery 250, Franklin 346 → **227 days / 7.46 months, Avery the
benchmark** (over the full history it was Lamar's measured 271 / 8.9). A projected benchmark has
no real capital-return curve, so every farm reads **unrated** until an era farm is actually freed
(over the full history five farms graded "behind" and Franklin "on pace" against Lamar). The
rotation headline changes from "every 8.9 months … 5 of the 6 turns cannot complete" to "every 7.5
months … 3 of the 6 turns"; the verdict (6 farms, Jul 2027, $2.8M, 8.2 lots/month) is identical
because the required plan does not depend on the cycle length. The shorter cycle is the honest
reading of today's farms, but it is a projection of a projection (#52) until Wichita or Freestone
is freed.

**Refreshed 2026-09-11 19:17 UTC:** Lamar's turn is no longer on record at all — with
`investor_capital` at $484,000 its $475,000 returned is 98.14 %, not a liberation — so
`excludedCycles` is empty in both eras, the all-time cycle is projected too (Franklin, 325 days /
10.68 months) and the era cycle is **219.5 days / 7.21 months** (Wichita 200, Freestone 150, Avery
239 = benchmark, Franklin 325). The verdict moved with the data (7 farms, $3.3M, 8.43 lots/month),
not with the cycle.

## 73. The Era: Freestone's "150-day cycle" is the day it is fully sold, not the day its capital is back

Freestone (funded 2026-04-14) has sold every lot, so `campaigns.ts` has nothing left to cover and
projects its liberation as "today" (2026-09-11 = 150 days), although none of its capital has been
distributed back yet (0 % returned). That 150 enters the era median above. The all-time benchmark
did not have this problem because Lamar's real date was the median. Documented rather than
patched: the projection is the campaign engine's rule (capital covered by sales → liberated), and
the campaign state already says so ("covered, awaiting payout", the same state Eastland shows as
the next liberation).

## 74. The Era: seasonality is unavailable until 2027-03-01

The month-of-year profile now counts era closings only (**29**, 8 left out) and requires **12
whole calendar months** of history before it is applied at all; the fixture has **6** (Mar 1 → Sep
11, 2026), so the War Plan's Seasonal button is disabled with *"not enough history for
seasonality"* and every plan is flat. Whole months are counted by calendar (`wholeMonthsBetween`),
so the profile switches on the morning of **2027-03-01**, not on 2027-02-28 (11 months). Without
the era the history from the first closing (2025-10-10) would be 11 months — also too short. When
it applies, the era profile peaks at **May ×2.65** (13 of the 29 closings) with Oct–Mar at the 25 %
floor, steeper than the all-time ×2.27 because the 2025 autumn closings no longer fill October and
November; the required plan would then ask ~26 lots of May 2027 against a flat 8.2. The spec's
"fewer than 12 months of data" is read as whole months since `ERA_START`, not as twelve distinct
calendar months with a closing (only five months — April to August — carry one).

## 75. The Era: the per-day figure leaves out the undated Eastland Lot 6

"Actual net profit per day since Mar 2026" is Σ net profit of closings **dated** on or after
2026-03-01 ÷ 194 days = **$1,945,051.41 / 194 = $10,026.04**, against **$6,762.81** over the full
history ($2,272,304.32 ÷ 336 days from the first closing on 2025-10-10). The gap of $327,252.91 is
the 8 dated pre-era closings ($297,718.66) **plus Eastland Lot 6 ($29,534.25)**, a sold lot with no
closing date at all (`missing_closing_date` on `/quality`): a lot with no date cannot be placed on
either side of the era, so it counts in the total and in the all-time per-day (which divides the
whole total) but not in the era rate. If Payments gets its date, it joins whichever side it
belongs to automatically.

**Refreshed 2026-09-11 19:17 UTC:** it did — Eastland Lot 6 closed on **2026-07-09**, inside the
era, so it now counts in the era pace ($10,025.56/day = $1,944,957.82 / 194) and in the trailing
90-day closings (14, 4.73/month); the pre-era gap is exactly the 8 dated 2025–Jan 2026 closings
($291,420.52). Nothing is undated any more.

## 76. The Era: the 90-day windows are inside it, so today's paces did not move

Reservations per month (7.44), closings per month (4.4) and the verdict ("You need 8.31 lots/month;
you are doing 4.4.") are trailing 90-day figures whose window starts on 2026-06-14, after
`ERA_START`; the era only clips a window that reaches back before March 1 and then divides by the
days it really covers (`trailingWindow`: 365 days on the snapshot day → "since Mar 2026 (195
days)"). The labels switch to "since Mar 2026 (N days)" only when that happens, so the Throne Room
and Pipeline still read "trailing 90 days" today. From 2026-05-29 on, the 90-day window has been
entirely inside the era; between March 1 and May 28 it would have been clipped.

## 77. The Era: Franklin 2's future funding date counts in the cadence

The cadence "a farm every **1.51** months" is the mean gap between the five fundings on or after
2026-03-01 — Freestone 2026-04-14, Wichita 04-15, Avery 06-16, Franklin 07-31 and **Franklin 2
2026-10-15**, a closing date still in the future on the snapshot day (its `funding_date` is null,
so `closing_date` stands in). This is the pre-era behaviour kept as it was (the all-time cadence,
1.72 over 9 fundings, counted it too); dropping future dates would give 4 fundings and 1.18
months. The Oracle slider hint says "5 fundings, 4 earlier left out".

## 78. The Era: what stays all-time on purpose

Only rates, averages and trends moved. Deliberately unchanged: every total (net profit to date,
cash realized, capital returned, liberation, the ledger); the **trophies**, which are records
("best month ever" stays the all-time best month — on the fixture it is the same May 2026); the
streak **runs** (current and best consecutive weeks/months, which are a chain, not a rate); the
oxygen ledger's **historical replay** (`goalOn` recomputes the pace as it stood on each closing's
day, so an era clip there would rewrite history — 547 days unchanged); and the Oracle's other
averages — sale price, land cost per lot, note-sale delay, conversion, median days to close, farm
→ first closing — which are per-lot or per-event means rather than paces. They could be scoped the
same way with one option each; left out of scope here so the change stays about pace.

## 79. The Era on live data

Live Payments is the same population as the fixture but has drifted (#50, #59), so the deployed
site shows the same shape with its own figures (read off the live Throne Room, Oracle, War Plan
and Trophies after the deploy): *"$10,026 / day since Mar 2026 (194 days) · $6,656 / day over the
full history since Oct 10, 2025"*; cadence *"1.51 mo since Mar 2026 (5 fundings, 4 earlier left
out)"*; farm cost *"$468,520 recent, since Mar 2026 (Franklin, Avery, Wichita: $46,852/lot) ·
$492,440 all-time"*; capital turn *"219.5 days / 7.2 mo (projected from 4 captive farms funded
since Mar 2026)"* — Avery 7.8 months the benchmark, and **no "on record" line because on live data
Lamar is not freed at all** (98.14 % returned, #52), so the era excludes nothing there; *"not
enough history for seasonality: 6 of 12 months since Mar 2026 (30 closings, 8 earlier left out)"*
with the Seasonal button disabled; headline *"$3.3M … rotating every 7.2 months … 4 of the 7
turns cannot complete"*; best week 7 closings and best month May 2026 (13) "since Mar 2026, 8
earlier closings left out". The e2e checks the labels and the disabled state, not the figures. Two
dates matter: **2027-03-01**, when seasonality switches on by itself, and the day the first era
farm is freed, when the benchmark becomes a measured cycle and grading resumes.

**Refreshed 2026-09-11 19:17 UTC:** the fixture now reproduces these live figures exactly
($10,025.56 / $6,655.89 per day, $468,520 / $46,852, 219.5 days / 7.21 months on Avery, 30 era
closings, "$3.3M … 7.2 months … 4 of the 7 turns"); see PROGRESS.md "Snapshot 2026-09-11 refresh".

## 80. Exodus, Step 1: the lot ledger port and what the RPC returns beyond the rule

`compute_lot_ledger(p_farm_id, p_as_of)` **is callable by the viewer** (HTTP 200 on all 6
fixed-interest farms, 2026-09-11 19:42 UTC), so the stop condition of Step 1 did not fire and the
raw rows are stored in the fixture (`lotLedgers`, 49 lots). `src/domain/lotLedger.ts` matches them
on every lot — capital, accrued interest, credits, outstanding, residual, release date and the
credit list itself — with a worst difference of 7e-12. Four things the rule as written does not
say, recorded here rather than guessed:

1. **`floor_amount`** — the RPC also returns `lot_capital × (1 + rate/100)` (×1.2 on the 20 % farms,
   ×1.25 on Franklin). It is not part of the release rule and does not gate it: Eastland Lot 3 was
   released on 2026-06-11 with credits of $59,525.53 against a floor of $61,636.36. The port does
   not compute it; Exodus never uses it. If Payments ever starts enforcing the floor, the parity
   test will say so.
2. **Franklin 2 has zero capital today.** Its only costs are dated 2026-10-15 (funding day, #77), so
   as of 2026-09-11 every lot shows capital 0, balance 0, `released_at` null, and the RPC's
   `floor_amount` is NaN. For the ledger this means the lots are *not* released (nothing was paid);
   their release cost becomes real on 2026-10-15. Exodus treats those lots as fixed-interest lots
   whose cost appears when the capital lands.
3. **Any note on a lot blocks the cash-closing credit**, including a test note. Payments' rule (c)
   says "no note on that property"; the port applies the same, without filtering `is_test`. On the
   fixture no lot has both a test note and a completed cash case, so parity cannot tell the two
   readings apart. Recorded so nobody "fixes" it silently.
4. **A property with no lot number** (Eastland has one) is a lot like any other: it takes its equal
   share of farm-level costs and accrues interest, so it counts in the release cost of the farm.

Also observed: `credit_detail.kind` uses exactly `down_payment` · `note_sale` · `cash_sale`, which the
port mirrors; the two 2026-09-11 snapshots (19:17 and 19:42 UTC) differ only in Avery Lot 4's stage
("Onboarding de RMLO" → "Aprobado por RMLO", 31 % → 35 %), which no pinned number reads.

## 81. Exodus: which note-sale ratio is the "real" one

The brief asked for `sale_price ÷ (sale_price + discount_from_upb)` when `discount_from_upb` is
populated, else `sale_price ÷ notes.financed_amount`. On the 6 sales that carry it,
`discount_from_upb` equals `100 × (1 − sale_price ÷ current_upb)` within 0.01 on every row — it is a
**percent, not dollars** — so the literal formula gives **99.98 %** and says nothing about the
discount. `noteSaleRatioReal()` computes all of them and the page shows each with its basis: the
**combined 80.92 %** that is used (per sale, the unpaid balance the recorded percent implies when it
is there, else the financed amount), the discount-only **82.75 %** (6 sales), the financed-only
**80.45 %** (15 sales) and the literal 99.98 %. The Oracle's `noteSalePct` stays the fallback if
`note_sales` were ever empty. The input is editable, so a different reading costs one keystroke; the
discount saved and the sale proceeds move with it (at 30 %, $572,400 = $3,000,000 × (1 − 0.8092)).

## 82. Exodus: Portafolio starts the loop with $0

Payments records no bank balance. The War Plan's cash mode starts from *cash kept − owed today*
($1,362,503.84 − $4,801,191.96 = **−$3,438,688.12**), which is a position toward sponsors, not money in
an account, and the Exodus must not pay LPs out of it. `startingCash` defaults to 0 and both real
figures are shown beside the input; the "sources" bridge on the page carries the $3,438,688.12 as its
first line so the War Plan's cash-at-deadline and the Exodus cash paid to LPs reconcile (#83). Anyone
who knows the real balance types it in.

## 83. Exodus: production is the War Plan's cash-mode plan, and the two are reconciled to the cent

Exodus does not invent its own pace: `prepareExodus` solves the War Plan for the LP capital in
`cash_in_bank` mode with the same deadline and replays its inventory consumption month by month
(today's 83 lots first, then each farm's lots as they land). `reconcileWithWarPlan` checks that the
replay closes the same 259.36 lots, buys the same 18 farms and spends the same $864,541.07 of ads,
rebuilds the Oracle's cash metric from the replay (**$10,005,937.39 vs the plan's $10,006,139.81**,
drift −$202.42, #94) and explains the gap to the 0 % baseline's $12,401,779.56 cash to LPs line by
line: starting position +$3,438,688.12 (#82) · receipts −$77,147.76 (Exodus sells each projected note
three months after closing at 80.92 % of its amortized balance; the Oracle books `noteSalePct` of
face) · existing notes +$1,034,918.91 (today's 24 live notes, which the Oracle never counted, all
sold at 0 % net of their partners' share) · partner
payments −$1,136,076.03 (#87) · settlement spend $0 · ads −$864,541.07 · unpaid carry $0 · replay
drift −$202.42 · **residual $0.00**. The test `notesPct = 0 equals War Plan cash-mode result` pins
all of it.

## 84. Exodus: capital that is committed before Payments books it

Two farms have partner capital that the ledger does not yet see as a cost: **Franklin 2** (closing
2026-10-02 since the 21:17 UTC correction; its only `property_costs` rows are dated 2026-10-15, #80)
and **Lakeview** (Townson, $495,000, `funding_date` null, no cost rows at all). Exodus treats both as
owed from day one: `lotClaimAt` counts every capital entry the ledger knows regardless of its date
(interest still accrues only from each entry's own date, so Franklin 2 accrues at 25 % from
2026-10-15), and Lakeview's $495,000 is the capital its lot proceeds must return before Townson's
50 % split applies. The alternative — pretending the lots are free until the cost row lands — would let
the September plan deliver Franklin 2 notes at no cost, which is not what a partial release means.

## 85. Exodus: notes with no farm and the excluded note produce no cash

Thirteen active, unsold notes ($1,031,429.19 of UPB) sit on properties that are not on any
`farm_acquisitions` row (houses and other lines); one more, **EAS-L04** ($42,050.43), is excluded by
default (`EXODUS_DEFAULT_EXCLUDED_NOTE_CODES`, "in dispute"). The model neither delivers nor sells
them: their proceeds would be real cash, but nothing in Payments says whose farm economics they
follow, so counting them would invent a waterfall. They are listed on the page under "No farm" and
"Excluded" so the omission is visible. Removing EAS-L04 from the input puts it back in play as a
fixed-interest note on Eastland.

## 86. Exodus: what kind of farm a War Plan farm is

The War Plan funds each new farm from the investor mix in order, so a farm can straddle two sponsors
(Farm 3: Kevin Concua $151,288 + Townson Family $317,232; Farm 8: Townson $4,688 + Julio Arriola
$463,832) or be partly or wholly **unfunded** (Farms 11–18, $3,669,756 in total). Exodus classifies
each farm by its **largest slice**: own capital → notes free; profit share → never delivered; fixed
interest → deliverable after a release at the slice-weighted rate, with unfunded capital counted as
fixed interest at the mix's first fixed rate (Kevin's 20 %). On this data that is 13 releasable farms,
5 Townson farms and none on own capital. A farm-level rule was chosen over a per-dollar split because
a note is either delivered or sold; the bridge (#83) absorbs whatever the rule costs.

## 87. Exodus: the profit-share waterfall returns capital first

On a profit-share farm (Wichita, Lamar, Lakeview, Farms 3–7) Exodus routes each lot's proceeds to
**return Townson's capital on that farm first**, then splits the rest at the farm's share (50 %). The
Oracle and the War Plan book Townson's take as gross × 50 % from the first dollar. Neither reading is
in Payments' schema; the liberation board measures Townson by capital returned, which is the reading
Exodus follows. The two differ by $1,136,076.03 on the 0 % baseline ("partner payments" in the
bridge, #83) — this is the largest single judgment call in the page's cash figure.

## 88. Exodus: unsold fixed-interest lots still carry a partner balance at the deadline

At 30 %, 3.64 fixed-interest lots are never sold by 2027-12-31 and carry **$193,280.12** of partner
balance (`unsoldLotsAtDeadline`); at 0 % the same. Exodus reports it in the sources block and does
not pay it — the War Plan does not either, and paying it would be a choice about what happens after
the LPs are settled, which the model leaves alone.

## 89. Exodus: ads come out of Portafolio cash

The War Plan's `adSpendPerClosing × closings` ($43,341 in September 2026, $68,433 in a full month,
$864,541.07 in total) is paid every month before any dollar reaches the LPs (step 3 of the loop). The
War Plan's cash mode deducts the same amount, so the bridge carries it as a named line rather than a
difference.

## 90. Exodus: what a future note looks like and when an undelivered note is sold

Every projected note — pipeline closings, required-pace closings, new farms — gets the realm's real
averages: face **$117,504.74** (avg sale price $127,335 − 7.72 % down), **9.46 %** (mean
`interest_rate` of the 39 non-test farm notes), **140 months**, level payment **$1,388.87**; its UPB
amortizes monthly from its closing month. Today's 24 live notes use their own `current_upb`,
`interest_rate` (a fraction) and `monthly_payment`, and their remaining term is `term_months` minus
the months since `start_date`. A note that is not reserved for delivery is sold `noteSaleLagMonths`
(3) after its closing; for today's notes that is `start_date + 3 months`, or the first month of the
loop when that is already past (most of them). The 6 Townson notes (CLA-*) are sold in months 2–3.

## 91. Exodus: buying a farm with own cash never wins on this data

An own-cash farm is one of the War Plan's farms bought with Portafolio cash instead of the plan's
funding, so that every note it produces is free; it is only viable when its purchase month is at or
before `deadline − land lag (3) − close lag (2)`, i.e. **Jul 2027** (shown in the verdict footer). It
competes in the same ranking as partial releases — settlement per dollar, ties to the earliest date —
and a 10-lot farm at $468,520 would settle ≈ 2.5× (10 × $117,505 of free notes), which would beat the
cheaper releases. It never happens on this data because a farm is bought whole, in its own purchase
month, and Portafolio never holds $468,520 then: at 30 % the cash in is $243,193 in Sep 2026 (all
spent on releases), $127,799 in Oct (Farms 1–2's month), $34,041 in Nov, $160,613 in Dec, and the
note target is met in Jan 2027, after which nothing is bought; at 60 % Sep–Nov even run a small
deficit on ads and the target is met in Feb 2027. `cashFarms` is therefore empty at every percent
from 0 to 60. The engine and the "Farm N (own cash instead of …)" label are exercised by
`exodus.test.ts`; the fixture simply never needs them.

## 92. Exodus: `maxNotesPct` is the slider's ceiling

`scanNotesPct` runs every percent from 0 to `EXODUS_NOTES_PCT_MAX` (60) and keeps the highest one
whose notes and cash cover the LP capital by the deadline. On this data all 61 points are feasible, so
`maxNotesPct` = **60** and the mark sits at the right end of the track. It is a real search — shorten
the deadline or raise the ratio input and it moves — not a constant.

## 93. Exodus: "lots not needed" is 0 at 30 % and 8.28 at 60 %

`lotsNotNeeded` compares the lots closed until the capital is back under 100 % cash with the lots
closed until it is back with notes. Both the 30 % plan (2027-10-05) and the baseline (2027-10-23)
finish after the War Plan's last closing month (Sep 2027), so all 259.36 lots are closed either way
and the saving shows up only as "0.59 months earlier". At 60 % the capital is back on 2027-09-18,
inside the closing months, and 8.28 lots are spared. The measure is month-granular by construction.

## 94. Exodus: the replay drifts $202.42 from the Oracle's own metric

Rebuilding the War Plan's cash-at-deadline from the replayed consumption gives $10,005,937.39 against
the plan's $10,006,139.81 — a **−$202.42** drift on $27M of receipts, from the plan's rows being
rounded to cents and its farms landing on month boundaries. It grew from $144.82 with 7 farms to
$202.42 with 18; the test tolerance is $250 and the bridge pins the exact figure so any change is
visible. It is not a bug to fix silently: the Oracle's rounding is what the War Plan page shows.

## 95. Exodus: today's notes are released whole

The brief allows fractions of notes; the model delivers a fraction of a *projected batch* freely, and a
fraction of the **last existing note** when the target needs less than a whole one — but a lot is
released whole or not at all (`indivisible`), because a partial release in Payments pays a lot's
outstanding balance, not a share of it. The undelivered remainder of that last note is sold the same
month. Inherited from #80 without change: any note on a lot (test notes included) blocks the
cash-closing credit, and Eastland's unnumbered property is a lot like any other.

## 96. Exodus on live data: Payments moved twice on 2026-09-11

The fixture was refreshed at 19:17 UTC (Step 0), re-fetched at 19:42 UTC with the RPC ledgers
(Step 1), and refreshed again at 21:31 UTC after Payments changed at 21:15–21:17 UTC (Lakeview,
Franklin 2 → Julio Arriola, Titus Lot 6 re-priced — PROGRESS.md "Second refresh the same day"). The
deployed page read at 22:11 UTC reproduces the 21:31 fixture **to the dollar**: verdict *"Con 30% en
pagarés ($3.0M entregados): liberar $684K mediante 5 liberaciones parciales por $203K, no comprar
fincas con efectivo propio, vender 255 pagarés y pagar $10.0M a los LP en efectivo."*, discount
saved $572,400, capital back Oct 5, 2027 vs Oct 23, 2027, `maxNotesPct` 60. The live page computes
with today's date, so the release costs grow a few dollars a day (EAS-L01 $50,963 today,
$51,498 at the end of September) and the same snapshot will read differently tomorrow; the e2e asserts
shape (a dollar amount, 30 → 0 changes the verdict, $0 discount saved), never these figures.

## 97. Access: `profiles` is readable under RLS — and more widely than Quest needs

Checked on 2026-09-11 before building the gate, signed in as the questbot viewer with the anon key:
`select id, role from profiles where id = <own auth id>` returned **1 row, role `viewer`**, no error
— so the gate could be built as specified and nothing had to be worked around. The same login can
also `select id, role from profiles` **without a filter** and gets every row: 13 (7 `admin`,
5 `investor`, 1 `viewer`). Quest only ever asks for its own row (`fetchOwnProfile`, `.eq("id", …)
.limit(1)`, columns `id, role`), but the policy itself is Payments' to judge: is a viewer meant to
see every profile's role? Nothing else in `profiles` was read; its other columns are unknown to Quest
(payments_schema.md lists only these two).

## 98. Access: no admin credentials, so the admin path is verified by tests, not by a real sign-in

The only login available here is the questbot (`viewer`). The rule `role === 'admin'` is pinned in
`access.test.ts`; the e2e and `verify:live` prove the **refusals** (a `viewer`, an `investor` and a
`note_buyer`, staged on the wire — see #99) and the **acceptance of the allowed e-mail** (the questbot
enters). The first real `admin` sign-in on production has not been performed by me; if an admin is
refused, the message will be the plain sentence (role read but not `admin`) or the sentence plus
"Your profile could not be read: …" (RLS/network), which tells the two cases apart.

## 99. Access: how a non-admin is staged, and why `note_buyer` is covered without a row

The e2e cannot sign in as anyone but the questbot, so a non-admin is staged at the network layer:
the real Supabase token response is fetched and its `user.email` rewritten to an address the gate
does not know (so the questbot's real `viewer` role decides), and for `investor` / `note_buyer` the
real `profiles` response has its `role` rewritten too. The app then sees exactly what it would see
for such a user. This relies on supabase-js building `session.user` from the response body (which it
does) rather than from the JWT claims; if that ever changes the staging, not the gate, needs updating.
No `profiles` row carried `note_buyer` on 2026-09-11 (#97); the rule is an allow-list of one value
(`admin`), so `note_buyer`, an unknown future role, a `NULL` role and a missing row are all refused.

## 100. Access: the allowed test e-mail is visible in the browser bundle, by design

`QUEST_ALLOWED_TEST_EMAIL` is a build-time constant (Vite `envPrefix` `VITE_` + `QUEST_ALLOWED_`),
so the questbot's address is readable in `dist/assets/index-*.js`. It is an e-mail address, not a
credential: entering still needs its password, which never reaches the bundle (checked by grepping
`dist/` for the password value and for the names `QUEST_TEST_EMAIL` / `QUEST_TEST_PASSWORD` — none
present). A server-side allow-list would need a function or a table write, which Quest may not do.
The variable is set on Vercel for production and preview as a hidden Secret (2026-09-11).

## 101. Access: the gate protects the app, RLS protects the data

The check runs in the browser. Anyone holding a valid Payments login can still read whatever RLS
lets that login read through the REST API directly, with or without Quest — which is exactly how
`npm run snapshot` works with the questbot. Quest cannot tighten that; whether the realm tables
should be readable by non-admin roles at all is a question for Payments' RLS. What the gate
guarantees is that Quest itself renders nothing, and fires no realm query, for anyone but an admin
or the allowed e-mail (`RequireAuth` waits for `granted`; `useRealm` is disabled until then).

## 102. Access: decisions inside the gate that were not specified

- Role match is exact: `'admin'` in lower case, untrimmed (`Admin`, `ADMIN`, `' admin'` are refused).
  Every observed value is lower case (#97). The e-mail match is case-insensitive and trims whitespace.
- A profile that cannot be read (RLS error, network) is treated as **not admin** (fail closed), with
  the sentence followed by the error text so the cause is visible.
- The refused sign-out uses `scope: "local"` — this browser only — so a refused attempt never revokes
  the same account's sessions elsewhere (a `global` sign-out would also have killed the e2e's own
  stored session mid-run). The drawer's "Sign out" button keeps the default global scope.
- The check runs once per page load per user (one `profiles` request); token refreshes re-use the
  verdict. `access` is derived from a stored verdict, not set in an effect: the first render after a
  persisted session loads must already read "checking", or `RequireAuth` bounces through `/login`
  (this happened once and five e2e tests caught it; a regression test now watches the navigations).
- An empty or unset `QUEST_ALLOWED_TEST_EMAIL` admits admins only; it is never a wildcard.

## 103. Access: what the first live run of `verify:live` taught about the gate in two tabs

The first `verify:live` against the deployed gate failed after "✓ signed in": the gate check and the
main tab shared one browser context, so when the staged non-admin signed in, the main tab — open at
`/login` — received the same session through shared storage, ran its own `profiles` check, was refused
too and sent a second `/auth/v1/logout?scope=local`, which Supabase answered **403** (the session was
already gone; supabase-js ignores 401/403/404 on sign-out, but the browser logs the failed request as a
console error). Behaviour to expect in real use: if a non-admin signs in while another Quest tab sits
on `/login`, both tabs show the refusal and one logout may 403 harmlessly. The script now runs the gate
check in its own context. Second lesson: where a sign-in lands depends on the deep link the browser
came from (`state.from`, kept by Chromium across a same-URL `goto` of `/login`), so the script asserts
"not `/login`" after signing in and then navigates to `/` explicitly for the Throne Room figures.

## 104. Pace labels: the Throne's 8.44 is the ledger average, not the War Plan's 8.5

The request treated the Throne verdict ("You need 8.44 lots/month") as the War Plan model (each new
farm pays its own real deal terms) and the Oracle required pace as a replay of today's mix. The
numbers do not match that pairing: `goal.requiredLotsPerMonthToHitDeadline` is `lotsStillNeeded ÷
monthsToDeadline` at the historical average net profit per closed lot (8.44 on the 21:31 fixture;
`expected.requiredClosingsPerMonth` is the same figure). The War Plan's required plan solves for
the smallest pace under each new farm's real deal terms and lands at **8.5**. The Oracle
`required_pace` future uses the Oracle's own net-profit-per-lot (`closingsOnly.result.lotsNeeded ÷
whole months left`) — a replay of today's mix. Labeling the Throne 8.44 "per the War Plan's real
deal terms" would have put two different numbers under the same model. Copy only, no math change:
Throne verdict (when it is a "You need") and the required-pace line read **"from the ledger
average"**; `/warplan` verdict and the required / +1-buffer "Lots / month" cells read **"per the
War Plan's real deal terms"**; the Oracle required-pace card reads **"replaying today's mix"**.

## 105. Live Throne numbers moved overnight (2026-09-11 → 2026-09-12)

`verify:live` after the labeling deploy read net profit **$2,235,850** (was $2,236,378 at 22:08 UTC),
trapped **$1,102,974** (was $1,103,375), and **"You need 8.46 lots/month"** (was 8.44). The as-of
date on the page is Sep 12; days left 475 (was 476). Capital outstanding Stat and Debt stayed
**$4,145,355.48**, own capital **$800,000**. The 8.46 is still `lotsStillNeeded ÷ monthsToDeadline`
(ledger average); it is not a math change. Not forced back to 8.44.

## 106. Exit horizon: `farmsStillNeeded` does not move

The request listed "farms still needed" with the deadline-derived figures that must change when
the horizon switches. `computeGoal.farmsStillNeeded` is `ceil(inventoryGap / avgLotsPerFarm)` and
does not read the deadline — `lotsStillNeeded` is remaining net profit ÷ average net profit per
closed lot. The existing math is unchanged. The unit test therefore asserts the three horizons
share the same `farmsStillNeeded` and that the War Plan's last purchase date and required
lots/month are what move. Do not "fix" the formula to make the farm count depend on the year.

## 107. Exit horizon: the On Track trophy can flip

`computeTrophies` has a trophy earned when `goal.onTrack === true` (projected date on or before
the deadline). A longer horizon can flip that flag without any new closing. Trophy *count* stays
the same (the list is fixed); historically earned trophies (closings, notes, streaks) do not
move. The unit test asserts count and leaves the on-track flag as deadline-derived, which it
already was.

## 108. Exit horizon: saved War Plan / Exodus scenarios do not write the global year

Loading a named scenario from localStorage restores the deadline that scenario was saved with.
That is correct — those pages are scenario tools with their own date fields. The loader must not
call `setHorizon`, or picking an old 2027 scenario would silently move the whole app. Changing
the global horizon while the page is open *does* re-seed the inputs from the new defaults
(stale inputs from the previous year are a bug).

## 109. Pulse: PRODUCING is the Oxygen pace, not the Debt's actual-per-day

The Pulse's PRODUCING figure is `oxygen.netProfitPerDayAtPace` (avg net profit per closed lot ×
trailing closings/month × 12 ÷ 365.25). The Debt card still shows `actualNetProfitPerDay` (net
profit of era-scoped closings ÷ calendar days since the era start). Those are different models
and different dollars (fixture: $9,145.63 vs $10,025.56). The request named the Oxygen field
explicitly. NEEDED is the Debt's `requiredNetProfitPerDay`. Do not blend the two "actual" paces
under the same label.
