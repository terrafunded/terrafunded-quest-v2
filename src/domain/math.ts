/** Rounds to cents. Payments stores numerics with 2 decimals; we never display more. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sum(values: Iterable<number | null | undefined>): number {
  let total = 0;
  for (const v of values) total += v ?? 0;
  return total;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return sum(values) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  return lo === undefined || hi === undefined ? null : (lo + hi) / 2;
}

/**
 * Payments stores `farm_acquisitions.annual_interest_rate` as a percent (20 = 20%)
 * while `file_cases.interest_rate` is a fraction (0.0699). Accept either and return a percent.
 */
export function toPercent(rate: number | null | undefined): number {
  if (rate === null || rate === undefined) return 0;
  return rate > 1 ? rate : rate * 100;
}

export function groupBy<T, K extends string | number>(items: Iterable<T>, key: (t: T) => K | null | undefined): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null || k === undefined) continue;
    const arr = out.get(k);
    if (arr) arr.push(item);
    else out.set(k, [item]);
  }
  return out;
}

export function indexBy<T, K extends string | number>(items: Iterable<T>, key: (t: T) => K | null | undefined): Map<K, T> {
  const out = new Map<K, T>();
  for (const item of items) {
    const k = key(item);
    if (k !== null && k !== undefined) out.set(k, item);
  }
  return out;
}
