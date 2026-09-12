import { round2 } from "./math";

/**
 * THE PULSE — producing ÷ needed as a percentage. Display only: the two inputs are already
 * computed (`oxygen.netProfitPerDayAtPace`, `debt.requiredNetProfitPerDay`). No new money math.
 */
export function pulseRatioPct(producing: number | null, needed: number | null): number | null {
  if (producing === null || needed === null || needed <= 0) return null;
  return round2((producing / needed) * 100);
}

/** Colour band for the Pulse ratio line. Existing tokens only: ember / gold / oxygen. */
export function pulseBand(ratioPct: number): "ember" | "gold" | "oxygen" {
  if (ratioPct < 90) return "ember";
  if (ratioPct > 110) return "oxygen";
  return "gold";
}
