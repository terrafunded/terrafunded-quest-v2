/**
 * Path to the goal — one shared reading of flat vs rotation figures.
 *
 * LOTS TO SELL is flat: remaining ÷ avg net profit per lot. That is the total number of
 * closings between now and the deadline. It is not an inventory requirement.
 *
 * FARMS TO BUY and CAPITAL TO RAISE are rotation figures: they come from the War Plan's
 * required schedule (the same capital-turn simulation the Engine family uses) — never from
 * lots ÷ lots-per-farm or the closed-form turns formula.
 *
 * INVENTORY is a runway question: how many months the lots on hand last at the current
 * closing pace, when inventory hits zero, and by when the next farm must be funded so
 * inventory never runs out (working back by the observed farm→first-close lag).
 */
import { addMonths, monthsBetween, parseDate, toIsoDate } from "./dates";
import type { GoalStatus } from "./goal";
import { round2 } from "./math";
import type { WarPlan } from "./warplan";

export type InventoryRunwaySeverity = "critical" | "warning" | "ok";

export interface PathToGoal {
  /** Flat: remaining ÷ avg net profit per lot. Total closings to the deadline — not inventory. */
  lotsToSell: number | null;
  /**
   * Rotation: farms in the required War Plan buy schedule (capital turns before the deadline).
   * This is the single farms-to-buy figure Throne, Council, War Plan and Engine must share.
   */
  farmsToBuy: number;
  /**
   * Rotation: peak land capital outstanding under the required schedule — the amount that
   * actually has to be raised (not Σ farm costs).
   */
  capitalToRaise: number;
  /** Fresh money the mix brings under the required plan (Σ cost − recycled). */
  freshCapital: number;
  /** totalDeployed ÷ peakOutstanding on the required plan. */
  turns: number | null;
  cycleMonths: number | null;
  inventoryOnHand: number;
  closingPacePerMonth: number;
  /** Months today's available lots last at the trailing closing pace. */
  inventoryRunwayMonths: number | null;
  /** ISO date when available inventory hits zero at the trailing pace. */
  inventoryZeroDate: string | null;
  /** Observed months from farm funding to first closing (War Plan land lag). */
  farmToFirstCloseLagMonths: number;
  /**
   * Date by which the next farm must be funded so inventory never hits zero:
   * inventoryZeroDate − farmToFirstCloseLagMonths.
   */
  nextFarmFundByDate: string | null;
  /** Months from asOf until nextFarmFundByDate; negative when the fund-by date is already past. */
  monthsUntilFundBy: number | null;
  /** Severity from how close the next-farm funding date is — not from a gap against lotsToSell. */
  inventorySeverity: InventoryRunwaySeverity;
}

/**
 * Build the shared path-to-goal reading from a solved War Plan and the goal's flat closings figure.
 * Pure: no I/O. Call once from `buildRealm` so every page reads the same object.
 */
export function computePathToGoal(goal: GoalStatus, warPlan: WarPlan, asOf: Date): PathToGoal {
  const required = warPlan.required;
  const rotation = warPlan.rotation;
  const inventoryOnHand = goal.availableLots;
  const closingPacePerMonth = goal.closedLotsPerMonth;
  const lag = Math.max(0, warPlan.landLag);

  let inventoryRunwayMonths: number | null = null;
  let inventoryZeroDate: string | null = null;
  let nextFarmFundByDate: string | null = null;
  let monthsUntilFundBy: number | null = null;

  if (closingPacePerMonth > 0) {
    inventoryRunwayMonths = round2(inventoryOnHand / closingPacePerMonth);
    const zero = addMonths(asOf, inventoryRunwayMonths);
    inventoryZeroDate = toIsoDate(zero);
    const fundBy = addMonths(zero, -lag);
    nextFarmFundByDate = toIsoDate(fundBy);
    monthsUntilFundBy = round2(monthsBetween(asOf, fundBy));
  } else if (inventoryOnHand <= 0) {
    inventoryRunwayMonths = 0;
    inventoryZeroDate = toIsoDate(asOf);
    nextFarmFundByDate = toIsoDate(addMonths(asOf, -lag));
    const fundBy = parseDate(nextFarmFundByDate);
    monthsUntilFundBy = fundBy ? round2(monthsBetween(asOf, fundBy)) : 0;
  }

  const inventorySeverity = runwaySeverity(monthsUntilFundBy, inventoryOnHand, closingPacePerMonth);

  return {
    lotsToSell: goal.lotsStillNeeded,
    farmsToBuy: required.farmsToBuy,
    capitalToRaise: rotation.peakOutstanding,
    freshCapital: required.capitalToRaise,
    turns: rotation.turnsNeeded,
    cycleMonths: rotation.cycleMonths,
    inventoryOnHand,
    closingPacePerMonth,
    inventoryRunwayMonths,
    inventoryZeroDate,
    farmToFirstCloseLagMonths: lag,
    nextFarmFundByDate,
    monthsUntilFundBy,
    inventorySeverity,
  };
}

/**
 * Overlay the shared rotation farms figure onto the goal so every `goal.farmsStillNeeded` reader
 * (Throne, export, reconcile) sees the War Plan schedule — not the closed-form turns formula.
 */
export function withPathToGoalFarms(goal: GoalStatus, path: PathToGoal): GoalStatus {
  return {
    ...goal,
    farmsStillNeeded: path.farmsToBuy,
    farmsStillNeededRecent: path.farmsToBuy,
  };
}

/** Severity from funding-date urgency. Critical within 2 months (or overdue); warning within 4. */
export function runwaySeverity(
  monthsUntilFundBy: number | null,
  inventoryOnHand: number,
  closingPacePerMonth: number,
): InventoryRunwaySeverity {
  if (!(closingPacePerMonth > 0)) {
    return inventoryOnHand > 0 ? "ok" : "critical";
  }
  if (monthsUntilFundBy === null) return "ok";
  if (monthsUntilFundBy <= 2) return "critical";
  if (monthsUntilFundBy <= 4) return "warning";
  return "ok";
}
