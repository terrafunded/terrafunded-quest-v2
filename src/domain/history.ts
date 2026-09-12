import type { Lot } from "./lot";
import { isSold } from "./lot";
import { endOfUtcMonth, monthKey, parseDate, startOfUtcDay, toIsoDate } from "./dates";
import { round2, sum } from "./math";
import { eraStartOf, type EraStart } from "./era";

/** One calendar month of reservations, closings and the net profit those closings booked. */
export interface MonthlyPoint {
  /** ISO first-of-month (`YYYY-MM-01`). */
  month: string;
  /** Short axis label, e.g. "Sep 26". */
  label: string;
  /**
   * Lots whose `reservationDate` falls in the month — including ones that later closed
   * or were cancelled. Only `Lot.reservationDate` is counted; cancelled-case dates are
   * a different field and are not invented here.
   */
  reservations: number;
  /** Sold lots whose `closeDate` falls in the month. */
  closings: number;
  /** Σ `netProfit` of those closings. */
  netProfit: number;
  /** True when the month ends before the era start (config ERA_START). */
  beforeEra: boolean;
  /** The as-of month is in progress; the counts are actuals, not extrapolated. */
  partial: boolean;
}

export interface HistoryOptions {
  /** Era start (ISO) used for `beforeEra`; `null` marks nothing. Default: config ERA_START. */
  eraStart?: EraStart;
  /** Keep only the most recent N months, current month included. Default 24. */
  maxMonths?: number;
}

const DEFAULT_MAX_MONTHS = 24;

const shortMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** "Sep 26" from an ISO first-of-month or YYYY-MM. */
export function historyMonthLabel(iso: string): string {
  const d = parseDate(iso.length === 7 ? `${iso}-01` : iso);
  if (!d) return iso;
  return `${shortMonth.format(d)} ${String(d.getUTCFullYear()).slice(2)}`;
}

function monthKeysThrough(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let year = Number(fromKey.slice(0, 4));
  let month = Number(fromKey.slice(5, 7));
  const endYear = Number(toKey.slice(0, 4));
  const endMonth = Number(toKey.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function keyOf(iso: string, asOf: Date): string | null {
  const d = parseDate(iso);
  if (!d || d > asOf) return null;
  return monthKey(d);
}

/**
 * One point per calendar month from the first month with a reservation or closing through
 * the as-of month, capped at the last `maxMonths` (24). The current month is flagged
 * `partial` and is not extrapolated.
 */
export function computeMonthlyHistory(lots: Lot[], asOf: Date, opts: HistoryOptions = {}): MonthlyPoint[] {
  const today = startOfUtcDay(asOf);
  const currentKey = monthKey(today);
  const era = parseDate(eraStartOf(opts.eraStart) ?? undefined);
  const maxMonths = opts.maxMonths ?? DEFAULT_MAX_MONTHS;

  const seen = new Set<string>();
  for (const lot of lots) {
    if (lot.reservationDate) {
      const k = keyOf(lot.reservationDate, today);
      if (k) seen.add(k);
    }
    if (isSold(lot) && lot.closeDate) {
      const k = keyOf(lot.closeDate, today);
      if (k) seen.add(k);
    }
  }
  if (seen.size === 0) return [];

  const first = [...seen].sort()[0] as string;
  const keys = monthKeysThrough(first, currentKey);
  const window = keys.length > maxMonths ? keys.slice(-maxMonths) : keys;
  const inWindow = new Set(window);

  const reservations = new Map<string, number>();
  const closings = new Map<string, number>();
  const profit = new Map<string, number[]>();
  for (const k of window) {
    reservations.set(k, 0);
    closings.set(k, 0);
    profit.set(k, []);
  }

  for (const lot of lots) {
    if (lot.reservationDate) {
      const k = keyOf(lot.reservationDate, today);
      if (k && inWindow.has(k)) reservations.set(k, (reservations.get(k) ?? 0) + 1);
    }
    if (isSold(lot) && lot.closeDate) {
      const k = keyOf(lot.closeDate, today);
      if (k && inWindow.has(k)) {
        closings.set(k, (closings.get(k) ?? 0) + 1);
        profit.get(k)?.push(lot.netProfit ?? 0);
      }
    }
  }

  return window.map((k) => {
    const start = parseDate(`${k}-01`) as Date;
    const end = endOfUtcMonth(start);
    return {
      month: toIsoDate(start),
      label: historyMonthLabel(start.toISOString().slice(0, 10)),
      reservations: reservations.get(k) ?? 0,
      closings: closings.get(k) ?? 0,
      netProfit: round2(sum(profit.get(k) ?? [])),
      beforeEra: era !== null && end < era,
      partial: k === currentKey,
    };
  });
}
