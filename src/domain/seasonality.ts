import type { Lot } from "./lot";
import { isSold } from "./lot";
import { parseDate } from "./dates";

/** A month may never be asked for less than this share of the flat pace. */
export const SEASONALITY_FLOOR = 0.25;
/** Circular smoothing kernel over the previous, current and next calendar month. */
const KERNEL = [0.25, 0.5, 0.25] as const;

export interface SeasonalProfile {
  /** Closings per calendar month (index 0 = January), as dated. */
  counts: number[];
  /** Smoothed share of the year's closings per calendar month; sums to 1. */
  shares: number[];
  /**
   * Multiplier on the flat monthly pace per calendar month; averages 1 over the year and never
   * drops below `floor`. All ones when there are no dated closings.
   */
  factors: number[];
  closings: number;
  floor: number;
  /** Calendar month with the highest factor (0 = January), or null with no data. */
  peakMonth: number | null;
  troughMonth: number | null;
}

const MONTHS = 12;

/**
 * Month-of-year profile of the realm's closings: how much of a year's closings each calendar
 * month has delivered, smoothed over its neighbours so a single busy month does not dominate,
 * floored at `floor` × the flat rate and renormalised so the twelve factors average to 1.
 */
export function computeSeasonality(lots: Lot[], asOf?: Date, floor = SEASONALITY_FLOOR): SeasonalProfile {
  const counts = Array.from({ length: MONTHS }, () => 0);
  let closings = 0;
  for (const l of lots) {
    if (!isSold(l)) continue;
    const d = parseDate(l.closeDate);
    if (!d || (asOf && d > asOf)) continue;
    counts[d.getUTCMonth()] = (counts[d.getUTCMonth()] ?? 0) + 1;
    closings += 1;
  }
  if (closings === 0) {
    return {
      counts,
      shares: Array.from({ length: MONTHS }, () => 1 / MONTHS),
      factors: Array.from({ length: MONTHS }, () => 1),
      closings,
      floor,
      peakMonth: null,
      troughMonth: null,
    };
  }

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
    counts,
    shares: factors.map((f) => Math.round((f / total) * 10_000) / 10_000),
    factors: factors.map((f) => Math.round(f * 1000) / 1000),
    closings,
    floor,
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
