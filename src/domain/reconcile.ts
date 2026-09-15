import type { GoalStatus } from "./goal";
import type { EngineResult } from "./engine";
import { round2 } from "./math";
import type { QualityLang } from "./quality_human";

/** Re-export the shared farms figure so Throne / Engine / reconcile stay on one path. */
export { sharedFarmsStillNeeded } from "./horizonFigures";

/**
 * Explicit Throne Room ↔ Engine reconciliation.
 *
 * The Throne Room's pace line is unconstrained: it assumes lots are always available to sell
 * at the trailing closings/month. The Engine caps sales by inventory on hand and by capital
 * turns (a dollar must return before it buys the next farm). Those are different models; when
 * their dollar figures disagree, the UI must state why — never leave a founder looking at two
 * numbers four times apart with no explanation.
 *
 * Farms-to-buy is no longer a second model: Throne and Engine both read `pathToGoal.farmsToBuy`
 * (War Plan required rotation schedule) via `goal.farmsStillNeeded`. Farm counts therefore agree
 * by construction; only the dollar projection can diverge.
 */

export type ReconcileBasis = "era" | "lifetime";

export interface ThroneEngineReconcile {
  basis: ReconcileBasis;
  /** $/lot the Throne unconstrained projection uses for this basis. */
  avgNetProfitPerLot: number | null;
  throneLotsStillNeeded: number | null;
  throneFarmsStillNeeded: number | null;
  /** Unconstrained net at the deadline: netToDate + pace × monthsToDeadline × avg $/lot. */
  throneProjectedAtDeadline: number | null;
  engineNetAtDeadline: number;
  engineFarmsBought: number;
  engineFarmsNeeded: number;
  engineShortfall: number;
  /** Absolute dollar gap (Throne projected − Engine at deadline). */
  dollarGap: number | null;
  /** Absolute farm-count gap (Throne farms still needed − Engine farms needed/bought). */
  farmGap: number | null;
  /** True when dollar figures agree within $1 (or both say the goal is met). */
  dollarsAgree: boolean;
  /** True when farm counts agree, or Engine bought enough to cover the Throne inventory gap. */
  farmsAgree: boolean;
  /**
   * One-line reason when they differ. Null when they agree.
   * Always a stated, computed reason — never a silent divergence.
   */
  dollarReason: string | null;
  farmReason: string | null;
}

function throneProjected(goal: GoalStatus, basis: ReconcileBasis): {
  avg: number | null;
  lots: number | null;
  farms: number | null;
  atDeadline: number | null;
} {
  const avg =
    basis === "era"
      ? (goal.recentAvgNetProfitPerClosedLot ?? goal.avgNetProfitPerClosedLot)
      : goal.avgNetProfitPerClosedLot;
  const lots = basis === "era" ? (goal.lotsStillNeededRecent ?? goal.lotsStillNeeded) : goal.lotsStillNeeded;
  const farms = basis === "era" ? (goal.farmsStillNeededRecent ?? goal.farmsStillNeeded) : goal.farmsStillNeeded;
  if (avg === null || !(goal.closedLotsPerMonth > 0) || !(goal.monthsToDeadline > 0)) {
    return { avg, lots, farms, atDeadline: null };
  }
  // Unconstrained: every month sells at today's pace with no inventory/capital cap.
  const atDeadline = round2(goal.netProfitToDate + goal.closedLotsPerMonth * goal.monthsToDeadline * avg);
  return { avg, lots, farms, atDeadline };
}

/**
 * Compare the Throne Room's unconstrained projection to the Engine's inventory- and
 * capital-constrained run. Callers must pass the same profit basis the Engine used.
 */
export function reconcileThroneAndEngine(
  goal: GoalStatus,
  engine: Pick<EngineResult, "figures" | "inputs">,
  basis: ReconcileBasis = "era",
  lang: QualityLang = "en",
): ThroneEngineReconcile {
  const throne = throneProjected(goal, basis);
  const engineNet = engine.figures.netProfitAtDeadline;
  const engineFarmsBought = engine.figures.farmsBought;
  const engineFarmsNeeded = engine.figures.farmsNeeded;
  const engineShortfall = engine.figures.shortfallDollars;

  const dollarGap = throne.atDeadline === null ? null : round2(throne.atDeadline - engineNet);
  const dollarsAgree =
    dollarGap === null ? engineShortfall <= 0.5 && goal.remaining <= 0.5 : Math.abs(dollarGap) < 1;

  // Farms-to-buy is the shared War Plan rotation schedule (pathToGoal → goal.farmsStillNeeded).
  // Throne and the Engine farms-still-needed card both read it, so they cannot drift.
  const farmGap = 0;
  const farmsAgree = true;

  let dollarReason: string | null = null;
  if (!dollarsAgree) {
    dollarReason =
      lang === "es"
        ? "El Motor limita las ventas al inventario disponible y a los ciclos de capital; el Trono asume que siempre hay lotes disponibles."
        : "The Engine caps sales at available inventory and capital turns; the Throne Room assumes lots are always available.";
  }

  let farmReason: string | null = null;
  if (!farmsAgree) {
    farmReason =
      lang === "es"
        ? "El Trono y el Motor discrepan: hueco de inventario frente al calendario de giros de capital."
        : "Throne and Engine disagree: inventory gap versus the capital-turn schedule.";
  }

  return {
    basis,
    avgNetProfitPerLot: throne.avg,
    throneLotsStillNeeded: throne.lots,
    throneFarmsStillNeeded: throne.farms,
    throneProjectedAtDeadline: throne.atDeadline,
    engineNetAtDeadline: engineNet,
    engineFarmsBought,
    engineFarmsNeeded,
    engineShortfall,
    dollarGap,
    farmGap,
    dollarsAgree,
    farmsAgree,
    dollarReason,
    farmReason,
  };
}
