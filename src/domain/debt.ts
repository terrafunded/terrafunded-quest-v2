import type { FarmEconomics } from "./farm";
import type { GoalStatus } from "./goal";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import { round2, sum } from "./math";
import { daysBetween, parseDate, toIsoDate } from "./dates";
import { resolveEra, type EraStart } from "./era";

/** THE DEBT — what the realm still owes and what it must earn every day (Phase 2 §1). */
export interface Debt {
  asOf: string;
  deadline: string;
  /** Σ (investor_capital − capital_return distributions) over farms not funded with own capital. */
  capitalOwed: number;
  /** Own capital (Terrafunded's) still tied up in unsold farms; shown separately, never blended. */
  ownCapitalOutstanding: number;
  /** Number of sponsor positions still owed anything. */
  openPositions: number;
  daysLeft: number;
  remainingNetProfit: number;
  /** remaining ÷ daysLeft — recomputes daily because it is a function of `asOf`. Null once the deadline has passed. */
  requiredNetProfitPerDay: number | null;
  /**
   * What the realm has actually earned per calendar day: the net profit of the closings since
   * `actualSince` ÷ the days since then. `actualSince` is the era start (config ERA_START) when
   * closings predate it, otherwise the first closing.
   */
  actualNetProfitPerDay: number | null;
  /** ISO date the per-day figure is measured from. */
  actualSince: string | null;
  /** Net profit of the closings counted in `actualNetProfitPerDay`. */
  actualNetProfit: number;
  /** Calendar days the per-day figure is averaged over. */
  actualDays: number;
  /** True when the era start left closings out of the per-day figure — the number then reads "since Mar 2026". */
  actualEraClipped: boolean;
  /** "since Mar 2026" when clipped; null otherwise. */
  actualSinceLabel: string | null;
  /** The same figure over the whole history (net profit to date ÷ days since the first closing), for the record. */
  actualNetProfitPerDayAllTime: number | null;
  /** ISO date of the first closing ever. */
  firstCloseDate: string | null;
  /** Interest still accruing daily on fixed-interest capital that has not been returned. */
  interestPerDay: number;
}

export interface DebtOptions {
  /** Era start (ISO) the per-day figure is measured from; `null` measures since the first closing. Default: config ERA_START. */
  eraStart?: EraStart;
}

export function computeDebt(farms: FarmEconomics[], goal: GoalStatus, lots: Lot[], opts: DebtOptions = {}): Debt {
  const owed = farms.filter((f) => f.dealType !== "own_capital");
  const own = farms.filter((f) => f.dealType === "own_capital");
  const capitalOwed = round2(owed.reduce((s, f) => s + f.capitalOutstanding, 0));
  const daysLeft = Math.max(0, goal.daysToDeadline);
  const asOf = parseDate(goal.asOf);

  const sold = lots.filter((l) => isSold(l) && l.closeDate);
  const firstCloseDate = sold.map((l) => l.closeDate as string).sort()[0] ?? null;
  const firstClose = parseDate(firstCloseDate);
  const era = asOf ? resolveEra(asOf, opts.eraStart) : null;

  const perDay = (from: Date | null, netProfit: number): { perDay: number | null; days: number } => {
    if (!from || !asOf) return { perDay: null, days: 0 };
    const days = daysBetween(from, asOf);
    return { perDay: days > 0 ? round2(netProfit / days) : null, days: Math.max(0, days) };
  };

  const allTime = perDay(firstClose, goal.netProfitToDate);
  const clipped = era !== null && firstClose !== null && firstClose < era.startDate;
  const since = clipped ? era.startDate : firstClose;
  const actualNetProfit = clipped
    ? round2(sum(sold.filter((l) => (parseDate(l.closeDate) as Date) >= era.startDate).map((l) => l.netProfit)))
    : goal.netProfitToDate;
  const actual = perDay(since, actualNetProfit);

  const interestPerDay = round2(
    owed
      .filter((f) => f.dealType === "fixed_interest" && f.capitalOutstanding > 0 && f.monthsSinceFunding !== null)
      .reduce((s, f) => s + (f.capitalOutstanding * (f.annualRatePct / 100)) / 365, 0),
  );

  return {
    asOf: goal.asOf,
    deadline: goal.deadline,
    capitalOwed,
    ownCapitalOutstanding: round2(own.reduce((s, f) => s + f.capitalOutstanding, 0)),
    openPositions: owed.filter((f) => f.capitalOutstanding > 0).length,
    daysLeft,
    remainingNetProfit: goal.remaining,
    requiredNetProfitPerDay: daysLeft > 0 ? round2(goal.remaining / daysLeft) : null,
    actualNetProfitPerDay: actual.perDay,
    actualSince: since ? toIsoDate(since) : null,
    actualNetProfit,
    actualDays: actual.days,
    actualEraClipped: clipped,
    actualSinceLabel: clipped ? era.since : null,
    actualNetProfitPerDayAllTime: allTime.perDay,
    firstCloseDate,
    interestPerDay,
  };
}
