import type { FarmEconomics } from "./farm";
import { computeGoal, type GoalStatus } from "./goal";
import type { InvestorSummary } from "./investors";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import type { Pipeline } from "./pipeline";
import type { Future } from "./futures";
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
import { daysBetween, monthsBetween, parseDate } from "./dates";
import { median, round2, sum } from "./math";
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
}

/** The real figures each input is prefilled from (null when the data cannot say). */
export interface WarPlanRealValues {
  target: number;
  deadline: string;
  lotsPerFarm: number | null;
  landCostPerLot: number;
  conversionPct: number | null;
  farmToFirstCloseMonths: number | null;
  /** Farms with both an acquisition date and a first closing, behind the median. */
  farmToFirstCloseFarms: number;
  medianDaysToClose: number | null;
  noteSaleLagMonths: number;
  closingsPerMonth: number;
  inventory: number;
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
}

export type WarPlanColumnId = "current_pace" | "required_plan" | "required_plus_buffer";
export type WarPlanFlag = "shortfall" | "too_late";

export interface WarPlanRow {
  monthIndex: number;
  /** Last day of the period (ISO). The first row runs from asOf to its month end. */
  date: string;
  farmsBought: number;
  capitalDeployed: number;
  lotsClosed: number;
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
  amount: number;
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
  capitalToRaise: number;
  /** Split of the capital by investor, in mix order (zero entries omitted). */
  funding: WarPlanFunding[];
  unfunded: number;
  adSpendPerMonth: number;
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
  const lotsPerFarm = WARPLAN_DEFAULT_LOTS_PER_FARM;
  const conversion = ctx.pipeline.conversion.pct;
  return {
    inputs: {
      target: ctx.goal.goal,
      deadline: ctx.goal.deadline,
      targetMode: "profit_at_closing",
      lotsPerFarm,
      farmCost: Math.round(landCostPerLot * lotsPerFarm),
      adSpendPerClosing: WARPLAN_DEFAULT_AD_SPEND_PER_CLOSING,
      conversionPct: conversion ?? 100,
      farmToFirstCloseMonths: first.months ?? 3,
      noteSaleLagMonths: ctx.oracleDefaults.avgMonthsToSellNote,
      investorMix: prefillInvestorMix(ctx.investors),
    },
    real: {
      target: ctx.goal.goal,
      deadline: ctx.goal.deadline,
      lotsPerFarm: ctx.goal.avgLotsPerFarm,
      landCostPerLot,
      conversionPct: conversion,
      farmToFirstCloseMonths: first.months,
      farmToFirstCloseFarms: first.farms,
      medianDaysToClose: ctx.pipeline.medianDaysToClose,
      noteSaleLagMonths: ctx.oracleDefaults.avgMonthsToSellNote,
      closingsPerMonth: ctx.goal.closedLotsPerMonth,
      inventory: ctx.goal.availableLots + ctx.goal.reservedLots,
    },
  };
}

/** cum[m] = Σ fraction of months 1..m (cum[0] = 0). */
function cumulativeFractions(grid: OracleMonthGrid): number[] {
  const cum = [0];
  for (const mo of grid.months) cum.push((cum[cum.length - 1] as number) + mo.fraction);
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

function aggregateFunding(farms: OracleFarm[], mix: InvestorMixEntry[]): { funding: WarPlanFunding[]; unfunded: number } {
  const amounts = mix.map(() => 0);
  let unfunded = 0;
  for (const f of farms) {
    for (const s of f.funding) amounts[s.mixIndex] = (amounts[s.mixIndex] ?? 0) + s.amount;
    unfunded += f.unfunded;
  }
  const funding: WarPlanFunding[] = [];
  mix.forEach((e, i) => {
    const amount = round2(amounts[i] ?? 0);
    if (amount > 0) funding.push({ mixIndex: i, investorId: e.investorId, name: e.name, amount });
  });
  return { funding, unfunded: round2(unfunded) };
}

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "Mar 2027" from an ISO date. */
export function warPlanMonthLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : monthFmt.format(d);
}

/** $3.6M / $21K / $500 — the verdict's own compact dollars, so the domain needs no UI formatter. */
export function usdCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function fundingClause(c: WarPlanColumn): string {
  const parts = c.funding.map((f) => `${f.name} ${usdCompact(f.amount)}`);
  if (c.unfunded > 0) parts.push(`unfunded ${usdCompact(c.unfunded)}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/** One sentence: what must happen. Pure so it can be tested. */
export function warPlanVerdict(plan: WarPlan): string {
  const r = plan.required;
  const pace = r.closingsPerMonth.toFixed(1);
  const farms = `${r.farmsToBuy} farm${r.farmsToBuy === 1 ? "" : "s"}`;
  const target = usdCompact(plan.goal.goal);
  const when = plan.goal.deadline;
  if (plan.deadlineMonthIndex === 0) {
    return plan.feasible
      ? `The target is already met: ${target} is in hand, buy 0 farms and raise $0.`
      : `The deadline ${when} is not in the future: no plan can add closings before it, so buy 0 farms and raise $0.`;
  }
  if (!plan.feasible) {
    return `No pace reaches ${target} by ${when}: even ${pace} lots/month with ${farms} and ${usdCompact(r.capitalToRaise)} raised${fundingClause(r)} lands at ${usdCompact(r.targetAtDeadline)}. Push the deadline or lower the target.`;
  }
  if (r.closingsPerMonth <= 0) {
    return `The target is already met: ${target} is in hand, buy 0 farms and raise $0.`;
  }
  const last = r.farmsToBuy > 0 && r.lastPurchaseDate ? `, the last one no later than ${warPlanMonthLabel(r.lastPurchaseDate)}` : ` — today's ${plan.startInventory} lots are enough`;
  const until = plan.lastClosingDate ? ` until ${warPlanMonthLabel(plan.lastClosingDate)} (then only note sales)` : "";
  return `Buy ${farms}${last}, raise ${usdCompact(r.capitalToRaise)}${fundingClause(r)}, close ${pace} lots/month${until}, sell ${r.noteSalesPerMonth.toFixed(1)} notes/month and spend at least ${usdCompact(r.adSpendPerMonth)}/month on ads.`;
}

/**
 * Inverts the simulation by search: the minimum pace that hits the target by the deadline
 * (farms bought just in time as the pace needs them), then the plan's farms, capital, ad spend,
 * note sales and sponsor paybacks — for the current pace, the required plan and the plan plus one
 * buffer farm.
 */
export function solveWarPlan(inputs: WarPlanInputs, ctx: WarPlanContext): WarPlan {
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
  };
  const opts: OracleRunOptions = { calendarMonths: true, cashStart: ledger.cashKept, owedStart: ledger.owedToday };
  const cum = cumulativeFractions(grid);
  // In cash mode a closing only pays off once its note sells, so farms are sized for the closings
  // that can still do that before the deadline, and the plan stops closing lots after that month.
  const lastUsefulMonth = cashMode ? Math.max(0, k - noteLag) : k;
  const pauseClosings: [number, number] | undefined = cashMode && lastUsefulMonth < k ? [lastUsefulMonth + 1, k] : undefined;
  const planParams: OracleParams = pauseClosings ? { ...base, pauseClosings } : base;
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
    const { funding, unfunded } = aggregateFunding(planned, inputs.investorMix);
    const lastPurchaseMonth = planned.length > 0 ? Math.max(...planned.map((f) => f.purchaseMonth)) : null;
    const rows: WarPlanRow[] = result.series
      .filter((p) => p.monthIndex <= Math.max(k, 1))
      .map((p) => {
        const flags: WarPlanFlag[] = [];
        if (p.shortfall) flags.push("shortfall");
        if (k > 0 && result.farms.some((f) => f.purchaseMonth === p.monthIndex && f.tooLate)) flags.push("too_late");
        return {
          monthIndex: p.monthIndex,
          date: p.date,
          farmsBought: p.farmsBought,
          capitalDeployed: p.capitalDeployed,
          lotsClosed: p.lotsClosed,
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
      exitDate: result.goalDate,
      hitsDeadline: result.hitsDeadline,
      daysEarlierThanCurrent: null,
      closingsPerMonth: round2(pace),
      schedule: planned,
      farmsToBuy: planned.length,
      lastPurchaseMonth,
      lastPurchaseDate: lastPurchaseMonth === null ? null : (rows.find((r) => r.monthIndex === lastPurchaseMonth)?.date ?? result.series[lastPurchaseMonth - 1]?.date ?? null),
      capitalToRaise: round2(sum(planned.map((f) => f.cost))),
      funding,
      unfunded,
      adSpendPerMonth: inputs.conversionPct > 0 ? round2((pace / (inputs.conversionPct / 100)) * inputs.adSpendPerClosing) : 0,
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
  const modeLabel = cashMode ? "cash in the bank after paying every sponsor" : "net profit at closing";
  const lastClosingDate = pauseClosings && lastUsefulMonth > 0 ? (grid.months[lastUsefulMonth - 1]?.end.toISOString().slice(0, 10) ?? null) : null;
  const pauseClause = lastClosingDate ? ` until ${warPlanMonthLabel(lastClosingDate)}, then only note sales` : "";

  const current = build(
    "current_pace",
    "At the current pace",
    ctx.oracleDefaults.lotsPerMonth,
    cadenceSchedule(ctx.oracleDefaults.newFarmEveryMonths),
    base,
    (c) =>
      `${c.closingsPerMonth} lots/month and a farm every ${ctx.oracleDefaults.newFarmEveryMonths} months — the trailing averages, farms funded from your mix in order.`,
  );
  const required = build(
    "required_plan",
    "The required plan",
    pace,
    requiredSchedule,
    planParams,
    (c) =>
      c.farmsToBuy > 0
        ? `${c.closingsPerMonth} lots/month${pauseClause} with ${c.farmsToBuy} farm${c.farmsToBuy === 1 ? "" : "s"} bought just in time (the last no later than ${c.lastPurchaseDate ? warPlanMonthLabel(c.lastPurchaseDate) : "—"}) so inventory never runs short, measured on ${modeLabel}.`
        : `${c.closingsPerMonth} lots/month${pauseClause} from today's ${startInventory} lots — no new farm needed, measured on ${modeLabel}.`,
  );
  const buffer = build(
    "required_plus_buffer",
    "Required plan, one buffer farm",
    pace,
    bufferSchedule,
    planParams,
    (c) =>
      `The same pace with one more farm bought alongside the last, as a cushion for lots that do not sell: ${c.farmsToBuy} farms, ${usdCompact(c.capitalToRaise)} to raise.` +
      (cashMode ? " In cash mode its unsold lots are land, not cash, so at the deadline the cushion costs its price unless those lots sell." : ""),
  );

  const currentExit = parseDate(current.exitDate);
  const withDiff = (c: WarPlanColumn): WarPlanColumn => {
    const exit = parseDate(c.exitDate);
    return { ...c, daysEarlierThanCurrent: exit && currentExit ? daysBetween(exit, currentExit) : null };
  };
  const all = [withDiff(current), withDiff(required), withDiff(buffer)];

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
    current: all[0] as WarPlanColumn,
    required: all[1] as WarPlanColumn,
    buffer: all[2] as WarPlanColumn,
    all,
    verdict: "",
  };
  return { ...plan, verdict: warPlanVerdict(plan) };
}
