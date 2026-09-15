/**
 * Simulator — owner levers on the same capital- and inventory-constrained forecast
 * Engine and War Plan already run. There is no third model.
 *
 * Closings per month are an OUTPUT: min(ad-driven demand, inventory on hand).
 * Farms the mix cannot pay for are marked unfunded and do not add lots.
 * Ad spend is the monthly lever (paid whether or not inventory can fulfill it).
 *
 * Today's-pace FREEDOM DATE is the authoritative Throne Room exit
 * (`pathToGoal.projectedExitAtCurrentPace`). The constrained run still supplies
 * costs, the binding constraint, and every other output. Do not replace that
 * date with a second engine date.
 */

import { ENGINE_DEFAULT_COST_PER_RESERVATION, ENGINE_MAX_FARMS } from "../config/engine";
import { daysBetween, monthsBetween, parseDate, toIsoDate, addDays } from "./dates";
import {
  costPerClosing,
  engineDefaultsFromRealm,
  engineStartInventory,
  resolveFarmCost,
  type EngineDefaults,
} from "./engine";
import type { Expected } from "./expected";
import type { GoalStatus } from "./goal";
import { mean, round2, sum } from "./math";
import { buildMonthGrid, fundSchedule, runOracle, type InvestorMixEntry, type OracleParams } from "./oracle";
import type { PathToGoal } from "./pathToGoal";
import type { WarPlan, WarPlanContext } from "./warplan";
import { cadenceSchedule } from "./warplan";

export const SIMULATOR_AD_STEP_USD = 5_000;
export const SIMULATOR_FARM_STEP = 1;
export const SIMULATOR_CPR_ASSUMPTION = ENGINE_DEFAULT_COST_PER_RESERVATION;

export type SimulatorPresetId = "today" | "required" | "plus_one_farm" | "aggressive";
export type BindingConstraint = "demand" | "inventory" | "capital";
export type SimulatorBottleneckKind = "inventory" | "demand" | "capital" | "none";
export type DeltaComparator = "today_pace" | "deadline";

export interface SimulatorLevers {
  adSpendPerMonth: number;
  farmsPerQuarter: number;
  capitalAvailable: number;
  avgSalePrice: number;
  costPerReservation: number;
  conversionPct: number;
  investorTakePct: number;
}

export interface DatedDelta {
  days: number;
  months: number;
  /** What the delta is measured against — never implied. */
  comparator: DeltaComparator;
  direction: "ahead" | "behind" | "same";
}

export interface SimulatorMonth {
  monthIndex: number;
  date: string;
  lotsClosed: number;
  demandLots: number;
  inventory: number;
  farmsBought: number;
  farmsUnfunded: number;
  adSpend: number;
  capitalDeployed: number;
  capitalOwed: number;
  interest: number;
  cumulativeAdSpend: number;
  cumulativeInterest: number;
  /** Booked net at closing (the $10M goal metric). */
  cumulativeBookedProfit: number;
  /** Booked net minus ads paid this plan minus interest. */
  cumulativeNetProfit: number;
  binding: BindingConstraint;
}

export interface SimulatorBottleneck {
  kind: SimulatorBottleneckKind;
  /** First month the constraint binds, or null. */
  monthIndex: number | null;
  date: string | null;
  capitalShort: number;
  fundByDate: string | null;
}

export interface LeverMarginal {
  daysSooner: number | null;
  binds: boolean;
  binding: BindingConstraint | null;
}

export interface SimulatorResult {
  levers: SimulatorLevers;
  presetId: SimulatorPresetId | null;
  /** Goal-reached date shown for this scenario. Today's pace is pinned to Throne Room. */
  freedomDate: string | null;
  /** After-cost crossing from this run (may differ from `freedomDate` on today's pace). */
  simulatedFreedomDate: string | null;
  monthsToGoal: number | null;
  vsTodayPace: DatedDelta | null;
  vsDeadline: DatedDelta | null;
  netProfitAtDeadline: number;
  totalAdSpend: number;
  landCapitalDeployed: number;
  peakCapitalOwed: number;
  interestPaid: number;
  lotsSold: number;
  farmsBought: number;
  farmsUnfunded: number;
  unfundedCapital: number;
  closingsPerMonth: number;
  demandPerMonth: number;
  bindingByMonth: BindingConstraint[];
  series: SimulatorMonth[];
  bottleneck: SimulatorBottleneck;
  marginalAds: LeverMarginal;
  marginalFarm: LeverMarginal;
  costPerReservationIsAssumption: true;
}

export interface SimulatorContext {
  goal: GoalStatus;
  asOf: Date;
  oracleDefaults: OracleParams;
  pathToGoal: PathToGoal;
  mix: InvestorMixEntry[];
  farmCost: number;
  lotsPerFarm: number;
  landLagMonths: number;
  cycleMonths: number;
  conversionPct: number;
  costPerReservation: number;
  startInventory: number;
  paceLagDays: number;
  owedStart: number;
  closedLotsPerMonth: number;
  newFarmEveryMonths: number;
  requiredClosingsPerMonth: number;
  requiredFarmsToBuy: number;
  requiredCapitalToRaise: number;
  engine: EngineDefaults;
}

export interface SimulatorRunOptions {
  /** When set, `freedomDate` is this ISO date (today's pace ↔ Throne Room). */
  pinFreedomDate?: string | null;
  presetId?: SimulatorPresetId | null;
  /** Skip the two extra runs that size the slider footnotes. */
  skipMarginals?: boolean;
}

export function demandLotsPerMonth(adSpendPerMonth: number, costPerReservation: number, conversionPct: number): number {
  if (!(costPerReservation > 0)) return 0;
  return round2((Math.max(0, adSpendPerMonth) / costPerReservation) * (Math.max(0, conversionPct) / 100));
}

export function inferredAdSpendPerMonth(closingsPerMonth: number, costPerReservation: number, conversionPct: number): number {
  return round2(Math.max(0, closingsPerMonth) * costPerClosing(costPerReservation, conversionPct));
}

export function farmsPerQuarterFromCadence(newFarmEveryMonths: number): number {
  if (!(newFarmEveryMonths > 0)) return 0;
  return round2(3 / newFarmEveryMonths);
}

export function cadenceMonthsFromFarmsPerQuarter(farmsPerQuarter: number): number {
  if (!(farmsPerQuarter > 0)) return 0;
  return round2(3 / farmsPerQuarter);
}

/** Authoritative current-pace exit — the same date Throne Room reads. */
export function todayPaceFreedomDate(path: Pick<PathToGoal, "projectedExitAtCurrentPace">): string | null {
  return path.projectedExitAtCurrentPace;
}

export function mixCapitalTotal(mix: InvestorMixEntry[]): number {
  return round2(sum(mix.map((e) => Math.max(0, e.capital))));
}

export function scaleMixToCapital(mix: InvestorMixEntry[], capitalAvailable: number): InvestorMixEntry[] {
  const cap = Math.max(0, capitalAvailable);
  const total = mixCapitalTotal(mix);
  if (mix.length === 0) {
    return [{ investorId: null, name: "Land capital", dealType: "fixed_interest", ratePct: 20, capital: cap }];
  }
  if (!(total > 0)) {
    const share = cap / mix.length;
    return mix.map((e) => ({ ...e, capital: round2(share) }));
  }
  const scale = cap / total;
  return mix.map((e) => ({ ...e, capital: round2(e.capital * scale) }));
}

export function datedDelta(from: string | null, toward: string | null, comparator: DeltaComparator): DatedDelta | null {
  const a = parseDate(from);
  const b = parseDate(toward);
  if (!a && !b) return null;
  if (!a && b) return { days: 3650, months: 120, comparator, direction: "behind" };
  if (a && !b) return { days: 3650, months: 120, comparator, direction: "ahead" };
  if (!a || !b) return null;
  // Positive days = `from` is earlier than `toward` = ahead of the comparator.
  const signed = daysBetween(a, b);
  const months = round2(monthsBetween(a, b));
  if (signed === 0) return { days: 0, months: 0, comparator, direction: "same" };
  if (signed > 0) return { days: signed, months, comparator, direction: "ahead" };
  return { days: -signed, months: round2(-months), comparator, direction: "behind" };
}

function weightedAnnualRate(mix: InvestorMixEntry[]): number {
  const funded = mix.filter((e) => e.capital > 0 && e.dealType === "fixed_interest");
  const total = sum(funded.map((e) => e.capital));
  if (total <= 0) {
    const any = mix.filter((e) => e.dealType === "fixed_interest");
    return any.length > 0 ? mean(any.map((e) => e.ratePct)) ?? 20 : 20;
  }
  return sum(funded.map((e) => e.capital * e.ratePct)) / total;
}

function interpolateCross(prevValue: number, prevDate: string, value: number, date: string, goal: number, asOf: Date): string {
  if (prevValue >= goal) return prevDate;
  if (value <= prevValue) return date;
  const frac = Math.min(1, Math.max(0, (goal - prevValue) / (value - prevValue)));
  const start = parseDate(prevDate) ?? asOf;
  const end = parseDate(date) ?? start;
  const span = Math.max(1, daysBetween(start, end));
  return toIsoDate(addDays(start, Math.min(span, Math.max(1, Math.ceil(frac * span)))));
}

export function todayLevers(ctx: SimulatorContext): SimulatorLevers {
  return {
    adSpendPerMonth: inferredAdSpendPerMonth(ctx.closedLotsPerMonth, ctx.costPerReservation, ctx.conversionPct),
    farmsPerQuarter: farmsPerQuarterFromCadence(ctx.newFarmEveryMonths),
    capitalAvailable: mixCapitalTotal(ctx.mix),
    avgSalePrice: ctx.oracleDefaults.avgSalePrice,
    costPerReservation: ctx.costPerReservation,
    conversionPct: ctx.conversionPct,
    investorTakePct: ctx.oracleDefaults.investorTakePct,
  };
}

export function requiredLevers(ctx: SimulatorContext): SimulatorLevers {
  const today = todayLevers(ctx);
  const months = Math.max(1, ctx.goal.monthsToDeadline);
  const farmsPerQuarter =
    ctx.requiredFarmsToBuy > 0 ? round2((ctx.requiredFarmsToBuy / months) * 3) : Math.max(today.farmsPerQuarter, 1);
  const capital = Math.max(today.capitalAvailable, ctx.requiredCapitalToRaise);
  return {
    ...today,
    adSpendPerMonth: inferredAdSpendPerMonth(ctx.requiredClosingsPerMonth, ctx.costPerReservation, ctx.conversionPct),
    farmsPerQuarter,
    capitalAvailable: capital,
  };
}

export function plusOneFarmLevers(ctx: SimulatorContext): SimulatorLevers {
  const today = todayLevers(ctx);
  return { ...today, farmsPerQuarter: round2(today.farmsPerQuarter + 1) };
}

export function aggressiveLevers(ctx: SimulatorContext): SimulatorLevers {
  const today = todayLevers(ctx);
  return {
    ...today,
    adSpendPerMonth: round2(today.adSpendPerMonth * 2),
    farmsPerQuarter: round2(today.farmsPerQuarter + 2),
    capitalAvailable: round2(today.capitalAvailable + ctx.farmCost * 2),
  };
}

export function leversForPreset(id: SimulatorPresetId, ctx: SimulatorContext): SimulatorLevers {
  if (id === "required") return requiredLevers(ctx);
  if (id === "plus_one_farm") return plusOneFarmLevers(ctx);
  if (id === "aggressive") return aggressiveLevers(ctx);
  return todayLevers(ctx);
}

export function simulatorContextFromRealm(
  realm: WarPlanContext & {
    pathToGoal: PathToGoal;
    warPlan: WarPlan;
    expected: Expected;
    rotation: { benchmark: { farmName: string } | null };
    debt: { capitalOwed: number };
    farmCadence: { months: number };
  },
): SimulatorContext {
  const engine = engineDefaultsFromRealm(realm, realm.rotation.benchmark?.farmName ?? null);
  const conversionPct = engine.inputs.conversionPct;
  const inv = engineStartInventory(realm.goal.availableLots, realm.goal.reservedLots, conversionPct);
  const lag = realm.expected.medianDaysToClose;
  return {
    goal: realm.goal,
    asOf: realm.asOf,
    oracleDefaults: realm.oracleDefaults,
    pathToGoal: realm.pathToGoal,
    mix: engine.inputs.investorMix,
    farmCost: resolveFarmCost(engine.inputs),
    lotsPerFarm: engine.inputs.lotsPerFarm,
    landLagMonths: engine.inputs.farmToFirstCloseMonths,
    cycleMonths: engine.inputs.cycleMonths,
    conversionPct,
    costPerReservation: engine.inputs.costPerReservation,
    startInventory: inv.total,
    paceLagDays: lag === null ? 0 : Math.round(lag),
    owedStart: Math.max(0, realm.debt.capitalOwed),
    closedLotsPerMonth: realm.goal.closedLotsPerMonth,
    newFarmEveryMonths: realm.farmCadence.months,
    requiredClosingsPerMonth: realm.warPlan.required.closingsPerMonth,
    requiredFarmsToBuy: realm.pathToGoal.farmsToBuy,
    requiredCapitalToRaise: realm.pathToGoal.capitalToRaise,
    engine,
  };
}

function farmPurchaseMonths(farmsPerQuarter: number, horizon: number): number[] {
  const every = cadenceMonthsFromFarmsPerQuarter(farmsPerQuarter);
  if (!(every > 0)) return [];
  return cadenceSchedule(every, horizon).slice(0, ENGINE_MAX_FARMS);
}

function decideBottleneck(
  series: SimulatorMonth[],
  farmsUnfunded: number,
  unfundedCapital: number,
  fundByDate: string | null,
  farmCost: number,
): SimulatorBottleneck {
  const firstCapital = series.find((s) => s.binding === "capital" || s.farmsUnfunded > 0);
  const firstInventory = series.find((s) => s.binding === "inventory");
  const leftover = series[series.length - 1];
  const idleInventory = leftover !== undefined && leftover.inventory > 1 && !series.some((s) => s.binding === "inventory");

  if (farmsUnfunded > 0 || (firstCapital && unfundedCapital > 0)) {
    return {
      kind: "capital",
      monthIndex: firstCapital?.monthIndex ?? null,
      date: firstCapital?.date ?? null,
      capitalShort: round2(Math.max(unfundedCapital, farmCost)),
      fundByDate,
    };
  }
  if (firstInventory) {
    return {
      kind: "inventory",
      monthIndex: firstInventory.monthIndex,
      date: firstInventory.date,
      capitalShort: 0,
      fundByDate,
    };
  }
  if (idleInventory) {
    return {
      kind: "demand",
      monthIndex: leftover.monthIndex,
      date: leftover.date,
      capitalShort: 0,
      fundByDate,
    };
  }
  return { kind: "none", monthIndex: null, date: null, capitalShort: 0, fundByDate };
}

function runCore(levers: SimulatorLevers, ctx: SimulatorContext): Omit<SimulatorResult, "marginalAds" | "marginalFarm" | "vsTodayPace" | "vsDeadline" | "presetId"> {
  const demand = demandLotsPerMonth(levers.adSpendPerMonth, levers.costPerReservation, levers.conversionPct);
  const deadline = parseDate(ctx.goal.deadline) ?? ctx.asOf;
  const grid = buildMonthGrid(ctx.asOf, deadline, true);
  const horizon = grid.months.length;
  const wanted = farmPurchaseMonths(levers.farmsPerQuarter, horizon);
  const fundedMix = scaleMixToCapital(ctx.mix, levers.capitalAvailable);
  const landLag = Math.max(0, Math.round(ctx.landLagMonths));
  const cycleMonths = ctx.cycleMonths > 0 ? Math.max(1, Math.round(ctx.cycleMonths)) : null;
  const planned = fundSchedule(wanted, ctx.farmCost, ctx.lotsPerFarm, landLag, fundedMix, cycleMonths, grid.deadlineIndex);
  const bought = planned.filter((f) => f.unfunded <= Math.max(1, ctx.farmCost * 0.01));
  const skipped = planned.filter((f) => f.unfunded > Math.max(1, ctx.farmCost * 0.01));
  const unfundedByMonth = new Map<number, number>();
  for (const f of skipped) {
    unfundedByMonth.set(f.purchaseMonth, (unfundedByMonth.get(f.purchaseMonth) ?? 0) + 1);
  }

  const adPerClosing = costPerClosing(levers.costPerReservation, levers.conversionPct);
  const params: OracleParams = {
    ...ctx.oracleDefaults,
    lotsPerMonth: Math.max(0, demand),
    avgSalePrice: levers.avgSalePrice,
    investorTakePct: levers.investorTakePct,
    avgLotsPerFarm: ctx.lotsPerFarm,
    farmCost: ctx.farmCost,
    adSpendPerClosing: adPerClosing,
    conversionPct: levers.conversionPct,
    farmToFirstCloseMonths: ctx.landLagMonths,
    investorMix: fundedMix,
    farmsToBuy: bought.map((f) => f.purchaseMonth),
    targetMode: "profit_at_closing",
    capitalCycleMonths: ctx.cycleMonths,
    newFarmEveryMonths: cadenceMonthsFromFarmsPerQuarter(levers.farmsPerQuarter),
  };

  // Inflate the target so runOracle does not stop when booked profit hits $10M —
  // we still need months after that to see after-cost (ads + interest) cross the goal.
  const oracle = runOracle(params, { ...ctx.goal, goal: Math.max(ctx.goal.goal * 5, 50_000_000) }, ctx.startInventory, ctx.asOf, {
    calendarMonths: true,
    grid,
    owedStart: ctx.owedStart,
    paceLagDays: ctx.paceLagDays,
  });

  const rate = weightedAnnualRate(fundedMix) / 100;
  const k = grid.deadlineIndex;
  const series: SimulatorMonth[] = [];
  let cumAds = 0;
  let cumInterest = 0;
  let lotsSold = 0;
  let landCapital = 0;
  let peakOwed = ctx.owedStart;
  let prevBooked = ctx.goal.netProfitToDate;
  let prevNet = ctx.goal.netProfitToDate;
  let prevDate = toIsoDate(ctx.asOf);
  let simulatedFreedomDate: string | null = ctx.goal.netProfitToDate >= ctx.goal.goal ? toIsoDate(ctx.asOf) : null;
  let monthsToGoal: number | null = ctx.goal.netProfitToDate >= ctx.goal.goal ? 0 : null;

  for (const p of oracle.series) {
    if (simulatedFreedomDate !== null && p.monthIndex > Math.max(k, 1) + 3) break;
    const month = grid.months[p.monthIndex - 1];
    const fraction = month?.fraction ?? 1;
    const ads = round2(Math.max(0, levers.adSpendPerMonth) * fraction);
    const interest = round2(Math.max(0, p.capitalOwed) * rate / 12);
    cumAds += ads;
    cumInterest += interest;
    const weight = p.monthIndex === k ? grid.deadlineFraction : 1;
    if (p.monthIndex <= k) lotsSold += p.lotsClosed * (p.monthIndex === k ? weight : 1);
    if (p.monthIndex <= k) landCapital += p.capitalDeployed;
    peakOwed = Math.max(peakOwed, p.capitalOwed);
    const netAfter = round2(p.cumulativeNetProfit - cumAds - cumInterest);
    const unfundedNow = unfundedByMonth.get(p.monthIndex) ?? 0;
    let binding: BindingConstraint;
    if (unfundedNow > 0) binding = "capital";
    else if (p.shortfall) binding = "inventory";
    else binding = "demand";

    if (simulatedFreedomDate === null && netAfter >= ctx.goal.goal) {
      simulatedFreedomDate = interpolateCross(prevNet, prevDate, netAfter, p.date, ctx.goal.goal, ctx.asOf);
      monthsToGoal = round2(monthsBetween(ctx.asOf, parseDate(simulatedFreedomDate) ?? ctx.asOf));
    }

    series.push({
      monthIndex: p.monthIndex,
      date: p.date,
      lotsClosed: p.lotsClosed,
      demandLots: round2(p.flatLotsClosed + p.scheduledLotsClosed),
      inventory: p.inventory,
      farmsBought: p.farmsBought,
      farmsUnfunded: unfundedNow,
      adSpend: ads,
      capitalDeployed: p.capitalDeployed,
      capitalOwed: p.capitalOwed,
      interest,
      cumulativeAdSpend: round2(cumAds),
      cumulativeInterest: round2(cumInterest),
      cumulativeBookedProfit: p.cumulativeNetProfit,
      cumulativeNetProfit: netAfter,
      binding,
    });
    prevBooked = p.cumulativeNetProfit;
    prevNet = netAfter;
    prevDate = p.date;
    void prevBooked;
  }

  const deadlinePoint = series.find((s) => s.monthIndex === k) ?? series[series.length - 1];
  const farmsBought = bought.filter((f) => f.purchaseMonth <= k).length;
  const farmsUnfunded = skipped.filter((f) => f.purchaseMonth <= k).length;
  const unfundedCapital = round2(sum(skipped.filter((f) => f.purchaseMonth <= k).map((f) => f.unfunded)));

  return {
    levers,
    freedomDate: simulatedFreedomDate,
    simulatedFreedomDate,
    monthsToGoal,
    netProfitAtDeadline: deadlinePoint?.cumulativeNetProfit ?? round2(ctx.goal.netProfitToDate),
    totalAdSpend: deadlinePoint?.cumulativeAdSpend ?? round2(cumAds),
    landCapitalDeployed: round2(landCapital),
    peakCapitalOwed: round2(peakOwed),
    interestPaid: deadlinePoint?.cumulativeInterest ?? round2(cumInterest),
    lotsSold: round2(lotsSold),
    farmsBought,
    farmsUnfunded,
    unfundedCapital,
    closingsPerMonth: demand > 0 ? round2(lotsSold / Math.max(1, ctx.goal.monthsToDeadline)) : 0,
    demandPerMonth: demand,
    bindingByMonth: series.filter((s) => s.monthIndex <= k).map((s) => s.binding),
    series,
    bottleneck: decideBottleneck(series.filter((s) => s.monthIndex <= k), farmsUnfunded, unfundedCapital, ctx.pathToGoal.nextFarmFundByDate, ctx.farmCost),
    costPerReservationIsAssumption: true,
  };
}

function daysSooner(base: string | null, next: string | null): { daysSooner: number | null; binds: boolean } {
  const a = parseDate(base);
  const b = parseDate(next);
  if (!a && !b) return { daysSooner: 0, binds: true };
  if (!a && b) return { daysSooner: 3650, binds: false };
  if (a && !b) return { daysSooner: -3650, binds: true };
  if (!a || !b) return { daysSooner: null, binds: true };
  const days = daysBetween(b, a);
  return { daysSooner: days, binds: days === 0 };
}

export function runSimulator(levers: SimulatorLevers, ctx: SimulatorContext, opts: SimulatorRunOptions = {}): SimulatorResult {
  const core = runCore(levers, ctx);
  const todayDate = todayPaceFreedomDate(ctx.pathToGoal);
  const freedomDate = opts.pinFreedomDate !== undefined ? opts.pinFreedomDate : core.simulatedFreedomDate;
  const vsTodayPace = datedDelta(freedomDate, todayDate, "today_pace");
  const vsDeadline = datedDelta(freedomDate, ctx.goal.deadline, "deadline");

  let marginalAds: LeverMarginal = { daysSooner: null, binds: false, binding: null };
  let marginalFarm: LeverMarginal = { daysSooner: null, binds: false, binding: null };
  if (!opts.skipMarginals) {
    const adsUp = runCore({ ...levers, adSpendPerMonth: levers.adSpendPerMonth + SIMULATOR_AD_STEP_USD }, ctx);
    const farmUp = runCore({ ...levers, farmsPerQuarter: levers.farmsPerQuarter + SIMULATOR_FARM_STEP }, ctx);
    const adsDelta = daysSooner(core.simulatedFreedomDate, adsUp.simulatedFreedomDate);
    const farmDelta = daysSooner(core.simulatedFreedomDate, farmUp.simulatedFreedomDate);
    marginalAds = {
      daysSooner: adsDelta.daysSooner,
      binds: adsDelta.binds,
      binding: adsDelta.binds ? core.bottleneck.kind === "none" ? "inventory" : core.bottleneck.kind === "demand" ? "inventory" : core.bottleneck.kind : null,
    };
    if (adsDelta.binds && core.bottleneck.kind === "inventory") marginalAds.binding = "inventory";
    if (adsDelta.binds && core.bottleneck.kind === "capital") marginalAds.binding = "capital";
    if (adsDelta.binds && !marginalAds.binding) marginalAds.binding = seriesDominant(core.series);
    marginalFarm = {
      daysSooner: farmDelta.daysSooner,
      binds: farmDelta.binds,
      binding: farmDelta.binds ? core.bottleneck.kind === "none" ? "demand" : core.bottleneck.kind === "inventory" ? "demand" : core.bottleneck.kind : null,
    };
    if (farmDelta.binds && core.bottleneck.kind === "demand") marginalFarm.binding = "demand";
    if (farmDelta.binds && core.bottleneck.kind === "capital") marginalFarm.binding = "capital";
    if (farmDelta.binds && !marginalFarm.binding) marginalFarm.binding = seriesDominant(core.series);
  }

  return {
    ...core,
    freedomDate,
    vsTodayPace,
    vsDeadline,
    marginalAds,
    marginalFarm,
    presetId: opts.presetId ?? null,
  };
}

function seriesDominant(series: SimulatorMonth[]): BindingConstraint {
  const counts: Record<BindingConstraint, number> = { demand: 0, inventory: 0, capital: 0 };
  for (const s of series) counts[s.binding] += 1;
  if (counts.inventory >= counts.demand && counts.inventory >= counts.capital) return "inventory";
  if (counts.capital >= counts.demand) return "capital";
  return "demand";
}

export function runPreset(id: SimulatorPresetId, ctx: SimulatorContext, skipMarginals = false): SimulatorResult {
  const levers = leversForPreset(id, ctx);
  return runSimulator(levers, ctx, {
    presetId: id,
    skipMarginals,
    pinFreedomDate: id === "today" ? todayPaceFreedomDate(ctx.pathToGoal) : undefined,
  });
}

export function runAllPresets(ctx: SimulatorContext, skipMarginals = true): Record<SimulatorPresetId, SimulatorResult> {
  return {
    today: runPreset("today", ctx, skipMarginals),
    required: runPreset("required", ctx, skipMarginals),
    plus_one_farm: runPreset("plus_one_farm", ctx, skipMarginals),
    aggressive: runPreset("aggressive", ctx, skipMarginals),
  };
}

export interface SimulatorCompareRow {
  id: string;
  name: string;
  freedomDate: string | null;
  vsTodayPace: DatedDelta | null;
  netProfitAtDeadline: number;
  totalAdSpend: number;
  landCapitalDeployed: number;
  peakCapitalOwed: number;
  interestPaid: number;
  lotsSold: number;
  bottleneck: SimulatorBottleneckKind;
}

export function compareResults(rows: { id: string; name: string; result: SimulatorResult }[]): SimulatorCompareRow[] {
  return rows.slice(0, 3).map((r) => ({
    id: r.id,
    name: r.name,
    freedomDate: r.result.freedomDate,
    vsTodayPace: r.result.vsTodayPace,
    netProfitAtDeadline: r.result.netProfitAtDeadline,
    totalAdSpend: r.result.totalAdSpend,
    landCapitalDeployed: r.result.landCapitalDeployed,
    peakCapitalOwed: r.result.peakCapitalOwed,
    interestPaid: r.result.interestPaid,
    lotsSold: r.result.lotsSold,
    bottleneck: r.result.bottleneck.kind,
  }));
}
