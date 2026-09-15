/**
 * Simulator — owner levers on the same capital- and inventory-constrained forecast.
 *
 * Selling is per-farm: every farm with available lots is advertised at the same daily
 * budget; each receives the same reservations that month. Closings are an output.
 * Ad spend is a forward-looking input only — it never enters the goal or historical figures.
 *
 * Freedom date and the profit chart share one series: the month after-cost cumulative
 * net (booked profit already net of sponsor take, minus ads) crosses the goal.
 * Interest is not deducted a second time. See AUDIT.md §9.
 */

import { ENGINE_DEFAULT_COST_PER_RESERVATION, ENGINE_MAX_FARMS } from "../config/engine";
import { daysBetween, monthsBetween, parseDate } from "./dates";
import {
  costPerClosing,
  engineDefaultsFromRealm,
  resolveFarmCost,
  type EngineDefaults,
} from "./engine";
import type { Expected } from "./expected";
import type { FarmScorecard } from "./farmScorecard";
import type { GoalStatus } from "./goal";
import { mean, round2, sum } from "./math";
import type { NoteStrategies } from "./noteStrategies";
import {
  DEFAULT_AD_BUDGET_PER_FARM_PER_DAY,
  buildMonthGrid,
  reservationsPerFarmPerMonth,
  runPerFarmSellingModel,
  type ExistingFarmSeed,
  type FarmInventoryRow,
  type InvestorMixEntry,
  type OracleParams,
  type PerFarmMonthPoint,
} from "./oracle";
import type { PathToGoal } from "./pathToGoal";
import type { WarPlan, WarPlanContext } from "./warplan";
import { cadenceSchedule } from "./warplan";

export const SIMULATOR_AD_STEP_USD = 5_000;
export const SIMULATOR_FARM_STEP = 1;
export const SIMULATOR_CPR_ASSUMPTION = ENGINE_DEFAULT_COST_PER_RESERVATION;
export const SIMULATOR_AD_BUDGET_PER_FARM_PER_DAY = DEFAULT_AD_BUDGET_PER_FARM_PER_DAY;
export const SIMULATOR_BUDGET_STEP = 50;

export type SimulatorPresetId = "today" | "required" | "plus_one_farm" | "aggressive";
export type BindingConstraint = "demand" | "inventory" | "capital";
export type SimulatorBottleneckKind = "inventory" | "demand" | "capital" | "none";
export type DeltaComparator = "today_pace" | "deadline";

export interface SimulatorLevers {
  adBudgetPerFarmPerDay: number;
  farmsPerQuarter: number;
  capitalAvailable: number;
  fallThroughPct: number;
  sellNotes: boolean;
  avgSalePrice: number;
  costPerReservation: number;
  conversionPct: number;
  investorTakePct: number;
  landCostPerFarm: number;
  /** @deprecated monthly total — derived from per-farm budget × active farms. Kept for saved scenarios. */
  adSpendPerMonth?: number;
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
  inventoryAvailable: number;
  inventoryReserved: number;
  activeFarms: number;
  farmsBought: number;
  farmsUnfunded: number;
  adSpend: number;
  capitalDeployed: number;
  capitalOwed: number;
  interest: number;
  cumulativeAdSpend: number;
  cumulativeInterest: number;
  /** Booked net at closing (sponsor take already deducted). */
  cumulativeBookedProfit: number;
  /** Booked net minus ads paid this plan. Interest is already inside booked net. */
  cumulativeNetProfit: number;
  binding: BindingConstraint;
  farmInventory: PerFarmMonthPoint["farmInventory"];
}

export interface SimulatorBottleneck {
  kind: SimulatorBottleneckKind;
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
  /** Month after-cost cumulative net crosses the goal — same series as the chart. */
  freedomDate: string | null;
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
  adBudgetIsAssumption: true;
  inventory: FarmInventoryRow[];
  inventoryOnHand: number;
  inventoryAvailable: number;
  inventoryReserved: number;
  inventoryZeroMonthIndex: number | null;
  inventoryZeroDate: string | null;
  activeFarmsToday: number;
  activeFarmsDropMonthIndex: number | null;
  activeFarmsDropDate: string | null;
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
  fallThroughPct: number;
  startInventory: number;
  paceLagDays: number;
  owedStart: number;
  closedLotsPerMonth: number;
  newFarmEveryMonths: number;
  requiredClosingsPerMonth: number;
  requiredFarmsToBuy: number;
  requiredCapitalToRaise: number;
  engine: EngineDefaults;
  farmSeeds: ExistingFarmSeed[];
  noteSaleRatio: number;
  notesHeldAtRatio: number;
  downPaymentPct: number;
}

export interface SimulatorRunOptions {
  /** When set, `freedomDate` is this ISO date (labeled Throne comparison only). */
  pinFreedomDate?: string | null;
  presetId?: SimulatorPresetId | null;
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

/** Authoritative current-pace exit — the same date the Overview reads. Labeled comparison only. */
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

export function farmSeedsFromRealm(scorecard: FarmScorecard, expected: Expected): ExistingFarmSeed[] {
  const dueByFarm = new Map<string, ExistingFarmSeed["reservedDue"]>();
  for (const lot of expected.lots) {
    const list = dueByFarm.get(lot.farmId) ?? [];
    list.push({
      date: lot.expectedCloseDate ?? lot.reservationDate,
      lots: 1,
      netProfitAtStake: lot.netProfitAtStake,
    });
    dueByFarm.set(lot.farmId, list);
  }
  return scorecard.rows
    .filter((r) => r.availableLots + r.reservedLots > 0)
    .map((r) => ({
      id: r.farmId,
      name: r.name,
      availableLots: r.availableLots,
      reservedLots: r.reservedLots,
      reservationsInLast90: r.reservationsInLast90,
      reservedDue: dueByFarm.get(r.farmId) ?? [],
    }));
}

export function todayLevers(ctx: SimulatorContext): SimulatorLevers {
  return {
    adBudgetPerFarmPerDay: SIMULATOR_AD_BUDGET_PER_FARM_PER_DAY,
    farmsPerQuarter: farmsPerQuarterFromCadence(ctx.newFarmEveryMonths),
    capitalAvailable: mixCapitalTotal(ctx.mix),
    fallThroughPct: ctx.fallThroughPct,
    sellNotes: true,
    avgSalePrice: ctx.oracleDefaults.avgSalePrice,
    costPerReservation: ctx.costPerReservation,
    conversionPct: ctx.conversionPct,
    investorTakePct: ctx.oracleDefaults.investorTakePct,
    landCostPerFarm: ctx.farmCost,
  };
}

export function requiredLevers(ctx: SimulatorContext): SimulatorLevers {
  const today = todayLevers(ctx);
  const months = Math.max(1, ctx.goal.monthsToDeadline);
  const farmsPerQuarter =
    ctx.requiredFarmsToBuy > 0 ? round2((ctx.requiredFarmsToBuy / months) * 3) : Math.max(today.farmsPerQuarter, 1);
  const active = ctx.farmSeeds.filter((f) => f.availableLots > 0).length;
  const neededRes =
    active > 0 && ctx.conversionPct > 0 ? ctx.requiredClosingsPerMonth / active / (ctx.conversionPct / 100) : 0;
  const neededBudget = neededRes > 0 && ctx.costPerReservation > 0 ? round2((neededRes * ctx.costPerReservation) / 30) : today.adBudgetPerFarmPerDay;
  return {
    ...today,
    adBudgetPerFarmPerDay: Math.max(today.adBudgetPerFarmPerDay, neededBudget),
    farmsPerQuarter,
    capitalAvailable: Math.max(today.capitalAvailable, ctx.requiredCapitalToRaise),
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
    adBudgetPerFarmPerDay: round2(today.adBudgetPerFarmPerDay * 2),
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
    farmScorecard: FarmScorecard;
    noteStrategies: NoteStrategies;
    pipeline: { conversion: { cancellationRatePct: number | null } };
  },
): SimulatorContext {
  const engine = engineDefaultsFromRealm(realm, realm.rotation.benchmark?.farmName ?? null);
  const conversionPct = engine.inputs.conversionPct;
  const farmSeeds = farmSeedsFromRealm(realm.farmScorecard, realm.expected);
  const onHand = farmSeeds.reduce((a, f) => a + f.availableLots + f.reservedLots, 0);
  const lag = realm.expected.medianDaysToClose;
  const cancel = realm.pipeline.conversion.cancellationRatePct;
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
    fallThroughPct: cancel === null ? Math.max(0, 100 - conversionPct) : cancel,
    startInventory: onHand,
    paceLagDays: lag === null ? 0 : Math.round(lag),
    owedStart: Math.max(0, realm.debt.capitalOwed),
    closedLotsPerMonth: realm.goal.closedLotsPerMonth,
    newFarmEveryMonths: realm.farmCadence.months,
    requiredClosingsPerMonth: realm.warPlan.required.closingsPerMonth,
    requiredFarmsToBuy: realm.pathToGoal.farmsToBuy,
    requiredCapitalToRaise: realm.pathToGoal.capitalToRaise,
    engine,
    farmSeeds,
    noteSaleRatio: realm.noteStrategies.noteSaleRatio,
    notesHeldAtRatio: realm.noteStrategies.notesHeldAtRatio,
    downPaymentPct: realm.oracleDefaults.downPaymentPct,
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
  const deadline = parseDate(ctx.goal.deadline) ?? ctx.asOf;
  const grid = buildMonthGrid(ctx.asOf, deadline, true);
  const wanted = farmPurchaseMonths(levers.farmsPerQuarter, grid.months.length);
  const fundedMix = scaleMixToCapital(ctx.mix, levers.capitalAvailable);
  const farmCost = Math.max(0, levers.landCostPerFarm);
  const resPerFarm = reservationsPerFarmPerMonth(levers.adBudgetPerFarmPerDay, levers.costPerReservation);

  const model = runPerFarmSellingModel(
    ctx.farmSeeds,
    {
      adBudgetPerFarmPerDay: levers.adBudgetPerFarmPerDay,
      costPerReservation: levers.costPerReservation,
      conversionPct: levers.conversionPct,
      fallThroughPct: levers.fallThroughPct,
      lotsPerFarm: ctx.lotsPerFarm,
      farmToFirstCloseMonths: ctx.landLagMonths,
      purchaseMonths: wanted,
      farmCost,
      capitalAvailable: levers.capitalAvailable,
      noteCashNow: ctx.notesHeldAtRatio,
      sellNotes: levers.sellNotes,
      noteSaleRatio: ctx.noteSaleRatio,
      downPaymentPct: ctx.downPaymentPct,
      avgSalePrice: levers.avgSalePrice,
      investorTakePct: levers.investorTakePct,
      owedStart: ctx.owedStart,
      startNetProfit: ctx.goal.netProfitToDate,
      goal: ctx.goal.goal,
      asOf: ctx.asOf,
      paceLagDays: ctx.paceLagDays,
      noteLagMonths: ctx.oracleDefaults.avgMonthsToSellNote,
    },
    grid,
    weightedAnnualRate(fundedMix),
  );

  const k = grid.deadlineIndex;
  const freedomIdx = model.freedomDate
    ? (model.series.find((s) => s.date >= (model.freedomDate as string))?.monthIndex ?? model.series.length)
    : model.series.length;
  const keepThrough = Math.max(k + 3, freedomIdx + 1, model.inventoryZeroMonthIndex ?? 0, model.activeFarmsDropMonthIndex ?? 0, 16);
  const series: SimulatorMonth[] = model.series
    .filter((p) => p.monthIndex <= keepThrough)
    .map((p) => ({
      monthIndex: p.monthIndex,
      date: p.date,
      lotsClosed: p.lotsClosed,
      demandLots: round2(p.activeFarms * resPerFarm * p.fraction * (levers.conversionPct / 100)),
      inventory: p.inventory,
      inventoryAvailable: p.inventoryAvailable,
      inventoryReserved: p.inventoryReserved,
      activeFarms: p.activeFarms,
      farmsBought: p.farmsBought,
      farmsUnfunded: p.farmsUnfunded,
      adSpend: p.adSpend,
      capitalDeployed: p.capitalDeployed,
      capitalOwed: p.capitalOwed,
      interest: p.interest,
      cumulativeAdSpend: p.cumulativeAdSpend,
      cumulativeInterest: p.cumulativeInterest,
      cumulativeBookedProfit: p.cumulativeBookedProfit,
      cumulativeNetProfit: p.cumulativeNetProfit,
      binding: p.binding,
      farmInventory: p.farmInventory,
    }));

  const available = ctx.farmSeeds.reduce((a, f) => a + f.availableLots, 0);
  const reserved = ctx.farmSeeds.reduce((a, f) => a + f.reservedLots, 0);

  return {
    levers,
    freedomDate: model.freedomDate,
    simulatedFreedomDate: model.freedomDate,
    monthsToGoal: model.monthsToGoal,
    netProfitAtDeadline: model.netProfitAtDeadline,
    totalAdSpend: model.totalAdSpend,
    landCapitalDeployed: model.landCapitalDeployed,
    peakCapitalOwed: model.peakCapitalOwed,
    interestPaid: model.interestPaid,
    lotsSold: model.lotsSold,
    farmsBought: model.farmsBought,
    farmsUnfunded: model.farmsUnfunded,
    unfundedCapital: model.unfundedCapital,
    closingsPerMonth: model.closingsPerMonth,
    demandPerMonth: model.demandPerMonth,
    bindingByMonth: series.filter((s) => s.monthIndex <= k).map((s) => s.binding),
    series,
    bottleneck: decideBottleneck(
      series.filter((s) => s.monthIndex <= k),
      model.farmsUnfunded,
      model.unfundedCapital,
      ctx.pathToGoal.nextFarmFundByDate,
      farmCost,
    ),
    costPerReservationIsAssumption: true,
    adBudgetIsAssumption: true,
    inventory: model.farms,
    inventoryOnHand: available + reserved,
    inventoryAvailable: available,
    inventoryReserved: reserved,
    inventoryZeroMonthIndex: model.inventoryZeroMonthIndex,
    inventoryZeroDate: model.inventoryZeroDate,
    activeFarmsToday: model.activeFarmsToday,
    activeFarmsDropMonthIndex: model.activeFarmsDropMonthIndex,
    activeFarmsDropDate: model.activeFarmsDropDate,
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
  const todayPace =
    opts.presetId === "today" ? core.simulatedFreedomDate : runCore(todayLevers(ctx), ctx).simulatedFreedomDate;
  const freedomDate = opts.pinFreedomDate !== undefined ? opts.pinFreedomDate : core.simulatedFreedomDate;
  const vsTodayPace = datedDelta(freedomDate, todayPace, "today_pace");
  const vsDeadline = datedDelta(freedomDate, ctx.goal.deadline, "deadline");

  let marginalAds: LeverMarginal = { daysSooner: null, binds: false, binding: null };
  let marginalFarm: LeverMarginal = { daysSooner: null, binds: false, binding: null };
  if (!opts.skipMarginals) {
    const adsUp = runCore({ ...levers, adBudgetPerFarmPerDay: levers.adBudgetPerFarmPerDay + SIMULATOR_BUDGET_STEP }, ctx);
    const farmUp = runCore({ ...levers, farmsPerQuarter: levers.farmsPerQuarter + SIMULATOR_FARM_STEP }, ctx);
    const adsDelta = daysSooner(core.simulatedFreedomDate, adsUp.simulatedFreedomDate);
    const farmDelta = daysSooner(core.simulatedFreedomDate, farmUp.simulatedFreedomDate);
    marginalAds = {
      daysSooner: adsDelta.daysSooner,
      binds: adsDelta.binds,
      binding: adsDelta.binds ? (core.bottleneck.kind === "none" ? "inventory" : core.bottleneck.kind === "demand" ? "inventory" : core.bottleneck.kind) : null,
    };
    if (adsDelta.binds && core.bottleneck.kind === "inventory") marginalAds.binding = "inventory";
    if (adsDelta.binds && core.bottleneck.kind === "capital") marginalAds.binding = "capital";
    if (adsDelta.binds && !marginalAds.binding) marginalAds.binding = seriesDominant(core.series);
    marginalFarm = {
      daysSooner: farmDelta.daysSooner,
      binds: farmDelta.binds,
      binding: farmDelta.binds ? (core.bottleneck.kind === "none" ? "demand" : core.bottleneck.kind === "inventory" ? "demand" : core.bottleneck.kind) : null,
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
  return runSimulator(levers, ctx, { presetId: id, skipMarginals });
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

export function normalizeLevers(raw: Partial<SimulatorLevers>, ctx: SimulatorContext): SimulatorLevers {
  const today = todayLevers(ctx);
  return {
    adBudgetPerFarmPerDay: raw.adBudgetPerFarmPerDay ?? today.adBudgetPerFarmPerDay,
    farmsPerQuarter: raw.farmsPerQuarter ?? today.farmsPerQuarter,
    capitalAvailable: raw.capitalAvailable ?? today.capitalAvailable,
    fallThroughPct: raw.fallThroughPct ?? today.fallThroughPct,
    sellNotes: raw.sellNotes ?? true,
    avgSalePrice: raw.avgSalePrice ?? today.avgSalePrice,
    costPerReservation: raw.costPerReservation ?? today.costPerReservation,
    conversionPct: raw.conversionPct ?? today.conversionPct,
    investorTakePct: raw.investorTakePct ?? today.investorTakePct,
    landCostPerFarm: raw.landCostPerFarm ?? today.landCostPerFarm,
  };
}
