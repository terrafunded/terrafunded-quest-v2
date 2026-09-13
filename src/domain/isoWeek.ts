/**
 * ISO week (Monday–Sunday, week 1 contains the first Thursday). Pure, UTC-only.
 * The weekly read is cached and titled by this week, not the local calendar.
 */

export interface IsoWeek {
  /** `YYYY-Www`, ISO week-year (which can differ from the calendar year in the first/last days). */
  week: string;
  /** Monday of that week, ISO date. */
  weekOf: string;
  year: number;
  weekNumber: number;
}

/** Thursday of the ISO week that contains `day` (UTC midnight). */
function thursdayOf(day: Date): Date {
  const utc = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const dow = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dow);
  return utc;
}

export function isoWeekOf(day: Date): IsoWeek {
  const thursday = thursdayOf(day);
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const weekNumber = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  const monday = new Date(thursday);
  monday.setUTCDate(thursday.getUTCDate() - 3);
  return {
    week: `${year}-W${String(weekNumber).padStart(2, "0")}`,
    weekOf: monday.toISOString().slice(0, 10),
    year,
    weekNumber,
  };
}

/** UTC date of today for the weekly-read clock (tests pass a fixed `now`). */
export function utcToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
