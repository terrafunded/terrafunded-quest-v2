/**
 * The Engine's editable prefills. Versioned in git like the War Plan's.
 */

/** Marketing dollars per reservation (lead). Cost per closing = this ÷ conversion. */
export const ENGINE_DEFAULT_COST_PER_RESERVATION = 2_000;

/** Hard cap on farms the greedy schedule will buy before giving up. */
export const ENGINE_MAX_FARMS = 40;

/** Sensitivity grid: pace multipliers on the modelled sales pace. */
export const ENGINE_PACE_MULTIPLIERS = [1, 1.5, 2] as const;

/** Sensitivity grid: cycle offsets in days around the benchmark (±60). */
export const ENGINE_CYCLE_OFFSET_DAYS = [-60, 0, 60] as const;
