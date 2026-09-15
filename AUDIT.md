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

- Lifetime: `lotsStillNeeded`, `farmsStillNeeded`, `requiredLotsPerMonthToHitDeadline`, `projectedDate`
- Era: `lotsStillNeededRecent`, `farmsStillNeededRecent`, `requiredLotsPerMonthToHitDeadlineRecent`, `projectedDateRecent`

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
