# AUDIT.md — Quest v2 numeric model decisions

Documented after the Engine / Throne / Pipeline / Treasury label pass. Domain math lives in `src/domain/`; this file records which figure the UI treats as authoritative and why two nearby numbers can disagree without either being wrong.

## 1. Era vs lifetime $/lot (Engine + Throne pace)

**Decision:** the Engine and forecast path default to the **era average** (`profitBasis: "era"` → `goal.recentAvgNetProfitPerClosedLot`). Lifetime (`goal.avgNetProfitPerClosedLot`) stays available and is always shown beside it.

| Basis | Field | What it counts |
|---|---|---|
| Era (default) | `recentAvgNetProfitPerClosedLot` | Closings on or after `ERA_START` only |
| Lifetime | `avgNetProfitPerClosedLot` | Every sold lot in the ledger |

Era excludes pre-operation closings and is the better estimator of today's business. The Throne Room pace block shows both side by side (`data-testid="pace-era-avg"` / `pace-lifetime-avg`). The Engine exposes a visible toggle labeled "Era average (default)" vs "Lifetime average".

Derived pace fields for each basis:

- Lifetime: `lotsStillNeeded`, `requiredLotsPerMonthToHitDeadline`, `projectedDate`
- Era: `lotsStillNeededRecent`, `requiredLotsPerMonthToHitDeadlineRecent`, `projectedDateRecent`

`farmsStillNeeded` / `farmsStillNeededRecent` are no longer per-basis. Both are overwritten by `pathToGoal.farmsToBuy` (the War Plan required rotation schedule).

### One projected exit date at current pace

**Decision:** the authoritative "projected exit date at current pace" is the **era** date (`goal.projectedDateRecent`, fixture `2028-10-22`). It is computed in one domain function — `projectedExitAtCurrentPace()` in `src/domain/pathToGoal.ts` — as `projectedDateRecent ?? projectedDate` (lifetime only when there is no era average). Formula: remaining ÷ era average net profit per lot ÷ trailing closings per month.

Throne Room, Oracle, Council, Exodus and the platform export all read `realm.pathToGoal.projectedExitAtCurrentPace`. The verdict and `onTrack` use the same date.

Other dates that remain on screen must state the assumption that makes them differ:

| Date on screen | Fixture | Assumption that differs |
|---|---|---|
| Projected exit at current pace | 2028-10-22 | Authoritative — era $/lot, trailing closings/month, no reservations first |
| Throne lifetime "lands" | 2029-01-08 | Uses every closed lot's $/lot, including pre-operation closings |
| Oracle current-pace card | 2028-01-11 | Lets every live reservation close on its expected date first, then the trailing pace |

## 2. Conversion: resolved vs blended vs open

Three figures from `pipeline.conversion`, never blended into one silent number:

| Label | Field | Formula / meaning | Used for forecasts? |
|---|---|---|---|
| **Resolved** | `resolvedPct` | `closed ÷ (closed + cancelled)` — open matured reservations excluded | **Yes** (Expected, Engine, War Plan, Council) |
| **Still open** | `stillReserved` | Count of matured reservations that have not closed or cancelled | No — inventory of unfinished deals |
| **Blended** | `pct` (and `pctWithCancellations`) | Includes unresolved reservations in the denominator | Display / audit only |

`expected.conversionSource` is usually `"resolved"` when a matured cohort exists. The Throne committed card and Pipeline page state which figure feeds forecasts.

## 3. Treasury gap = `totalOtherNoteSales`

**Cash realized** (`goal.cashRealized`) is **farm-lot cash only** (down payments + note sales tied to farm lots).

**Treasury cash in** (`treasury.totalCashIn`) = farm-lot cash **plus** other note sales:

```
cashRealized + totalOtherNoteSales (+ undated) = totalCashIn
```

The gap is `treasury.totalOtherNoteSales` — note sales on notes that are not farm lots. The known live row that opens this gap is the **Benwood Ave house note at $57,000**. The UI shows the dollar amount from `totalOtherNoteSales` without inventing addresses; this audit names Benwood Ave as the known non-farm note.

UI: `data-testid="treasury-cash-reconcile"` on Throne and Treasury when `totalOtherNoteSales > 0`.

## 4. Throne vs Engine (inventory / capital caps)

They answer different questions. When they disagree, the UI must say why (`reconcileThroneAndEngine` in `src/domain/reconcile.ts`, shown with `data-testid="engine-throne-reconcile"`).

| | Throne Room | The Engine |
|---|---|---|
| Model | Unconstrained pace | Inventory- and capital-constrained |
| $/lot | Ledger / era averages on the pace lines | `inputs.profitBasis` (era default) |
| Farms still needed | Inventory gap at $/lot (`farmsStillNeeded` / `farmsStillNeededRecent`) | Farms the capital-turn schedule can fund (`farmsNeeded` / `farmsBought`) |
| Net at deadline | Pace × months × $/lot (no land or raise cap) | `netProfitAtDeadline` after inventory dry-outs and capital turns |

**Dollar reason (when they disagree):** the Engine caps sales at available inventory and capital turns; the Throne Room assumes lots are always available.

**Farm reason (when they disagree):** the Throne counts farms from the inventory gap at the ledger $/lot; the Engine counts farms the capital-turn schedule can fund before the deadline.

Rotation labels on the Throne also separate two capital concepts that used to read as the same number:

- `rot.capitalOutstanding` — today's captive sponsor capital (excludes own-capital farms)
- `plan.peakOutstanding` — peak in the war-plan buy schedule across planned farms (not today's outstanding)

Benchmark months shown on the Throne use `rot.cycleMonths` (the same median the Engine seeds), not `rot.benchmark.months` alone.

## 5. Interest carry on existing outstanding is display-only

**Traced before changing the model.** `goal.remaining` is `$7,763,621.66` at 2027, 2028 and 2029. Interest on today's outstanding to each deadline is `$609,260.96` / `$1,077,726.32` / `$1,544,911.72` (`interestPerDay` × `daysLeft`, fixture `interestPerDay` `$1,279.96`). Extra versus the 2027 exit: **`$0` / `$468,465.36` / `$935,650.76`**.

Where future interest on the **existing** book is (not) deducted:

| Figure | Deducts existing-book carry? | What it actually is |
|---|---|---|
| `goal.remaining` | **No** | `max(0, $10M − netProfitToDate)`. Historical closings only. Same at every horizon. |
| `lotsStillNeeded` / `lotsStillNeededRecent` | **No** | `ceil(remaining ÷ $/lot)`. Same remaining, same $/lot, same count at every horizon. |
| War Plan `cumulativeNet` / `targetAtDeadline` | **No** | Oracle month series: closings × (price − land) × (1 − new-farm take). New-farm interest is inside that take. Existing outstanding carry is not subtracted. Fixture cumulative net stays ~`$10M` at all three horizons once the required pace hits. |
| Engine `netProfitAtDeadline` | **No** | `cumulativeNetProfit − ad spend`. Monthly interest is accumulated as `totalInterest` (a side figure and a share-of-profit hint) and is **not** subtracted from reachable profit. Engine `totalInterest` grows with horizon (`$766,251.76` / `$1,288,950.90` / `$1,808,632.22`) because the Engine also accrues on new-farm outstanding in the current-pace series. |

**Decision: do not change the model.** The extra interest of a later exit is a cost of staying outstanding longer, not a reduction of remaining or of lots still needed. Throne Room and War Plan show a visible note with the extra versus 2027. Helpers: `interestCarryToDeadline()` and `extraInterestVersus2027()` in `src/domain/pathToGoal.ts`.

## 6. Engine capital-deadline marker vs projected purchases

**Neither the marker nor the buy schedule is wrong.** They answer different questions.

| Piece | Function / field | Meaning |
|---|---|---|
| Marker | `capitalDeadlineMonth(deadlineIndex, cycleMonths)` → `figures.capitalDeadlineMonthIndex` | Last month **fresh** capital can arrive and still complete a full turn (`purchase + cycle ≤ deadline`). |
| Schedule window | `buyThrough = max(capDeadline, deadlineIndex)` | Recycled capital may still buy after that month, through the exit deadline. |

`greedyBuySchedule` is called with `buyThrough`, so a projected farm whose `purchaseMonth` is after `capitalDeadlineMonthIndex` is a **recycled** buy in the post-fresh window. The old "Capital turns" chart looked broken because those bars sat past the gold line while the hint said capital had to land before it.

**Decision:** keep the schedule and the marker. The table hint states that the deadline is the last month fresh capital can complete a turn, not a ban on later recycled buys. `EngineTurnRow.afterFreshDeadline` flags those rows for audit.

Existing-farm return months use `allocateExistingFarmSales`: the company `salesPace` is shared in sell-order (fewest remaining lots first, then name). Monthly Σ lots closed across farms never exceeds `salesPace`, and the last existing farm returns at `ceil(total remaining ÷ pace)` — the same horizon as `inventoryMonths`. Projected farms are always `Projected farm N` in the domain (UI i18n: "Projected farm N" / "Finca proyectada N"); they never inherit an existing farm's name. The empty "Inventory on hand" lane is omitted.
