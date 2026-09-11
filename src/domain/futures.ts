import type { GoalStatus } from "./goal";
import { runOracle, type OracleParams, type OracleResult } from "./oracle";
import { daysBetween, parseDate } from "./dates";
import { round2 } from "./math";

export type FutureId = "current_pace" | "required_pace" | "one_more_farm";

/** ORACLE (Phase 2 §6) — three futures side by side, all seeded from the real trailing averages. */
export interface Future {
  id: FutureId;
  title: string;
  premise: string;
  params: OracleParams;
  startInventory: number;
  result: OracleResult;
  /** Exit date (goal reached) or null when not within the horizon. */
  exitDate: string | null;
  hitsDeadline: boolean;
  /** Days this future exits before the current-pace future (positive = earlier). Null when either is unknown. */
  daysEarlierThanCurrent: number | null;
}

export interface Futures {
  current: Future;
  required: Future;
  oneMoreFarm: Future;
  all: Future[];
}

/**
 * @param activeFarms farms that were selling during the trailing window (funded, with unsold
 *   lots) — the current pace is spread across them to size what one more farm adds.
 */
export function computeFutures(defaults: OracleParams, goal: GoalStatus, startInventory: number, asOf: Date, activeFarms: number): Futures {
  const build = (id: FutureId, title: string, premise: string, params: OracleParams, inventory: number): Future => {
    const result = runOracle(params, goal, inventory, asOf);
    return {
      id,
      title,
      premise,
      params,
      startInventory: inventory,
      result,
      exitDate: result.goalDate,
      hitsDeadline: result.hitsDeadline,
      daysEarlierThanCurrent: null,
    };
  };

  const current = build(
    "current_pace",
    "At the current pace",
    `${defaults.lotsPerMonth} lots/month and a new farm every ${defaults.newFarmEveryMonths} months — exactly the trailing averages.`,
    defaults,
    startInventory,
  );

  // Required pace in the Oracle's own economics (its net profit per lot), so this future lands
  // on the deadline; GoalStatus.requiredLotsPerMonthToHitDeadline uses the ledger average instead.
  // The simulation books closings in whole months, so spread the lots over the whole months left.
  const wholeMonthsLeft = Math.floor(goal.monthsToDeadline);
  const requiredPace =
    current.result.lotsNeeded !== null && wholeMonthsLeft > 0
      ? round2(current.result.lotsNeeded / wholeMonthsLeft)
      : goal.requiredLotsPerMonthToHitDeadline ?? defaults.lotsPerMonth;
  // Inventory has to keep up with the pace: at least one farm per (lots per farm ÷ lots per month) months.
  const farmCadence =
    requiredPace > 0 && defaults.avgLotsPerFarm > 0
      ? round2(Math.min(defaults.newFarmEveryMonths > 0 ? defaults.newFarmEveryMonths : Infinity, defaults.avgLotsPerFarm / requiredPace))
      : defaults.newFarmEveryMonths;
  const required = build(
    "required_pace",
    "At the required pace",
    `${requiredPace} lots/month — what the deadline demands — buying a farm every ${farmCadence} months to keep inventory.`,
    { ...defaults, lotsPerMonth: requiredPace, newFarmEveryMonths: farmCadence },
    startInventory,
  );

  // One more farm selling in parallel adds its own stream of closings (the average per active
  // farm) on top of the current pace, and its lots to today's inventory.
  const perFarmPace = activeFarms > 0 ? round2(defaults.lotsPerMonth / activeFarms) : 0;
  const oneMoreFarm = build(
    "one_more_farm",
    "Current pace, one more farm",
    `One extra farm of ${defaults.avgLotsPerFarm} lots bought today and selling like the others: ${round2(defaults.lotsPerMonth + perFarmPace)} lots/month in total.`,
    { ...defaults, lotsPerMonth: round2(defaults.lotsPerMonth + perFarmPace) },
    startInventory + defaults.avgLotsPerFarm,
  );

  const currentExit = parseDate(current.exitDate);
  const withDiff = (f: Future): Future => {
    const exit = parseDate(f.exitDate);
    return { ...f, daysEarlierThanCurrent: exit && currentExit ? daysBetween(exit, currentExit) : null };
  };
  const all = [withDiff(current), withDiff(required), withDiff(oneMoreFarm)];
  return { current: all[0] as Future, required: all[1] as Future, oneMoreFarm: all[2] as Future, all };
}
