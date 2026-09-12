/**
 * The Exodus's editable prefills (`src/domain/exodus.ts`). The capital to return lives with the
 * goal (`LP_CAPITAL_TO_RETURN` in `goal.ts`); everything else the page starts from is here.
 */

/** Percent of the LP capital paid in note fractions, where the slider starts. */
export const EXODUS_DEFAULT_NOTES_PCT = 30;

/** The slider's upper bound; `maxNotesPct` is searched over 0..this. */
export const EXODUS_NOTES_PCT_MAX = 60;

/** Notes that may never be delivered to LPs, by `notes.note_code`. EAS-L04 is in dispute. */
export const EXODUS_DEFAULT_EXCLUDED_NOTE_CODES: readonly string[] = ["EAS-L04"];

/**
 * Portafolio cash on hand when the loop starts. Payments holds no bank balance; "cash kept"
 * (receipts − payouts since inception) is shown next to the input but not assumed, because the
 * farm waterfalls say part of it belongs to partners and operating costs since inception are unknown.
 */
export const EXODUS_DEFAULT_STARTING_CASH = 0;
