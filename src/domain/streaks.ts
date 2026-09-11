import { addDays, parseDate, startOfUtcDay, toIsoDate } from "./dates";
import { round2 } from "./math";

/**
 * STREAKS (Phase 2 §5) — consecutive ISO weeks with at least one closing, from real closing dates.
 */
export interface WeekTally {
  /** ISO week key, e.g. "2026-W23". */
  week: string;
  /** Monday of that week, ISO date. */
  weekStart: string;
  count: number;
  netProfit: number;
}

export interface MonthTally {
  month: string;
  count: number;
  netProfit: number;
}

export interface Streaks {
  /** Weeks in the streak that includes the current or the immediately previous ISO week. 0 if broken. */
  currentWeeks: number;
  /** The longest run of consecutive weeks with a closing. */
  bestWeeks: number;
  bestWeeksEndedOn: string | null;
  /** Whether the current ISO week already has a closing. */
  closedThisWeek: boolean;
  /** Days left in the current ISO week to keep the streak alive (0 when already closed this week). */
  daysToKeepStreak: number;
  bestWeek: WeekTally | null;
  bestMonth: MonthTally | null;
  weeks: WeekTally[];
  months: MonthTally[];
  currentMonths: number;
  bestMonths: number;
}

export interface Closing {
  date: string;
  netProfit: number;
}

/** Monday 00:00 UTC of the ISO week containing `d`. */
export function isoWeekStart(d: Date): Date {
  const day = startOfUtcDay(d);
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

/** "YYYY-Www" using the ISO-8601 week-numbering year. */
export function isoWeekKey(d: Date): string {
  const monday = isoWeekStart(d);
  const thursday = addDays(monday, 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Monday = isoWeekStart(jan4);
  const week = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 86_400_000)) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function longestRun(sortedStarts: Date[], stepDays: (from: Date) => Date): { best: number; endedOn: Date | null } {
  let best = 0;
  let run = 0;
  let endedOn: Date | null = null;
  let prev: Date | null = null;
  for (const cur of sortedStarts) {
    run = prev && stepDays(prev).getTime() === cur.getTime() ? run + 1 : 1;
    if (run > best) {
      best = run;
      endedOn = cur;
    }
    prev = cur;
  }
  return { best, endedOn };
}

function runEndingAt(sortedStarts: Date[], anchor: Date, stepBack: (from: Date) => Date): number {
  const set = new Set(sortedStarts.map((d) => d.getTime()));
  let cursor = anchor;
  let n = 0;
  while (set.has(cursor.getTime())) {
    n += 1;
    cursor = stepBack(cursor);
  }
  return n;
}

const nextWeek = (d: Date) => addDays(d, 7);
const prevWeek = (d: Date) => addDays(d, -7);
const nextMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
const prevMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));

export function computeStreaks(closings: Closing[], asOf: Date): Streaks {
  const today = startOfUtcDay(asOf);
  const past = closings.map((c) => ({ ...c, d: parseDate(c.date) })).filter((c): c is Closing & { d: Date } => !!c.d && c.d <= today);

  const weekMap = new Map<string, WeekTally>();
  const monthMap = new Map<string, MonthTally>();
  for (const c of past) {
    const ws = isoWeekStart(c.d);
    const wk = isoWeekKey(c.d);
    const w = weekMap.get(wk) ?? { week: wk, weekStart: toIsoDate(ws), count: 0, netProfit: 0 };
    w.count += 1;
    w.netProfit = round2(w.netProfit + c.netProfit);
    weekMap.set(wk, w);

    const mk = c.date.slice(0, 7);
    const m = monthMap.get(mk) ?? { month: mk, count: 0, netProfit: 0 };
    m.count += 1;
    m.netProfit = round2(m.netProfit + c.netProfit);
    monthMap.set(mk, m);
  }

  const weeks = [...weekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  const weekStarts = weeks.map((w) => parseDate(w.weekStart) as Date);
  const monthStarts = months.map((m) => parseDate(`${m.month}-01`) as Date);

  const thisWeek = isoWeekStart(today);
  const closedThisWeek = weekStarts.some((d) => d.getTime() === thisWeek.getTime());
  // A streak is alive if it reaches this week or last week (this week may still be closed).
  const currentWeeks = closedThisWeek ? runEndingAt(weekStarts, thisWeek, prevWeek) : runEndingAt(weekStarts, prevWeek(thisWeek), prevWeek);

  const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const closedThisMonth = monthStarts.some((d) => d.getTime() === thisMonth.getTime());
  const currentMonths = closedThisMonth ? runEndingAt(monthStarts, thisMonth, prevMonth) : runEndingAt(monthStarts, prevMonth(thisMonth), prevMonth);

  const bestW = longestRun(weekStarts, nextWeek);
  const bestM = longestRun(monthStarts, nextMonth);

  const byCount = <T extends { count: number; netProfit: number }>(a: T, b: T) => b.count - a.count || b.netProfit - a.netProfit;
  const sundayEnd = addDays(thisWeek, 6);

  return {
    currentWeeks,
    bestWeeks: bestW.best,
    bestWeeksEndedOn: bestW.endedOn ? toIsoDate(addDays(bestW.endedOn, 6)) : null,
    closedThisWeek,
    daysToKeepStreak: closedThisWeek ? 0 : Math.max(0, Math.round((sundayEnd.getTime() - today.getTime()) / 86_400_000)),
    bestWeek: [...weeks].sort(byCount)[0] ?? null,
    bestMonth: [...months].sort(byCount)[0] ?? null,
    weeks,
    months,
    currentMonths,
    bestMonths: bestM.best,
  };
}
