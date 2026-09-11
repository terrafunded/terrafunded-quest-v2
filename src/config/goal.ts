/**
 * The Goal. Editable, versioned in git. Every page derives from these numbers.
 */
export const GOAL_NET_PROFIT = 10_000_000;

/** ISO date (UTC). The fund must be paid out and closed by this day. */
export const GOAL_DEADLINE = "2027-12-31";

/**
 * Capital invested by the limited partners of Portafolio Diversificado Alpha LP, to be returned
 * by the deadline in cash and note fractions (the Exodus, `src/domain/exodus.ts`).
 */
export const LP_CAPITAL_TO_RETURN = 10_000_000;

/** Trailing window used for "current pace" (closed lots per month). */
export const TRAILING_WINDOW_DAYS = 90;

/**
 * ISO date (UTC). Sales operations started in earnest in March 2026; earlier closings are real
 * money but not representative of pace. Every rate, average and trend (net profit per day, farm
 * cadence, reservations and closings per month, seasonality, best week and month, the War Plan's
 * cycle length and land-cost trend) is measured from this day on. Totals — net profit, cash
 * realized, capital returned, liberation — keep the full history.
 */
export const ERA_START = "2026-03-01";

/** Every time cumulative net profit crosses a multiple of this, the chronicle celebrates. */
export const MILESTONE_STEP = 1_000_000;

/**
 * Farms that `payments_schema.md` explicitly describes as "legacy / one-off
 * properties with no lot subdivision". They are excluded from lot economics even
 * when `total_lots > 1` (Red River 1 has total_lots = 2 but its "lots" are legacy
 * cyberlots notes that predate the farm purchase). The Data Quality panel still
 * surfaces them; see OPEN_QUESTIONS.md.
 */
export const LEGACY_FARM_NAMES: readonly string[] = ["Ben White", "Sharps Rd", "Olney", "Red River 1"];

/** Average days per month used to convert the trailing window into a monthly rate. */
export const DAYS_PER_MONTH = 365.25 / 12;
