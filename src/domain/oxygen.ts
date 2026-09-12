import type { FarmEconomics } from "./farm";
import type { GoalStatus } from "./goal";
import type { Lot } from "./lot";
import { computeGoal, type GoalOptions } from "./goal";
import { isSold } from "./lot";
import { netProfitAtStake } from "./pipeline";
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

/**
 * A live reservation's provisional score: the days its closing would gain, measured at the pace
 * of the reservation day and weighted by the conversion. The closing turns it into a confirmed
 * `LotOxygen`; a cancellation simply removes it (the lot is no longer reserved).
 */
export interface ProvisionalOxygen {
  propertyId: string;
  lotName: string;
  farmName: string;
  reservationDate: string;
  /** Date the score was measured on (the reservation date, or asOf when it is dated later). */
  measuredOn: string;
  /** grossProfit − investorTake: what the closing would book. */
  netProfitAtStake: number;
  /** Days the closing would gain at that day's pace, before the conversion. */
  daysIfClosed: number;
  /** daysIfClosed × conversion, rounded — the provisional days this reservation earns. */
  provisionalDays: number;
  paceThatDay: number | null;
  conversionPct: number;
}

export interface Oxygen {
  /** Sum of daysGained over every closed lot — the primary score of the game. Confirmed days only. */
  totalDaysGained: number;
  perLot: Map<string, LotOxygen>;
  ranked: LotOxygen[];
  /** Net profit the realm produces per calendar day at today's trailing pace. Does not read the deadline. */
  netProfitPerDayAtPace: number | null;
  best: LotOxygen | null;
  latest: LotOxygen | null;
  /** Days gained by closings inside the trailing window (the "recent breath"). */
  trailingDaysGained: number;
  /** Sum of provisionalDays over every live reservation — shown next to the score, never added to it. */
  provisionalDaysGained: number;
  provisional: Map<string, ProvisionalOxygen>;
  provisionalRanked: ProvisionalOxygen[];
  /** Conversion the provisional days were weighted with, in percent. */
  conversionPct: number;
}

export interface OxygenOptions extends GoalOptions {
  /** Reservation → closing conversion in percent (pipeline.ts, cancellations included). Default 100. */
  conversionPct?: number;
}

const DAYS_PER_YEAR = 365.25;

/** Dollars of net profit the realm books per calendar day at the given goal status' pace. */
export function netProfitPerDayAtPace(goal: GoalStatus): number | null {
  if (goal.avgNetProfitPerClosedLot === null || goal.closedLotsPerMonth <= 0) return null;
  const perDay = (goal.avgNetProfitPerClosedLot * goal.closedLotsPerMonth * 12) / DAYS_PER_YEAR;
  return perDay > 0 ? perDay : null;
}

export function computeOxygen(lots: Lot[], farms: FarmEconomics[], asOf: Date, opts: OxygenOptions = {}): Oxygen {
  const { conversionPct: conversionOpt, ...goalOpts } = opts;
  const conversionPct = conversionOpt ?? 100;
  const today = computeGoal(lots, farms, asOf, goalOpts);
  const asOfIso = toIsoDate(asOf);
  const perLot = new Map<string, LotOxygen>();

  // The ledger as it stood on a given day: closings dated after it had not happened yet. The pace
  // of that day is its own full trailing window — never clipped at the era start, or a closing in
  // the era's first weeks would be measured against a window a few days wide.
  const goalOn = (measuredOn: string): GoalStatus => {
    if (measuredOn === asOfIso) return today;
    const ledger = lots.filter((l) => !isSold(l) || !l.closeDate || l.closeDate <= measuredOn);
    return computeGoal(ledger, farms, parseDate(measuredOn) ?? asOf, { ...goalOpts, eraStart: null });
  };

  for (const lot of lots) {
    if (!isSold(lot)) continue;
    const measuredOn = lot.closeDate && lot.closeDate <= asOfIso ? lot.closeDate : asOfIso;
    const thatDay = goalOn(measuredOn);
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

  // Provisional days: every live reservation, measured at the pace of its reservation day. A
  // reservation older than the first closing has no pace to measure against and uses today's.
  const provisional = new Map<string, ProvisionalOxygen>();
  for (const lot of lots) {
    if (lot.stage !== "reserved" || !lot.reservationDate) continue;
    const measuredOn = lot.reservationDate <= asOfIso ? lot.reservationDate : asOfIso;
    const paceThatDay = netProfitPerDayAtPace(goalOn(measuredOn)) ?? pace;
    const atStake = netProfitAtStake(lot);
    const daysIfClosed = paceThatDay ? Math.round(atStake / paceThatDay) : 0;
    provisional.set(lot.propertyId, {
      propertyId: lot.propertyId,
      lotName: lot.name,
      farmName: lot.farmName,
      reservationDate: lot.reservationDate,
      measuredOn,
      netProfitAtStake: atStake,
      daysIfClosed,
      provisionalDays: Math.round((daysIfClosed * conversionPct) / 100),
      paceThatDay: paceThatDay === null ? null : round2(paceThatDay),
      conversionPct,
    });
  }
  const provisionalRanked = [...provisional.values()].sort((a, b) => b.provisionalDays - a.provisionalDays || b.reservationDate.localeCompare(a.reservationDate));

  return {
    totalDaysGained: ranked.reduce((s, o) => s + o.daysGained, 0),
    perLot,
    ranked,
    netProfitPerDayAtPace: pace === null ? null : round2(pace),
    best: ranked[0] ?? null,
    latest: dated[0] ?? null,
    trailingDaysGained: dated.filter((o) => (o.closeDate as string) > windowStart).reduce((s, o) => s + o.daysGained, 0),
    provisionalDaysGained: provisionalRanked.reduce((s, o) => s + o.provisionalDays, 0),
    provisional,
    provisionalRanked,
    conversionPct,
  };
}
