import type { FarmEconomics } from "./farm";
import type { GoalStatus } from "./goal";
import { round2 } from "./math";
import { daysBetween, parseDate } from "./dates";

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
  /** What the realm has actually earned per calendar day since its first closing. */
  actualNetProfitPerDay: number | null;
  /** Interest still accruing daily on fixed-interest capital that has not been returned. */
  interestPerDay: number;
}

export function computeDebt(farms: FarmEconomics[], goal: GoalStatus, firstCloseDate: string | null): Debt {
  const owed = farms.filter((f) => f.dealType !== "own_capital");
  const own = farms.filter((f) => f.dealType === "own_capital");
  const capitalOwed = round2(owed.reduce((s, f) => s + f.capitalOutstanding, 0));
  const daysLeft = Math.max(0, goal.daysToDeadline);

  let actual: number | null = null;
  const start = parseDate(firstCloseDate);
  const asOf = parseDate(goal.asOf);
  if (start && asOf) {
    const days = daysBetween(start, asOf);
    if (days > 0) actual = round2(goal.netProfitToDate / days);
  }

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
    actualNetProfitPerDay: actual,
    interestPerDay,
  };
}
