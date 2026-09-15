import type { Lot } from "./lot";
import { isSold } from "./lot";
import { addDays, daysBetween, parseDate, toIsoDate } from "./dates";
import { groupBy, median, round2, sum } from "./math";
import { trailingWindow, type EraStart } from "./era";
import { DAYS_PER_MONTH, TRAILING_WINDOW_DAYS } from "../config/goal";

/** A reservation with no closing after this many days is "stuck". */
export const STUCK_AFTER_DAYS = 60;
/** Reservations younger than this have not had a fair chance to close, so they are left out of the conversion cohort. */
export const CONVERSION_MATURITY_DAYS = 90;

export interface StuckLot {
  propertyId: string;
  farmId: string;
  farmName: string;
  lotName: string;
  lotNumber: string | null;
  buyerName: string | null;
  buyerIsTestClient: boolean;
  reservationDate: string;
  estimatedClosingDate: string | null;
  daysWaiting: number;
  salePrice: number | null;
  /** Net profit the realm would book if this reservation closed (grossProfit − investorTake, as in the goal's pipeline). */
  netProfitAtStake: number;
}

export interface Conversion {
  /** Reservations made at least `maturityDays` before `asOf` that are still live or closed (any current stage). */
  cohort: number;
  closed: number;
  stillReserved: number;
  /**
   * Blended: closed ÷ cohort, in percent. Counts still-open matured reservations in the
   * denominator — useful as a trailing pulse, not as a forecast input (open ≠ failed).
   */
  pct: number | null;
  /** Matured reservations whose only file case was cancelled — a conversion failure. */
  cancelled: number;
  /** cohort + cancelled. */
  cohortWithCancellations: number;
  /** closed ÷ (cohort + cancelled), in percent — blended with cancellations, still includes open. */
  pctWithCancellations: number | null;
  /** cancelled ÷ (cohort + cancelled), in percent. */
  cancellationRatePct: number | null;
  /**
   * Resolved: closed ÷ (closed + cancelled). Open matured reservations are excluded — they have
   * not failed yet. Forecasts (Expected, Engine, War Plan, Council) use this figure.
   */
  resolvedPct: number | null;
  /** closed + cancelled — the resolved denominator. */
  resolvedDenominator: number;
  maturityDays: number;
  /** Reservations on or before this date belong to the cohort. */
  cutoff: string;
}

export interface FarmPipeline {
  farmId: string;
  farmName: string;
  /** Median days from reservation to closing over this farm's closed lots with both dates. */
  medianDaysToClose: number | null;
  closedWithBothDates: number;
  reserved: number;
  stuck: number;
  netProfitTrapped: number;
}

export interface Pipeline {
  asOf: string;
  /** Width of the trailing window asked for. */
  trailingWindowDays: number;
  /** Days the window really covers — fewer than asked when the era start (config ERA_START) cut it short. */
  trailingDays: number;
  /** First day the window counts (ISO). */
  trailingSince: string;
  /** True when the window was clipped at the era start — the per-month figures then read "since Mar 2026". */
  trailingEraClipped: boolean;

  /**
   * Leading indicator: lots reserved inside the trailing window that are still waiting to close
   * (file case active, no closing date, no note) — per month, on the same footing as closedLotsPerMonth.
   */
  newReservationsTrailing: number;
  reservationsPerMonth: number;
  /** Every reservation dated inside the window, including those that have since closed. For context only. */
  reservationsMadeTrailing: number;
  reservationsMadePerMonth: number;
  /** Closings per month over the same window — copied from the goal so the two can sit side by side. */
  closedLotsPerMonth: number;

  conversion: Conversion;
  /** Lots whose only file case was cancelled, any age. */
  cancelledReservations: number;

  reserved: number;
  pipelineNetProfit: number;
  stuck: StuckLot[];
  stuckCount: number;
  /** Σ net profit at stake across stuck reservations — "profit trapped in reservations". */
  netProfitTrapped: number;
  /** Σ sale price across stuck reservations. */
  salePriceTrapped: number;
  stuckAfterDays: number;

  medianDaysToClose: number | null;
  closedWithBothDates: number;
  farms: FarmPipeline[];
  farmById: Map<string, FarmPipeline>;
  /** Property ids of stuck lots, for O(1) lookups in the ledger. */
  stuckIds: Set<string>;
}

export interface PipelineOptions {
  trailingWindowDays?: number;
  stuckAfterDays?: number;
  maturityDays?: number;
  closedLotsPerMonth?: number;
  /** Era start (ISO) the trailing window may not reach before; `null` for no era. Default: config ERA_START. */
  eraStart?: EraStart;
}

function daysReservationToClose(lot: Lot): number | null {
  if (!isSold(lot) || !lot.reservationDate || !lot.closeDate) return null;
  const r = parseDate(lot.reservationDate);
  const c = parseDate(lot.closeDate);
  if (!r || !c) return null;
  const d = daysBetween(r, c);
  // A reservation dated after the close is a data disagreement (quality panel), not a duration.
  return d >= 0 ? d : null;
}

/** Same formula `computeGoal` uses for `netProfitInPipeline`: what the realm would book if the lot closed today. */
export function netProfitAtStake(lot: Pick<Lot, "grossProfit" | "investorTake">): number {
  return round2((lot.grossProfit ?? 0) - (lot.investorTake ?? 0));
}

function inWindow(iso: string | null, from: Date, to: Date): boolean {
  const d = parseDate(iso);
  return !!d && d > from && d <= to;
}

/**
 * The reservations layer. Reads the same lots the goal reads and never feeds back into it:
 * netProfitToDate, pace, oxygen and the goal date are computed from closings only.
 */
export function computeStuckLots(lots: Lot[], asOf: Date, stuckAfterDays = STUCK_AFTER_DAYS): StuckLot[] {
  const out: StuckLot[] = [];
  for (const l of lots) {
    if (l.stage !== "reserved" || !l.reservationDate) continue;
    const r = parseDate(l.reservationDate);
    if (!r) continue;
    const daysWaiting = daysBetween(r, asOf);
    if (daysWaiting < stuckAfterDays) continue;
    out.push({
      propertyId: l.propertyId,
      farmId: l.farmId,
      farmName: l.farmName,
      lotName: l.name,
      lotNumber: l.lotNumber,
      buyerName: l.buyerName,
      buyerIsTestClient: l.buyerIsTestClient,
      reservationDate: l.reservationDate,
      estimatedClosingDate: l.estimatedClosingDate,
      daysWaiting,
      salePrice: l.salePrice,
      netProfitAtStake: netProfitAtStake(l),
    });
  }
  return out.sort((a, b) => b.daysWaiting - a.daysWaiting || b.netProfitAtStake - a.netProfitAtStake || a.lotName.localeCompare(b.lotName));
}

export function computeConversion(lots: Lot[], asOf: Date, maturityDays = CONVERSION_MATURITY_DAYS): Conversion {
  const cutoff = addDays(asOf, -maturityDays);
  let cohort = 0;
  let closed = 0;
  let stillReserved = 0;
  let cancelled = 0;
  for (const l of lots) {
    // A lot whose only file case was cancelled is available again; its failed reservation still
    // counts against conversion once it is old enough to belong to the cohort.
    if (l.stage === "available") {
      const c = parseDate(l.cancelledReservationDate);
      if (c && c <= cutoff) cancelled += 1;
      continue;
    }
    const r = parseDate(l.reservationDate);
    if (!r || r > cutoff) continue;
    cohort += 1;
    if (isSold(l)) closed += 1;
    else stillReserved += 1;
  }
  const withCancellations = cohort + cancelled;
  const resolvedDenominator = closed + cancelled;
  return {
    cohort,
    closed,
    stillReserved,
    pct: cohort > 0 ? round2((closed / cohort) * 100) : null,
    cancelled,
    cohortWithCancellations: withCancellations,
    pctWithCancellations: withCancellations > 0 ? round2((closed / withCancellations) * 100) : null,
    cancellationRatePct: withCancellations > 0 ? round2((cancelled / withCancellations) * 100) : null,
    resolvedPct: resolvedDenominator > 0 ? round2((closed / resolvedDenominator) * 100) : null,
    resolvedDenominator,
    maturityDays,
    cutoff: toIsoDate(cutoff),
  };
}

export function computePipeline(lots: Lot[], asOf: Date, opts: PipelineOptions = {}): Pipeline {
  const windowDays = opts.trailingWindowDays ?? TRAILING_WINDOW_DAYS;
  const stuckAfterDays = opts.stuckAfterDays ?? STUCK_AFTER_DAYS;
  const maturityDays = opts.maturityDays ?? CONVERSION_MATURITY_DAYS;
  const window = trailingWindow(asOf, windowDays, opts.eraStart);
  const from = window.from;
  const monthsInWindow = window.days / DAYS_PER_MONTH;

  const reservedLots = lots.filter((l) => l.stage === "reserved");
  const newReservationsTrailing = reservedLots.filter((l) => inWindow(l.reservationDate, from, asOf)).length;
  const reservationsMadeTrailing = lots.filter((l) => l.stage !== "available" && inWindow(l.reservationDate, from, asOf)).length;

  const stuck = computeStuckLots(lots, asOf, stuckAfterDays);
  const conversion = computeConversion(lots, asOf, maturityDays);

  const durations = new Map<string, number>();
  for (const l of lots) {
    const d = daysReservationToClose(l);
    if (d !== null) durations.set(l.propertyId, d);
  }

  const farms: FarmPipeline[] = [];
  for (const [farmId, farmLots] of groupBy(lots, (l) => l.farmId)) {
    const first = farmLots[0];
    if (!first) continue;
    const ds = farmLots.map((l) => durations.get(l.propertyId)).filter((d): d is number => d !== undefined);
    const farmStuck = stuck.filter((s) => s.farmId === farmId);
    farms.push({
      farmId,
      farmName: first.farmName,
      medianDaysToClose: median(ds),
      closedWithBothDates: ds.length,
      reserved: farmLots.filter((l) => l.stage === "reserved").length,
      stuck: farmStuck.length,
      netProfitTrapped: round2(sum(farmStuck.map((s) => s.netProfitAtStake))),
    });
  }
  farms.sort((a, b) => b.netProfitTrapped - a.netProfitTrapped || a.farmName.localeCompare(b.farmName));

  return {
    asOf: toIsoDate(asOf),
    trailingWindowDays: windowDays,
    trailingDays: window.days,
    trailingSince: window.since,
    trailingEraClipped: window.eraClipped,
    newReservationsTrailing,
    reservationsPerMonth: round2(newReservationsTrailing / monthsInWindow),
    reservationsMadeTrailing,
    reservationsMadePerMonth: round2(reservationsMadeTrailing / monthsInWindow),
    closedLotsPerMonth: opts.closedLotsPerMonth ?? 0,
    conversion,
    cancelledReservations: lots.filter((l) => l.stage === "available" && l.cancelledReservationDate !== null).length,
    reserved: reservedLots.length,
    pipelineNetProfit: round2(sum(reservedLots.map(netProfitAtStake))),
    stuck,
    stuckCount: stuck.length,
    netProfitTrapped: round2(sum(stuck.map((s) => s.netProfitAtStake))),
    salePriceTrapped: round2(sum(stuck.map((s) => s.salePrice))),
    stuckAfterDays,
    medianDaysToClose: median([...durations.values()]),
    closedWithBothDates: durations.size,
    farms,
    farmById: new Map(farms.map((f) => [f.farmId, f])),
    stuckIds: new Set(stuck.map((s) => s.propertyId)),
  };
}
