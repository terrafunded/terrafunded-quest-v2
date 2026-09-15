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
  type CapitalReturnSeed,
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
  /**
   * Which $/lot average drives inventory profit and shortfall math.
   * Default `era` — excludes pre-operation closings; toggle to `lifetime` for the all-time ledger.
   */
  profitBasis: "era" | "lifetime";
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
  /** Resolved conversion preferred for forecasts; open matured reservations excluded. */
  conversionResolvedPct: number | null;
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
export interface GreedyBuyDemand {
  /** Closings per month the model sells. */
  salesPace: number;
  /** Lots already on hand at month 0. */
  startInventory: number;
  /**
   * Effective capital cycle in months. The gate allows a buy once on-hand runway is at or
   * below one cycle (or the land lead time, whichever is larger) — enough buffer to not
   * stock out, but not so much that returned capital sits idle until the deadline is too close
   * to land a farm.
   */
  cycleMonths: number;
}

/**
 * Buys each farm the moment the recycled pool (plus remaining mix capital) covers it —
 * the inverse of the War Plan's just-in-time schedule. Uses the same `fundSchedule`.
 *
 * When `demand` is set, a buy is skipped unless the lots already secured (start inventory +
 * scheduled farms) still fall short of what the remaining horizon can sell. That stops the
 * ASAP policy from piling inventory while today's lots are still draining.
 *
 * `seedReturns` is capital already outstanding that re-enters the pool as existing lots sell —
 * the Engine's turning dollars. Without it, only mix.capital (dry powder) can buy.
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
  demand?: GreedyBuyDemand,
  seedReturns: CapitalReturnSeed[] = [],
): number[] {
  const schedule: number[] = [];
  if (!(farmCost > 0) || lotsPerFarm <= 0 || lastBuyMonth < 1) return schedule;
  const cycle = cycleMonths !== null && cycleMonths > 0 ? Math.max(1, Math.round(cycleMonths)) : null;
  let m = 1;
  while (m <= lastBuyMonth && schedule.length < maxFarms) {
    if (demand && demand.salesPace > 0) {
      // Approximate on-hand lots at month m: start inventory, minus sales so far, plus farms
      // that have already landed (bought landLag months ago). Buy when runway shrinks to one
      // capital cycle (or the land lead time, if longer). Tighter than "only at stockout" so
      // returned capital can turn before the deadline; looser than ASAP so inventory still
      // sawtooths instead of climbing without bound.
      const landed = schedule.filter((b) => b + landLag <= m).length * lotsPerFarm;
      const soldSoFar = demand.salesPace * Math.max(0, m - 1);
      const onHand = Math.max(0, demand.startInventory + landed - soldSoFar);
      const runwayMonths = onHand / demand.salesPace;
      const leadTime = Math.max(1, landLag + 1);
      const bufferMonths = Math.max(leadTime, demand.cycleMonths > 0 ? demand.cycleMonths : leadTime);
      if (runwayMonths > bufferMonths) {
        m += 1;
        continue;
      }
    }
    const trial = fundSchedule([...schedule, m], farmCost, lotsPerFarm, landLag, mix, cycle, deadlineIndex, seedReturns);
    const last = trial[trial.length - 1];
    if (last && last.unfunded <= 1e-6) {
      schedule.push(m);
      if (demand && demand.salesPace > 0) {
        // Demand-capped mode: one farm per stockout signal, then wait for sales to drain again.
        m += 1;
      }
      // Without demand: same month may fund another farm if the mix still has capital.
    } else {
      m += 1;
    }
  }
  return schedule;
}

/**
 * Capital already in the ground, timed to re-enter the pool as remaining lots sell through.
 * The Engine funds new farms from these returns (+ explicit fresh), not by treating
 * historical deployed capital as unused dry powder a second time.
 */
export function capitalReturnSeeds(
  existingFarms: EngineExistingFarm[],
  salesPace: number,
  fallbackCycleMonths: number,
  mixSlotCount: number,
): CapitalReturnSeed[] {
  if (mixSlotCount <= 0) return [];
  const seeds: CapitalReturnSeed[] = [];
  for (const farm of existingFarms) {
    if (!(farm.capitalOutstanding > 0)) continue;
    const returnMonth =
      salesPace > 0 && farm.remainingLots > 0
        ? Math.max(1, Math.ceil(farm.remainingLots / salesPace))
        : Math.max(1, Math.round(fallbackCycleMonths));
    seeds.push({ month: returnMonth, mixIndex: 0, amount: farm.capitalOutstanding });
  }
  return seeds;
}

export function deriveEngineDefaults(ctx: WarPlanContext): EngineDefaults {
  const war = deriveWarPlanDefaults(ctx);
  const benchmark = war.real;
  const acres = ctx.farms.map((f) => f.totalAcres).filter((a): a is number => a !== null && a > 0);
  const meanAcres = mean(acres);
  const withBasis = ctx.farms.filter((f) => f.capitalBasisSource !== "none" && f.totalAcres !== null && f.totalAcres > 0 && f.capitalDeployed > 0);
  const meanCostPerAcre = mean(withBasis.map((f) => f.capitalDeployed / (f.totalAcres as number)));
  // Prefer the measured average lots/farm when the realm has it; otherwise the War Plan default.
  const lotsPerFarm =
    war.real.lotsPerFarm !== null && war.real.lotsPerFarm > 0
      ? round2(war.real.lotsPerFarm)
      : WARPLAN_DEFAULT_LOTS_PER_FARM;
  // Authoritative farm cost: acres × $/acre when both means exist; else landCostPerLot × lots.
  // acresPerFarm / costPerAcre are seeded from the same product so the helper never disagrees.
  const acresPerFarm = meanAcres === null ? null : round2(meanAcres);
  const costPerAcre = meanCostPerAcre === null ? null : Math.round(meanCostPerAcre);
  const farmCostFromAcres =
    acresPerFarm !== null && acresPerFarm > 0 && costPerAcre !== null && costPerAcre > 0
      ? Math.round(acresPerFarm * costPerAcre)
      : null;
  const farmCost =
    farmCostFromAcres !== null
      ? farmCostFromAcres
      : Math.round(war.real.defaultLandCostPerLot * lotsPerFarm);
  const cycleMonths = benchmark.cycleMonths ?? 9;
  const salesPace = Math.max(0.01, war.real.closingsPerMonth);
  const conversionPct = war.real.conversionResolvedPct ?? war.real.conversionWithCancellationsPct ?? war.real.conversionPct ?? 75;
  const first = farmToFirstCloseMonths(ctx.farms);

  return {
    inputs: {
      cycleMonths: round2(cycleMonths),
      costPerReservation: ENGINE_DEFAULT_COST_PER_RESERVATION,
      conversionPct: round2(conversionPct),
      lotsPerFarm,
      farmCost,
      acresPerFarm,
      costPerAcre,
      salesPace: round2(salesPace),
      farmToFirstCloseMonths: first.months ?? 3,
      investorMix: prefillInvestorMix(ctx.investors),
      // Era average is the better estimator: it excludes pre-operation closings.
      profitBasis: "era",
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
      conversionResolvedPct: war.real.conversionResolvedPct,
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

/** Amounts below this are treated as $0 for verdict / bottleneck agreement (and for usdCompact $0K). */
export const ENGINE_FRESH_CAPITAL_EPSILON = 500;

export type EngineBottleneckCode =
  | { code: "none" }
  | { code: "land_before_return"; dryMonth: number; returnMonth: number }
  | { code: "capital_no_turn"; cycleMonths: number }
  | { code: "land_inventory"; inventoryMonths: number; cycleMonths: number }
  | { code: "sales_pace"; dryMonth: number }
  | { code: "capital_short"; deadlineMonth: number }
  | { code: "sales_pace_no_fresh"; salesPace: number };

export type EngineCapitalDeadlineCode =
  | { code: "not_needed" }
  | { code: "no_turn"; cycleMonths: number; deadline: string }
  | { code: "last_buy"; buyMonth: number; cycleMonths: number; deadlineMonth: number };

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

/** One deployment of a capital line — buy → return — on the Turns chart. */
export interface EngineTurnBlock {
  farmName: string;
  /** True when this block is an existing farm already in the ground. */
  isExisting: boolean;
  purchaseMonth: number;
  purchaseIso: string | null;
  returnMonth: number | null;
  returnIso: string | null;
  cost: number;
  recycled: number;
  fresh: number;
  lots: number;
  kind: "recycled" | "fresh";
}

export interface EngineTurnLane {
  /** 0 = inventory on hand; 1+ = capital-lineage index. */
  id: number;
  label: string;
  /** Existing farm (inventory) vs projected purchase. */
  kind: "inventory" | "recycled" | "fresh";
  /** Successive turns of the same dollar along the timeline. */
  blocks: EngineTurnBlock[];
  /** First block summary (kept so single-block callers stay simple). */
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
  /** Structured reason so the page can i18n the capital-deadline card. */
  capitalDeadlineCode: EngineCapitalDeadlineCode;
  totalAdSpend: number;
  adSpendShareOfProfit: number | null;
  totalInterest: number;
  /** totalInterest / netProfitAtDeadline × 100, or null when profit ≤ 0. */
  interestShareOfProfit: number | null;
  farmsBought: number;
  farmsFromRecycled: number;
  farmsFromFresh: number;
  /** Farms the verdict talks about — schedule delta only when fresh capital > 0. */
  farmsNeeded: number;
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
  /** Structured bottleneck so the page can i18n the explanation. */
  bottleneckCode: EngineBottleneckCode;
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


export interface EngineExistingFarm {
  name: string;
  capitalOutstanding: number;
  remainingLots: number;
}

/**
 * Collapse scheduled purchases into capital-lineage lanes: each lane is one dollar
 * working successive farms. Existing farms with capital still out seed the first block;
 * later recycled buys stack on the same lane. Invented farms are "Projected farm N".
 */
export function buildTurnLanes(
  planned: OracleFarm[],
  existing: EngineExistingFarm[],
  isoFor: (month: number | null) => string | null,
  inventoryLots: number,
  salesPace: number,
  effectiveCycle: number,
): EngineTurnLane[] {
  const inventoryLane: EngineTurnLane = {
    id: 0,
    label: "Inventory on hand",
    kind: "inventory",
    blocks: [],
    purchaseMonth: null,
    purchaseIso: null,
    returnMonth: null,
    returnIso: null,
    cost: 0,
    recycled: 0,
    fresh: 0,
    lots: inventoryLots,
  };

  type Slot = {
    freeMonth: number;
    blocks: EngineTurnBlock[];
    kind: "recycled" | "fresh";
  };
  const slots: Slot[] = [];
  const seeded = [...existing]
    .filter((f) => f.capitalOutstanding > 0 || f.remainingLots > 0)
    .sort((a, b) => b.capitalOutstanding - a.capitalOutstanding);

  for (const farm of seeded) {
    const returnMonth =
      salesPace > 0 && farm.remainingLots > 0
        ? Math.max(1, Math.ceil(farm.remainingLots / salesPace))
        : Math.max(1, Math.round(effectiveCycle));
    slots.push({
      freeMonth: returnMonth,
      kind: "recycled",
      blocks: [
        {
          farmName: farm.name,
          isExisting: true,
          purchaseMonth: 0,
          purchaseIso: null,
          returnMonth,
          returnIso: isoFor(returnMonth),
          cost: round2(farm.capitalOutstanding),
          recycled: 0,
          fresh: 0,
          lots: farm.remainingLots,
          kind: "recycled",
        },
      ],
    });
  }

  let projected = 0;
  const ordered = [...planned].sort((a, b) => a.purchaseMonth - b.purchaseMonth || a.index - b.index);
  for (const f of ordered) {
    const kind: "recycled" | "fresh" = f.recycled >= f.cost - 1e-6 || f.recycled > 0 ? "recycled" : "fresh";
    let slot = slots.find((s) => s.freeMonth <= f.purchaseMonth);
    if (!slot) {
      slot = { freeMonth: 0, blocks: [], kind };
      slots.push(slot);
    }
    projected += 1;
    const name = `Projected farm ${projected}`;
    const returnMonth = f.turnCompletesMonth;
    slot.blocks.push({
      farmName: name,
      isExisting: false,
      purchaseMonth: f.purchaseMonth,
      purchaseIso: isoFor(f.purchaseMonth),
      returnMonth,
      returnIso: isoFor(returnMonth),
      cost: round2(f.cost),
      recycled: round2(f.recycled),
      fresh: round2(Math.max(0, f.cost - f.recycled - f.unfunded)),
      lots: f.lots,
      kind,
    });
    slot.freeMonth = returnMonth ?? f.purchaseMonth + Math.max(1, Math.round(effectiveCycle));
    if (kind === "fresh") slot.kind = "fresh";
  }

  const lanes: EngineTurnLane[] = [inventoryLane];
  slots.forEach((slot, i) => {
    const first = slot.blocks[0];
    if (!first) return;
    const label = first.isExisting ? first.farmName : first.farmName;
    lanes.push({
      id: i + 1,
      label,
      kind: slot.kind,
      blocks: slot.blocks,
      purchaseMonth: first.purchaseMonth,
      purchaseIso: first.purchaseIso,
      returnMonth: slot.blocks[slot.blocks.length - 1]?.returnMonth ?? first.returnMonth,
      returnIso: slot.blocks[slot.blocks.length - 1]?.returnIso ?? first.returnIso,
      cost: round2(sum(slot.blocks.map((b) => b.cost))),
      recycled: round2(sum(slot.blocks.map((b) => b.recycled))),
      fresh: round2(sum(slot.blocks.map((b) => b.fresh))),
      lots: round2(sum(slot.blocks.map((b) => b.lots))),
    });
  });
  return lanes;
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
  existingFarms: EngineExistingFarm[] = [],
  owedStart = 0,
): SimBundle {
  const farmCost = resolveFarmCost(inputs);
  const landLag = Math.max(0, Math.round(inputs.farmToFirstCloseMonths));
  const effectiveCycle = coupledCycleMonths(inputs.cycleMonths, inputs.salesPace, referencePace);
  const adPerClosing = costPerClosing(inputs.costPerReservation, inputs.conversionPct);
  // Capital already deployed is NOT dry powder — it only buys again after it returns.
  // Zero the mix; seed the pool with outstanding capital timed to existing-lot sell-through;
  // freshExtra (the raise search) is the only new powder on top. Keep at least one mix slot so
  // returned capital has a sponsor line to land in.
  const turningMix: InvestorMixEntry[] =
    mix.length > 0
      ? mix.map((e) => ({ ...e, capital: 0 }))
      : [{ investorId: null, name: "Recycled capital", dealType: "fixed_interest", ratePct: 20, capital: 0 }];
  const fundedMix = mixWithExtra(turningMix, freshExtra);
  const seedReturns = capitalReturnSeeds(existingFarms, inputs.salesPace, effectiveCycle, fundedMix.length);
  // If farms didn't carry outstanding but the ledger does, still return that capital once.
  if (seedReturns.length === 0 && owedStart > 0) {
    seedReturns.push({
      month: Math.max(1, Math.round(effectiveCycle)),
      mixIndex: 0,
      amount: owedStart,
    });
  }
  const schedule = greedyBuySchedule(
    farmCost,
    inputs.lotsPerFarm,
    landLag,
    fundedMix,
    effectiveCycle,
    grid.deadlineIndex,
    buyThroughMonth,
    ENGINE_MAX_FARMS,
    { salesPace: inputs.salesPace, startInventory: startInv, cycleMonths: effectiveCycle },
    seedReturns,
  );
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
    seedReturns,
  };
  const result = runOracle(params, goal, startInv, asOf, { calendarMonths: true, grid, owedStart: Math.max(0, owedStart) });
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

  const turns = buildTurnLanes(planned, existingFarms, isoFor, inventoryLots, inputs.salesPace, effectiveCycle);

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
    peakOutstanding: round2(series.reduce((peak, s) => Math.max(peak, s.capitalOwed), 0)),
    lotsClosed: round2(lotsClosed),
    inventoryDryMonths,
    turns,
    profitAfterAds: round2(profitAfterAds),
  };
}

function buildVerdict(
  args: {
    salesPace: number;
    reachable: number;
    deadline: string;
    goal: number;
    shortfall: number;
    farmsNeeded: number;
    freshCapital: number;
    capitalDeadlineIso: string | null;
    hits: boolean;
  },
  lang: "en" | "es" = "en",
): string {
  const pace = args.salesPace.toFixed(1);
  const reached = usdCompact(args.reachable);
  const short = usdCompact(args.shortfall);
  const fresh = usdCompact(args.freshCapital);
  const deadlineLabel = warPlanMonthLabel(args.deadline, lang);
  if (lang === "es") {
    if (args.hits || args.shortfall <= 0) {
      return `Con el capital desplegado hoy, vendiendo a ${pace} lotes/mes, llegas a ${reached} para ${deadlineLabel} — no hace falta capital fresco.`;
    }
    if (!(args.freshCapital > 0)) {
      return `Con el capital desplegado hoy, vendiendo a ${pace} lotes/mes, llegas a ${reached} para ${deadlineLabel} — faltan ${short}. El capital fresco no cierra ese hueco a tiempo para un giro completo; sube el ritmo o compra tierra que convierta a tiempo.`;
    }
    const farmWord = args.farmsNeeded === 1 ? "finca" : "fincas";
    const byWhen = args.capitalDeadlineIso
      ? `y tiene que llegar antes de ${warPlanMonthLabel(args.capitalDeadlineIso, lang)} o no alcanza a completar un giro`
      : "pero el horizonte es demasiado cerca para un giro completo de capital fresco";
    return `Con el capital desplegado hoy, vendiendo a ${pace} lotes/mes, llegas a ${reached} para ${deadlineLabel} — faltan ${short}. Cerrar ese hueco necesita ${args.farmsNeeded} ${farmWord} más y ${fresh} de capital fresco, ${byWhen}.`;
  }
  if (args.hits || args.shortfall <= 0) {
    return `With capital deployed today, selling at ${pace} lots/month, you reach ${reached} by ${deadlineLabel} — no fresh capital needed.`;
  }
  if (!(args.freshCapital > 0)) {
    return `With capital deployed today, selling at ${pace} lots/month, you reach ${reached} by ${deadlineLabel} — ${short} short. Fresh capital cannot close that gap before a full turn fits; raise the pace or buy land that converts in time.`;
  }
  const farmWord = args.farmsNeeded === 1 ? "farm" : "farms";
  const byWhen = args.capitalDeadlineIso
    ? `and it must land before ${warPlanMonthLabel(args.capitalDeadlineIso, lang)} or it cannot complete a turn in time`
    : "but the horizon is too close for a full turn of fresh capital";
  return `With capital deployed today, selling at ${pace} lots/month, you reach ${reached} by ${deadlineLabel} — ${short} short. Closing that gap needs ${args.farmsNeeded} more ${farmWord} and ${fresh} of fresh capital, ${byWhen}.`;
}

/** Plain-language verdict in the page language. Pure so it can be tested. */
export function engineVerdict(result: Pick<EngineResult, "figures" | "inputs" | "deadline" | "goal" | "band"> & { capitalDeadlineIso?: string | null }, lang: "en" | "es" = "en"): string {
  const f = result.figures;
  return buildVerdict(
    {
      salesPace: result.inputs.salesPace,
      reachable: f.netProfitAtDeadline,
      deadline: result.deadline,
      goal: result.goal,
      shortfall: f.shortfallDollars,
      farmsNeeded: f.farmsNeeded,
      freshCapital: f.freshCapital,
      capitalDeadlineIso: f.freshCapital > 0 ? f.capitalDeadlineIso : null,
      hits: f.shortfallDollars <= 0,
    },
    lang,
  );
}

function bottleneckOf(
  series: EngineMonthPoint[],
  schedule: OracleFarm[],
  cycleMonths: number,
  capitalDeadline: number,
  shortfall: number,
  inventoryMonths: number | null,
  freshCapital: number,
  salesPace: number,
): { bottleneck: EngineBottleneck; detail: string; code: EngineBottleneckCode } {
  if (shortfall <= 0) {
    return {
      bottleneck: "none",
      detail: "Deployed capital and inventory cover the goal at this pace — no constraint binds.",
      code: { code: "none" },
    };
  }
  const firstDry = series.find((s) => s.inventoryDry)?.monthIndex ?? null;
  const firstReturn =
    schedule
      .map((f) => f.turnCompletesMonth)
      .filter((m): m is number => m !== null)
      .sort((a, b) => a - b)[0] ?? null;

  if (firstDry !== null && firstReturn !== null && firstDry < firstReturn) {
    return {
      bottleneck: "land",
      detail: `Inventory runs dry in month ${firstDry}, before capital returns in month ${firstReturn}. Fly to Texas — buy land, do not wait on a raise.`,
      code: { code: "land_before_return", dryMonth: firstDry, returnMonth: firstReturn },
    };
  }
  if (inventoryMonths !== null && inventoryMonths < cycleMonths && schedule.length === 0) {
    return {
      bottleneck: "land",
      detail: `Inventory lasts ${inventoryMonths.toFixed(1)} months; capital needs ${cycleMonths.toFixed(1)} months to return. The land gap binds.`,
      code: { code: "land_inventory", inventoryMonths, cycleMonths },
    };
  }

  // Fresh capital ~0 ⇒ capital cannot be the bottleneck (verdict and card must agree).
  if (!(freshCapital > 0)) {
    if (firstDry !== null) {
      return {
        bottleneck: "sales_pace",
        detail: `Inventory hits zero in month ${firstDry} while capital is still out. A faster pace returns capital sooner (cycle couples to pace); a slower pace wastes the raise.`,
        code: { code: "sales_pace", dryMonth: firstDry },
      };
    }
    return {
      bottleneck: "sales_pace",
      detail: `At ${salesPace.toFixed(1)} lots/month the deployed capital cannot reach the goal before the deadline even with a raise that still completes a turn. Speed (or land that converts sooner) moves the needle more than capital.`,
      code: { code: "sales_pace_no_fresh", salesPace },
    };
  }

  if (capitalDeadline < 1) {
    return {
      bottleneck: "capital",
      detail: `A ${cycleMonths.toFixed(1)}-month cycle cannot complete a turn before the deadline. Raise earlier or shorten the cycle.`,
      code: { code: "capital_no_turn", cycleMonths },
    };
  }
  if (firstDry !== null) {
    return {
      bottleneck: "sales_pace",
      detail: `Inventory hits zero in month ${firstDry} while capital is still out. A faster pace returns capital sooner (cycle couples to pace); a slower pace wastes the raise.`,
      code: { code: "sales_pace", dryMonth: firstDry },
    };
  }
  return {
    bottleneck: "capital",
    detail: `Profit falls short with the capital already deployed. Fresh capital must land by month ${capitalDeadline} to complete a turn.`,
    code: { code: "capital_short", deadlineMonth: capitalDeadline },
  };
}

/**
 * Capital-first run: buy farms as soon as recycled capital covers them, subtract ad spend,
 * couple cycle length to sales pace, and search for the minimum fresh capital that closes
 * the goal gap before the capital deadline.
 */
export function runEngine(inputs: EngineInputs, ctx: EngineContext, lang: "en" | "es" = "en"): EngineResult {
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
  const ledgerAvg =
    inputs.profitBasis === "era"
      ? (goal.recentAvgNetProfitPerClosedLot ?? goal.avgNetProfitPerClosedLot)
      : goal.avgNetProfitPerClosedLot;
  const netPerLot = (() => {
    const g = inputs;
    const gross = ctx.oracleDefaults.avgSalePrice - (resolveFarmCost(g) / Math.max(1, g.lotsPerFarm));
    // Prefer the chosen ledger average (era by default) — inventory profit should match the throne's chosen basis.
    return ledgerAvg ?? round2(gross * (1 - ctx.oracleDefaults.investorTakePct / 100));
  })();

  const inventoryNetProfit = round2(inv.total * (ledgerAvg ?? netPerLot));
  const inventoryMonths = inputs.salesPace > 0 ? round2(inv.total / inputs.salesPace) : null;
  const existingFarms: EngineExistingFarm[] = ctx.farms
    .filter((f) => f.capitalOutstanding > 0 || (f.totalLots - f.soldLots) > 0)
    .map((f) => ({
      name: f.name,
      capitalOutstanding: Math.max(0, f.capitalOutstanding),
      remainingLots: Math.max(0, f.totalLots - f.soldLots),
    }));
  const owedStart = Math.max(0, sponsorLedger(ctx).capitalOwed);

  // Pass 1: only capital already in the mix (deployed today) — no fresh top-up.
  const base = simulateOnce(inputs, goal, asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, 0, Math.max(capDeadline, k), existingFarms, owedStart);
  const noFreshProfit = base.profitAfterAds;
  const shortfall0 = round2(Math.max(0, goal.goal - noFreshProfit));

  // Pass 2: search for minimum fresh capital to hit the goal. Buy through the full horizon so
  // recycled capital can still turn after the fresh-capital deadline; fresh powder only helps
  // when it funds purchases that the recycled pool cannot (fundSchedule draws recycled first).
  // Never replace the base run with a worse empty schedule.
  let freshCapital = 0;
  let withFresh = base;
  if (shortfall0 > 0.005 && capDeadline >= 1) {
    const farmCost = resolveFarmCost(inputs);
    const buyThrough = Math.max(capDeadline, k);
    let lo = 0;
    let hi = Math.max(farmCost * ENGINE_MAX_FARMS, shortfall0 * 2, 1);
    let best = base;
    let bestExtra = 0;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const trial = simulateOnce(inputs, goal, asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, mid, buyThrough, existingFarms, owedStart);
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
    const final = simulateOnce(inputs, goal, asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, snapped, buyThrough, existingFarms, owedStart);
    const candidate =
      final.profitAfterAds >= best.profitAfterAds - 0.5
        ? { run: final, extra: snapped }
        : { run: best, extra: Math.ceil(bestExtra) };
    // Keep base when fresh cannot beat it (e.g. demand gate blocks deployment of the raise).
    if (candidate.run.profitAfterAds > base.profitAfterAds + 0.5) {
      withFresh = candidate.run;
      freshCapital = candidate.extra;
    }
  }

  const reachable = withFresh.profitAfterAds;
  const shortfall = round2(Math.max(0, goal.goal - reachable));
  const hits = shortfall <= 0.005;
  const farmsFromRecycled = withFresh.schedule.filter((f) => f.recycled >= f.cost - 1e-6).length;
  const farmsFromFresh = withFresh.schedule.filter((f) => f.cost - f.recycled > 1e-6).length;
  // Snap tiny "fresh" amounts that would render as $0K so verdict and bottleneck never disagree.
  const reportedFresh =
    freshCapital < ENGINE_FRESH_CAPITAL_EPSILON ? 0 : Math.round(freshCapital);
  // Farms the verdict may cite — only the schedule delta, and only when fresh capital is real.
  const farmsNeeded =
    reportedFresh > 0 ? Math.max(0, withFresh.schedule.length - base.schedule.length) : 0;

  const capitalDeadlineIsoRaw = (() => {
    if (capDeadline < 1) return null;
    const mo = grid.months[capDeadline - 1];
    return mo ? toIsoDate(mo.end) : null;
  })();
  const capitalDeadlineCode: EngineCapitalDeadlineCode =
    reportedFresh <= 0
      ? { code: "not_needed" }
      : capDeadline < 1
        ? { code: "no_turn", cycleMonths: effectiveCycle, deadline: goal.deadline }
        : {
            code: "last_buy",
            buyMonth: capDeadline,
            cycleMonths: Math.round(effectiveCycle),
            deadlineMonth: k,
          };
  // Month index always tracks the physics of the cycle (charts / tests). Iso + copy clear when no raise is needed.
  const capitalDeadlineIso = reportedFresh > 0 ? capitalDeadlineIsoRaw : null;
  const capitalDeadlineMonthIndex = capDeadline;
  const capitalDeadlineReason =
    capitalDeadlineCode.code === "not_needed"
      ? lang === "es"
        ? "No hace falta capital fresco — el capital reciclado financia las fincas que faltan."
        : "No fresh capital is required — recycled capital funds the remaining farms."
      : capitalDeadlineCode.code === "no_turn"
        ? lang === "es"
          ? `Un giro de ${effectiveCycle.toFixed(1)} meses no puede completarse antes de ${goal.deadline}.`
          : `A ${effectiveCycle.toFixed(1)}-month turn cannot complete before ${goal.deadline}.`
        : lang === "es"
          ? `Último mes en que se puede comprar una finca y aún devolver capital antes del plazo: mes de compra ${capDeadline} + ciclo de ${Math.round(effectiveCycle)} meses ≤ mes plazo ${k}.`
          : `Last month a farm can be bought and still return capital by the deadline: purchase month ${capDeadline} + ${Math.round(effectiveCycle)}-month cycle ≤ deadline month ${k}.`;

  const shortfallLots =
    ledgerAvg !== null && ledgerAvg > 0 ? Math.ceil(shortfall / ledgerAvg)
      : null;
  const shortfallFarms =
    inputs.lotsPerFarm > 0 && shortfallLots !== null ? Math.ceil(shortfallLots / inputs.lotsPerFarm) : farmsNeeded;

  const turnsCount =
    withFresh.peakOutstanding > 0
      ? round2(sum(withFresh.schedule.map((f) => f.cost)) / withFresh.peakOutstanding)
      : withFresh.schedule.length > 0
        ? withFresh.schedule.length
        : 0;

  const adShare = reachable > 0 ? round2((withFresh.adSpendTotal / reachable) * 100) : null;
  const interestShare = reachable > 0 ? round2((withFresh.interestTotal / reachable) * 100) : null;
  const band = bandFor(shortfall, goal.goal);
  const verdict = buildVerdict({
    salesPace: inputs.salesPace,
    reachable,
    deadline: goal.deadline,
    goal: goal.goal,
    shortfall,
    farmsNeeded,
    freshCapital: reportedFresh,
    capitalDeadlineIso,
    hits,
  }, lang);

  const { bottleneck, detail, code: bottleneckCode } = bottleneckOf(
    withFresh.series,
    withFresh.schedule,
    effectiveCycle,
    capDeadline,
    shortfall,
    inventoryMonths,
    reportedFresh,
    inputs.salesPace,
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
    freshCapital: round2(reportedFresh),
    peakOutstanding: withFresh.peakOutstanding,
    capitalDeadlineIso,
    capitalDeadlineMonthIndex,
    capitalDeadlineReason,
    capitalDeadlineCode,
    totalAdSpend: withFresh.adSpendTotal,
    adSpendShareOfProfit: adShare,
    totalInterest: withFresh.interestTotal,
    interestShareOfProfit: interestShare,
    farmsBought: withFresh.schedule.length,
    farmsFromRecycled,
    farmsFromFresh,
    farmsNeeded,
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
        }, lang),
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
    bottleneckCode,
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
  const existingFarms: EngineExistingFarm[] = ctx.farms
    .filter((f) => f.capitalOutstanding > 0 || (f.totalLots - f.soldLots) > 0)
    .map((f) => ({
      name: f.name,
      capitalOutstanding: Math.max(0, f.capitalOutstanding),
      remainingLots: Math.max(0, f.totalLots - f.soldLots),
    }));
  const owedStart = Math.max(0, sponsorLedger(ctx).capitalOwed);
  const effectiveCycle = coupledCycleMonths(inputs.cycleMonths, inputs.salesPace, referencePace);
  const capDeadline = capitalDeadlineMonth(grid.deadlineIndex, effectiveCycle);
  const buyThrough = Math.max(capDeadline, grid.deadlineIndex);
  const base = simulateOnce(inputs, goal, ctx.asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, 0, buyThrough, existingFarms, owedStart);
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
  let bestExtra = 0;
  let bestProfit = base.profitAfterAds;
  let bestFarms = 0;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const trial = simulateOnce(inputs, goal, ctx.asOf, grid, ctx.oracleDefaults, referencePace, inv.total, inv.total, inputs.investorMix, mid, buyThrough, existingFarms, owedStart);
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
  const mo = capDeadline >= 1 ? grid.months[capDeadline - 1] : null;
  // Fresh only counts when it actually beats the recycled-only base.
  if (bestProfit <= base.profitAfterAds + 0.5) {
    return {
      profit: base.profitAfterAds,
      fresh: 0,
      farmsNeeded: 0,
      capitalDeadlineIso: mo ? toIsoDate(mo.end) : null,
    };
  }
  return {
    profit: round2(bestProfit),
    fresh: Math.ceil(bestExtra),
    farmsNeeded: bestFarms,
    capitalDeadlineIso: mo ? toIsoDate(mo.end) : null,
  };
}


export function engineDefaultsFromRealm(
  ctx: WarPlanContext,
  rotationBenchmarkFarm: string | null,
): EngineDefaults {
  return withBenchmarkFarm(deriveEngineDefaults(ctx), rotationBenchmarkFarm);
}
