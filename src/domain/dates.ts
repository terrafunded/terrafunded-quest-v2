/**
 * Pure date helpers. All dates in Payments are `date` columns (YYYY-MM-DD) or
 * timestamptz; we normalize everything to UTC midnight so day arithmetic is exact.
 */

const MS_PER_DAY = 86_400_000;

const PARSE_CACHE = new Map<string, Date | null>();

/** Parses "YYYY-MM-DD" or an ISO timestamp into a UTC-midnight Date. Returns null for bad input. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hit = PARSE_CACHE.get(value);
  if (hit !== undefined) return hit;
  const head = value.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) {
    PARSE_CACHE.set(value, null);
    return null;
  }
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const parsed = Number.isNaN(d.getTime()) ? null : d;
  PARSE_CACHE.set(value, parsed);
  return parsed;
}

/** Truncates any Date to UTC midnight. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole days from `a` to `b` (positive when b is after a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfUtcDay(b).getTime() - startOfUtcDay(a).getTime()) / MS_PER_DAY);
}

export function addDays(d: Date, days: number): Date {
  return new Date(startOfUtcDay(d).getTime() + days * MS_PER_DAY);
}

export function addMonths(d: Date, months: number): Date {
  const whole = Math.floor(months);
  const frac = months - whole;
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + whole, d.getUTCDate()));
  return addDays(base, Math.round(frac * 30.44));
}

/** Last day of the UTC month `d` falls in. */
export function endOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function daysInUtcMonth(d: Date): number {
  return endOfUtcMonth(d).getUTCDate();
}

/** "YYYY-MM" bucket key. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function toIsoDate(d: Date): string {
  return startOfUtcDay(d).toISOString().slice(0, 10);
}

/** Fractional months between two dates using the mean Gregorian month. */
export function monthsBetween(a: Date, b: Date): number {
  return daysBetween(a, b) / (365.25 / 12);
}

/** Latest of the given dates, ignoring nulls. */
export function maxDate(...ds: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const d of ds) if (d && (!best || d > best)) best = d;
  return best;
}

export function minDate(...ds: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const d of ds) if (d && (!best || d < best)) best = d;
  return best;
}
