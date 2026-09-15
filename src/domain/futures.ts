import type { GoalStatus } from "./goal";
import type { Expected } from "./expected";
import { runOracle, type OracleParams, type OracleResult, type OracleRunOptions, type ScheduledClosing } from "./oracle";
import { daysBetween, parseDate } from "./dates";
import { round2 } from "./math";
import type { QualityLang } from "./quality_human";

export type FutureId = "current_pace" | "required_pace" | "one_more_farm" | "closings_only";

/** ORACLE (Phase 2 §6) — futures side by side, all seeded from the real trailing averages. */
export interface Future {
  id: FutureId;
  title: string;
  premise: string;
  params: OracleParams;
  startInventory: number;
  /** Committed closings this future starts with (live reservations on their expected dates). */
  scheduled: ScheduledClosing[];
  result: OracleResult;
  /** Exit date (goal reached) or null when not within the horizon. */
  exitDate: string | null;
  hitsDeadline: boolean;
  /** Days this future exits before the current-pace future (positive = earlier). Null when either is unknown. */
  daysEarlierThanCurrent: number | null;
}

export interface Futures {
  /** Live reservations close on their expected dates, then new reservations keep coming at the trailing pace. */
  current: Future;
  required: Future;
  oneMoreFarm: Future;
  /** The closings-only extrapolation: the trailing closing pace, as if no reservation ever closed. */
  closingsOnly: Future;
  all: Future[];
}

/** Every live reservation with an expected date, weighted by the conversion it was measured with. */
export function scheduledClosings(expected: Expected): ScheduledClosing[] {
  const share = expected.conversionPct / 100;
  return expected.lots
    .filter((l) => l.expectedCloseDate !== null)
    .map((l) => ({ date: l.expectedCloseDate as string, lots: share, netProfit: l.expectedNetProfit }));
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export interface FuturesOptions {
  /** "since Mar 2026" when the farm cadence is measured from the era start (oracle.ts farmCadence); tagged in the premises. */
  cadenceSince?: string | null;
  lang?: QualityLang;
}

/**
 * @param activeFarms farms that were selling during the trailing window (funded, with unsold
 *   lots) — the current pace is spread across them to size what one more farm adds.
 * @param expected the reservations layer; without it the current pace is the closings-only line.
 */
export function computeFutures(
  defaults: OracleParams,
  goal: GoalStatus,
  startInventory: number,
  asOf: Date,
  activeFarms: number,
  expected?: Expected,
  opts: FuturesOptions = {},
): Futures {
  const lang = opts.lang ?? "en";
  const es = lang === "es";
  const cadence = es
    ? `una finca nueva cada ${defaults.newFarmEveryMonths} meses${opts.cadenceSince ? ` (${opts.cadenceSince})` : ""}`
    : `a new farm every ${defaults.newFarmEveryMonths} months${opts.cadenceSince ? ` (${opts.cadenceSince})` : ""}`;
  const build = (id: FutureId, title: string, premise: string, params: OracleParams, inventory: number, opts: OracleRunOptions = {}): Future => {
    const result = runOracle(params, goal, inventory, asOf, opts);
    return {
      id,
      title,
      premise,
      params,
      startInventory: inventory,
      scheduled: opts.scheduled ?? [],
      result,
      exitDate: result.goalDate,
      hitsDeadline: result.hitsDeadline,
      daysEarlierThanCurrent: null,
    };
  };

  const liveWord = plural(expected?.liveReservations ?? 0, es ? "reserva" : "reservation", es ? "reservas" : "reservations");
  const closingsOnly = build(
    "closings_only",
    es ? "Si ninguna reserva cerrara" : "If no reservation ever closed",
    es
      ? `${defaults.lotsPerMonth} cierres/mes y ${cadence} — solo el ritmo de cierres, ciego a las ${expected?.liveReservations ?? 0} ${liveWord} vivas.`
      : `${defaults.lotsPerMonth} closings/month and ${cadence} — the trailing closing pace alone, blind to the ${expected?.liveReservations ?? 0} live ${liveWord}.`,
    defaults,
    startInventory,
  );

  // Current pace: every live reservation closes on its expected date (weighted by the conversion),
  // then reservations keep being made at the trailing pace and close at that conversion, one
  // median lag later.
  const scheduled = expected ? scheduledClosings(expected) : [];
  const conversion = expected ? expected.conversionPct / 100 : 1;
  const steadyPace = expected ? round2(expected.reservationsPerMonth * conversion) : defaults.lotsPerMonth;
  const lagDays = expected?.medianDaysToClose !== null && expected?.medianDaysToClose !== undefined ? Math.round(expected.medianDaysToClose) : 0;
  const currentOpts: OracleRunOptions = expected ? { scheduled, paceLagDays: lagDays } : {};
  const currentParams: OracleParams = { ...defaults, lotsPerMonth: steadyPace };
  const currentPremise = expected
    ? es
      ? `${expected.liveReservations} ${liveWord} vivas cierran en sus fechas esperadas al ${expected.conversionPct}% de conversión` +
        `${expected.overdueCount > 0 ? ` (${expected.overdueCount} ya vencidas, contadas en el primer mes)` : ""}; tras el desfase de ${lagDays} días, nuevas reservas a ${expected.reservationsPerMonth}/mes siguen cerrando a ese ritmo — ${steadyPace} lotes/mes — con ${cadence}.`
      : `${expected.liveReservations} live ${liveWord} close on their expected dates at ${expected.conversionPct}% conversion` +
        `${expected.overdueCount > 0 ? ` (${expected.overdueCount} already overdue, counted in the first month)` : ""}; after the ${lagDays}-day lag, new reservations at ${expected.reservationsPerMonth}/month keep closing at that rate — ${steadyPace} lots/month — with ${cadence}.`
    : es
      ? `${defaults.lotsPerMonth} lotes/mes y ${cadence} — exactamente los promedios recientes.`
      : `${defaults.lotsPerMonth} lots/month and ${cadence} — exactly the trailing averages.`;
  const current = build("current_pace", es ? "Al ritmo actual" : "At the current pace", currentPremise, currentParams, startInventory, currentOpts);

  // Required pace in the Oracle's own economics (its net profit per lot), so this future lands
  // on the deadline; GoalStatus.requiredLotsPerMonthToHitDeadline uses the ledger average instead.
  // The simulation books closings in whole months, so spread the lots over the whole months left.
  const wholeMonthsLeft = Math.floor(goal.monthsToDeadline);
  const requiredPace =
    closingsOnly.result.lotsNeeded !== null && wholeMonthsLeft > 0
      ? round2(closingsOnly.result.lotsNeeded / wholeMonthsLeft)
      : goal.requiredLotsPerMonthToHitDeadline ?? defaults.lotsPerMonth;
  // Inventory has to keep up with the pace: at least one farm per (lots per farm ÷ lots per month) months.
  const farmCadence =
    requiredPace > 0 && defaults.avgLotsPerFarm > 0
      ? round2(Math.min(defaults.newFarmEveryMonths > 0 ? defaults.newFarmEveryMonths : Infinity, defaults.avgLotsPerFarm / requiredPace))
      : defaults.newFarmEveryMonths;
  const required = build(
    "required_pace",
    es ? "Al ritmo requerido" : "At the required pace",
    es
      ? `${requiredPace} lotes/mes — lo que exige la fecha límite — comprando una finca cada ${farmCadence} meses para mantener inventario.`
      : `${requiredPace} lots/month — what the deadline demands — buying a farm every ${farmCadence} months to keep inventory.`,
    { ...defaults, lotsPerMonth: requiredPace, newFarmEveryMonths: farmCadence },
    startInventory,
  );

  // One more farm selling in parallel adds its own stream of closings (the average per active
  // farm) on top of the current pace, and its lots to today's inventory.
  const perFarmPace = activeFarms > 0 ? round2(steadyPace / activeFarms) : 0;
  const oneMoreFarm = build(
    "one_more_farm",
    es ? "Ritmo actual, una finca más" : "Current pace, one more farm",
    es
      ? `Una finca extra de ${defaults.avgLotsPerFarm} lotes comprada hoy y vendiendo como las demás: ${round2(steadyPace + perFarmPace)} lotes/mes en total${expected ? ", encima de las mismas reservas" : ""}.`
      : `One extra farm of ${defaults.avgLotsPerFarm} lots bought today and selling like the others: ${round2(steadyPace + perFarmPace)} lots/month in total${expected ? ", on top of the same reservations" : ""}.`,
    { ...currentParams, lotsPerMonth: round2(steadyPace + perFarmPace) },
    startInventory + defaults.avgLotsPerFarm,
    currentOpts,
  );

  const currentExit = parseDate(current.exitDate);
  const withDiff = (f: Future): Future => {
    const exit = parseDate(f.exitDate);
    return { ...f, daysEarlierThanCurrent: exit && currentExit ? daysBetween(exit, currentExit) : null };
  };
  const all = [withDiff(current), withDiff(required), withDiff(oneMoreFarm), withDiff(closingsOnly)];
  return { current: all[0] as Future, required: all[1] as Future, oneMoreFarm: all[2] as Future, closingsOnly: all[3] as Future, all };
}
