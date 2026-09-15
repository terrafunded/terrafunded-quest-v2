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
/** Warn when resolved conversion is computed from fewer resolved outcomes than this. */
export const CONVERSION_RESOLVED_MIN_N = 20;
/**
 * Warn when matured reservations still open are this share or more of
 * (closed + cancelled + still open). Open is not a failure; a large open share
 * means the resolved rate rests on a thin slice of the cohort.
 */
export const CONVERSION_OPEN_SHARE_WARN = 0.25;
/** Progress at or above this (percent) counts as near closing. */
export const NEAR_CLOSING_PROGRESS_PCT = 70;
/** An estimated closing date this many days ahead (inclusive) counts as near closing. */
export const NEAR_CLOSING_WITHIN_DAYS = 30;

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
  currentStageName: string | null;
  currentStageNumber: number | null;
  progressPct: number | null;
  daysSinceUpdate: number | null;
  hasBlockedStages: boolean;
  hasOverdueStages: boolean;
  nearClosing: boolean;
  /** daysWaiting × (1 − progress/100) + days since last update. Higher = more stuck. */
  severity: number;
}

export interface StageBottleneck {
  stageName: string;
  stageNumber: number | null;
  count: number;
  salePrice: number;
  medianDaysWaiting: number | null;
  lots: { propertyId: string; farmName: string; lotName: string; daysWaiting: number; salePrice: number | null }[];
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
  /**
   * stillReserved ÷ (resolvedDenominator + stillReserved). Null when that sum is 0.
   * The resolved rate must never be read without this share.
   */
  openShare: number | null;
  /** True when resolved N is below CONVERSION_RESOLVED_MIN_N or openShare ≥ CONVERSION_OPEN_SHARE_WARN. */
  thinSample: boolean;
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
  /** 60+ day reservations that are not near closing — the working stuck list. */
  stuckActive: StuckLot[];
  /** Reserved lots near closing (high progress or estimated close within NEAR_CLOSING_WITHIN_DAYS). */
  nearClosing: StuckLot[];
  /** Reserved lots with a blocked or overdue stage in Payments. */
  flagged: StuckLot[];
  /** Open reservations grouped by current stage, highest sale value first. */
  stageBottleneck: StageBottleneck[];
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

/** Days waiting weighted by remaining progress, plus days since Payments last updated the case. */
export function stuckSeverity(daysWaiting: number, progressPct: number | null, daysSinceUpdate: number | null): number {
  const remaining = 1 - Math.max(0, Math.min(100, progressPct ?? 0)) / 100;
  return round2(daysWaiting * remaining + (daysSinceUpdate ?? 0));
}

export function isNearClosing(
  lot: Pick<Lot, "progressPct" | "estimatedClosingDate">,
  asOf: Date,
  progressFloor = NEAR_CLOSING_PROGRESS_PCT,
  withinDays = NEAR_CLOSING_WITHIN_DAYS,
): boolean {
  if (lot.progressPct !== null && lot.progressPct >= progressFloor) return true;
  const est = parseDate(lot.estimatedClosingDate);
  if (!est) return false;
  const ahead = daysBetween(asOf, est);
  return ahead >= 0 && ahead <= withinDays;
}

export function conversionNeedsWarning(c: Pick<Conversion, "resolvedDenominator" | "stillReserved">): boolean {
  if (c.resolvedDenominator === 0 && c.stillReserved === 0) return false;
  if (c.resolvedDenominator < CONVERSION_RESOLVED_MIN_N) return true;
  const denom = c.resolvedDenominator + c.stillReserved;
  if (denom <= 0) return false;
  return c.stillReserved / denom >= CONVERSION_OPEN_SHARE_WARN;
}

/**
 * Open reservations grouped by Payments `current_stage_name`, highest trapped sale value first.
 * Council and the Pipeline page both call this — they cannot disagree.
 */
export function computeStageBottleneck(lots: Lot[], asOf: Date): StageBottleneck[] {
  const open = lots.filter((l) => l.stage === "reserved" && l.reservationDate);
  const groups = groupBy(open, (l) => l.currentStageName ?? "");
  const out: StageBottleneck[] = [];
  for (const [key, group] of groups) {
    const waits = group.map((l) => {
      const r = parseDate(l.reservationDate);
      return r ? daysBetween(r, asOf) : 0;
    });
    out.push({
      stageName: key,
      stageNumber: group.map((l) => l.currentStageNumber).find((n) => n !== null) ?? null,
      count: group.length,
      salePrice: round2(sum(group.map((l) => l.salePrice))),
      medianDaysWaiting: median(waits),
      lots: group
        .map((l) => {
          const r = parseDate(l.reservationDate);
          return {
            propertyId: l.propertyId,
            farmName: l.farmName,
            lotName: l.name,
            daysWaiting: r ? daysBetween(r, asOf) : 0,
            salePrice: l.salePrice,
          };
        })
        .sort((a, b) => b.daysWaiting - a.daysWaiting || a.lotName.localeCompare(b.lotName)),
    });
  }
  return out.sort((a, b) => b.salePrice - a.salePrice || b.count - a.count || a.stageName.localeCompare(b.stageName));
}

function toStuckLot(l: Lot, asOf: Date): StuckLot | null {
  if (l.stage !== "reserved" || !l.reservationDate) return null;
  const r = parseDate(l.reservationDate);
  if (!r) return null;
  const daysWaiting = daysBetween(r, asOf);
  const updated = parseDate(l.fileCaseUpdatedAt);
  const daysSinceUpdate = updated ? daysBetween(updated, asOf) : null;
  return {
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
    currentStageName: l.currentStageName,
    currentStageNumber: l.currentStageNumber,
    progressPct: l.progressPct,
    daysSinceUpdate,
    hasBlockedStages: l.hasBlockedStages,
    hasOverdueStages: l.hasOverdueStages,
    nearClosing: isNearClosing(l, asOf),
    severity: stuckSeverity(daysWaiting, l.progressPct, daysSinceUpdate),
  };
}

function bySeverity(a: StuckLot, b: StuckLot): number {
  return b.severity - a.severity || b.daysWaiting - a.daysWaiting || b.netProfitAtStake - a.netProfitAtStake || a.lotName.localeCompare(b.lotName);
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
    const row = toStuckLot(l, asOf);
    if (!row || row.daysWaiting < stuckAfterDays) continue;
    out.push(row);
  }
  return out.sort(bySeverity);
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
  const resolvedPlusOpen = resolvedDenominator + stillReserved;
  const openShare = resolvedPlusOpen > 0 ? stillReserved / resolvedPlusOpen : null;
  const conversion: Conversion = {
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
    openShare,
    thinSample: false,
    maturityDays,
    cutoff: toIsoDate(cutoff),
  };
  conversion.thinSample = conversionNeedsWarning(conversion);
  return conversion;
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
  const reservedRows = lots.map((l) => toStuckLot(l, asOf)).filter((s): s is StuckLot => s !== null);
  const nearClosing = reservedRows.filter((s) => s.nearClosing).sort(bySeverity);
  const stuckActive = stuck.filter((s) => !s.nearClosing);
  const flagged = reservedRows.filter((s) => s.hasBlockedStages || s.hasOverdueStages).sort(bySeverity);
  const stageBottleneck = computeStageBottleneck(lots, asOf);
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
    stuckActive,
    nearClosing,
    flagged,
    stageBottleneck,
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
