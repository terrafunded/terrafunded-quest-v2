import type { Lot } from "./lot";
import { isSold } from "./lot";
import { parseDate, toIsoDate } from "./dates";
import { resolveEra, wholeMonthsBetween, type EraStart } from "./era";

/** A month may never be asked for less than this share of the flat pace. */
export const SEASONALITY_FLOOR = 0.25;
/** Months of closing history a month-of-year profile needs before it is applied at all. */
export const SEASONALITY_MIN_MONTHS = 12;
/** What the screen says while the history is shorter than that. */
export const SEASONALITY_TOO_SHORT = "not enough history for seasonality";
/** Circular smoothing kernel over the previous, current and next calendar month. */
const KERNEL = [0.25, 0.5, 0.25] as const;

export interface SeasonalProfile {
  /** Closings per calendar month (index 0 = January), as dated — since the era start only. */
  counts: number[];
  /** Smoothed share of the year's closings per calendar month; sums to 1. Flat (1/12 each) when not applied. */
  shares: number[];
  /**
   * Multiplier on the flat monthly pace per calendar month; averages 1 over the year and never
   * drops below `floor`. All ones when there are no dated closings or the profile is not applied.
   */
  factors: number[];
  /** Closings behind the profile (since the era start). */
  closings: number;
  floor: number;
  /** Calendar month with the highest factor (0 = January), or null with no data or when not applied. */
  peakMonth: number | null;
  troughMonth: number | null;
  /**
   * False while the history since the era start is shorter than `monthsRequired` months: the
   * factors are then all ones and `reason` says why. Nothing seasonal is applied anywhere.
   */
  applied: boolean;
  /** "not enough history for seasonality" when not applied for lack of history; null otherwise. */
  reason: string | null;
  /** Whole calendar months of closing history the profile rests on: from the era start (or the first closing without one) to asOf. */
  monthsOfHistory: number | null;
  monthsRequired: number;
  /** ISO date the profile counts closings from (the era start), or null when every closing counts. */
  since: string | null;
  /** "since Mar 2026", or null when every closing counts. */
  sinceLabel: string | null;
  /** Closings left out because they predate the era start. */
  excluded: number;
}

export interface SeasonalityOptions {
  floor?: number;
  /** Era start (ISO) the profile counts closings from; `null` counts every closing. Default: config ERA_START. */
  eraStart?: EraStart;
  /** Months of history required before the profile applies. Default `SEASONALITY_MIN_MONTHS`; 0 always applies. */
  minMonths?: number;
}

const MONTHS = 12;

function flat(base: Omit<SeasonalProfile, "shares" | "factors" | "peakMonth" | "troughMonth">): SeasonalProfile {
  return {
    ...base,
    shares: Array.from({ length: MONTHS }, () => 1 / MONTHS),
    factors: Array.from({ length: MONTHS }, () => 1),
    peakMonth: null,
    troughMonth: null,
  };
}

/**
 * Month-of-year profile of the realm's closings since the era start: how much of a year's
 * closings each calendar month has delivered, smoothed over its neighbours so a single busy month
 * does not dominate, floored at `floor` × the flat rate and renormalised so the twelve factors
 * average to 1. With fewer than `minMonths` months of history no profile is applied at all.
 */
export function computeSeasonality(lots: Lot[], asOf?: Date, opts: SeasonalityOptions = {}): SeasonalProfile {
  const floor = opts.floor ?? SEASONALITY_FLOOR;
  const minMonths = opts.minMonths ?? SEASONALITY_MIN_MONTHS;
  const counts = Array.from({ length: MONTHS }, () => 0);

  const dated: Date[] = [];
  for (const l of lots) {
    if (!isSold(l)) continue;
    const d = parseDate(l.closeDate);
    if (!d || (asOf && d > asOf)) continue;
    dated.push(d);
  }
  dated.sort((a, b) => a.getTime() - b.getTime());
  // Without an asOf the history runs to the last closing.
  const horizon = asOf ?? dated[dated.length - 1] ?? null;
  const era = horizon ? resolveEra(horizon, opts.eraStart) : null;
  const first = dated[0] ?? null;
  const from = era ? era.startDate : first;

  let closings = 0;
  let excluded = 0;
  for (const d of dated) {
    if (era && d < era.startDate) {
      excluded += 1;
      continue;
    }
    counts[d.getUTCMonth()] = (counts[d.getUTCMonth()] ?? 0) + 1;
    closings += 1;
  }

  const monthsOfHistory = from && horizon ? wholeMonthsBetween(from, horizon) : null;
  const enough = minMonths <= 0 || (monthsOfHistory !== null && monthsOfHistory >= minMonths);
  const base = {
    counts,
    closings,
    floor,
    applied: false,
    reason: null as string | null,
    monthsOfHistory,
    monthsRequired: minMonths,
    since: era ? toIsoDate(era.startDate) : null,
    sinceLabel: era?.since ?? null,
    excluded,
  };
  if (!enough) return flat({ ...base, reason: SEASONALITY_TOO_SHORT });
  if (closings === 0) return flat(base);

  const smoothed = counts.map((_, i) => {
    const prev = counts[(i + MONTHS - 1) % MONTHS] ?? 0;
    const next = counts[(i + 1) % MONTHS] ?? 0;
    return (KERNEL[0] * prev + KERNEL[1] * (counts[i] ?? 0) + KERNEL[2] * next) / closings;
  });

  let factors = smoothed.map((s) => s * MONTHS);
  // Lift every month to the floor, then scale back to an average of 1; a few passes settle it.
  for (let i = 0; i < 20; i++) {
    const floored = factors.map((f) => Math.max(floor, f));
    const mean = floored.reduce((a, b) => a + b, 0) / MONTHS;
    factors = floored.map((f) => f / mean);
    if (factors.every((f) => f >= floor - 1e-9)) break;
  }
  factors = factors.map((f) => Math.max(floor, f));
  const total = factors.reduce((a, b) => a + b, 0);

  let peak = 0;
  let trough = 0;
  factors.forEach((f, i) => {
    if (f > (factors[peak] ?? 0)) peak = i;
    if (f < (factors[trough] ?? 0)) trough = i;
  });

  return {
    ...base,
    applied: true,
    shares: factors.map((f) => Math.round((f / total) * 10_000) / 10_000),
    factors: factors.map((f) => Math.round(f * 1000) / 1000),
    peakMonth: peak,
    troughMonth: trough,
  };
}

/**
 * The factors rescaled so that, weighted by each simulated month's `fraction`, they average 1
 * over the months the plan closes lots in — the flat pace stays the plan's average and the
 * shape only moves closings between months.
 */
export function normalizeSeasonality(factors: number[], months: { end: Date; fraction: number }[], lastMonth: number): number[] {
  let weight = 0;
  let weighted = 0;
  for (let m = 1; m <= Math.min(lastMonth, months.length); m++) {
    const mo = months[m - 1];
    if (!mo) break;
    weight += mo.fraction;
    weighted += mo.fraction * (factors[mo.end.getUTCMonth()] ?? 1);
  }
  if (weight <= 0 || weighted <= 0) return factors.map(() => 1);
  const scale = weight / weighted;
  return factors.map((f) => f * scale);
}
