import type { FarmEconomics } from "./farm";
import { computeGoal, type GoalStatus } from "./goal";
import type { InvestorSummary } from "./investors";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import type { Pipeline } from "./pipeline";
import type { Future } from "./futures";
import type { Campaign } from "./campaigns";
import type { Hostage, Liberation } from "./liberation";
import type { InvestorDistributionRow, PaymentsSnapshot } from "./types";
import { normalizeSeasonality, type SeasonalProfile } from "./seasonality";
import {
  ORACLE_HORIZON_MONTHS,
  buildMonthGrid,
  runOracle,
  type InvestorMixEntry,
  type MixDealType,
  type OracleFarm,
  type OracleMonthGrid,
  type OracleParams,
  type OracleResult,
  type OracleRunOptions,
  type TargetMode,
} from "./oracle";
import { addDays, daysBetween, monthsBetween, parseDate, toIsoDate } from "./dates";
import { mean, median, round2, sum } from "./math";
import { resolveEra, type Era, type EraStart } from "./era";
import type { QualityLang } from "./quality_human";
import { DAYS_PER_MONTH } from "../config/goal";
import {
  WARPLAN_DEFAULT_AD_SPEND_PER_CLOSING,
  WARPLAN_DEFAULT_LOTS_PER_FARM,
  WARPLAN_INVESTOR_PREFILL,
  WARPLAN_MAX_CLOSINGS_PER_MONTH,
} from "../config/warplan";

/**
 * WAR PLAN — the Oracle in reverse. The Oracle takes a pace and returns a date; the War Plan
 * takes the deadline and returns what must happen: closings per month, farms to buy and when,
 * capital to raise and from whom, ad spend, note sales, and what comes back to each sponsor.
 */

export interface WarPlanInputs {
  target: number;
  /** ISO date. */
  deadline: string;
  targetMode: TargetMode;
  lotsPerFarm: number;
  /** Capital per new farm. */
  farmCost: number;
  adSpendPerClosing: number;
  /** Reservation → closing conversion, percent. */
  conversionPct: number;
  farmToFirstCloseMonths: number;
  noteSaleLagMonths: number;
  /** Funding order: new farms draw from the top down. */
  investorMix: InvestorMixEntry[];
  /**
   * Months for a dollar of land capital to come back and buy the next farm — the realm's real
   * liberation cycle. Null when no farm has been freed and none can be projected: capital then
   * never rotates inside the plan.
   */
  cycleMonths: number | null;
  /** Shape the required pace by the realm's month-of-year profile (the flat average is always shown alongside). */
  seasonal: boolean;
}

export type CycleSource = "freed_farms" | "projected";

/** The real figures each input is prefilled from (null when the data cannot say). */
export interface WarPlanRealValues {
  target: number;
  deadline: string;
  lotsPerFarm: number | null;
  /** All-time average land cost per sold lot (the Oracle's figure). */
  landCostPerLot: number;
  /** Average per-lot cost of the most recent farm purchases (`recentFarms`), since the era start. */
  recentLandCostPerLot: number | null;
  recentFarms: string[];
  /** The per-lot cost the farm-cost input is prefilled from: recent when available, else all-time. */
  defaultLandCostPerLot: number;
  /** "since Mar 2026" — the era every trend here (land-cost trend, cycle length) is measured from; null without an era. */
  eraSince: string | null;
  /** Reservation → closing conversion over live and closed reservations only (blended; includes still-open). */
  conversionPct: number | null;
  /** Conversion counting cancelled reservations as failures — blended; still includes still-open. */
  conversionWithCancellationsPct: number | null;
  /** Resolved conversion: closed ÷ (closed + cancelled). Open reservations excluded. Forecasts default here. */
  conversionResolvedPct: number | null;
  cancellationRatePct: number | null;
  cancelledReservations: number;
  farmToFirstCloseMonths: number | null;
  /** Farms with both an acquisition date and a first closing, behind the median. */
  farmToFirstCloseFarms: number;
  medianDaysToClose: number | null;
  noteSaleLagMonths: number;
  closingsPerMonth: number;
  inventory: number;
  cycleDays: number | null;
  cycleMonths: number | null;
  cycleSource: CycleSource | null;
  /** Farms behind the cycle median. */
  cycleFarms: number;
  /** Freed farms whose real cycle predates the era start and so stays out of the median (e.g. Lamar). */
  cycleExcludedFarms: string[];
  /** Whether the realm's month-of-year profile is applied (seasonality.ts); false with too little history. */
  seasonalityApplied: boolean;
  /** "not enough history for seasonality" when it is not applied for lack of history. */
  seasonalityReason: string | null;
}

export interface WarPlanDefaults {
  inputs: WarPlanInputs;
  real: WarPlanRealValues;
}

/** What the fund has kept and what it still owes sponsors today — where cash mode starts. */
export interface SponsorLedger {
  /** Σ investor_capital − capital returned, over sponsor-funded farms (own capital excluded). */
  capitalOwed: number;
  /** Every distribution paid to sponsors so far (capital, interest, profit share). */
  paidOut: number;
  /** Interest accrued and profit share earned that has not been distributed yet. */
  unpaidTake: number;
  /** Cash realized on lots − paid out. */
  cashKept: number;
  /** capitalOwed + unpaidTake. */
  owedToday: number;
}

export interface WarPlanContext {
  asOf: Date;
  lots: Lot[];
  farms: FarmEconomics[];
  goal: GoalStatus;
  investors: InvestorSummary[];
  oracleDefaults: OracleParams;
  pipeline: Pipeline;
  liberation: Liberation;
  campaigns: Campaign[];
  snapshot: Pick<PaymentsSnapshot, "investorDistributions">;
  seasonality: SeasonalProfile;
  /** Era start (ISO) the cycle length and land-cost trend are measured from; `null` for none. Default: config ERA_START. */
  eraStart?: EraStart;
}

export type WarPlanColumnId = "current_pace" | "required_plan" | "required_plus_buffer";
export type WarPlanFlag = "shortfall" | "too_late" | "turn_incomplete";

/** One farm's real (or projected) capital cycle: funding → every dollar of capital returned. */
export interface CapitalCycle {
  farmId: string;
  farmName: string;
  investorName: string;
  fundingDate: string;
  /** Date cumulative capital_return reached 100 % (real), or the projected liberation date. */
  liberationDate: string;
  days: number;
  months: number;
  projected: boolean;
}

export type FarmGradeVerdict = "benchmark" | "ahead" | "on_pace" | "behind" | "unrated";

/** A sponsor-funded farm measured against the benchmark cycle at the same point in its life. */
export interface FarmGrade {
  farmId: string;
  farmName: string;
  investorName: string;
  dealType: string | null;
  capital: number;
  capitalReturned: number;
  pctReturned: number;
  freed: boolean;
  fundingDate: string | null;
  /** Days since funding (to liberation when freed, to today otherwise). */
  daysElapsed: number | null;
  /** The benchmark's % of capital returned this many days into its own cycle. */
  benchmarkPctAtSameDay: number | null;
  /** pctReturned − benchmarkPctAtSameDay; positive means ahead of the benchmark. */
  pctVsBenchmark: number | null;
  /** Days the benchmark needed to return the same %; null when it never reached it. */
  benchmarkDaysToSamePct: number | null;
  /** benchmarkDaysToSamePct − daysElapsed; positive means ahead. */
  daysVsBenchmark: number | null;
  verdict: FarmGradeVerdict;
  /** Campaign lots still to sell to cover the capital (and accrued interest). */
  lotsLeftToCover: number | null;
  /** Projected liberation at the current pace (campaigns.ts), or the real date when freed. */
  projectedLiberationDate: string | null;
  daysToGo: number | null;
}

/** The realm's capital cycle today — where the rotation engine gets its turn length. */
export interface RotationBenchmark {
  cycleDays: number | null;
  cycleMonths: number | null;
  source: CycleSource | null;
  /** The farm whose cycle is the median — a freed farm funded since the era start, or the projected one when none is freed. */
  benchmark: CapitalCycle | null;
  /** The cycles behind the median: farms funded on or after the era start only. */
  cycles: CapitalCycle[];
  /** Real cycles of freed farms funded before the era start — measured, but not representative of today's pace. */
  excludedCycles: CapitalCycle[];
  /** ISO era start the cycles are measured from, or null when every farm counts. */
  since: string | null;
  /** "since Mar 2026", or null when every farm counts. */
  sinceLabel: string | null;
  /** Cumulative % of capital returned by day since funding on the benchmark farm (step curve). */
  curve: { day: number; pct: number; date: string }[];
  grades: FarmGrade[];
  /** Farms already freed — turns completed so far. */
  turnsCompleted: number;
  capitalOutstanding: number;
  /** The captive farm closest to its own liberation. */
  nextLiberation: FarmGrade | null;
}

export interface InvestorTurns {
  mixIndex: number;
  name: string;
  /** Capital of theirs put into farms over the plan, counting every turn. */
  deployed: number;
  /** Fresh capital they have to bring (deployed − what came back from earlier farms). */
  fresh: number;
  /** Most of their capital out at any one time. */
  peakOutstanding: number;
  turns: number;
}

/** The rotation reading of a plan: how much capital really has to be raised and how often it turns. */
export interface RotationPlan {
  cycleMonths: number | null;
  /** Σ farm cost over the plan (every purchase, counting recycled dollars each time). */
  totalDeployed: number;
  /** Most land capital out at any one moment — the amount that actually has to be raised. */
  peakOutstanding: number;
  /** Fresh money the mix brings plus the unfunded remainder (totalDeployed − recycled). */
  newMoney: number;
  recycled: number;
  /** totalDeployed ÷ peakOutstanding — how many times the raised capital turns over the plan. */
  turnsNeeded: number | null;
  turnsCompleted: number;
  /** Planned farms whose capital is not back before the deadline. */
  turnsIncomplete: number;
  farms: number;
  firstTurnStartBy: string | null;
  lastTurnCompletes: string | null;
  perInvestor: InvestorTurns[];
  headline: string;
}

export interface WarPlanRow {
  monthIndex: number;
  /** Last day of the period (ISO). The first row runs from asOf to its month end. */
  date: string;
  farmsBought: number;
  capitalDeployed: number;
  lotsClosed: number;
  /** What the flat average pace alone would ask of this month. */
  flatLotsClosed: number;
  seasonalFactor: number;
  notesSold: number;
  adSpend: number;
  /** In the chosen target mode. */
  cumulativeNet: number;
  capitalOwed: number;
  /** Cumulative, per investor-mix entry. */
  capitalReturned: number[];
  inventory: number;
  flags: WarPlanFlag[];
}

export interface WarPlanFunding {
  mixIndex: number;
  investorId: string | null;
  name: string;
  /** Fresh capital this sponsor brings to the plan. */
  amount: number;
  /** Everything of theirs deployed over the plan, counting returned dollars on their next turn. */
  deployed: number;
}

/** One of the three futures, in the futures.ts shape plus the plan's own figures. */
export interface WarPlanColumn extends Omit<Future, "id"> {
  id: WarPlanColumnId;
  closingsPerMonth: number;
  /** Farms bought on or before the deadline. */
  schedule: OracleFarm[];
  farmsToBuy: number;
  lastPurchaseMonth: number | null;
  lastPurchaseDate: string | null;
  /** Fresh capital the plan needs: Σ farm cost − capital that came back from earlier farms in the plan. */
  capitalToRaise: number;
  /** Σ farm cost over every purchase. */
  totalDeployed: number;
  /** Most land capital out at once — what actually has to be raised. */
  peakOutstanding: number;
  /** Split of the fresh capital by investor, in mix order (zero entries omitted). */
  funding: WarPlanFunding[];
  unfunded: number;
  /** Planned farms whose capital is not back before the deadline (needs a cycle). */
  turnsIncomplete: number;
  adSpendPerMonth: number;
  /** Reservations the pace needs each month at the conversion including cancellations. */
  reservationsPerMonth: number;
  noteSalesPerMonth: number;
  /** Lots the plan closes between today and the deadline. */
  lotsNeeded: number;
  inventoryAtDeadline: number;
  targetAtDeadline: number;
  rows: WarPlanRow[];
  flaggedMonths: number;
}

export interface WarPlan {
  inputs: WarPlanInputs;
  goal: GoalStatus;
  asOf: string;
  startInventory: number;
  monthsToDeadline: number;
  deadlineMonthIndex: number;
  /** Months from purchase until a farm's lots can close (rounded farmToFirstCloseMonths). */
  landLag: number;
  /** Median reservation → closing, in whole months. */
  closeLag: number;
  noteLag: number;
  /** Latest month index a farm can still be bought and convert before the deadline. */
  maxPurchaseMonth: number;
  /** Cash mode only: last month-end (ISO) the plan closes lots; afterwards it only sells notes. Null in profit mode. */
  lastClosingDate: string | null;
  /** False when no pace up to the cap reaches the target by the deadline. */
  feasible: boolean;
  ledger: SponsorLedger;
  /** Twelve seasonal factors as applied to the required plan (normalised over its closing months). */
  seasonality: number[];
  benchmark: RotationBenchmark;
  rotation: RotationPlan;
  current: WarPlanColumn;
  required: WarPlanColumn;
  buffer: WarPlanColumn;
  all: WarPlanColumn[];
  verdict: string;
}

/** Median months from a farm's acquisition (farm_acquisitions.closing_date) to its first closing. */
export function farmToFirstCloseMonths(farms: FarmEconomics[]): { months: number | null; farms: number } {
  const values: number[] = [];
  for (const f of farms) {
    const acquired = parseDate(f.closingDate) ?? parseDate(f.fundingDate);
    const first = f.lots
      .filter((l) => isSold(l) && l.closeDate)
      .map((l) => l.closeDate as string)
      .sort()[0];
    const d = parseDate(first);
    if (!acquired || !d) continue;
    const m = monthsBetween(acquired, d);
    if (m >= 0) values.push(m);
  }
  const med = median(values);
  return { months: med === null ? null : round2(med), farms: values.length };
}

/** Farms bought on or before asOf (and, with an era, on or after its start), most recent first (funding_date, else closing_date). */
function purchasedFarms(farms: FarmEconomics[], asOf: Date, era: Era | null = null): { farm: FarmEconomics; date: Date }[] {
  return farms
    .map((farm) => ({ farm, date: parseDate(farm.fundingDate) ?? parseDate(farm.closingDate) }))
    .filter((x): x is { farm: FarmEconomics; date: Date } => x.date !== null && x.date <= asOf && (!era || x.date >= era.startDate))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export interface RecentLandCost {
  perLot: number | null;
  farms: string[];
  /** ISO era start the purchases are taken from, or null when every purchase counts. */
  since: string | null;
  /** "since Mar 2026", or null when every purchase counts. */
  sinceLabel: string | null;
}

/** Average per-lot land cost of the `count` most recent farm purchases with a capital basis, since the era start (config ERA_START). */
export function recentLandCostPerLot(farms: FarmEconomics[], asOf: Date, count = 3, eraStart: EraStart = undefined): RecentLandCost {
  const era = resolveEra(asOf, eraStart);
  const recent = purchasedFarms(farms, asOf, era)
    .filter(({ farm }) => farm.capitalBasisSource !== "none" && farm.landCostPerLot > 0)
    .slice(0, count);
  const perLot = mean(recent.map(({ farm }) => farm.landCostPerLot));
  return {
    perLot: perLot === null ? null : Math.round(perLot),
    farms: recent.map(({ farm }) => farm.name),
    since: era?.start ?? null,
    sinceLabel: era?.since ?? null,
  };
}

const pctOf = (part: number, whole: number) => (whole <= 0 ? 0 : round2(Math.min(100, (part / whole) * 100)));

function benchmarkCurve(hostage: Hostage, fundingDate: Date, distributions: InvestorDistributionRow[]): RotationBenchmark["curve"] {
  const returns = distributions
    .filter((d) => d.farm_acquisition_id === hostage.farmId && d.kind === "capital_return" && d.distribution_date)
    .sort((a, b) => (a.distribution_date as string).localeCompare(b.distribution_date as string));
  const curve: RotationBenchmark["curve"] = [];
  let cum = 0;
  for (const d of returns) {
    const date = parseDate(d.distribution_date);
    if (!date) continue;
    cum += d.amount ?? 0;
    const day = daysBetween(fundingDate, date);
    const pct = pctOf(cum, hostage.capital);
    const last = curve[curve.length - 1];
    if (last && last.day === day) last.pct = pct;
    else curve.push({ day, pct, date: d.distribution_date as string });
  }
  return curve;
}

/** The benchmark's % returned `day` days into its cycle (0 before its first return). */
function curvePctAt(curve: RotationBenchmark["curve"], day: number): number {
  let pct = 0;
  for (const p of curve) {
    if (p.day <= day) pct = p.pct;
    else break;
  }
  return pct;
}

/** Days the benchmark needed to return at least `pct` %, or null when it never did (or nothing has been returned yet). */
function curveDaysTo(curve: RotationBenchmark["curve"], pct: number): number | null {
  if (pct <= 0) return null;
  for (const p of curve) if (p.pct >= pct - 1e-9) return p.day;
  return null;
}

/**
 * The capital cycle the rotation engine turns on. Real when a farm has been freed (funding_date →
 * the day cumulative capital_return reached 100 %, liberation.ts); projected from each captive
 * farm's campaign shortfall at the current pace when none has. Never a constant. Only farms funded
 * on or after the era start (config ERA_START) go into the median: an earlier turn is real, but
 * not representative of today's pace, and is reported in `excludedCycles`.
 */
export function computeRotationBenchmark(
  ctx: Pick<WarPlanContext, "asOf" | "farms" | "goal" | "liberation" | "campaigns" | "snapshot" | "eraStart">,
): RotationBenchmark {
  const { asOf, liberation } = ctx;
  const era = resolveEra(asOf, ctx.eraStart);
  const inEra = (d: Date) => !era || d >= era.startDate;
  const farmById = new Map(ctx.farms.map((f) => [f.farmId, f]));
  const campaignByFarm = new Map(ctx.campaigns.map((c) => [c.farmId, c]));
  const fundedOn = (h: Hostage): Date | null => {
    const f = farmById.get(h.farmId);
    return f ? parseDate(f.fundingDate) ?? parseDate(f.closingDate) : null;
  };

  // Current pace shared out over the farms that still have lots to sell, by their unsold inventory.
  const pace = ctx.goal.closedLotsPerMonth;
  const unsoldBy = new Map<string, number>();
  let unsoldTotal = 0;
  for (const f of ctx.farms) {
    const unsold = Math.max(0, f.lots.length - f.soldLots);
    const purchased = (parseDate(f.fundingDate) ?? parseDate(f.closingDate) ?? asOf) <= asOf;
    if (unsold > 0 && purchased) {
      unsoldBy.set(f.farmId, unsold);
      unsoldTotal += unsold;
    }
  }
  const projectedDaysToGo = (h: Hostage): { days: number | null; lotsLeft: number | null } => {
    const c = campaignByFarm.get(h.farmId);
    if (!c) return { days: null, lotsLeft: null };
    if (c.lotsLeftToCover === null) return { days: null, lotsLeft: null };
    if (c.lotsLeftToCover === 0) return { days: 0, lotsLeft: 0 };
    const share = unsoldTotal > 0 ? (unsoldBy.get(h.farmId) ?? 0) / unsoldTotal : 0;
    const farmPace = pace * share;
    if (farmPace <= 0) return { days: null, lotsLeft: c.lotsLeftToCover };
    return { days: Math.round((c.lotsLeftToCover / farmPace) * DAYS_PER_MONTH), lotsLeft: c.lotsLeftToCover };
  };

  const realCycles: CapitalCycle[] = [];
  const excludedCycles: CapitalCycle[] = [];
  for (const h of liberation.freedHostages) {
    const funded = fundedOn(h);
    const freed = parseDate(h.freedAt);
    if (!funded || !freed || !h.freedAt) continue;
    const days = daysBetween(funded, freed);
    if (days < 0) continue;
    (inEra(funded) ? realCycles : excludedCycles).push({
      farmId: h.farmId,
      farmName: h.farmName,
      investorName: h.investorName,
      fundingDate: toIsoDate(funded),
      liberationDate: h.freedAt,
      days,
      months: round2(days / DAYS_PER_MONTH),
      projected: false,
    });
  }
  const projectedCycles: CapitalCycle[] = [];
  for (const h of liberation.captiveHostages) {
    const funded = fundedOn(h);
    if (!funded || !inEra(funded)) continue;
    const { days } = projectedDaysToGo(h);
    if (days === null) continue;
    const total = daysBetween(funded, addDays(asOf, days));
    if (total <= 0) continue;
    projectedCycles.push({
      farmId: h.farmId,
      farmName: h.farmName,
      investorName: h.investorName,
      fundingDate: toIsoDate(funded),
      liberationDate: toIsoDate(addDays(asOf, days)),
      days: total,
      months: round2(total / DAYS_PER_MONTH),
      projected: true,
    });
  }

  const cycles = realCycles.length > 0 ? realCycles : projectedCycles;
  const source: CycleSource | null = realCycles.length > 0 ? "freed_farms" : projectedCycles.length > 0 ? "projected" : null;
  const cycleDays = median(cycles.map((c) => c.days));
  // The benchmark farm is the one whose cycle sits at (or just above) the median.
  const benchmark =
    cycleDays === null ? null : ([...cycles].sort((a, b) => a.days - b.days).find((c) => c.days >= cycleDays) ?? cycles[0] ?? null);
  const benchmarkHostage = benchmark ? liberation.hostages.find((h) => h.farmId === benchmark.farmId) ?? null : null;
  const benchmarkFunded = benchmark ? parseDate(benchmark.fundingDate) : null;
  const curve = benchmarkHostage && benchmarkFunded && !benchmark?.projected ? benchmarkCurve(benchmarkHostage, benchmarkFunded, ctx.snapshot.investorDistributions) : [];

  const grades: FarmGrade[] = liberation.hostages.map((h): FarmGrade => {
    const funded = fundedOn(h);
    const isBenchmark = benchmark !== null && h.farmId === benchmark.farmId;
    const freedAt = parseDate(h.freedAt);
    const daysElapsed = funded ? (h.freed && freedAt ? daysBetween(funded, freedAt) : daysBetween(funded, asOf)) : null;
    const rated = curve.length > 0 && daysElapsed !== null && daysElapsed >= 0 && !isBenchmark;
    const benchmarkPctAtSameDay = rated ? curvePctAt(curve, daysElapsed as number) : null;
    const benchmarkDaysToSamePct = rated ? curveDaysTo(curve, h.pctReturned) : null;
    const pctVs = benchmarkPctAtSameDay === null ? null : round2(h.pctReturned - benchmarkPctAtSameDay);
    const daysVs = benchmarkDaysToSamePct === null || daysElapsed === null ? null : benchmarkDaysToSamePct - daysElapsed;
    let verdict: FarmGradeVerdict = "unrated";
    if (isBenchmark) verdict = "benchmark";
    else if (pctVs !== null) verdict = pctVs >= 5 ? "ahead" : pctVs <= -5 ? "behind" : "on_pace";
    const projected = h.freed ? { days: 0, lotsLeft: 0 } : projectedDaysToGo(h);
    return {
      farmId: h.farmId,
      farmName: h.farmName,
      investorName: h.investorName,
      dealType: h.dealType,
      capital: h.capital,
      capitalReturned: h.capitalReturned,
      pctReturned: h.pctReturned,
      freed: h.freed,
      fundingDate: funded ? toIsoDate(funded) : null,
      daysElapsed,
      benchmarkPctAtSameDay,
      pctVsBenchmark: pctVs,
      benchmarkDaysToSamePct,
      daysVsBenchmark: daysVs,
      verdict,
      lotsLeftToCover: projected.lotsLeft,
      projectedLiberationDate: h.freed ? h.freedAt : projected.days === null ? null : toIsoDate(addDays(asOf, projected.days)),
      daysToGo: h.freed ? 0 : projected.days,
    };
  });

  const nextLiberation =
    grades
      .filter((g) => !g.freed && g.daysToGo !== null)
      .sort((a, b) => (a.daysToGo as number) - (b.daysToGo as number) || b.pctReturned - a.pctReturned)[0] ?? null;

  return {
    cycleDays,
    cycleMonths: cycleDays === null ? null : round2(cycleDays / DAYS_PER_MONTH),
    source,
    benchmark,
    cycles,
    excludedCycles,
    since: era?.start ?? null,
    sinceLabel: era?.since ?? null,
    curve,
    grades,
    turnsCompleted: liberation.freedHostages.length,
    capitalOutstanding: round2(sum(liberation.captiveHostages.map((h) => h.capitalOutstanding))),
    nextLiberation,
  };
}

export function sponsorLedger(ctx: Pick<WarPlanContext, "farms" | "investors" | "goal">): SponsorLedger {
  const capitalOwed = round2(sum(ctx.farms.filter((f) => f.dealType !== "own_capital").map((f) => f.capitalOutstanding)));
  const paidOut = round2(sum(ctx.investors.map((i) => i.totalPaidOut)));
  const unpaidTake = round2(
    sum(ctx.investors.map((i) => Math.max(0, i.interestAccrued - i.interestPaid) + Math.max(0, i.profitShareEarned - i.profitSharePaid))),
  );
  return {
    capitalOwed,
    paidOut,
    unpaidTake,
    cashKept: round2(ctx.goal.cashRealized - paidOut),
    owedToday: round2(capitalOwed + unpaidTake),
  };
}

/** The named prefills first (in their order), then any other sponsor with a position, each with its latest deal. */
export function prefillInvestorMix(investors: InvestorSummary[]): InvestorMixEntry[] {
  const byName = new Map(investors.map((i) => [i.name.trim().toLowerCase(), i]));
  const used = new Set<string>();
  const out: InvestorMixEntry[] = [];
  for (const p of WARPLAN_INVESTOR_PREFILL) {
    const inv = byName.get(p.name.toLowerCase());
    if (inv) used.add(inv.investorId);
    out.push({
      investorId: inv?.investorId ?? null,
      name: inv?.name ?? p.name,
      dealType: p.dealType,
      ratePct: p.ratePct,
      capital: Math.round(inv?.capitalDeployed ?? 0),
    });
  }
  for (const inv of investors) {
    if (used.has(inv.investorId)) continue;
    const sponsored = inv.farms.filter((f) => f.dealType === "fixed_interest" || f.dealType === "profit_share");
    if (sponsored.length === 0) continue;
    const latest = [...sponsored].sort((a, b) => (b.fundingDate ?? "").localeCompare(a.fundingDate ?? ""))[0];
    if (!latest) continue;
    const dealType = latest.dealType as MixDealType;
    out.push({
      investorId: inv.investorId,
      name: inv.name,
      dealType,
      ratePct: dealType === "profit_share" ? latest.profitSharePct ?? 0 : latest.annualRatePct,
      capital: Math.round(sum(sponsored.map((f) => f.capitalDeployed))),
    });
  }
  return out;
}

export function deriveWarPlanDefaults(ctx: WarPlanContext): WarPlanDefaults {
  const first = farmToFirstCloseMonths(ctx.farms);
  const landCostPerLot = ctx.oracleDefaults.avgLandCost;
  const recent = recentLandCostPerLot(ctx.farms, ctx.asOf, 3, ctx.eraStart);
  const defaultLandCostPerLot = recent.perLot ?? landCostPerLot;
  const lotsPerFarm = WARPLAN_DEFAULT_LOTS_PER_FARM;
  const conversion = ctx.pipeline.conversion;
  const benchmark = computeRotationBenchmark(ctx);
  const era = resolveEra(ctx.asOf, ctx.eraStart);
  return {
    inputs: {
      target: ctx.goal.goal,
      deadline: ctx.goal.deadline,
      targetMode: "profit_at_closing",
      lotsPerFarm,
      farmCost: Math.round(defaultLandCostPerLot * lotsPerFarm),
      adSpendPerClosing: WARPLAN_DEFAULT_AD_SPEND_PER_CLOSING,
      conversionPct: conversion.resolvedPct ?? conversion.pctWithCancellations ?? conversion.pct ?? 100,
      farmToFirstCloseMonths: first.months ?? 3,
      noteSaleLagMonths: ctx.oracleDefaults.avgMonthsToSellNote,
      investorMix: prefillInvestorMix(ctx.investors),
      cycleMonths: benchmark.cycleMonths,
      // A profile that is not applied (too little history since the era start) leaves nothing to switch on.
      seasonal: ctx.seasonality.applied,
    },
    real: {
      target: ctx.goal.goal,
      deadline: ctx.goal.deadline,
      lotsPerFarm: ctx.goal.avgLotsPerFarm,
      landCostPerLot,
      recentLandCostPerLot: recent.perLot,
      recentFarms: recent.farms,
      defaultLandCostPerLot,
      eraSince: era?.since ?? null,
      conversionPct: conversion.pct,
      conversionWithCancellationsPct: conversion.pctWithCancellations,
      conversionResolvedPct: conversion.resolvedPct,
      cancellationRatePct: conversion.cancellationRatePct,
      cancelledReservations: ctx.pipeline.cancelledReservations,
      farmToFirstCloseMonths: first.months,
      farmToFirstCloseFarms: first.farms,
      medianDaysToClose: ctx.pipeline.medianDaysToClose,
      noteSaleLagMonths: ctx.oracleDefaults.avgMonthsToSellNote,
      closingsPerMonth: ctx.goal.closedLotsPerMonth,
      inventory: ctx.goal.availableLots + ctx.goal.reservedLots,
      cycleDays: benchmark.cycleDays,
      cycleMonths: benchmark.cycleMonths,
      cycleSource: benchmark.source,
      cycleFarms: benchmark.cycles.length,
      cycleExcludedFarms: benchmark.excludedCycles.map((c) => c.farmName),
      seasonalityApplied: ctx.seasonality.applied,
      seasonalityReason: ctx.seasonality.reason,
    },
  };
}

/** cum[m] = Σ fraction × seasonal factor of months 1..m (cum[0] = 0): lots the flat pace consumes per unit of pace. */
function cumulativeFractions(grid: OracleMonthGrid, factors?: number[]): number[] {
  const cum = [0];
  for (const mo of grid.months) {
    const f = factors ? (factors[mo.end.getUTCMonth()] ?? 1) : 1;
    cum.push((cum[cum.length - 1] as number) + mo.fraction * f);
  }
  return cum;
}

/**
 * Buys each farm as late as possible: farm n must have landed by the first month in which the
 * pace has consumed today's inventory plus the n−1 farms before it. Only closings up to
 * `lastUsefulMonth` count (the deadline month, or in cash mode the last month whose notes still
 * sell before the deadline), so no farm is bought for lots that cannot convert. Purchases are
 * never later than `maxPurchaseMonth` and never earlier than month 1.
 */
export function justInTimeSchedule(
  pace: number,
  cum: number[],
  lastUsefulMonth: number,
  inventory: number,
  lotsPerFarm: number,
  landLag: number,
  maxPurchaseMonth: number,
): number[] {
  if (pace <= 0 || lotsPerFarm <= 0 || lastUsefulMonth <= 0) return [];
  const needed = pace * (cum[lastUsefulMonth] as number);
  const farms = Math.ceil(Math.max(0, needed - inventory - 1e-9) / lotsPerFarm);
  const out: number[] = [];
  for (let n = 1; n <= farms; n++) {
    const have = inventory + (n - 1) * lotsPerFarm;
    let land = lastUsefulMonth;
    for (let m = 1; m <= lastUsefulMonth; m++) {
      if (pace * (cum[m] as number) > have + 1e-9) {
        land = m;
        break;
      }
    }
    out.push(Math.max(1, Math.min(land - landLag, maxPurchaseMonth)));
  }
  return out;
}

/** The real cadence as an explicit schedule: a farm every `every` months, from today to the horizon. */
export function cadenceSchedule(every: number, horizon = ORACLE_HORIZON_MONTHS): number[] {
  if (!(every > 0)) return [];
  const out: number[] = [];
  for (let j = 1; ; j++) {
    const p = Math.max(1, Math.round(j * every));
    if (p > horizon) break;
    out.push(p);
  }
  return out;
}

/** Smallest p in [lo, hi] (to the cent of a lot) for which `ok` holds, assuming ok(hi). */
function bisect(ok: (p: number) => boolean, lo: number, hi: number): number {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  let p = Math.ceil(hi * 100) / 100;
  for (let i = 0; i < 200 && !ok(p); i++) p = round2(p + 0.01);
  return p;
}

/**
 * Per-sponsor totals over the planned farms. A sponsor's fresh money is what they deploy minus what
 * came back to them from an earlier farm in the plan; the recycled part is attributed to sponsors in
 * mix order, the same order the simulation drew it.
 */
function aggregateFunding(
  farms: OracleFarm[],
  mix: InvestorMixEntry[],
  deadlineIndex: number,
): { funding: WarPlanFunding[]; unfunded: number; perInvestor: InvestorTurns[]; peakOutstanding: number; recycled: number } {
  const deployed = mix.map(() => 0);
  const fresh = mix.map(() => 0);
  let unfunded = 0;
  let recycled = 0;
  for (const f of farms) {
    let toRecycle = f.recycled;
    for (const s of f.funding) {
      deployed[s.mixIndex] = (deployed[s.mixIndex] ?? 0) + s.amount;
      const r = Math.min(toRecycle, s.amount);
      toRecycle -= r;
      fresh[s.mixIndex] = (fresh[s.mixIndex] ?? 0) + (s.amount - r);
    }
    unfunded += f.unfunded;
    recycled += f.recycled;
  }
  // Outstanding capital by month: farms bought and not yet back with their sponsors.
  const outstandingAt = (m: number, of: (f: OracleFarm) => number) =>
    sum(farms.filter((f) => f.purchaseMonth <= m && (f.turnCompletesMonth === null || f.turnCompletesMonth > m)).map(of));
  let peakOutstanding = 0;
  const peakBy = mix.map(() => 0);
  for (let m = 1; m <= Math.max(1, deadlineIndex); m++) {
    peakOutstanding = Math.max(peakOutstanding, outstandingAt(m, (f) => f.cost));
    mix.forEach((_, i) => {
      peakBy[i] = Math.max(peakBy[i] ?? 0, outstandingAt(m, (f) => sum(f.funding.filter((s) => s.mixIndex === i).map((s) => s.amount))));
    });
  }
  const funding: WarPlanFunding[] = [];
  const perInvestor: InvestorTurns[] = [];
  mix.forEach((e, i) => {
    const amount = round2(fresh[i] ?? 0);
    const total = round2(deployed[i] ?? 0);
    if (amount > 0) funding.push({ mixIndex: i, investorId: e.investorId, name: e.name, amount, deployed: total });
    const peak = round2(peakBy[i] ?? 0);
    if (total > 0) perInvestor.push({ mixIndex: i, name: e.name, deployed: total, fresh: amount, peakOutstanding: peak, turns: peak > 0 ? round2(total / peak) : 0 });
  });
  return { funding, unfunded: round2(unfunded), perInvestor, peakOutstanding: round2(peakOutstanding), recycled: round2(recycled) };
}

const monthFmtEn = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const monthFmtEs = new Intl.DateTimeFormat("es", { month: "short", year: "numeric", timeZone: "UTC" });

/** Month label from an ISO date (e.g. "Mar 2027"). The year is the date's year, not the exit horizon. */
export function warPlanMonthLabel(iso: string, lang: QualityLang = "en"): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : (lang === "es" ? monthFmtEs : monthFmtEn).format(d);
}

/** $3.6M / $21K / $500 — the verdict's own compact dollars, so the domain needs no UI formatter. */
export function usdCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function fundingClause(c: WarPlanColumn, lang: QualityLang = "en"): string {
  const parts = c.funding.map((f) => `${f.name} ${usdCompact(f.amount)}`);
  if (c.unfunded > 0) parts.push(lang === "es" ? `sin fondear ${usdCompact(c.unfunded)}` : `unfunded ${usdCompact(c.unfunded)}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/** One sentence: what must happen. Pure so it can be tested. Defaults to English. */
export function warPlanVerdict(plan: WarPlan, lang: QualityLang = "en"): string {
  const r = plan.required;
  const pace = r.closingsPerMonth.toFixed(1);
  const farms = lang === "es" ? `${r.farmsToBuy} finca${r.farmsToBuy === 1 ? "" : "s"}` : `${r.farmsToBuy} farm${r.farmsToBuy === 1 ? "" : "s"}`;
  const target = usdCompact(plan.goal.goal);
  const when = plan.goal.deadline;
  if (lang === "es") {
    if (plan.deadlineMonthIndex === 0) {
      return plan.feasible
        ? `La meta ya está cumplida: ${target} están en mano, compra 0 fincas y levanta $0.`
        : `La fecha límite ${when} no está en el futuro: ningún plan puede agregar cierres antes, así que compra 0 fincas y levanta $0.`;
    }
    if (!plan.feasible) {
      return `Ningún ritmo alcanza ${target} para ${when}: incluso ${pace} lotes/mes con ${farms} y ${usdCompact(r.capitalToRaise)} levantados${fundingClause(r, lang)} llega a ${usdCompact(r.targetAtDeadline)}. Empuja la fecha límite o baja la meta.`;
    }
    if (r.closingsPerMonth <= 0) {
      return `La meta ya está cumplida: ${target} están en mano, compra 0 fincas y levanta $0.`;
    }
    const last =
      r.farmsToBuy > 0 && r.lastPurchaseDate
        ? `, la última no después de ${warPlanMonthLabel(r.lastPurchaseDate, lang)}`
        : ` — los ${plan.startInventory} lotes de hoy alcanzan`;
    const until = plan.lastClosingDate
      ? ` hasta ${warPlanMonthLabel(plan.lastClosingDate, lang)} (luego solo ventas de pagarés)`
      : "";
    return `Compra ${farms}${last}, levanta ${usdCompact(r.capitalToRaise)}${fundingClause(r, lang)}, cierra ${pace} lotes/mes${until}, vende ${r.noteSalesPerMonth.toFixed(1)} pagarés/mes y gasta al menos ${usdCompact(r.adSpendPerMonth)}/mes en anuncios.`;
  }
  if (plan.deadlineMonthIndex === 0) {
    return plan.feasible
      ? `The target is already met: ${target} is in hand, buy 0 farms and raise $0.`
      : `The deadline ${when} is not in the future: no plan can add closings before it, so buy 0 farms and raise $0.`;
  }
  if (!plan.feasible) {
    return `No pace reaches ${target} by ${when}: even ${pace} lots/month with ${farms} and ${usdCompact(r.capitalToRaise)} raised${fundingClause(r, lang)} lands at ${usdCompact(r.targetAtDeadline)}. Push the deadline or lower the target.`;
  }
  if (r.closingsPerMonth <= 0) {
    return `The target is already met: ${target} is in hand, buy 0 farms and raise $0.`;
  }
  const last = r.farmsToBuy > 0 && r.lastPurchaseDate ? `, the last one no later than ${warPlanMonthLabel(r.lastPurchaseDate, lang)}` : ` — today's ${plan.startInventory} lots are enough`;
  const until = plan.lastClosingDate ? ` until ${warPlanMonthLabel(plan.lastClosingDate, lang)} (then only note sales)` : "";
  return `Buy ${farms}${last}, raise ${usdCompact(r.capitalToRaise)}${fundingClause(r, lang)}, close ${pace} lots/month${until}, sell ${r.noteSalesPerMonth.toFixed(1)} notes/month and spend at least ${usdCompact(r.adSpendPerMonth)}/month on ads.`;
}

/**
 * Inverts the simulation by search: the minimum pace that hits the target by the deadline
 * (farms bought just in time as the pace needs them), then the plan's farms, capital, ad spend,
 * note sales and sponsor paybacks — for the current pace, the required plan and the plan plus one
 * buffer farm.
 */
export function solveWarPlan(inputs: WarPlanInputs, ctx: WarPlanContext, lang: QualityLang = "en"): WarPlan {
  const asOf = ctx.asOf;
  const goal = computeGoal(ctx.lots, ctx.farms, asOf, { goal: inputs.target, deadline: inputs.deadline });
  const deadline = parseDate(goal.deadline) ?? asOf;
  const grid = buildMonthGrid(asOf, deadline, true);
  const k = grid.deadlineIndex;
  const startInventory = goal.availableLots + goal.reservedLots;
  const ledger = sponsorLedger(ctx);
  const cashMode = inputs.targetMode === "cash_in_bank";
  const landLag = Math.max(0, Math.round(inputs.farmToFirstCloseMonths));
  const noteLag = Math.max(0, Math.round(inputs.noteSaleLagMonths));
  const closeLag = Math.max(0, Math.round((ctx.pipeline.medianDaysToClose ?? 0) / DAYS_PER_MONTH));
  const maxPurchaseMonth = k - landLag - closeLag - (cashMode ? noteLag : 0);
  const lotsPerFarm = Math.max(0, inputs.lotsPerFarm);

  const cycleMonths = inputs.cycleMonths !== null && inputs.cycleMonths > 0 ? inputs.cycleMonths : null;
  const cycleRounded = cycleMonths === null ? null : Math.max(1, Math.round(cycleMonths));

  const base: OracleParams = {
    ...ctx.oracleDefaults,
    avgLotsPerFarm: lotsPerFarm,
    avgMonthsToSellNote: inputs.noteSaleLagMonths,
    farmCost: Math.max(0, inputs.farmCost),
    adSpendPerClosing: Math.max(0, inputs.adSpendPerClosing),
    conversionPct: inputs.conversionPct,
    farmToFirstCloseMonths: inputs.farmToFirstCloseMonths,
    investorMix: inputs.investorMix,
    targetMode: inputs.targetMode,
    ...(cycleMonths !== null ? { capitalCycleMonths: cycleMonths } : {}),
  };
  const opts: OracleRunOptions = { calendarMonths: true, cashStart: ledger.cashKept, owedStart: ledger.owedToday, grid };
  // In cash mode a closing only pays off once its note sells, so farms are sized for the closings
  // that can still do that before the deadline, and the plan stops closing lots after that month.
  const lastUsefulMonth = cashMode ? Math.max(0, k - noteLag) : k;
  const pauseClosings: [number, number] | undefined = cashMode && lastUsefulMonth < k ? [lastUsefulMonth + 1, k] : undefined;
  // The month-of-year shape of the realm's closings, rescaled so the flat pace stays the plan's
  // average. A profile that is not applied (too little history since the era start) stays flat.
  const seasonality =
    inputs.seasonal && ctx.seasonality.applied
      ? normalizeSeasonality(ctx.seasonality.factors, grid.months, Math.max(1, lastUsefulMonth))
      : ctx.seasonality.factors.map(() => 1);
  const cum = cumulativeFractions(grid, seasonality);
  const planParams: OracleParams = { ...base, seasonality, ...(pauseClosings ? { pauseClosings } : {}) };
  const simulate = (pace: number, schedule: number[]): OracleResult =>
    runOracle({ ...planParams, lotsPerMonth: pace, farmsToBuy: schedule }, goal, startInventory, asOf, opts);
  const scheduleFor = (pace: number) => justInTimeSchedule(pace, cum, lastUsefulMonth, startInventory, lotsPerFarm, landLag, maxPurchaseMonth);
  const hits = (r: OracleResult) => r.targetAtDeadline >= goal.goal - 0.005;
  const MAX = WARPLAN_MAX_CLOSINGS_PER_MONTH;

  let feasible = true;
  let pace = 0;
  if (k === 0) {
    feasible = hits(simulate(0, []));
  } else if (!hits(simulate(0, scheduleFor(0)))) {
    const atMax = simulate(MAX, scheduleFor(MAX));
    if (hits(atMax)) {
      pace = bisect((p) => hits(simulate(p, scheduleFor(p))), 0, MAX);
    } else {
      // Unreachable by the deadline: show the pace beyond which more closings no longer help.
      feasible = false;
      const best = atMax.targetAtDeadline;
      const tol = Math.max(1, Math.abs(best) * 1e-6);
      pace = bisect((p) => simulate(p, scheduleFor(p)).targetAtDeadline >= best - tol, 0, MAX);
    }
  }

  const build = (
    id: WarPlanColumnId,
    title: string,
    pace: number,
    schedule: number[],
    from: OracleParams,
    premise: (c: Omit<WarPlanColumn, "premise">) => string,
  ): WarPlanColumn => {
    const params: OracleParams = { ...from, lotsPerMonth: round2(pace), farmsToBuy: schedule };
    const result = runOracle(params, goal, startInventory, asOf, opts);
    const planned = result.farms.filter((f) => f.purchaseMonth <= k);
    const { funding, unfunded, peakOutstanding } = aggregateFunding(planned, inputs.investorMix, k);
    const lastPurchaseMonth = planned.length > 0 ? Math.max(...planned.map((f) => f.purchaseMonth)) : null;
    const rows: WarPlanRow[] = result.series
      .filter((p) => p.monthIndex <= Math.max(k, 1))
      .map((p) => {
        const flags: WarPlanFlag[] = [];
        if (p.shortfall) flags.push("shortfall");
        if (k > 0 && result.farms.some((f) => f.purchaseMonth === p.monthIndex && f.tooLate)) flags.push("too_late");
        if (k > 0 && cycleRounded !== null && planned.some((f) => f.purchaseMonth === p.monthIndex && !f.turnComplete)) flags.push("turn_incomplete");
        return {
          monthIndex: p.monthIndex,
          date: p.date,
          farmsBought: p.farmsBought,
          capitalDeployed: p.capitalDeployed,
          lotsClosed: p.lotsClosed,
          flatLotsClosed: p.flatLotsClosed,
          seasonalFactor: p.seasonalFactor,
          notesSold: p.notesSold,
          adSpend: p.adSpend,
          cumulativeNet: p.cumulativeNet,
          capitalOwed: p.capitalOwed,
          capitalReturned: p.capitalReturned,
          inventory: p.inventory,
          flags,
        };
      });
    let lotsNeeded = 0;
    for (const p of result.series) {
      if (p.monthIndex > k) break;
      lotsNeeded += (p.monthIndex === k ? grid.deadlineFraction : 1) * p.lotsClosed;
    }
    const deadlinePoint = result.series.find((p) => p.monthIndex === k);
    const column: Omit<WarPlanColumn, "premise"> = {
      id,
      title,
      params,
      startInventory,
      result,
      scheduled: opts.scheduled ?? [],
      exitDate: result.goalDate,
      hitsDeadline: result.hitsDeadline,
      daysEarlierThanCurrent: null,
      closingsPerMonth: round2(pace),
      schedule: planned,
      farmsToBuy: planned.length,
      lastPurchaseMonth,
      lastPurchaseDate: lastPurchaseMonth === null ? null : (rows.find((r) => r.monthIndex === lastPurchaseMonth)?.date ?? result.series[lastPurchaseMonth - 1]?.date ?? null),
      capitalToRaise: round2(sum(planned.map((f) => f.cost - f.recycled))),
      totalDeployed: round2(sum(planned.map((f) => f.cost))),
      peakOutstanding,
      funding,
      unfunded,
      turnsIncomplete: cycleRounded === null ? 0 : planned.filter((f) => !f.turnComplete).length,
      adSpendPerMonth: inputs.conversionPct > 0 ? round2((pace / (inputs.conversionPct / 100)) * inputs.adSpendPerClosing) : 0,
      reservationsPerMonth: inputs.conversionPct > 0 ? round2(pace / (inputs.conversionPct / 100)) : 0,
      noteSalesPerMonth: round2(pace),
      lotsNeeded: round2(lotsNeeded),
      inventoryAtDeadline: deadlinePoint?.inventory ?? startInventory,
      targetAtDeadline: result.targetAtDeadline,
      rows,
      flaggedMonths: rows.filter((r) => r.flags.length > 0).length,
    };
    return { ...column, premise: premise(column) };
  };

  const requiredSchedule = scheduleFor(pace);
  // The buffer farm rides with the last purchase: funded after the planned farms and consumed
  // only once every planned lot is gone, so it never displaces a planned lot. Nothing to cushion
  // when the deadline has passed or the target is already in hand.
  const bufferMonth = requiredSchedule.length > 0 ? (requiredSchedule[requiredSchedule.length - 1] as number) : Math.max(1, Math.min(k, maxPurchaseMonth));
  const bufferSchedule = k > 0 && (pace > 0 || requiredSchedule.length > 0) ? [...requiredSchedule, bufferMonth].sort((a, b) => a - b) : requiredSchedule;

  const era = resolveEra(asOf, ctx.eraStart);
  const es = lang === "es";
  const modeLabel = cashMode
    ? es
      ? "efectivo en banco después de pagar a cada sponsor"
      : "cash in the bank after paying every sponsor"
    : es
      ? "utilidad neta al cierre"
      : "net profit at closing";
  const lastClosingDate = pauseClosings && lastUsefulMonth > 0 ? (grid.months[lastUsefulMonth - 1]?.end.toISOString().slice(0, 10) ?? null) : null;
  const pauseClause = lastClosingDate
    ? es
      ? ` hasta ${warPlanMonthLabel(lastClosingDate, lang)}, luego solo ventas de pagarés`
      : ` until ${warPlanMonthLabel(lastClosingDate, lang)}, then only note sales`
    : "";

  const current = build(
    "current_pace",
    es ? "Al ritmo actual" : "At the current pace",
    ctx.oracleDefaults.lotsPerMonth,
    cadenceSchedule(ctx.oracleDefaults.newFarmEveryMonths),
    base,
    (c) =>
      es
        ? `${c.closingsPerMonth} lotes/mes y una finca cada ${ctx.oracleDefaults.newFarmEveryMonths} meses${era ? ` (${era.since})` : ""} — los promedios recientes, fincas fondeadas de tu mezcla en orden.`
        : `${c.closingsPerMonth} lots/month and a farm every ${ctx.oracleDefaults.newFarmEveryMonths} months${era ? ` (${era.since})` : ""} — the trailing averages, farms funded from your mix in order.`,
  );
  const required = build(
    "required_plan",
    es ? "El plan requerido" : "The required plan",
    pace,
    requiredSchedule,
    planParams,
    (c) =>
      c.farmsToBuy > 0
        ? es
          ? `${c.closingsPerMonth} lotes/mes${pauseClause} con ${c.farmsToBuy} finca${c.farmsToBuy === 1 ? "" : "s"} comprada${c.farmsToBuy === 1 ? "" : "s"} justo a tiempo (la última no después de ${c.lastPurchaseDate ? warPlanMonthLabel(c.lastPurchaseDate, lang) : "—"}) para que el inventario nunca se agote, medido sobre ${modeLabel}.`
          : `${c.closingsPerMonth} lots/month${pauseClause} with ${c.farmsToBuy} farm${c.farmsToBuy === 1 ? "" : "s"} bought just in time (the last no later than ${c.lastPurchaseDate ? warPlanMonthLabel(c.lastPurchaseDate, lang) : "—"}) so inventory never runs short, measured on ${modeLabel}.`
        : es
          ? `${c.closingsPerMonth} lotes/mes${pauseClause} desde los ${startInventory} lotes de hoy — no hace falta finca nueva, medido sobre ${modeLabel}.`
          : `${c.closingsPerMonth} lots/month${pauseClause} from today's ${startInventory} lots — no new farm needed, measured on ${modeLabel}.`,
  );
  const buffer = build(
    "required_plus_buffer",
    es ? "Plan requerido, una finca de colchón" : "Required plan, one buffer farm",
    pace,
    bufferSchedule,
    planParams,
    (c) =>
      (es
        ? `El mismo ritmo con una finca más comprada junto a la última, como colchón para lotes que no se venden: ${c.farmsToBuy} fincas, ${usdCompact(c.capitalToRaise)} por levantar.`
        : `The same pace with one more farm bought alongside the last, as a cushion for lots that do not sell: ${c.farmsToBuy} farms, ${usdCompact(c.capitalToRaise)} to raise.`) +
      (cashMode
        ? es
          ? " En modo efectivo sus lotes sin vender son tierra, no efectivo, así que a la fecha límite el colchón cuesta su precio a menos que esos lotes se vendan."
          : " In cash mode its unsold lots are land, not cash, so at the deadline the cushion costs its price unless those lots sell."
        : ""),
  );

  const currentExit = parseDate(current.exitDate);
  const withDiff = (c: WarPlanColumn): WarPlanColumn => {
    const exit = parseDate(c.exitDate);
    return { ...c, daysEarlierThanCurrent: exit && currentExit ? daysBetween(exit, currentExit) : null };
  };
  const all = [withDiff(current), withDiff(required), withDiff(buffer)];
  const benchmark = computeRotationBenchmark(ctx);

  const plan: WarPlan = {
    inputs,
    goal,
    asOf: goal.asOf,
    startInventory,
    monthsToDeadline: round2(grid.monthsToDeadline),
    deadlineMonthIndex: k,
    landLag,
    closeLag,
    noteLag,
    maxPurchaseMonth,
    lastClosingDate,
    feasible,
    ledger,
    seasonality: seasonality.map((f) => Math.round(f * 1000) / 1000),
    benchmark,
    rotation: rotationPlan(all[1] as WarPlanColumn, inputs.investorMix, cycleMonths, benchmark.turnsCompleted, k, grid, goal, feasible, startInventory, lang),
    current: all[0] as WarPlanColumn,
    required: all[1] as WarPlanColumn,
    buffer: all[2] as WarPlanColumn,
    all,
    verdict: "",
  };
  return { ...plan, verdict: warPlanVerdict(plan, lang) };
}

function turnsLabel(turns: number, lang: QualityLang = "en"): string {
  const n = Number.isInteger(turns) ? String(turns) : turns.toFixed(1);
  if (lang === "es") return `${n} ciclo${turns === 1 ? "" : "s"}`;
  return `${n} turn${turns === 1 ? "" : "s"}`;
}

/** The rotation reading of the required plan, with the founder's headline. Pure so it can be tested. */
export function rotationPlan(
  column: WarPlanColumn,
  mix: InvestorMixEntry[],
  cycleMonths: number | null,
  turnsCompleted: number,
  deadlineIndex: number,
  grid: OracleMonthGrid,
  goal: GoalStatus,
  feasible: boolean,
  startInventory: number,
  lang: QualityLang = "en",
): RotationPlan {
  const planned = column.schedule;
  const { perInvestor, peakOutstanding, recycled } = aggregateFunding(planned, mix, deadlineIndex);
  const totalDeployed = column.totalDeployed;
  const turnsNeeded = planned.length > 0 && peakOutstanding > 0 ? round2(totalDeployed / peakOutstanding) : null;
  const monthEnd = (m: number | null): string | null => {
    if (m === null || m <= 0) return null;
    const mo = grid.months[m - 1];
    return mo ? toIsoDate(mo.end) : null;
  };
  const firstPurchase = planned.length > 0 ? Math.min(...planned.map((f) => f.purchaseMonth)) : null;
  const lastCompletes = planned.length > 0 && cycleMonths !== null ? Math.max(...planned.map((f) => f.turnCompletesMonth ?? 0)) : null;
  const firstTurnStartBy = monthEnd(firstPurchase);
  const lastTurnCompletes = monthEnd(lastCompletes);
  const turnsIncomplete = column.turnsIncomplete;

  const target = usdCompact(goal.goal);
  const cycle = cycleMonths === null ? null : lang === "es" ? `${cycleMonths.toFixed(1)} meses` : `${cycleMonths.toFixed(1)} months`;
  const es = lang === "es";
  let headline: string;
  if (deadlineIndex === 0) {
    headline = feasible
      ? es
        ? `La meta ya está cumplida: no hace falta que rote capital de tierra.`
        : `The target is already met: no land capital has to turn.`
      : es
        ? `La fecha límite ${goal.deadline} no está en el futuro: ningún ciclo de capital puede empezar antes.`
        : `The deadline ${goal.deadline} is not in the future: no capital turn can start before it.`;
  } else if (planned.length === 0) {
    headline = feasible
      ? es
        ? `Los ${startInventory} lotes de hoy alcanzan ${target} para ${goal.deadline} sin una finca nueva: no hace falta que rote capital de tierra.`
        : `Today's ${startInventory} lots reach ${target} by ${goal.deadline} without a new farm: no land capital has to turn.`
      : es
        ? `Ningún ritmo alcanza ${target} para ${goal.deadline} desde los ${startInventory} lotes de hoy, y ninguna finca comprada ahora podría convertir a tiempo: ningún ciclo de capital ayuda.`
        : `No pace reaches ${target} by ${goal.deadline} from today's ${startInventory} lots, and no farm bought now could convert in time: no capital turn helps.`;
  } else if (cycle === null) {
    headline = es
      ? `Se desconoce la duración de un ciclo de capital — ninguna finca liberada para medirla, ninguna proyectable, o la entrada quedó en blanco — así que el plan necesita ${usdCompact(totalDeployed)} de capital de tierra en ${planned.length} finca${planned.length === 1 ? "" : "s"} sin rotar; la primera debe comprarse para ${firstTurnStartBy ? warPlanMonthLabel(firstTurnStartBy, lang) : "—"}.`
      : `The length of a capital turn is unknown — no freed farm to measure it, none projectable, or the input left blank — so the plan needs ${usdCompact(totalDeployed)} of land capital across ${planned.length} farm${planned.length === 1 ? "" : "s"} with nothing rotating; the first must be bought by ${firstTurnStartBy ? warPlanMonthLabel(firstTurnStartBy, lang) : "—"}.`;
  } else if (!feasible) {
    headline = es
      ? `Ningún ritmo alcanza ${target} para ${goal.deadline}: incluso ${usdCompact(peakOutstanding)} de capital de tierra rotando cada ${cycle} (${turnsLabel(turnsNeeded ?? 0, lang)} en ${planned.length} fincas) llega a ${usdCompact(column.targetAtDeadline)}.`
      : `No pace reaches ${target} by ${goal.deadline}: even ${usdCompact(peakOutstanding)} of land capital rotating every ${cycle} (${turnsLabel(turnsNeeded ?? 0, lang)} across ${planned.length} farms) lands at ${usdCompact(column.targetAtDeadline)}.`;
  } else {
    const incomplete =
      turnsIncomplete > 0
        ? es
          ? ` ${turnsIncomplete} de los ${planned.length} ciclos no pueden completarse antes de la fecha límite.`
          : ` ${turnsIncomplete} of the ${planned.length} turns cannot complete before the deadline.`
        : "";
    headline = es
      ? `Con ${usdCompact(peakOutstanding)} de capital de tierra rotando cada ${cycle} alcanzas ${target} a la fecha límite; necesitas ${turnsLabel(turnsNeeded ?? 0, lang)}; el primer ciclo debe empezar para ${firstTurnStartBy ? warPlanMonthLabel(firstTurnStartBy, lang) : "—"}.${incomplete}`
      : `With ${usdCompact(peakOutstanding)} of land capital rotating every ${cycle} you reach ${target} by the deadline; you need ${turnsLabel(turnsNeeded ?? 0)}; the first turn must start by ${firstTurnStartBy ? warPlanMonthLabel(firstTurnStartBy, lang) : "—"}.${incomplete}`;
  }

  return {
    cycleMonths,
    totalDeployed,
    peakOutstanding,
    newMoney: column.capitalToRaise,
    recycled,
    turnsNeeded,
    turnsCompleted,
    turnsIncomplete,
    farms: planned.length,
    firstTurnStartBy,
    lastTurnCompletes,
    perInvestor,
    headline,
  };
}
