import type { FarmEconomics } from "./farm";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import { addMonths, daysBetween, monthsBetween, parseDate, toIsoDate } from "./dates";
import { mean, round2, sum } from "./math";
import { inEra, trailingWindow, type EraStart } from "./era";
import type { QualityLang } from "./quality_human";
import { DAYS_PER_MONTH, GOAL_DEADLINE, GOAL_NET_PROFIT, TRAILING_WINDOW_DAYS } from "../config/goal";

export interface GoalStatus {
  goal: number;
  deadline: string;
  asOf: string;
  netProfitToDate: number;
  netProfitInPipeline: number;
  grossProfitToDate: number;
  investorTakeToDate: number;
  revenueToDate: number;
  cashRealized: number;
  /** Net profit recognized but not yet in the bank (profit on paper). */
  profitOnPaper: number;
  capitalOutstanding: number;
  remaining: number;
  pctComplete: number;
  daysToDeadline: number;
  monthsToDeadline: number;
  closedLots: number;
  reservedLots: number;
  availableLots: number;
  noteSoldLots: number;
  /** Lots that closed inside the trailing window. */
  closedLotsTrailing: number;
  /** Width of the trailing window asked for. */
  trailingWindowDays: number;
  /** Days the window really covers: `trailingWindowDays`, or fewer when the era start (config ERA_START) cut it short. */
  trailingDays: number;
  /** First day the window counts (ISO). */
  trailingSince: string;
  /** True when the window was clipped at the era start — the pace then reads "since Mar 2026". */
  trailingEraClipped: boolean;
  /** closedLotsTrailing per month over `trailingDays`. */
  closedLotsPerMonth: number;
  avgNetProfitPerClosedLot: number | null;
  /** null when there is no profit history to extrapolate from. */
  lotsStillNeeded: number | null;
  /** null when pace is zero. */
  monthsAtCurrentPace: number | null;
  projectedDate: string | null;
  requiredLotsPerMonthToHitDeadline: number | null;
  /**
   * The second average the audit compares (F4): net profit per closed lot over the closings since
   * the era start only. `avgNetProfitPerClosedLot` keeps every sold lot and stays the goal
   * arithmetic; this one sits next to it so the disagreement is visible, never blended in.
   * Null without an era (config ERA_START, or `eraStart: null`) or without an era closing.
   */
  recentAvgNetProfitPerClosedLot: number | null;
  /** Closings since the era start behind `recentAvgNetProfitPerClosedLot`. */
  recentClosedLots: number;
  /** ISO era start the recent figures count from; null without an era. */
  recentSince: string | null;
  /** "since Mar 2026"; null without an era. */
  recentSinceLabel: string | null;
  /** ceil(remaining ÷ recentAvgNetProfitPerClosedLot). */
  lotsStillNeededRecent: number | null;
  /** lotsStillNeededRecent ÷ closedLotsPerMonth — the same trailing pace, the other $/lot. */
  monthsAtCurrentPaceRecent: number | null;
  projectedDateRecent: string | null;
  requiredLotsPerMonthToHitDeadlineRecent: number | null;
  inventoryGap: number | null;
  avgLotsPerFarm: number | null;
  farmsStillNeeded: number | null;
  /** Inventory gap at the era $/lot: ceil((lotsStillNeededRecent − available) ÷ avgLotsPerFarm). */
  farmsStillNeededRecent: number | null;
  onTrack: boolean | null;
  verdict: string;
}

export interface GoalOptions {
  goal?: number;
  deadline?: string;
  trailingWindowDays?: number;
  /** Era start (ISO) the trailing window may not reach before; `null` for no era. Default: config ERA_START. */
  eraStart?: EraStart;
  /**
   * Capital-cycle length in months (from the rotation benchmark). When set, `farmsStillNeeded`
   * accounts for how many times the same capital can buy a farm before the deadline — longer
   * horizons need fewer farms. Omit for the flat inventory-gap formula (tests, callers without
   * a cycle).
   */
  cycleMonths?: number | null;
}

/**
 * Farms still to buy, given that land capital turns before the deadline.
 *
 * Flat model (no cycle): ceil(inventoryGap ÷ avgLotsPerFarm).
 * Rotation model: the same gap divided by the number of full capital turns that fit before
 * the deadline (at least 1), so a longer horizon strictly reduces farms still needed.
 */
export function farmsStillNeededWithTurns(
  inventoryGap: number | null,
  avgLotsPerFarm: number | null,
  monthsToDeadline: number,
  cycleMonths: number | null | undefined,
): number | null {
  if (inventoryGap === null || avgLotsPerFarm === null || !(avgLotsPerFarm > 0)) return null;
  if (inventoryGap <= 0) return 0;
  const turns =
    cycleMonths != null && cycleMonths > 0 && monthsToDeadline > 0
      ? Math.max(1, Math.floor(monthsToDeadline / cycleMonths))
      : 1;
  return Math.max(0, Math.ceil(inventoryGap / (avgLotsPerFarm * turns)));
}

/** Recompute farmsStillNeeded / farmsStillNeededRecent with a capital-cycle length. */
export function withCapitalTurns(goal: GoalStatus, cycleMonths: number | null): GoalStatus {
  const inventoryGapRecent =
    goal.lotsStillNeededRecent !== null ? goal.lotsStillNeededRecent - goal.availableLots : null;
  return {
    ...goal,
    farmsStillNeeded: farmsStillNeededWithTurns(
      goal.inventoryGap,
      goal.avgLotsPerFarm,
      goal.monthsToDeadline,
      cycleMonths,
    ),
    farmsStillNeededRecent: farmsStillNeededWithTurns(
      inventoryGapRecent,
      goal.avgLotsPerFarm,
      goal.monthsToDeadline,
      cycleMonths,
    ),
  };
}

/** Sold lots that closed inside the trailing window — never before the era start (era.ts). */
export function trailingClosedLots(lots: Lot[], asOf: Date, windowDays: number, eraStart: EraStart = undefined): Lot[] {
  const { from } = trailingWindow(asOf, windowDays, eraStart);
  return lots.filter((l) => {
    if (!isSold(l) || !l.closeDate) return false;
    const d = parseDate(l.closeDate);
    return !!d && d > from && d <= asOf;
  });
}

export function computeGoal(lots: Lot[], farms: FarmEconomics[], asOf: Date, opts: GoalOptions = {}): GoalStatus {
  const goal = opts.goal ?? GOAL_NET_PROFIT;
  // GOAL_DEADLINE is the only runtime read of the constant — the fallback when the caller
  // (buildRealm / a test) did not pass a deadline. Pages must not import GOAL_DEADLINE.
  const deadlineIso = opts.deadline ?? GOAL_DEADLINE;
  const windowDays = opts.trailingWindowDays ?? TRAILING_WINDOW_DAYS;
  const window = trailingWindow(asOf, windowDays, opts.eraStart);
  const deadline = parseDate(deadlineIso) ?? asOf;

  const sold = lots.filter(isSold);
  const reserved = lots.filter((l) => l.stage === "reserved");
  const available = lots.filter((l) => l.stage === "available");

  const netProfitToDate = round2(sum(sold.map((l) => l.netProfit)));
  const netProfitInPipeline = round2(sum(reserved.map((l) => (l.grossProfit ?? 0) - (l.investorTake ?? 0))));
  const cashRealized = round2(sum(lots.map((l) => l.cashRealized)));
  const remaining = round2(Math.max(0, goal - netProfitToDate));

  const daysToDeadline = daysBetween(asOf, deadline);
  const monthsToDeadline = monthsBetween(asOf, deadline);

  const trailing = trailingClosedLots(lots, asOf, windowDays, opts.eraStart);
  const closedLotsPerMonth = round2(trailing.length / (window.days / DAYS_PER_MONTH));
  const avgNetProfitPerClosedLot = sold.length > 0 ? round2(netProfitToDate / sold.length) : null;

  const lotsStillNeeded =
    avgNetProfitPerClosedLot !== null && avgNetProfitPerClosedLot > 0 ? Math.ceil(remaining / avgNetProfitPerClosedLot) : null;
  const monthsAtCurrentPace =
    lotsStillNeeded !== null && closedLotsPerMonth > 0 ? round2(lotsStillNeeded / closedLotsPerMonth) : null;
  const projectedDate = monthsAtCurrentPace !== null ? toIsoDate(addMonths(asOf, monthsAtCurrentPace)) : null;
  const requiredLotsPerMonthToHitDeadline =
    lotsStillNeeded !== null && monthsToDeadline > 0 ? round2(lotsStillNeeded / monthsToDeadline) : null;

  // The same three steps on the era closings only. Same pace, same remaining, other $/lot.
  const era = window.era;
  const recentSold = era ? sold.filter((l) => inEra(l.closeDate, era)) : [];
  const recentAvgNetProfitPerClosedLot = recentSold.length > 0 ? round2(sum(recentSold.map((l) => l.netProfit)) / recentSold.length) : null;
  const lotsStillNeededRecent =
    recentAvgNetProfitPerClosedLot !== null && recentAvgNetProfitPerClosedLot > 0 ? Math.ceil(remaining / recentAvgNetProfitPerClosedLot) : null;
  const monthsAtCurrentPaceRecent =
    lotsStillNeededRecent !== null && closedLotsPerMonth > 0 ? round2(lotsStillNeededRecent / closedLotsPerMonth) : null;
  const projectedDateRecent = monthsAtCurrentPaceRecent !== null ? toIsoDate(addMonths(asOf, monthsAtCurrentPaceRecent)) : null;
  const requiredLotsPerMonthToHitDeadlineRecent =
    lotsStillNeededRecent !== null && monthsToDeadline > 0 ? round2(lotsStillNeededRecent / monthsToDeadline) : null;

  const avgLotsPerFarm = mean(farms.map((f) => f.totalLots));
  const inventoryGap = lotsStillNeeded !== null ? lotsStillNeeded - available.length : null;
  const inventoryGapRecent = lotsStillNeededRecent !== null ? lotsStillNeededRecent - available.length : null;
  const avgLots = avgLotsPerFarm === null ? null : avgLotsPerFarm;
  const farmsStillNeeded = farmsStillNeededWithTurns(inventoryGap, avgLots, monthsToDeadline, opts.cycleMonths);
  const farmsStillNeededRecent = farmsStillNeededWithTurns(
    inventoryGapRecent,
    avgLots,
    monthsToDeadline,
    opts.cycleMonths,
  );

  const onTrack =
    remaining === 0 ? true : projectedDate !== null ? (parseDate(projectedDate) ?? deadline) <= deadline : null;

  return {
    goal,
    deadline: deadlineIso,
    asOf: toIsoDate(asOf),
    netProfitToDate,
    netProfitInPipeline,
    grossProfitToDate: round2(sum(sold.map((l) => l.grossProfit))),
    investorTakeToDate: round2(sum(sold.map((l) => l.investorTake))),
    revenueToDate: round2(sum(sold.map((l) => l.salePrice))),
    cashRealized,
    profitOnPaper: round2(Math.max(0, netProfitToDate - cashRealized)),
    capitalOutstanding: round2(sum(farms.map((f) => f.capitalOutstanding))),
    remaining,
    pctComplete: goal > 0 ? round2(Math.min(100, (netProfitToDate / goal) * 100)) : 0,
    daysToDeadline,
    monthsToDeadline: round2(monthsToDeadline),
    closedLots: sold.length,
    reservedLots: reserved.length,
    availableLots: available.length,
    noteSoldLots: lots.filter((l) => l.stage === "note_sold").length,
    closedLotsTrailing: trailing.length,
    trailingWindowDays: windowDays,
    trailingDays: window.days,
    trailingSince: window.since,
    trailingEraClipped: window.eraClipped,
    closedLotsPerMonth,
    avgNetProfitPerClosedLot,
    lotsStillNeeded,
    monthsAtCurrentPace,
    projectedDate,
    requiredLotsPerMonthToHitDeadline,
    recentAvgNetProfitPerClosedLot,
    recentClosedLots: recentSold.length,
    recentSince: era?.start ?? null,
    recentSinceLabel: era?.since ?? null,
    lotsStillNeededRecent,
    monthsAtCurrentPaceRecent,
    projectedDateRecent,
    requiredLotsPerMonthToHitDeadlineRecent,
    inventoryGap,
    avgLotsPerFarm: avgLotsPerFarm === null ? null : round2(avgLotsPerFarm),
    farmsStillNeeded,
    farmsStillNeededRecent,
    onTrack,
    verdict: "",
  };
}

/** One sentence the Throne Room speaks. Pure so it can be tested. Defaults to English. */
export function buildVerdict(g: GoalStatus, fmtDate: (iso: string) => string = (s) => s, lang: QualityLang = "en"): string {
  if (lang === "es") {
    if (g.remaining === 0) return "La meta está cumplida.";
    if (g.lotsStillNeeded === null) return "Aún no hay lotes cerrados — no hay ritmo que medir.";
    if (g.closedLotsPerMonth <= 0) {
      const window = g.trailingEraClipped ? `desde ${fmtDate(g.trailingSince)}` : `en los últimos ${g.trailingWindowDays} días`;
      return `Necesitas ${g.requiredLotsPerMonthToHitDeadline ?? "?"} lotes/mes; no cerraste ninguno ${window}.`;
    }
    if (g.onTrack && g.projectedDate) {
      return `Al ritmo actual de ${g.closedLotsPerMonth} lotes/mes alcanzas la meta el ${fmtDate(g.projectedDate)}.`;
    }
    return `Necesitas ${g.requiredLotsPerMonthToHitDeadline ?? "?"} lotes/mes; vas a ${g.closedLotsPerMonth}.`;
  }
  if (g.remaining === 0) return "The goal is met.";
  if (g.lotsStillNeeded === null) return "No closed lots yet — there is no pace to measure.";
  if (g.closedLotsPerMonth <= 0) {
    const window = g.trailingEraClipped ? `since ${fmtDate(g.trailingSince)}` : `in the last ${g.trailingWindowDays} days`;
    return `You need ${g.requiredLotsPerMonthToHitDeadline ?? "?"} lots/month; you closed none ${window}.`;
  }
  if (g.onTrack && g.projectedDate) {
    return `At the current pace of ${g.closedLotsPerMonth} lots/month you reach the goal on ${fmtDate(g.projectedDate)}.`;
  }
  return `You need ${g.requiredLotsPerMonthToHitDeadline ?? "?"} lots/month; you are doing ${g.closedLotsPerMonth}.`;
}

export function withVerdict(g: GoalStatus, fmtDate?: (iso: string) => string, lang: QualityLang = "en"): GoalStatus {
  return { ...g, verdict: buildVerdict(g, fmtDate, lang) };
}
