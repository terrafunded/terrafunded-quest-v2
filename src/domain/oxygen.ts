import type { FarmEconomics } from "./farm";
import type { GoalStatus } from "./goal";
import type { Lot } from "./lot";
import { computeGoal, type GoalOptions } from "./goal";
import { isSold } from "./lot";
import { addDays, parseDate, toIsoDate } from "./dates";
import { round2 } from "./math";

/**
 * OXYGEN (Phase 2 §2) — every closed lot is worth "days gained" toward the exit date.
 *
 * On the day a lot closed, the realm had a pace: net profit per calendar day =
 * avgNetProfitPerClosedLot × closedLotsPerMonth (trailing window) × 12 ÷ 365.25, measured on
 * the ledger as it stood that day (closings dated on or before it, the new one included).
 * The projected goal date *before* the closing is `remainingBefore ÷ pace` days out; *after* it
 * is `remainingAfter ÷ pace`. Their difference — `netProfit ÷ pace` — is the shift of the exit
 * date that this closing produced. It is fixed at the closing date, so the chronicle line never
 * changes later, and a dollar earned when the realm was slow is worth more days than one earned
 * when it was fast.
 *
 * Why not "recompute today's projection with and without the lot"? Because the average net
 * profit per lot moves too, and a perfectly profitable closing that happened to be below
 * average would be scored as *losing* days — a modelling artefact, not a fact about the deal.
 */
export interface LotOxygen {
  propertyId: string;
  lotName: string;
  farmName: string;
  closeDate: string | null;
  /** Date the score was measured on (closeDate, or asOf when the close is undated). */
  measuredOn: string;
  netProfit: number;
  daysGained: number;
  /** Net profit per day the realm was earning on `measuredOn`. */
  paceThatDay: number | null;
  /** Projected goal date just before and just after this closing, at that day's pace. */
  projectedBefore: string | null;
  projectedAfter: string | null;
}

export interface Oxygen {
  /** Sum of daysGained over every closed lot — the primary score of the game. */
  totalDaysGained: number;
  perLot: Map<string, LotOxygen>;
  ranked: LotOxygen[];
  /** Net profit that buys one day at today's pace. */
  netProfitPerDayAtPace: number | null;
  best: LotOxygen | null;
  latest: LotOxygen | null;
  /** Days gained by closings inside the trailing window (the "recent breath"). */
  trailingDaysGained: number;
}

const DAYS_PER_YEAR = 365.25;

/** Dollars of net profit the realm books per calendar day at the given goal status' pace. */
export function netProfitPerDayAtPace(goal: GoalStatus): number | null {
  if (goal.avgNetProfitPerClosedLot === null || goal.closedLotsPerMonth <= 0) return null;
  const perDay = (goal.avgNetProfitPerClosedLot * goal.closedLotsPerMonth * 12) / DAYS_PER_YEAR;
  return perDay > 0 ? perDay : null;
}

export function computeOxygen(lots: Lot[], farms: FarmEconomics[], asOf: Date, opts: GoalOptions = {}): Oxygen {
  const today = computeGoal(lots, farms, asOf, opts);
  const asOfIso = toIsoDate(asOf);
  const perLot = new Map<string, LotOxygen>();

  for (const lot of lots) {
    if (!isSold(lot)) continue;
    const measuredOn = lot.closeDate && lot.closeDate <= asOfIso ? lot.closeDate : asOfIso;
    const day = parseDate(measuredOn) ?? asOf;
    // The ledger as it stood on that day: closings dated after it had not happened yet.
    const ledger = lots.filter((l) => !isSold(l) || !l.closeDate || l.closeDate <= measuredOn);
    const thatDay = measuredOn === asOfIso ? today : computeGoal(ledger, farms, day, opts);
    const pace = netProfitPerDayAtPace(thatDay);
    const net = lot.netProfit ?? 0;
    const daysGained = pace ? Math.round(net / pace) : 0;
    const after = thatDay.projectedDate;
    const afterDate = parseDate(after);

    perLot.set(lot.propertyId, {
      propertyId: lot.propertyId,
      lotName: lot.name,
      farmName: lot.farmName,
      closeDate: lot.closeDate,
      measuredOn,
      netProfit: net,
      daysGained,
      paceThatDay: pace === null ? null : round2(pace),
      projectedBefore: afterDate ? toIsoDate(addDays(afterDate, daysGained)) : null,
      projectedAfter: after,
    });
  }

  const ranked = [...perLot.values()].sort((a, b) => b.daysGained - a.daysGained || (b.closeDate ?? "").localeCompare(a.closeDate ?? ""));
  const dated = [...perLot.values()].filter((o) => o.closeDate).sort((a, b) => (b.closeDate as string).localeCompare(a.closeDate as string));
  const windowStart = toIsoDate(addDays(asOf, -today.trailingWindowDays));
  const pace = netProfitPerDayAtPace(today);

  return {
    totalDaysGained: ranked.reduce((s, o) => s + o.daysGained, 0),
    perLot,
    ranked,
    netProfitPerDayAtPace: pace === null ? null : round2(pace),
    best: ranked[0] ?? null,
    latest: dated[0] ?? null,
    trailingDaysGained: dated.filter((o) => (o.closeDate as string) > windowStart).reduce((s, o) => s + o.daysGained, 0),
  };
}
