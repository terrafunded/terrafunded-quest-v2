/**
 * THE ENGINE — capital-first inversion of the War Plan / Oracle.
 *
 * War Plan and the Oracle start from a farm plan and ask what capital it demands.
 * The Engine starts from capital already in the ground, projects how many times it
 * turns before the horizon at a modelled sales pace, and only then reports the
 * shortfall and the fresh capital that must land — and by when.
 *
 * Same forecast: every simulation calls `runOracle` with a schedule funded by
 * `fundSchedule`. The War Plan buys just-in-time; the Engine buys as soon as the
 * recycled pool covers the next farm. Do not invent a third forecast.
 *
 * LIMITATION / COUPLING: `runOracle` / War Plan pass a fixed `capitalCycleMonths`.
 * Pace and cycle are coupled here: selling faster returns capital sooner, so
 * `effectiveCycleMonths = baseCycle × (referencePace / salesPace)`. Documented on
 * the page and in `coupledCycleMonths`.
 */

import type { GoalStatus } from "./goal";
import { computeGoal } from "./goal";
import {
  buildMonthGrid,
  fundSchedule,
  runOracle,
  type InvestorMixEntry,
  type OracleFarm,
  type OracleMonthGrid,
  type OracleParams,
  type OracleResult,
} from "./oracle";
import {
  deriveWarPlanDefaults,
  farmToFirstCloseMonths,
  prefillInvestorMix,
  sponsorLedger,
  usdCompact,
  warPlanMonthLabel,
  type WarPlanContext,
  type WarPlanRealValues,
} from "./warplan";
import { parseDate, toIsoDate } from "./dates";
import { mean, round2, sum } from "./math";
import { DAYS_PER_MONTH } from "../config/goal";
import {
  ENGINE_CYCLE_OFFSET_DAYS,
  ENGINE_DEFAULT_COST_PER_RESERVATION,
  ENGINE_MAX_FARMS,
  ENGINE_PACE_MULTIPLIERS,
} from "../config/engine";
import { WARPLAN_DEFAULT_LOTS_PER_FARM } from "../config/warplan";

// ---------------------------------------------------------------------------------------------
// Inputs / defaults
// ---------------------------------------------------------------------------------------------

export interface EngineInputs {
  /** Benchmark turn length the slider starts from; coupled to pace via `coupledCycleMonths`. */
  cycleMonths: number;
  /** Marketing dollars per reservation. Assumption — no ad table in Payments. */
  costPerReservation: number;
  /** Reservation → closing conversion, percent. */
  conversionPct: number;
  lotsPerFarm: number;
  /** Capital to buy one new farm. Overridden by acres × cost/acre when both are set. */
  farmCost: number;
  /** Optional: acres on the farm under consideration. */
  acresPerFarm: number | null;
  /** Optional: $/acre. With acresPerFarm, sets farmCost = acres × costPerAcre. */
  costPerAcre: number | null;
  /** Closings per month to model. KEY ASSUMPTION: reachable by ad spend alone (linear). */
  salesPace: number;
  farmToFirstCloseMonths: number;
  /** Funding order; capital is what is already deployed (can rotate). */
  investorMix: InvestorMixEntry[];
}

export interface EngineRealValues {
  cycleMonths: number | null;
  cycleDays: number | null;
  cycleSource: WarPlanRealValues["cycleSource"];
  cycleFarms: number;
  cycleExcludedFarms: string[];
  /** The farm behind the projected/measured benchmark (e.g. Avery). */
  cycleBenchmarkFarm: string | null;
  conversionPct: number | null;
  conversionWithCancellationsPct: number | null;
  salesPace: number;
  lotsPerFarm: number | null;
  defaultLandCostPerLot: number;
  recentFarms: string[];
  meanAcresPerFarm: number | null;
  meanCostPerAcre: number | null;
  availableLots: number;
  reservedLots: number;
  capitalOutstanding: number;
  farmToFirstCloseMonths: number | null;
  eraSince: string | null;
}

export interface EngineDefaults {
  inputs: EngineInputs;
  real: EngineRealValues;
  /** Pace the cycle was measured/projected at — the coupling reference. */
  referencePace: number;
}

/** Resolved farm cost: acres × $/acre when both are set, else the explicit farmCost. */
export function resolveFarmCost(inputs: Pick<EngineInputs, "farmCost" | "acresPerFarm" | "costPerAcre">): number {
  if (inputs.acresPerFarm !== null && inputs.acresPerFarm > 0 && inputs.costPerAcre !== null && inputs.costPerAcre > 0) {
    return Math.round(inputs.acresPerFarm * inputs.costPerAcre);
  }
  return Math.max(0, Math.round(inputs.farmCost));
}

/**
 * Pace ↔ cycle coupling. The Oracle hard-codes a constant `capitalCycleMonths`; the Engine
 * scales the slider's base cycle by how fast we sell relative to the pace the benchmark
 * was taken at. Faster pace → shorter cycle → more turns before the deadline.
 */
export function coupledCycleMonths(baseCycleMonths: number, salesPace: number, referencePace: number): number {
  if (!(baseCycleMonths > 0)) return Math.max(0, baseCycleMonths);
  if (!(salesPace > 0) || !(referencePace > 0)) return Math.max(1, round2(baseCycleMonths));
  return Math.max(1, round2(baseCycleMonths * (referencePace / salesPace)));
}

/** Cost per closing = costPerReservation ÷ conversion (fraction). */
export function costPerClosing(costPerReservation: number, conversionPct: number): number {
  const c = conversionPct / 100;
  return c > 0 ? round2(costPerReservation / c) : 0;
}

/** Inventory the Engine can sell: available lots + reserved lots × conversion. */
export function engineStartInventory(availableLots: number, reservedLots: number, conversionPct: number): {
  availableLots: number;
  reservedLots: number;
  reservedExpected: number;
  total: number;
} {
  const reservedExpected = round2(reservedLots * (Math.max(0, conversionPct) / 100));
  return {
    availableLots,
    reservedLots,
    reservedExpected,
    total: round2(availableLots + reservedExpected),
  };
}

/**
 * Last month index fresh capital can arrive and still complete a full turn before the
 * deadline (`purchase + cycle ≤ deadlineIndex`).
 */
export function capitalDeadlineMonth(deadlineIndex: number, cycleMonths: number): number {
  if (deadlineIndex <= 0 || !(cycleMonths > 0)) return 0;
  return Math.max(0, deadlineIndex - Math.max(1, Math.round(cycleMonths)));
}

/**
 * Buys each farm the moment the recycled pool (plus remaining mix capital) covers it —
 * the inverse of the War Plan's just-in-time schedule. Uses the same `fundSchedule`.
 */
export function greedyBuySchedule(
  farmCost: number,
  lotsPerFarm: number,
  landLag: number,
  mix: InvestorMixEntry[],
  cycleMonths: number | null,
  deadlineIndex: number,
  lastBuyMonth: number,
  maxFarms = ENGINE_MAX_FARMS,
): number[] {
  const schedule: number[] = [];
  if (!(farmCost > 0) || lotsPerFarm <= 0 || lastBuyMonth < 1) return schedule;
  const cycle = cycleMonths !== null && cycleMonths > 0 ? Math.max(1, Math.round(cycleMonths)) : null;
  let m = 1;
  while (m <= lastBuyMonth && schedule.length < maxFarms) {
    const trial = fundSchedule([...schedule, m], farmCost, lotsPerFarm, landLag, mix, cycle, deadlineIndex);
    const last = trial[trial.length - 1];
    if (last && last.unfunded <= 1e-6) {
      schedule.push(m);
      // Same month may fund another farm if the mix still has capital.
    } else {
      m += 1;
    }
  }
  return schedule;
}

export function deriveEngineDefaults(ctx: WarPlanContext): EngineDefaults {
  const war = deriveWarPlanDefaults(ctx);
  const benchmark = war.real;
  const acres = ctx.farms.map((f) => f.totalAcres).filter((a): a is number => a !== null && a > 0);
  const meanAcres = mean(acres);
  const withBasis = ctx.farms.filter((f) => f.capitalBasisSource !== "none" && f.totalAcres !== null && f.totalAcres > 0 && f.capitalDeployed > 0);
  const meanCostPerAcre = mean(withBasis.map((f) => f.capitalDeployed / (f.totalAcres as number)));
  const lotsPerFarm = WARPLAN_DEFAULT_LOTS_PER_FARM;
  const farmCost = Math.round(war.real.defaultLandCostPerLot * lotsPerFarm);
  const cycleMonths = benchmark.cycleMonths ?? 9;
  const salesPace = Math.max(0.01, war.real.closingsPerMonth);
  const conversionPct = war.real.conversionWithCancellationsPct ?? war.real.conversionPct ?? 75;
  const first = farmToFirstCloseMonths(ctx.farms);

  return {
    inputs: {
      cycleMonths: round2(cycleMonths),
      costPerReservation: ENGINE_DEFAULT_COST_PER_RESERVATION,
      conversionPct: round2(conversionPct),
      lotsPerFarm,
      farmCost,
      acresPerFarm: meanAcres === null ? null : round2(meanAcres),
      costPerAcre: meanCostPerAcre === null ? null : Math.round(meanCostPerAcre),
      salesPace: round2(salesPace),
      farmToFirstCloseMonths: first.months ?? 3,
      investorMix: prefillInvestorMix(ctx.investors),
    },
    real: {
      cycleMonths: benchmark.cycleMonths,
      cycleDays: benchmark.cycleDays,
      cycleSource: benchmark.cycleSource,
      cycleFarms: benchmark.cycleFarms,
      cycleExcludedFarms: benchmark.cycleExcludedFarms,
      cycleBenchmarkFarm: null,
      conversionPct: war.real.conversionPct,
      conversionWithCancellationsPct: war.real.conversionWithCancellationsPct,
      salesPace: war.real.closingsPerMonth,
      lotsPerFarm: war.real.lotsPerFarm,
      defaultLandCostPerLot: war.real.defaultLandCostPerLot,
      recentFarms: war.real.recentFarms,
      meanAcresPerFarm: meanAcres === null ? null : round2(meanAcres),
      meanCostPerAcre: meanCostPerAcre === null ? null : Math.round(meanCostPerAcre),
      availableLots: ctx.goal.availableLots,
      reservedLots: ctx.goal.reservedLots,
      capitalOutstanding: sponsorLedger(ctx).capitalOwed,
      farmToFirstCloseMonths: first.months,
      eraSince: war.real.eraSince,
    },
    referencePace: salesPace,
  };
}

/** Enrich defaults with the rotation benchmark farm name once the realm has solved the War Plan. */
export function withBenchmarkFarm(defaults: EngineDefaults, benchmarkFarmName: string | null): EngineDefaults {
  return {
    ...defaults,
    real: { ...defaults.real, cycleBenchmarkFarm: benchmarkFarmName },
  };
}

// ---------------------------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------------------------

export type EngineBottleneck = "land" | "sales_pace" | "capital" | "none";
export type EngineBand = "met" | "close" | "short" | "far";

export interface EngineMonthPoint {
  monthIndex: number;
  date: string;
  inventory: number;
  lotsClosed: number;
  adSpend: number;
  cumulativeAdSpend: number;
  /** Cumulative net profit after ad spend. */
  cumulativeProfit: number;
  /** Profit attributable to today's inventory (no new farm). */
  profitFromInventory: number;
  /** Profit from recycled turns (farms funded without fresh capital beyond deployed). */
  profitFromRecycled: number;
  /** Profit from farms that needed fresh capital. */
  profitFromFresh: number;
  capitalOwed: number;
  /** Monthly interest accrual estimate on outstanding capital. */
  interestAccrued: number;
  cumulativeInterest: number;
  inventoryDry: boolean;
  farmsBought: number;
  capitalDeployed: number;
  shortfall: boolean;
}

export interface EngineTurnLane {
  /** 0 = inventory on hand; 1+ = planned farm index. */
  id: number;
  label: string;
  /** Existing farm (inventory) vs projected purchase. */
  kind: "inventory" | "recycled" | "fresh";
  purchaseMonth: number | null;
  purchaseIso: string | null;
  returnMonth: number | null;
  returnIso: string | null;
  cost: number;
  recycled: number;
  fresh: number;
  lots: number;
}

export interface EngineSensitivityCell {
  paceMultiplier: number;
  cycleOffsetDays: number;
  salesPace: number;
  cycleMonths: number;
  effectiveCycleMonths: number;
  netProfitAtDeadline: number;
  shortfall: number;
  hitsGoal: boolean;
  freshCapital: number;
  band: EngineBand;
  verdict: string;
}

export interface EngineFigures {
  availableLots: number;
  reservedLots: number;
  reservedExpected: number;
  inventoryLots: number;
  inventoryNetProfit: number;
  inventoryMonths: number | null;
  totalLotsProduced: number;
  turns: number;
  netProfitNoFresh: number;
  netProfitAtDeadline: number;
  shortfallDollars: number;
  shortfallLots: number | null;
  shortfallFarms: number;
  freshCapital: number;
  peakOutstanding: number;
  capitalDeadlineIso: string | null;
  capitalDeadlineMonthIndex: number;
  capitalDeadlineReason: string;
  totalAdSpend: number;
  adSpendShareOfProfit: number | null;
  totalInterest: number;
  farmsBought: number;
  farmsFromRecycled: number;
  farmsFromFresh: number;
}

export interface EngineResult {
  inputs: EngineInputs;
  asOf: string;
  deadline: string;
  goal: number;
  netProfitToDate: number;
  referencePace: number;
  effectiveCycleMonths: number;
  cycleCouplingNote: string;
  costPerClosing: number;
  startInventory: ReturnType<typeof engineStartInventory>;
  figures: EngineFigures;
  bottleneck: EngineBottleneck;
  bottleneckDetail: string;
  band: EngineBand;
  verdict: string;
  series: EngineMonthPoint[];
  turns: EngineTurnLane[];
  sensitivity: EngineSensitivityCell[];
  goalLine: { asOf: number; deadline: number; start: number; goal: number };
  inventoryDryMonths: number[];
  oracle: OracleResult;
  schedule: OracleFarm[];
}

export type EngineContext = WarPlanContext & {
  /** Pace the cycle was measured at; defaults to trailing closings/month. */
  referencePace?: number;
};

// ---------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------

function weightedAnnualRate(mix: InvestorMixEntry[]): number {
  const funded = mix.filter((e) => e.capital > 0 && e.dealType === "fixed_interest");
  const total = sum(funded.map((e) => e.capital));
  if (total <= 0) {
    const any = mix.filter((e) => e.dealType === "fixed_interest");
    return any.length > 0 ? mean(any.map((e) => e.ratePct)) ?? 20 : 20;
  }
  return sum(funded.map((e) => e.capital * e.ratePct)) / total;
}

function peakOutstandingOf(farms: OracleFarm[], deadlineIndex: number): number {
  let peak = 0;
  for (let m = 1; m <= Math.max(1, deadlineIndex); m++) {
    const out = sum(
      farms
        .filter((f) => f.purchaseMonth <= m && (f.turnCompletesMonth === null || f.turnCompletesMonth > m))
        .map((f) => f.cost),
    );
    peak = Math.max(peak, out);
  }
  return round2(peak);
}

function bandFor(shortfall: number, goal: number): EngineBand {
  if (shortfall <= 0) return "met";
  if (shortfall <= goal * 0.1) return "close";
  if (shortfall <= goal * 0.35) return "short";
  return "far";
}

function mixWithExtra(mix: InvestorMixEntry[], extra: number): InvestorMixEntry[] {
  if (!(extra > 0) || mix.length === 0) {
    if (extra > 0 && mix.length === 0) {
      return [{ investorId: null, name: "Fresh capital", dealType: "fixed_interest", ratePct: 20, capital: Math.round(extra) }];
    }
    return mix.map((e) => ({ ...e }));
  }
  const out = mix.map((e) => ({ ...e }));
  const first = out[0] as InvestorMixEntry;
  out[0] = { ...first, capital: Math.round(first.capital + extra) };
  return out;
}

interface SimBundle {
  result: OracleResult;
  schedule: OracleFarm[];
  series: EngineMonthPoint[];
  adSpendTotal: number;
  interestTotal: number;
  peakOutstanding: number;
  lotsClosed: number;
  inventoryDryMonths: number[];
  turns: EngineTurnLane[];
  profitAfterAds: number;
}

function simulateOnce(
  inputs: EngineInputs,
  goal: GoalStatus,
  asOf: Date,
  grid: OracleMonthGrid,
  oracleDefaults: OracleParams,
  referencePace: number,
  startInv: number,
  inventoryLots: number,
  mix: InvestorMixEntry[],
  freshExtra: number,
  buyThroughMonth: number,
): SimBundle {
  const farmCost = resolveFarmCost(inputs);
  const landLag = Math.max(0, Math.round(inputs.farmToFirstCloseMonths));
  const effectiveCycle = coupledCycleMonths(inputs.cycleMonths, inputs.salesPace, referencePace);
  const adPerClosing = costPerClosing(inputs.costPerReservation, inputs.conversionPct);
  const fundedMix = mixWithExtra(mix, freshExtra);
  const schedule = greedyBuySchedule(farmCost, inputs.lotsPerFarm, landLag, fundedMix, effectiveCycle, grid.deadlineIndex, buyThroughMonth);
  const params: OracleParams = {
    ...oracleDefaults,
    lotsPerMonth: Math.max(0, inputs.salesPace),
    avgLotsPerFarm: inputs.lotsPerFarm,
    farmCost,
    adSpendPerClosing: adPerClosing,
    conversionPct: inputs.conversionPct,
    farmToFirstCloseMonths: inputs.farmToFirstCloseMonths,
    investorMix: fundedMix,
    farmsToBuy: schedule,
    targetMode: "profit_at_closing",
    capitalCycleMonths: effectiveCycle,
  };
  const result = runOracle(params, goal, startInv, asOf, { calendarMonths: true, grid });
  const k = grid.deadlineIndex;
  const planned = result.farms.filter((f) => f.purchaseMonth <= k);
  const rate = weightedAnnualRate(fundedMix) / 100;
  const netPerLot = result.netProfitPerLot;

  // Split cumulative profit into inventory / recycled / fresh stacks.
  let soldFromInventory = 0;
  let soldFromRecycled = 0;
  let soldFromFresh = 0;
  const farmRemaining = new Map<number, { left: number; freshShare: number }>();
  for (const f of planned) {
    const freshShare = f.cost > 0 ? Math.max(0, (f.cost - f.recycled) / f.cost) : 0;
    farmRemaining.set(f.index, { left: f.lots, freshShare });
  }

  let cumAds = 0;
  let cumInterest = 0;
  let cumProfit = goal.netProfitToDate;
  const series: EngineMonthPoint[] = [];
  const inventoryDryMonths: number[] = [];
  let poolLeft = startInv;

  for (const p of result.series) {
    if (p.monthIndex > Math.max(k, 1)) break;
    const weight = p.monthIndex === k ? grid.deadlineFraction : 1;
    const closed = p.lotsClosed;
    // Attribute closings: inventory first, then farms in purchase order.
    const fromInv = Math.min(closed, poolLeft);
    poolLeft = Math.max(0, poolLeft - fromInv);
    soldFromInventory += fromInv * (p.monthIndex === k ? weight : 1);
    let left = closed - fromInv;
    for (const f of planned) {
      if (left <= 1e-12) break;
      if (p.monthIndex < f.landMonth) continue;
      const state = farmRemaining.get(f.index);
      if (!state || state.left <= 0) continue;
      const take = Math.min(left, state.left);
      state.left -= take;
      left -= take;
      const w = p.monthIndex === k ? weight : 1;
      soldFromFresh += take * state.freshShare * w;
      soldFromRecycled += take * (1 - state.freshShare) * w;
    }

    const ads = p.adSpend;
    cumAds += ads;
    const interest = round2(Math.max(0, p.capitalOwed) * rate / 12);
    cumInterest += interest;
    // Oracle net already deducts investor take; subtract ad spend for the Engine's reachable profit.
    cumProfit = round2(p.cumulativeNetProfit - cumAds);

    const invProfit = round2(Math.min(soldFromInventory, inventoryLots) * netPerLot + goal.netProfitToDate);
    // Stacks for the chart: inventory base, then recycled turns, then fresh on top (after ads).
    const profitFromInventory = round2(Math.min(cumProfit, invProfit));
    const recycledGross = round2(soldFromRecycled * netPerLot);
    const freshGross = round2(soldFromFresh * netPerLot);
    const afterInv = Math.max(0, cumProfit - profitFromInventory);
    const profitFromRecycled = round2(Math.min(afterInv, recycledGross));
    const profitFromFresh = round2(Math.min(Math.max(0, afterInv - profitFromRecycled), Math.max(freshGross, afterInv)));

    const dry = p.inventory <= 1e-6 && p.shortfall;
    if (dry) inventoryDryMonths.push(p.monthIndex);

    series.push({
      monthIndex: p.monthIndex,
      date: p.date,
      inventory: p.inventory,
      lotsClosed: p.lotsClosed,
      adSpend: ads,
      cumulativeAdSpend: round2(cumAds),
      cumulativeProfit: cumProfit,
      profitFromInventory,
      profitFromRecycled,
      profitFromFresh,
      capitalOwed: p.capitalOwed,
      interestAccrued: interest,
      cumulativeInterest: round2(cumInterest),
      inventoryDry: dry,
      farmsBought: p.farmsBought,
      capitalDeployed: p.capitalDeployed,
      shortfall: p.shortfall,
    });
  }

  const deadlinePoint = series.find((s) => s.monthIndex === k) ?? series[series.length - 1];
  const profitAfterAds = deadlinePoint?.cumulativeProfit ?? round2(goal.netProfitToDate - cumAds);

  const isoFor = (m: number | null): string | null => {
    if (m === null || m <= 0) return null;
    const mo = grid.months[m - 1];
    return mo ? toIsoDate(mo.end) : null;
  };

  const turns: EngineTurnLane[] = [
    {
      id: 0,
      label: "Inventory on hand",
      kind: "inventory",
      purchaseMonth: null,
      purchaseIso: null,
      returnMonth: null,
      returnIso: null,
      cost: 0,
      recycled: 0,
      fresh: 0,
      lots: inventoryLots,
    },
    ...planned.map((f, i) => ({
      id: i + 1,
      label: `Farm ${i + 1}`,
      kind: (f.recycled >= f.cost - 1e-6 ? "recycled" : f.recycled > 0 ? "recycled" : "fresh") as EngineTurnLane["kind"],
      purchaseMonth: f.purchaseMonth,
      purchaseIso: isoFor(f.purchaseMonth),
      returnMonth: f.turnCompletesMonth,
      returnIso: isoFor(f.turnCompletesMonth),
      cost: round2(f.cost),
      recycled: round2(f.recycled),
      fresh: round2(Math.max(0, f.cost - f.recycled - f.unfunded)),
      lots: f.lots,
    })),
  ];

  let lotsClosed = 0;
  for (const p of result.series) {
    if (p.monthIndex > k) break;
    lotsClosed += (p.monthIndex === k ? grid.deadlineFraction : 1) * p.lotsClosed;
  }

  return {
    result,
    schedule: planned,
    series,
    adSpendTotal: round2(deadlinePoint?.cumulativeAdSpend ?? cumAds),
    interestTotal: round2(deadlinePoint?.cumulativeInterest ?? cumInterest),
    peakOutstanding: peakOutstandingOf(planned, k),
    lotsClosed: round2(lotsClosed),
    inventoryDryMonths,
    turns,
    profitAfterAds: round2(profitAfterAds),
  };
}

function buildVerdict(args: {
  salesPace: number;
  reachable: number;
  deadline: string;
  goal: number;
  shortfall: number;
  farmsNeeded: number;
  freshCapital: number;
  capitalDeadlineIso: string | null;
  hits: boolean;
}): string {
  const pace = args.salesPace.toFixed(1);
  const reached = usdCompact(args.reachable);
  const short = usdCompact(args.shortfall);
  const fresh = usdCompact(args.freshCapital);
  const deadlineLabel = warPlanMonthLabel(args.deadline);
  if (args.hits || args.shortfall <= 0) {
    return `With capital deployed today, selling at ${pace} lots/month, you reach ${reached} by ${deadlineLabel} — no fresh capital needed.`;
  }
  const farmWord = args.farmsNeeded === 1 ? "farm" : "farms";
  const byWhen = args.capitalDeadlineIso
    ? `and it must land before ${warPlanMonthLabel(args.capitalDeadlineIso)} or it cannot complete a turn in time`
    : "but the horizon is too close for a full turn of fresh capital";
  return `With capital deployed today, selling at ${pace} lots/month, you reach ${reached} by ${deadlineLabel} — ${short} short. Closing that gap needs ${args.farmsNeeded} more ${farmWord} and ${fresh} of fresh capital, ${byWhen}.`;
}

function bottleneckOf(
  series: EngineMonthPoint[],
  schedule: OracleFarm[],
  cycleMonths: number,
  capitalDeadline: number,
  shortfall: number,
  inventoryMonths: number | null,
): { bottleneck: EngineBottleneck; detail: string } {
  if (shortfall <= 0) {
    return { bottleneck: "none", detail: "Deployed capital and inventory cover the goal at this pace — no constraint binds." };
  }
  const firstDry = series.find((s) => s.inventoryDry)?.monthIndex ?? null;
  const firstReturn = schedule.map((f) => f.turnCompletesMonth).filter((m): m is number => m !== null).sort((a, b) => a - b)[0] ?? null;

  if (firstDry !== null && firstReturn !== null && firstDry < firstReturn) {
    return {
      bottleneck: "land",
      detail: `Inventory runs dry in month ${firstDry}, before capital returns in month ${firstReturn}. Fly to Texas — buy land, do not wait on a raise.`,
    };
  }
  if (capitalDeadline < 1) {
    return {
      bottleneck: "capital",
      detail: `A ${cycleMonths.toFixed(1)}-month cycle cannot complete a turn before the deadline. Raise earlier or shorten the cycle.`,
    };
  }
  if (inventoryMonths !== null && inventoryMonths < cycleMonths && schedule.length === 0) {
    return {
      bottleneck: "land",
      detail: `Inventory lasts ${inventoryMonths.toFixed(1)} months; capital needs ${cycleMonths.toFixed(1)} months to return. The land gap binds.`,
    };
  }
  if (firstDry !== null) {
    return {
      bottleneck: "sales_pace",
      detail: `Inventory hits zero in month ${firstDry} while capital is still out. A faster pace returns capital sooner (cycle couples to pace); a slower pace wastes the raise.`,
    };
  }
  return {
    bottleneck: "capital",
    detail: `Profit falls short with the capital already deployed. Fresh capital must land by month ${capitalDeadline} to complete a turn.`,
  };
}

/**
 * Capital-first run: buy farms as soon as recycled capital covers them, subtract ad spend,
 * couple cycle length to sales pace, and search for the minimum fresh capital that closes
 * the goal gap before the capital deadline.
 */
export function runEngine(inputs: EngineInputs, ctx: EngineContext): EngineResult {
  const asOf = ctx.asOf;
  const goal = computeGoal(ctx.lots, ctx.farms, asOf, { goal: ctx.goal.goal, deadline: ctx.goal.deadline });
  const deadline = parseDate(goal.deadline) ?? asOf;
  const grid = buildMonthGrid(asOf, deadline, true);
  const k = grid.deadlineIndex;
  const referencePace = ctx.referencePace !== undefined && ctx.referencePace > 0 ? ctx.referencePace : Math.max(0.01, ctx.oracleDefaults.lotsPerMonth || inputs.salesPace);
  const effectiveCycle = coupledCycleMonths(inputs.cycleMonths, inputs.salesPace, referencePace);
  const inv = engineStartInventory(goal.availableLots, goal.reservedLots, inputs.conversionPct);
  const capDeadline = capitalDeadlineMonth(k, effectiveCycle);
  const adPerClosing = costPerClosing(inputs.costPerReservation, inputs.conversionPct);
  const netPerLot = (() => {
    const g = inputs;
    const gross = ctx.oracleDefaults.avgSalePrice - (resolveFarmCost(g) / Math.max(1, g.lotsPerFarm));
    // Prefer the ledger average when present — inventory profit should match the throne.
    return goal.avgNetProfitPerClosedLot ?? round2(gross * (1 - ctx.oracleDefaults.investorTakePct / 100));
  })();

  const inventoryNetProfit = round2(inv.total * (goal.avgNetProfitPerClosedLot ?? netPerLot));
  const inventoryMonths = inputs.salesPace > 0 ? round2(inv.total / inputs.salesPace) : null;

  // Pass 1: only capital already in the mix (deployed today) — no fresh top-up.
  const base = simulateOnce(inputs, goal, asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, 0, Math.max(capDeadline, k));
  const noFreshProfit = base.profitAfterAds;
  const shortfall0 = round2(Math.max(0, goal.goal - noFreshProfit));

  // Pass 2: search for minimum fresh capital to hit the goal, buying only through the capital deadline.
  let freshCapital = 0;
  let withFresh = base;
  if (shortfall0 > 0.005 && capDeadline >= 1) {
    const farmCost = resolveFarmCost(inputs);
    let lo = 0;
    let hi = Math.max(farmCost * ENGINE_MAX_FARMS, shortfall0 * 2, 1);
    let best = base;
    let bestExtra = 0;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const trial = simulateOnce(inputs, goal, asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, mid, capDeadline);
      if (trial.profitAfterAds >= goal.goal - 0.5) {
        best = trial;
        bestExtra = mid;
        hi = mid;
      } else {
        lo = mid;
      }
    }
    // Snap up to the next dollar that still hits, if any.
    const snapped = Math.ceil(bestExtra);
    const final = simulateOnce(inputs, goal, asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, snapped, capDeadline);
    if (final.profitAfterAds >= goal.goal - 0.5 || final.profitAfterAds >= best.profitAfterAds) {
      withFresh = final;
      freshCapital = snapped;
    } else {
      withFresh = best;
      freshCapital = Math.ceil(bestExtra);
    }
  }

  const reachable = withFresh.profitAfterAds;
  const shortfall = round2(Math.max(0, goal.goal - reachable));
  const hits = shortfall <= 0.005;
  const farmsFromRecycled = withFresh.schedule.filter((f) => f.recycled >= f.cost - 1e-6).length;
  const farmsFromFresh = withFresh.schedule.filter((f) => f.cost - f.recycled > 1e-6).length;
  // Farms beyond what the no-fresh run bought.
  const farmsNeeded = Math.max(0, withFresh.schedule.length - base.schedule.length);
  const capitalDeadlineIso = (() => {
    if (capDeadline < 1) return null;
    const mo = grid.months[capDeadline - 1];
    return mo ? toIsoDate(mo.end) : null;
  })();
  const capitalDeadlineReason =
    capDeadline < 1
      ? `A ${effectiveCycle.toFixed(1)}-month turn cannot complete before ${goal.deadline}.`
      : `Last month a farm can be bought and still return capital by the deadline: purchase month ${capDeadline} + ${Math.round(effectiveCycle)}-month cycle ≤ deadline month ${k}.`;

  const shortfallLots =
    goal.avgNetProfitPerClosedLot !== null && goal.avgNetProfitPerClosedLot > 0
      ? Math.ceil(shortfall / goal.avgNetProfitPerClosedLot)
      : null;
  const shortfallFarms =
    inputs.lotsPerFarm > 0 && shortfallLots !== null ? Math.ceil(shortfallLots / inputs.lotsPerFarm) : farmsNeeded;

  const turnsCount =
    withFresh.peakOutstanding > 0 ? round2(sum(withFresh.schedule.map((f) => f.cost)) / withFresh.peakOutstanding) : withFresh.schedule.length > 0 ? withFresh.schedule.length : 0;

  const adShare = reachable > 0 ? round2((withFresh.adSpendTotal / reachable) * 100) : null;
  const band = bandFor(shortfall, goal.goal);
  const verdict = buildVerdict({
    salesPace: inputs.salesPace,
    reachable,
    deadline: goal.deadline,
    goal: goal.goal,
    shortfall,
    farmsNeeded: Math.max(farmsNeeded, shortfallFarms),
    freshCapital,
    capitalDeadlineIso,
    hits,
  });

  const { bottleneck, detail } = bottleneckOf(
    withFresh.series,
    withFresh.schedule,
    effectiveCycle,
    capDeadline,
    shortfall,
    inventoryMonths,
  );

  const figures: EngineFigures = {
    availableLots: inv.availableLots,
    reservedLots: inv.reservedLots,
    reservedExpected: inv.reservedExpected,
    inventoryLots: inv.total,
    inventoryNetProfit,
    inventoryMonths,
    totalLotsProduced: withFresh.lotsClosed,
    turns: turnsCount,
    netProfitNoFresh: noFreshProfit,
    netProfitAtDeadline: reachable,
    shortfallDollars: shortfall,
    shortfallLots,
    shortfallFarms,
    freshCapital: round2(freshCapital),
    peakOutstanding: withFresh.peakOutstanding,
    capitalDeadlineIso,
    capitalDeadlineMonthIndex: capDeadline,
    capitalDeadlineReason,
    totalAdSpend: withFresh.adSpendTotal,
    adSpendShareOfProfit: adShare,
    totalInterest: withFresh.interestTotal,
    farmsBought: withFresh.schedule.length,
    farmsFromRecycled,
    farmsFromFresh,
  };

  // Sensitivity grid (3×3) — each cell is a full run at that pace × cycle.
  const sensitivity: EngineSensitivityCell[] = [];
  for (const mult of ENGINE_PACE_MULTIPLIERS) {
    for (const offsetDays of ENGINE_CYCLE_OFFSET_DAYS) {
      const pace = round2(inputs.salesPace * mult);
      const cycle = Math.max(1, round2(inputs.cycleMonths + offsetDays / DAYS_PER_MONTH));
      const cellInputs: EngineInputs = { ...inputs, salesPace: pace, cycleMonths: cycle };
      const cell = runEngineLight(cellInputs, ctx, goal, grid, referencePace, inv);
      sensitivity.push({
        paceMultiplier: mult,
        cycleOffsetDays: offsetDays,
        salesPace: pace,
        cycleMonths: cycle,
        effectiveCycleMonths: coupledCycleMonths(cycle, pace, referencePace),
        netProfitAtDeadline: cell.profit,
        shortfall: round2(Math.max(0, goal.goal - cell.profit)),
        hitsGoal: cell.profit >= goal.goal - 0.5,
        freshCapital: cell.fresh,
        band: bandFor(Math.max(0, goal.goal - cell.profit), goal.goal),
        verdict: buildVerdict({
          salesPace: pace,
          reachable: cell.profit,
          deadline: goal.deadline,
          goal: goal.goal,
          shortfall: Math.max(0, goal.goal - cell.profit),
          farmsNeeded: cell.farmsNeeded,
          freshCapital: cell.fresh,
          capitalDeadlineIso: cell.capitalDeadlineIso,
          hits: cell.profit >= goal.goal - 0.5,
        }),
      });
    }
  }

  return {
    inputs,
    asOf: goal.asOf,
    deadline: goal.deadline,
    goal: goal.goal,
    netProfitToDate: goal.netProfitToDate,
    referencePace,
    effectiveCycleMonths: effectiveCycle,
    cycleCouplingNote:
      "Oracle and War Plan pass a fixed capitalCycleMonths into fundSchedule. The Engine couples cycle to pace: effectiveCycle = baseCycle × (referencePace / salesPace), so selling faster returns capital sooner and buys more turns.",
    costPerClosing: adPerClosing,
    startInventory: inv,
    figures,
    bottleneck,
    bottleneckDetail: detail,
    band,
    verdict,
    series: withFresh.series,
    turns: withFresh.turns,
    sensitivity,
    goalLine: {
      asOf: asOf.getTime(),
      deadline: deadline.getTime(),
      start: goal.netProfitToDate,
      goal: goal.goal,
    },
    inventoryDryMonths: withFresh.inventoryDryMonths,
    oracle: withFresh.result,
    schedule: withFresh.schedule,
  };
}

/** Lighter cell run for the sensitivity grid (skips nested sensitivity). */
function runEngineLight(
  inputs: EngineInputs,
  ctx: EngineContext,
  goal: GoalStatus,
  grid: OracleMonthGrid,
  referencePace: number,
  inv: ReturnType<typeof engineStartInventory>,
): { profit: number; fresh: number; farmsNeeded: number; capitalDeadlineIso: string | null } {
  const effectiveCycle = coupledCycleMonths(inputs.cycleMonths, inputs.salesPace, referencePace);
  const capDeadline = capitalDeadlineMonth(grid.deadlineIndex, effectiveCycle);
  const base = simulateOnce(inputs, goal, ctx.asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, 0, Math.max(capDeadline, grid.deadlineIndex));
  const shortfall0 = Math.max(0, goal.goal - base.profitAfterAds);
  if (shortfall0 <= 0.005 || capDeadline < 1) {
    const mo = capDeadline >= 1 ? grid.months[capDeadline - 1] : null;
    return {
      profit: base.profitAfterAds,
      fresh: 0,
      farmsNeeded: 0,
      capitalDeadlineIso: mo ? toIsoDate(mo.end) : null,
    };
  }
  const farmCost = resolveFarmCost(inputs);
  let lo = 0;
  let hi = Math.max(farmCost * ENGINE_MAX_FARMS, shortfall0 * 2, 1);
  let bestExtra = hi;
  let bestProfit = base.profitAfterAds;
  let bestFarms = 0;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const trial = simulateOnce(inputs, goal, ctx.asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, mid, capDeadline);
    if (trial.profitAfterAds >= goal.goal - 0.5) {
      bestExtra = mid;
      bestProfit = trial.profitAfterAds;
      bestFarms = Math.max(0, trial.schedule.length - base.schedule.length);
      hi = mid;
    } else {
      lo = mid;
      if (trial.profitAfterAds > bestProfit) {
        bestProfit = trial.profitAfterAds;
        bestExtra = mid;
        bestFarms = Math.max(0, trial.schedule.length - base.schedule.length);
      }
    }
  }
  const mo = grid.months[capDeadline - 1];
  return {
    profit: round2(bestProfit),
    fresh: Math.ceil(bestExtra),
    farmsNeeded: bestFarms,
    capitalDeadlineIso: mo ? toIsoDate(mo.end) : null,
  };
}

/** Build Engine defaults from a realm-shaped War Plan context, tagging the benchmark farm. */
export function engineDefaultsFromRealm(
  ctx: WarPlanContext,
  rotationBenchmarkFarm: string | null,
): EngineDefaults {
  return withBenchmarkFarm(deriveEngineDefaults(ctx), rotationBenchmarkFarm);
}
