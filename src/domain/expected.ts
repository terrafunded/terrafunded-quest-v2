import type { GoalStatus } from "./goal";
import type { Lot } from "./lot";
import type { Pipeline } from "./pipeline";
import { isSold } from "./lot";
import { trailingClosedLots } from "./goal";
import { netProfitAtStake } from "./pipeline";
import { addDays, daysBetween, monthKey, parseDate, toIsoDate } from "./dates";
import { round2, sum } from "./math";
import { trailingWindow, type EraStart } from "./era";
import { DAYS_PER_MONTH, TRAILING_WINDOW_DAYS } from "../config/goal";

/**
 * EXPECTED — reservations as first-class citizens. Every live reservation carries an expected
 * closing date (its reservation date plus the median reservation→closing lag, per farm when the
 * farm has one) and an expected net profit (what the realm books if it closes, weighted by the
 * measured conversion, cancellations included). Closings stay the only source of *realized* net
 * profit: nothing here feeds the goal, the pace or the oxygen score.
 */
export type MedianSource = "farm" | "realm";

export interface ExpectedLot {
  propertyId: string;
  farmId: string;
  farmName: string;
  lotName: string;
  lotNumber: string | null;
  buyerName: string | null;
  buyerIsTestClient: boolean;
  reservationDate: string;
  /** Days the reservation has been waiting as of `asOf`. */
  daysWaiting: number;
  /** Median reservation→closing days used: this farm's when it has closed lots with both dates, else the realm's. */
  medianDaysToClose: number | null;
  medianSource: MedianSource | null;
  /** reservationDate + medianDaysToClose. Null when the realm has no closed lot with both dates. */
  expectedCloseDate: string | null;
  /** "YYYY-MM" of expectedCloseDate. */
  expectedMonth: string | null;
  /** Days from asOf to the expected close; negative once the date has passed. */
  daysToExpectedClose: number | null;
  overdue: boolean;
  /** grossProfit − investorTake: what the realm books if this reservation closes (same formula as the goal's pipeline). */
  netProfitAtStake: number;
  /** netProfitAtStake × conversion. */
  expectedNetProfit: number;
}

export interface ExpectedMonth {
  month: string;
  /** Live reservations expected to close in this month. */
  count: number;
  /** count × conversion — closings the month should produce. */
  expectedClosings: number;
  /** Σ expectedNetProfit — what the month is worth at the measured conversion. */
  expectedNetProfit: number;
  /** Σ netProfitAtStake — what it would be worth if every one closed. */
  netProfitAtStake: number;
  /** True when the month is before asOf's month: these reservations are late. */
  past: boolean;
  propertyIds: string[];
}

export interface MonthActivity {
  month: string;
  /** Reservations dated in this calendar month: live, closed since, or cancelled. */
  reservations: number;
  /** Closings dated in this calendar month. */
  closings: number;
  /** Live reservations expected to close in this month. */
  expectedReservations: number;
  /** Closings those reservations should produce (count × conversion). */
  expectedClosings: number;
  expectedNetProfit: number;
}

export type ReservationOutcome = "live" | "closed" | "cancelled";

export interface ReservationMade {
  propertyId: string;
  date: string;
  outcome: ReservationOutcome;
  /** Net profit at stake for live and closed reservations; 0 for cancelled ones (no economics for a dead case). */
  netProfitAtStake: number;
}

export type ConversionSource = "with_cancellations" | "without_cancellations" | "assumed";

export interface Expected {
  asOf: string;
  /** Width of the trailing window asked for. */
  trailingWindowDays: number;
  /** Days the window really covers — fewer than asked when the era start (config ERA_START) cut it short. */
  trailingDays: number;
  /** First day the window counts (ISO). */
  trailingSince: string;
  /** True when the window was clipped at the era start — the per-month paces then read "since Mar 2026". */
  trailingEraClipped: boolean;
  /** Conversion in percent: closed ÷ (matured cohort + cancellations). Falls back to the plain conversion, then to 100. */
  conversionPct: number;
  conversionSource: ConversionSource;
  /** Realm-wide median reservation→closing days (the fallback for farms without closings). */
  medianDaysToClose: number | null;

  /** One entry per live reservation, soonest expected close first. */
  lots: ExpectedLot[];
  byId: Map<string, ExpectedLot>;
  expectedByMonth: ExpectedMonth[];

  /** Σ expectedNetProfit over live reservations — the "Committed" counter. */
  committedNetProfit: number;
  /** Σ netProfitAtStake over live reservations (equals pipeline.pipelineNetProfit). */
  netProfitAtStake: number;
  liveReservations: number;
  /** Last month in which a live reservation is expected to close: when the whole committed amount should have landed. */
  landsBy: string | null;
  /** Month (asOf's or later) with the largest expected net profit. */
  peakMonth: string | null;
  overdueCount: number;
  overdueNetProfit: number;
  /** Live reservations without an expected date (no median anywhere in the realm). */
  undatedCount: number;

  /** Reservations made inside the trailing window, whatever became of them since. */
  reservationsTrailing: number;
  reservationsPerMonth: number;
  closingsTrailing: number;
  closingsPerMonth: number;
  /** Closings per month the deadline demands (GoalStatus.requiredLotsPerMonthToHitDeadline). */
  requiredClosingsPerMonth: number | null;
  /** requiredClosingsPerMonth ÷ conversion. */
  requiredReservationsPerMonth: number | null;

  thisMonth: MonthActivity;
  nextMonth: MonthActivity;
}

export interface ExpectedOptions {
  trailingWindowDays?: number;
  /** Era start (ISO) the trailing window may not reach before; `null` for no era. Default: config ERA_START. */
  eraStart?: EraStart;
}

/** Every reservation ever made, from the lots: live and closed ones through their file case, failed ones through the cancelled cases. */
export function reservationsMade(lots: Lot[]): ReservationMade[] {
  const out: ReservationMade[] = [];
  for (const l of lots) {
    if (l.stage !== "available" && l.reservationDate) {
      out.push({ propertyId: l.propertyId, date: l.reservationDate, outcome: isSold(l) ? "closed" : "live", netProfitAtStake: netProfitAtStake(l) });
    }
    for (const c of l.cancellations) {
      if (c.reservationDate) out.push({ propertyId: l.propertyId, date: c.reservationDate, outcome: "cancelled", netProfitAtStake: 0 });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.propertyId.localeCompare(b.propertyId));
}

function nextMonthKey(month: string): string {
  const d = parseDate(`${month}-01`) as Date;
  return monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}

export function computeExpected(lots: Lot[], pipeline: Pipeline, goal: GoalStatus, asOf: Date, opts: ExpectedOptions = {}): Expected {
  const windowDays = opts.trailingWindowDays ?? TRAILING_WINDOW_DAYS;
  const asOfIso = toIsoDate(asOf);
  const thisMonth = monthKey(asOf);
  const window = trailingWindow(asOf, windowDays, opts.eraStart);
  const monthsInWindow = window.days / DAYS_PER_MONTH;

  const conv = pipeline.conversion;
  let conversionPct: number;
  let conversionSource: ConversionSource;
  if (conv.pctWithCancellations !== null) {
    conversionPct = conv.pctWithCancellations;
    conversionSource = "with_cancellations";
  } else if (conv.pct !== null) {
    conversionPct = conv.pct;
    conversionSource = "without_cancellations";
  } else {
    conversionPct = 100;
    conversionSource = "assumed";
  }
  const conversion = conversionPct / 100;

  const expectedLots: ExpectedLot[] = [];
  for (const l of lots) {
    if (l.stage !== "reserved" || !l.reservationDate) continue;
    const reserved = parseDate(l.reservationDate);
    if (!reserved) continue;
    const farmMedian = pipeline.farmById.get(l.farmId)?.medianDaysToClose ?? null;
    const medianSource: MedianSource | null = farmMedian !== null ? "farm" : pipeline.medianDaysToClose !== null ? "realm" : null;
    const median = farmMedian ?? pipeline.medianDaysToClose;
    const expectedDate = median === null ? null : addDays(reserved, Math.round(median));
    const atStake = netProfitAtStake(l);
    expectedLots.push({
      propertyId: l.propertyId,
      farmId: l.farmId,
      farmName: l.farmName,
      lotName: l.name,
      lotNumber: l.lotNumber,
      buyerName: l.buyerName,
      buyerIsTestClient: l.buyerIsTestClient,
      reservationDate: l.reservationDate,
      daysWaiting: daysBetween(reserved, asOf),
      medianDaysToClose: median,
      medianSource,
      expectedCloseDate: expectedDate ? toIsoDate(expectedDate) : null,
      expectedMonth: expectedDate ? monthKey(expectedDate) : null,
      daysToExpectedClose: expectedDate ? daysBetween(asOf, expectedDate) : null,
      overdue: expectedDate !== null && expectedDate < asOf,
      netProfitAtStake: atStake,
      expectedNetProfit: round2(atStake * conversion),
    });
  }
  expectedLots.sort(
    (a, b) =>
      (a.expectedCloseDate ?? "9999").localeCompare(b.expectedCloseDate ?? "9999") || a.reservationDate.localeCompare(b.reservationDate) || a.lotName.localeCompare(b.lotName),
  );

  const monthMap = new Map<string, ExpectedMonth>();
  for (const e of expectedLots) {
    if (!e.expectedMonth) continue;
    const m = monthMap.get(e.expectedMonth) ?? {
      month: e.expectedMonth,
      count: 0,
      expectedClosings: 0,
      expectedNetProfit: 0,
      netProfitAtStake: 0,
      past: e.expectedMonth < thisMonth,
      propertyIds: [],
    };
    m.count += 1;
    m.expectedNetProfit = round2(m.expectedNetProfit + e.expectedNetProfit);
    m.netProfitAtStake = round2(m.netProfitAtStake + e.netProfitAtStake);
    m.propertyIds.push(e.propertyId);
    monthMap.set(e.expectedMonth, m);
  }
  const expectedByMonth = [...monthMap.values()]
    .map((m) => ({ ...m, expectedClosings: round2(m.count * conversion) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const overdue = expectedLots.filter((e) => e.overdue);
  const upcoming = expectedByMonth.filter((m) => !m.past);
  const peak = [...upcoming].sort((a, b) => b.expectedNetProfit - a.expectedNetProfit || a.month.localeCompare(b.month))[0] ?? null;

  const made = reservationsMade(lots);
  const from = window.from;
  const reservationsTrailing = made.filter((r) => {
    const d = parseDate(r.date);
    return !!d && d > from && d <= asOf;
  }).length;
  const closingsTrailing = trailingClosedLots(lots, asOf, windowDays, opts.eraStart).length;
  const requiredClosings = goal.requiredLotsPerMonthToHitDeadline;

  const activity = (month: string): MonthActivity => {
    const em = monthMap.get(month);
    return {
      month,
      reservations: made.filter((r) => r.date.slice(0, 7) === month && r.date <= asOfIso).length,
      closings: lots.filter((l) => isSold(l) && l.closeDate && l.closeDate.slice(0, 7) === month && l.closeDate <= asOfIso).length,
      expectedReservations: em?.count ?? 0,
      expectedClosings: em ? round2(em.count * conversion) : 0,
      expectedNetProfit: em?.expectedNetProfit ?? 0,
    };
  };

  return {
    asOf: asOfIso,
    trailingWindowDays: windowDays,
    trailingDays: window.days,
    trailingSince: window.since,
    trailingEraClipped: window.eraClipped,
    conversionPct,
    conversionSource,
    medianDaysToClose: pipeline.medianDaysToClose,
    lots: expectedLots,
    byId: new Map(expectedLots.map((e) => [e.propertyId, e])),
    expectedByMonth,
    committedNetProfit: round2(sum(expectedLots.map((e) => e.expectedNetProfit))),
    netProfitAtStake: round2(sum(expectedLots.map((e) => e.netProfitAtStake))),
    liveReservations: expectedLots.length,
    landsBy: expectedByMonth.at(-1)?.month ?? null,
    peakMonth: peak?.month ?? null,
    overdueCount: overdue.length,
    overdueNetProfit: round2(sum(overdue.map((e) => e.expectedNetProfit))),
    undatedCount: expectedLots.filter((e) => e.expectedCloseDate === null).length,
    reservationsTrailing,
    reservationsPerMonth: round2(reservationsTrailing / monthsInWindow),
    closingsTrailing,
    closingsPerMonth: round2(closingsTrailing / monthsInWindow),
    requiredClosingsPerMonth: requiredClosings,
    requiredReservationsPerMonth: requiredClosings !== null && conversion > 0 ? round2(requiredClosings / conversion) : null,
    thisMonth: activity(thisMonth),
    nextMonth: activity(nextMonthKey(thisMonth)),
  };
}
