import {
  DEFAULT_EXIT_HORIZON,
  EXIT_HORIZONS,
  deadlineForHorizon,
  isExitHorizon,
  type ExitHorizon,
} from "@/config/goal";

export const HORIZON_STORAGE_KEY = "quest.v2.exitHorizon";

export { DEFAULT_EXIT_HORIZON, EXIT_HORIZONS, deadlineForHorizon, isExitHorizon, type ExitHorizon };

/**
 * Accepts a stored value (number or numeric string). Anything not in `EXIT_HORIZONS`
 * — garbage, a free date, a year outside the three — falls back to the default.
 */
export function parseStoredHorizon(raw: unknown): ExitHorizon {
  if (isExitHorizon(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (isExitHorizon(n)) return n;
  }
  return DEFAULT_EXIT_HORIZON;
}

/** Reads the persisted exit horizon; never throws (private mode, disabled storage). */
export function readStoredHorizon(): ExitHorizon {
  try {
    return parseStoredHorizon(localStorage.getItem(HORIZON_STORAGE_KEY));
  } catch {
    return DEFAULT_EXIT_HORIZON;
  }
}
