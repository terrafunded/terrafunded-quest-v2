import { ERA_START } from "../config/goal";
import { addDays, daysBetween, maxDate, parseDate, toIsoDate } from "./dates";

/**
 * THE ERA — sales operations started in earnest on `ERA_START` (config/goal.ts). Every rate,
 * average and trend is measured from that day on; earlier closings are real money but not
 * representative of pace, so totals keep the full history. Pass `null` as `eraStart` to measure
 * over everything; `undefined` takes the configured start.
 */
export interface Era {
  /** ISO date the era starts on. */
  start: string;
  startDate: Date;
  /** "Mar 2026". */
  label: string;
  /** "since Mar 2026" — the tag every era-scoped number carries on screen. */
  since: string;
  /** Whole calendar months from the era start to asOf (6 on 2026-09-11; 12 from 2027-03-01). */
  monthsOfHistory: number;
}

export type EraStart = string | null | undefined;

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "Mar 2026" from an ISO date. */
export function eraMonthLabel(iso: string): string {
  const d = parseDate(iso);
  return d ? monthFmt.format(d) : iso;
}

/** Whole calendar months from `a` to `b` (0 when b is before a): Mar 1 → Sep 11 is 6, Mar 1 → Mar 1 a year on is 12. */
export function wholeMonthsBetween(a: Date, b: Date): number {
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** The configured start unless an explicit one (or `null`, meaning no era) is given. */
export function eraStartOf(eraStart: EraStart): string | null {
  return eraStart === undefined ? ERA_START : eraStart;
}

/**
 * The era as it stands on `asOf`, or null when there is none — disabled, unparseable, or not yet
 * begun (an era that starts after `asOf` has no history to measure, so everything before it counts).
 */
export function resolveEra(asOf: Date, eraStart: EraStart = undefined): Era | null {
  const iso = eraStartOf(eraStart);
  const start = parseDate(iso);
  if (!iso || !start || start > asOf) return null;
  return {
    start: toIsoDate(start),
    startDate: start,
    label: eraMonthLabel(iso),
    since: `since ${eraMonthLabel(iso)}`,
    monthsOfHistory: wholeMonthsBetween(start, asOf),
  };
}

/** True when `iso` is a date on or after the era start (always true without an era). */
export function inEra(iso: string | null | undefined, era: Era | null): boolean {
  if (!era) return true;
  const d = parseDate(iso);
  return !!d && d >= era.startDate;
}

/** A trailing window that never reaches back before the era. */
export interface TrailingWindow {
  /** Exclusive lower bound: dates strictly after it count. */
  from: Date;
  /** First day counted (ISO). */
  since: string;
  /** Days the window really covers — the requested width, or fewer when the era start cut it. */
  days: number;
  /** Days that were asked for. */
  requestedDays: number;
  /** True when the era start cut the requested window short. */
  eraClipped: boolean;
  /** The era the window was clipped against, when any. */
  era: Era | null;
}

/**
 * The trailing `windowDays` ending on `asOf`, clipped so nothing before the era start counts:
 * from = max(asOf − windowDays, era start − 1 day). Divide by `days`, not `requestedDays`, so a
 * clipped window still yields a per-day (or per-month) rate over the days it really covers.
 */
export function trailingWindow(asOf: Date, windowDays: number, eraStart: EraStart = undefined): TrailingWindow {
  const era = resolveEra(asOf, eraStart);
  const requested = addDays(asOf, -windowDays);
  const eraFrom = era ? addDays(era.startDate, -1) : null;
  const from = (maxDate(requested, eraFrom) ?? requested) as Date;
  const eraClipped = eraFrom !== null && eraFrom > requested;
  return {
    from,
    since: toIsoDate(addDays(from, 1)),
    days: Math.max(1, daysBetween(from, asOf)),
    requestedDays: windowDays,
    eraClipped,
    era,
  };
}

/** "last 90 days", or "since Mar 2026 (71 days)" when the era cut the window short. */
export function trailingWindowLabel(w: Pick<TrailingWindow, "days" | "requestedDays" | "eraClipped" | "era">): string {
  if (w.eraClipped && w.era) return `${w.era.since} (${w.days} ${w.days === 1 ? "day" : "days"})`;
  return `last ${w.requestedDays} days`;
}
