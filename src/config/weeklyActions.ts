/**
 * Weekly action system — thresholds only. Scoring lives in src/domain/weeklyActions.ts
 * and is documented in AUDIT.md §8.
 */

/** A candidate below this many days is not enough to fill the week list on its own. */
export const WEEKLY_MIN_DAYS = 3;

/** next_farm_fund_by fires only when the fund-by date is this many days away (or already past). */
export const WEEKLY_FUND_BY_WINDOW_DAYS = 120;

/** Rank multiplier when the action's due date is within this many days (including overdue). */
export const WEEKLY_URGENCY_WITHIN_DAYS = 14;
export const WEEKLY_URGENCY_MULTIPLIER = 1.5;

/**
 * Held notes whose sale at the measured ratio would cost more than this (USD)
 * become a held_note_discount candidate.
 */
export const HELD_NOTE_DISCOUNT_MIN_USD = 20_000;

/** Time zone the ISO week is frozen against (Monday 00:00). */
export const WEEKLY_ACTIONS_TZ = "America/Chicago";
