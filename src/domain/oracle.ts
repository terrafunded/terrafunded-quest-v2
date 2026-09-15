import type { FarmEconomics } from "./farm";
import type { GoalStatus } from "./goal";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import { addDays, addMonths, daysBetween, daysInUtcMonth, endOfUtcMonth, monthsBetween, parseDate, toIsoDate } from "./dates";
import { mean, round2 } from "./math";
import { resolveEra, type EraStart } from "./era";

/** What the target is measured on: net profit booked at closing, or cash in the bank after paying every sponsor out. */
export type TargetMode = "profit_at_closing" | "cash_in_bank";

export type MixDealType = "fixed_interest" | "profit_share" | "own_capital";

/** One sponsor in the War Plan's funding order. New farms draw from these entries top to bottom until the capital is gone. */
export interface InvestorMixEntry {
  investorId: string | null;
  name: string;
  dealType: MixDealType;
  /** Annual interest % (fixed_interest) or share of gross profit % (profit_share). Ignored for own_capital. */
  ratePct: number;
  /** Capital this sponsor will put into new farms, in dollars. */
  capital: number;
}

export interface OracleParams {
  lotsPerMonth: number;
  avgSalePrice: number;
  avgLandCost: number;
  avgMonthsToSellNote: number;
  newFarmEveryMonths: number;
  avgLotsPerFarm: number;
  /** Blended investor take as a percent of gross profit. */
  investorTakePct: number;
  /** Down payment as a percent of sale price (cash at closing). */
  downPaymentPct: number;
  /** Note sale price as a percent of the financed amount. */
  noteSalePct: number;

  // ——— War Plan extensions. Every field is optional; leaving them out runs the original simulation. ———
  /** Marketing dollars per closing. Monthly ad spend = closings ÷ conversion × this. */
  adSpendPerClosing?: number;
  /** Reservation → closing conversion, in percent (pipeline.ts). Default 100. */
  conversionPct?: number;
  /** Capital to buy one new farm. Default avgLandCost × avgLotsPerFarm. */
  farmCost?: number;
  /** Months from buying a farm to its first closing; its lots join the inventory only after this lag. Default 0. */
  farmToFirstCloseMonths?: number;
  /**
   * Explicit purchase schedule: the month index (1 = the current month) of every farm to buy.
   * When present it replaces `newFarmEveryMonths`, and each farm is funded from `investorMix` in order.
   */
  farmsToBuy?: number[];
  /** Funding order for the explicit schedule. Each new lot's take follows its own farm's deal, not the blended average. */
  investorMix?: InvestorMixEntry[];
  /** Default "profit_at_closing". */
  targetMode?: TargetMode;
  /**
   * Inclusive range of month indices with no closings: a cash plan stops selling lots whose
   * notes cannot be sold before the deadline and harvests the notes instead.
   */
  pauseClosings?: [from: number, to: number];
  /**
   * Twelve multipliers on the monthly pace by calendar month (index 0 = January), calendar mode
   * only. Month-of-year shape of the closings; the plan's flat pace is the average.
   */
  seasonality?: number[];
  /**
   * Months from buying a farm until the capital that funded it is back in the sponsor's hands
   * and can fund the next farm (the realm's real liberation cycle). Without it capital never rotates.
   */
  capitalCycleMonths?: number;
  /**
   * Capital already outstanding that re-enters the recycled pool on the given month
   * (Engine: existing farms' lots selling through). Forwarded to `fundSchedule`.
   */
  seedReturns?: CapitalReturnSeed[];
}

/** A closing already committed by a live reservation (expected.ts): when it should land and what it books. */
export interface ScheduledClosing {
  /** Expected close date (ISO). Dates on or before `asOf` land in the first simulated month. */
  date: string;
  /** Closings this entry produces — one reservation weighted by its conversion, e.g. 0.74. */
  lots: number;
  /** Net profit it books (the reservation's expected net profit). */
  netProfit: number;
}

/** Realm-level context the Oracle sliders do not carry. */
export interface OracleRunOptions {
  /**
   * Closings the live reservations have already committed. Each lands in the month containing its
   * date, comes out of today's inventory first and books its own net profit; `params.lotsPerMonth`
   * then only has to cover reservations made from `asOf` on.
   */
  scheduled?: ScheduledClosing[];
  /**
   * Days after `asOf` before `params.lotsPerMonth` starts producing closings — the reservation →
   * closing lag, so a pace expressed in new reservations does not close them the day they are made.
   * Prorated inside the month the lag ends in. Default 0.
   */
  paceLagDays?: number;
  /**
   * Anchor months to the calendar: month 1 runs from `asOf` to its month-end (pace prorated by the
   * days left), every later month is a full calendar month, and the goal date is interpolated
   * inside the month it is crossed. Default false: whole months counted from `asOf`.
   */
  calendarMonths?: boolean;
  /** Cash the fund has kept so far (receipts − payouts to sponsors). Cash mode starts here. Default goal.cashRealized. */
  cashStart?: number;
  /** Capital and accrued take owed to sponsors today; cash mode subtracts it. Default 0. */
  owedStart?: number;
  /**
   * Reuse a month grid already built for this asOf/deadline/calendar. `solveWarPlan` bisects
   * through tens of `runOracle` calls; rebuilding 120 months of dates each time was the
   * dominant cost of `buildRealm`.
   */
  grid?: OracleMonthGrid;
}

export interface FarmFundingSlice {
  /** Position in `params.investorMix`. */
  mixIndex: number;
  investorId: string | null;
  name: string;
  dealType: MixDealType;
  ratePct: number;
  amount: number;
}

/** One farm from the explicit schedule, as the simulation bought and sold it. */
export interface OracleFarm {
  index: number;
  purchaseMonth: number;
  /** First month its lots can close (purchase + farmToFirstCloseMonths). */
  landMonth: number;
  lots: number;
  cost: number;
  funding: FarmFundingSlice[];
  /** Part of the cost no sponsor in the mix could cover. */
  unfunded: number;
  /** Part of the funding that was capital returned by an earlier farm in this plan (a second turn of the same dollar). */
  recycled: number;
  /** Month the capital that bought this farm is back with its sponsors (purchase + capitalCycleMonths), or null without a cycle. */
  turnCompletesMonth: number | null;
  /** True when the turn completes on or before the deadline month. */
  turnComplete: boolean;
  lotsClosedByDeadline: number;
  notesSoldByDeadline: number;
  /** Bought so late that (after the lag, plus the note sale in cash mode) nothing converts before the deadline. */
  tooLate: boolean;
}

export interface OraclePoint {
  monthIndex: number;
  date: string;
  lotsClosed: number;
  /** Closings the flat pace alone would ask for this month (before the seasonal shape). */
  flatLotsClosed: number;
  /** Closings that came from live reservations scheduled in this month (`OracleRunOptions.scheduled`). */
  scheduledLotsClosed: number;
  /** Seasonal multiplier applied this month (1 without a profile). */
  seasonalFactor: number;
  inventory: number;
  cumulativeNetProfit: number;
  cumulativeCash: number;
  /** Farms bought this month (explicit schedule or cadence). */
  farmsBought: number;
  /** Capital deployed on farms this month. */
  capitalDeployed: number;
  /** Notes sold this month — the closings of `avgMonthsToSellNote` months ago. */
  notesSold: number;
  adSpend: number;
  /** Cumulative value of the target in `targetMode` (net profit, or cash after paying everyone out). */
  cumulativeNet: number;
  /** Capital (and accrued take) still owed to sponsors at month end. */
  capitalOwed: number;
  /** Cumulative capital returned per `investorMix` entry (same order). */
  capitalReturned: number[];
  /** The pace asked for more closings than the inventory could supply. */
  shortfall: boolean;
}

export interface OracleResult {
  params: OracleParams;
  startNetProfit: number;
  goal: number;
  deadline: string;
  /** Months until the goal is met (whole months, or fractional in calendar mode), or null if not within the horizon. */
  monthsToGoal: number | null;
  goalDate: string | null;
  hitsDeadline: boolean;
  netProfitAtDeadline: number;
  netProfitPerLot: number;
  lotsNeeded: number | null;
  farmsBought: number;
  series: OraclePoint[];
  targetMode: TargetMode;
  /** The target metric today. */
  targetStart: number;
  /** The target metric at the deadline (interpolated in calendar mode). */
  targetAtDeadline: number;
  monthsToDeadline: number;
  /** Month index containing the deadline (0 when the deadline is not after asOf, or beyond the horizon). */
  deadlineMonthIndex: number;
  /** Farms of the explicit schedule (empty when the cadence was used). */
  farms: OracleFarm[];
}

export const ORACLE_HORIZON_MONTHS = 120;

/** One simulated month. `open` is exclusive (the day before the period starts). */
export interface OracleMonth {
  index: number;
  open: Date;
  end: Date;
  /** Share of a full month this period covers (1 except a partial first calendar month). */
  fraction: number;
}

export interface OracleMonthGrid {
  months: OracleMonth[];
  /** Index of the month containing the deadline; 0 when the deadline is not after asOf or lies beyond the horizon. */
  deadlineIndex: number;
  /** Share of the deadline month that lies on or before the deadline. */
  deadlineFraction: number;
  /** Fractional months from asOf to the deadline as the grid counts them. */
  monthsToDeadline: number;
  calendar: boolean;
}

export function buildMonthGrid(asOf: Date, deadline: Date, calendar: boolean, horizon = ORACLE_HORIZON_MONTHS): OracleMonthGrid {
  const months: OracleMonth[] = [];
  if (!calendar) {
    for (let m = 1; m <= horizon; m++) months.push({ index: m, open: addMonths(asOf, m - 1), end: addMonths(asOf, m), fraction: 1 });
  } else {
    let open = asOf;
    let end = endOfUtcMonth(asOf);
    let fraction = daysBetween(asOf, end) / daysInUtcMonth(asOf);
    if (fraction <= 0) {
      // asOf is a month end: the first simulated month is the next full calendar month.
      end = endOfUtcMonth(addDays(asOf, 1));
      fraction = 1;
    }
    for (let m = 1; m <= horizon; m++) {
      months.push({ index: m, open, end, fraction });
      open = end;
      end = endOfUtcMonth(addDays(open, 1));
      fraction = 1;
    }
  }

  let deadlineIndex = 0;
  let deadlineFraction = 0;
  let monthsToDeadline = 0;
  if (deadline > asOf) {
    let cum = 0;
    for (const mo of months) {
      if (deadline <= mo.end) {
        deadlineIndex = mo.index;
        const span = daysBetween(mo.open, mo.end);
        deadlineFraction = span > 0 ? daysBetween(mo.open, deadline) / span : 1;
        monthsToDeadline = cum + deadlineFraction * mo.fraction;
        break;
      }
      cum += mo.fraction;
    }
    if (deadlineIndex === 0) monthsToDeadline = calendar ? cum : monthsBetween(asOf, deadline);
  }
  return { months, deadlineIndex, deadlineFraction, monthsToDeadline, calendar };
}

/** Index of the simulated month containing `date` (1 when the date has already passed); null beyond the horizon. */
export function monthIndexFor(date: Date, grid: OracleMonthGrid): number | null {
  for (const mo of grid.months) if (date <= mo.end) return mo.index;
  return null;
}

/** Share of month `mo` that lies after `start`: 0 before it, prorated in the month containing it, 1 after. */
function shareAfter(mo: OracleMonth, start: Date): number {
  if (start <= mo.open) return 1;
  if (start >= mo.end) return 0;
  const span = daysBetween(mo.open, mo.end);
  return span > 0 ? daysBetween(start, mo.end) / span : 0;
}

/** How often the realm buys a farm: the mean gap between consecutive fundings since the era start. */
export interface FarmCadence {
  /** Mean months between consecutive farm fundings (`DEFAULT_FARM_CADENCE_MONTHS` when fewer than two farms qualify). */
  months: number;
  /** True when the figure was measured from at least two fundings. */
  measured: boolean;
  /** Farms behind the figure — funded (else acquired) on or after the era start. */
  farms: number;
  /** ISO funding dates behind the figure, oldest first. */
  fundingDates: string[];
  /** Farms left out because they were funded before the era start. */
  excluded: number;
  /** ISO era start the cadence is measured from, or null when every farm counts. */
  since: string | null;
  /** "since Mar 2026", or null when every farm counts. */
  sinceLabel: string | null;
}

export const DEFAULT_FARM_CADENCE_MONTHS = 3;

export interface OracleDefaultsOptions {
  /** Era start (ISO) the cadence is measured from; `null` counts every farm. Default: config ERA_START. */
  eraStart?: EraStart;
}

/**
 * Mean months between consecutive farm fundings, over farms funded on or after the era start
 * (config ERA_START): the cadence the Oracle's "new farm every N months" slider starts from.
 */
export function farmCadence(farms: FarmEconomics[], asOf: Date, eraStart: EraStart = undefined): FarmCadence {
  const era = resolveEra(asOf, eraStart);
  const dated = farms.map((f) => parseDate(f.fundingDate) ?? parseDate(f.closingDate)).filter((d): d is Date => d !== null);
  const fundingDates = dated.filter((d) => !era || d >= era.startDate).sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < fundingDates.length; i++) {
    gaps.push(monthsBetween(fundingDates[i - 1] as Date, fundingDates[i] as Date));
  }
  const measured = mean(gaps);
  return {
    months: round2(measured ?? DEFAULT_FARM_CADENCE_MONTHS),
    measured: measured !== null,
    farms: fundingDates.length,
    fundingDates: fundingDates.map(toIsoDate),
    excluded: dated.length - fundingDates.length,
    since: era?.start ?? null,
    sinceLabel: era?.since ?? null,
  };
}

/** Real trailing averages the sliders start from. */
export function deriveOracleDefaults(lots: Lot[], farms: FarmEconomics[], goal: GoalStatus, opts: OracleDefaultsOptions = {}): OracleParams {
  const sold = lots.filter(isSold);
  const avgSalePrice = mean(sold.map((l) => l.salePrice ?? 0).filter((n) => n > 0)) ?? 0;
  const avgLandCost = mean(sold.map((l) => l.landCost)) ?? mean(farms.map((f) => f.landCostPerLot)) ?? 0;

  const noteDelays = sold
    .filter((l) => l.noteSaleDate && l.closeDate)
    .map((l) => monthsBetween(parseDate(l.closeDate) as Date, parseDate(l.noteSaleDate) as Date))
    .filter((m) => m >= 0);
  const avgMonthsToSellNote = mean(noteDelays) ?? 3;

  const asOf = parseDate(goal.asOf);
  // Without a readable asOf there is no era to resolve: every farm counts.
  const newFarmEveryMonths = (asOf ? farmCadence(farms, asOf, opts.eraStart) : farmCadence(farms, new Date(0), null)).months;

  const financed = sold.filter((l) => l.dealType === "financed" && (l.salePrice ?? 0) > 0);
  const downPaymentPct = mean(financed.map((l) => ((l.downPayment ?? 0) / (l.salePrice as number)) * 100)) ?? 5;
  const noteSalePct =
    mean(
      sold
        .filter((l) => l.noteSalePrice && l.noteFinancedAmount)
        .map((l) => ((l.noteSalePrice as number) / (l.noteFinancedAmount as number)) * 100),
    ) ?? 80;

  const investorTakePct = goal.grossProfitToDate > 0 ? (goal.investorTakeToDate / goal.grossProfitToDate) * 100 : 0;

  return {
    lotsPerMonth: round2(goal.closedLotsPerMonth),
    avgSalePrice: Math.round(avgSalePrice),
    avgLandCost: Math.round(avgLandCost),
    avgMonthsToSellNote: round2(avgMonthsToSellNote),
    newFarmEveryMonths,
    avgLotsPerFarm: round2(goal.avgLotsPerFarm ?? mean(farms.map((f) => f.totalLots)) ?? 10),
    investorTakePct: round2(investorTakePct),
    downPaymentPct: round2(downPaymentPct),
    noteSalePct: round2(noteSalePct),
  };
}

interface FarmBatch {
  farm: OracleFarm;
  lots: number;
  closedByMonth: number[];
}

/** Capital that re-enters the recycled pool on a given month (e.g. today's outstanding as existing lots sell). */
export interface CapitalReturnSeed {
  month: number;
  mixIndex: number;
  amount: number;
}

/**
 * Funds each scheduled farm from the mix in order; whatever the mix cannot cover is `unfunded`.
 * With a capital cycle, the money that bought a farm returns to its sponsor `cycleMonths` later
 * and funds the farms bought from that month on — the same dollar on its next turn.
 * `seedReturns` puts capital already outstanding back into the pool on the month those lots
 * sell through — without it, a capital-first schedule would treat deployed capital as fresh
 * dry powder and outstanding would only ever climb.
 *
 * Exported so The Engine (and any capital-first schedule) can reuse the same recycling math
 * the War Plan already runs through `runOracle` — one forecast, two questions.
 */
export function fundSchedule(
  schedule: number[],
  farmCost: number,
  lotsPerFarm: number,
  landLag: number,
  mix: InvestorMixEntry[],
  cycleMonths: number | null,
  deadlineIndex: number,
  seedReturns: CapitalReturnSeed[] = [],
): OracleFarm[] {
  const remaining = mix.map((e) => Math.max(0, e.capital));
  const recycledPool = mix.map(() => 0);
  // Existing capital already in the ground returns on its seed month; new purchases append after.
  const pending: { month: number; mixIndex: number; amount: number }[] = seedReturns
    .filter((s) => s.amount > 0 && s.month > 0)
    .map((s) => ({ month: s.month, mixIndex: s.mixIndex, amount: s.amount }));
  return schedule.map((purchaseMonth, index) => {
    for (const p of pending) {
      if (p.month <= purchaseMonth && p.amount > 0) {
        recycledPool[p.mixIndex] = (recycledPool[p.mixIndex] ?? 0) + p.amount;
        p.amount = 0;
      }
    }
    let need = farmCost;
    let recycled = 0;
    const funding: FarmFundingSlice[] = [];
    for (let s = 0; s < mix.length && need > 1e-9; s++) {
      const entry = mix[s] as InvestorMixEntry;
      const fromReturned = Math.min(recycledPool[s] as number, need);
      recycledPool[s] = (recycledPool[s] as number) - fromReturned;
      need -= fromReturned;
      recycled += fromReturned;
      const fromFresh = Math.min(remaining[s] as number, need);
      remaining[s] = (remaining[s] as number) - fromFresh;
      need -= fromFresh;
      const amount = fromReturned + fromFresh;
      if (amount <= 0) continue;
      funding.push({ mixIndex: s, investorId: entry.investorId, name: entry.name, dealType: entry.dealType, ratePct: entry.ratePct, amount });
      if (cycleMonths !== null) pending.push({ month: purchaseMonth + cycleMonths, mixIndex: s, amount });
    }
    const turnCompletesMonth = cycleMonths === null ? null : purchaseMonth + cycleMonths;
    return {
      index,
      purchaseMonth,
      landMonth: purchaseMonth + landLag,
      lots: lotsPerFarm,
      cost: farmCost,
      funding,
      unfunded: Math.max(0, need),
      recycled,
      turnCompletesMonth,
      turnComplete: turnCompletesMonth !== null && deadlineIndex > 0 && turnCompletesMonth <= deadlineIndex,
      lotsClosedByDeadline: 0,
      notesSoldByDeadline: 0,
      tooLate: false,
    };
  });
}

/**
 * Month-by-month simulation. Inventory starts at available + reserved lots;
 * every `newFarmEveryMonths` a farm of `avgLotsPerFarm` lots is added. Each lot
 * closed recognizes (price − land) × (1 − take) as net profit; cash arrives as
 * the down payment now and the note sale `avgMonthsToSellNote` later.
 *
 * With the War Plan extensions, `farmsToBuy` replaces the cadence: each farm is funded from
 * `investorMix` in order, its lots can close only `farmToFirstCloseMonths` after purchase,
 * and each of its lots pays that farm's deal (interest on its share of the land for the months
 * held, or a share of its gross) instead of the blended take. The unfunded share of a farm is
 * charged the blended take. In cash mode the target is cash kept − farm outlays − take paid −
 * capital still owed: what the fund could hand out after paying everyone.
 */
export function runOracle(params: OracleParams, goal: GoalStatus, startInventory: number, asOf: Date, opts: OracleRunOptions = {}): OracleResult {
  const calendar = opts.calendarMonths === true;
  const targetMode: TargetMode = params.targetMode ?? "profit_at_closing";
  const cashMode = targetMode === "cash_in_bank";
  const deadline = parseDate(goal.deadline) ?? asOf;
  const legacyMonthsToDeadline = Math.max(0, monthsBetween(asOf, deadline));
  const grid = opts.grid && opts.grid.calendar === calendar ? opts.grid : buildMonthGrid(asOf, deadline, calendar);
  const deadlineIndex = grid.deadlineIndex;

  const grossPerLot = params.avgSalePrice - params.avgLandCost;
  const netProfitPerLot = round2(grossPerLot * (1 - params.investorTakePct / 100));
  const downPerLot = params.avgSalePrice * (params.downPaymentPct / 100);
  const noteCashPerLot = (params.avgSalePrice - downPerLot) * (params.noteSalePct / 100);
  const noteLag = Math.max(0, Math.round(params.avgMonthsToSellNote));
  const poolTakePerLot = grossPerLot * (params.investorTakePct / 100);

  const lotsPerFarm = params.avgLotsPerFarm;
  const farmCost = params.farmCost ?? params.avgLandCost * lotsPerFarm;
  const landLag = Math.max(0, Math.round(params.farmToFirstCloseMonths ?? 0));
  const conversion = params.conversionPct ?? 100;
  const adPerClosing = params.adSpendPerClosing ?? 0;
  const mix = params.investorMix ?? [];
  const explicit = params.farmsToBuy !== undefined;
  const schedule = explicit
    ? (params.farmsToBuy as number[])
        .filter((p) => Number.isFinite(p))
        .map((p) => Math.max(1, Math.round(p)))
        .filter((p) => p <= ORACLE_HORIZON_MONTHS)
        .sort((a, b) => a - b)
    : [];
  const cycleMonths = params.capitalCycleMonths !== undefined && params.capitalCycleMonths > 0 ? Math.max(1, Math.round(params.capitalCycleMonths)) : null;
  const farms = fundSchedule(schedule, farmCost, lotsPerFarm, landLag, mix, cycleMonths, deadlineIndex, params.seedReturns ?? []);
  const farmsByPurchase = new Map<number, OracleFarm[]>();
  const farmsByLand = new Map<number, OracleFarm[]>();
  for (const f of farms) {
    const bought = farmsByPurchase.get(f.purchaseMonth);
    if (bought) bought.push(f);
    else farmsByPurchase.set(f.purchaseMonth, [f]);
    const landed = farmsByLand.get(f.landMonth);
    if (landed) landed.push(f);
    else farmsByLand.set(f.landMonth, [f]);
  }
  const seasonality = calendar && params.seasonality && params.seasonality.length === 12 ? params.seasonality : null;
  const fundedOf = (f: OracleFarm) => f.funding.filter((s) => s.dealType !== "own_capital").reduce((a, s) => a + s.amount, 0);

  // Committed closings by month: reservations whose expected date has passed land in month 1.
  const scheduledByMonth = new Map<number, { lots: number; profit: number }>();
  for (const s of opts.scheduled ?? []) {
    const d = parseDate(s.date);
    if (!d || s.lots <= 0) continue;
    const idx = d <= asOf ? 1 : monthIndexFor(d, grid);
    if (idx === null) continue;
    const cur = scheduledByMonth.get(idx) ?? { lots: 0, profit: 0 };
    cur.lots += s.lots;
    cur.profit += s.netProfit;
    scheduledByMonth.set(idx, cur);
  }
  const paceStart = addDays(asOf, Math.max(0, opts.paceLagDays ?? 0));

  const series: OraclePoint[] = [];
  let poolInventory = startInventory;
  const farmBatches: FarmBatch[] = [];
  let profit = goal.netProfitToDate;
  let cash = goal.cashRealized;
  const cashStart = opts.cashStart ?? goal.cashRealized;
  const owedStart = opts.owedStart ?? 0;
  let takePaid = 0;
  let outlays = 0;
  const metric = () => (cashMode ? cash - goal.cashRealized + cashStart - owedStart - takePaid - outlays : profit);
  const targetStart = metric();

  let farmsBought = 0;
  let monthsToGoal: number | null = targetStart >= goal.goal ? 0 : null;
  let crossMonth: number | null = null;
  let crossFraction = 0;
  let netAtDeadline = profit;
  let targetAtDeadline = targetStart;
  let prevValue = targetStart;
  let prevProfit = profit;
  const pendingNoteCash: number[] = [];
  const closedByMonth: number[] = [];
  const farmEvery = params.newFarmEveryMonths > 0 ? params.newFarmEveryMonths : Infinity;
  let nextFarmAt = farmEvery;

  // Display-only sponsor accounting (the cash-mode metric does not depend on when capital is handed back).
  let existingOwed = owedStart;
  const existingOwedPerLot = startInventory > 0 ? owedStart / startInventory : 0;
  let owed = owedStart;
  const returned = mix.map(() => 0);

  for (let m = 1; m <= ORACLE_HORIZON_MONTHS; m++) {
    const month = grid.months[m - 1] as OracleMonth;
    let farmsBoughtNow = 0;
    let capitalNow = 0;
    if (!explicit) {
      while (m >= nextFarmAt && Number.isFinite(nextFarmAt)) {
        poolInventory += lotsPerFarm;
        farmsBought += 1;
        farmsBoughtNow += 1;
        capitalNow += farmCost;
        nextFarmAt += farmEvery;
      }
    } else {
      const bought = farmsByPurchase.get(m);
      if (bought) {
        for (const f of bought) {
          farmsBoughtNow += 1;
          capitalNow += f.cost;
          owed += fundedOf(f);
        }
      }
      const landed = farmsByLand.get(m);
      if (landed) {
        for (const f of landed) farmBatches.push({ farm: f, lots: f.lots, closedByMonth: [] });
      }
      farmsBought += farmsBoughtNow;
    }
    outlays += capitalNow;

    const paused = params.pauseClosings !== undefined && m >= params.pauseClosings[0] && m <= params.pauseClosings[1];
    const flatPace = paused ? 0 : Math.max(0, params.lotsPerMonth) * (calendar ? month.fraction : 1) * shareAfter(month, paceStart);
    const seasonalFactor = seasonality ? Math.max(0, seasonality[month.end.getUTCMonth()] ?? 1) : 1;
    const sched = scheduledByMonth.get(m) ?? { lots: 0, profit: 0 };
    const pace = flatPace * seasonalFactor + sched.lots;
    const farmInventory = farmBatches.reduce((a, b) => a + b.lots, 0);
    const closed = Math.min(pace, poolInventory + farmInventory);

    // Existing inventory first — the original arithmetic, untouched. The committed closings are
    // reserved lots of that inventory; each books its own expected net profit instead of the average.
    const fromPool = Math.min(closed, poolInventory);
    const schedClosed = Math.min(sched.lots, fromPool);
    const schedProfit = sched.lots > 0 ? sched.profit * (schedClosed / sched.lots) : 0;
    poolInventory -= fromPool;
    profit += schedProfit + (fromPool - schedClosed) * netProfitPerLot;
    cash += fromPool * downPerLot;
    pendingNoteCash[m + noteLag] = (pendingNoteCash[m + noteLag] ?? 0) + fromPool * noteCashPerLot;
    takePaid += fromPool * poolTakePerLot;
    const existingReturn = Math.min(existingOwed, fromPool * existingOwedPerLot);
    existingOwed -= existingReturn;
    owed -= existingReturn;

    // Then the new farms, in the order they landed, each lot on its own farm's deal.
    let remaining = closed - fromPool;
    for (const batch of farmBatches) {
      if (remaining <= 1e-12) break;
      const take = Math.min(remaining, batch.lots);
      if (take <= 0) continue;
      batch.lots -= take;
      remaining -= take;
      batch.closedByMonth[m] = (batch.closedByMonth[m] ?? 0) + take;
      const f = batch.farm;
      const capitalPerLot = f.lots > 0 ? f.cost / f.lots : 0;
      const gross = params.avgSalePrice - capitalPerLot;
      let takePerLot = 0;
      for (const s of f.funding) {
        const share = f.cost > 0 ? s.amount / f.cost : 0;
        if (s.dealType === "fixed_interest") takePerLot += capitalPerLot * share * (s.ratePct / 100) * (Math.max(0, m - f.purchaseMonth) / 12);
        else if (s.dealType === "profit_share") takePerLot += gross * share * (s.ratePct / 100);
        if (s.dealType !== "own_capital") {
          const r = take * capitalPerLot * share;
          returned[s.mixIndex] = (returned[s.mixIndex] ?? 0) + r;
          owed -= r;
        }
      }
      if (f.cost > 0) takePerLot += gross * (f.unfunded / f.cost) * (params.investorTakePct / 100);
      profit += take * (gross - takePerLot);
      cash += take * downPerLot;
      pendingNoteCash[m + noteLag] = (pendingNoteCash[m + noteLag] ?? 0) + take * noteCashPerLot;
      takePaid += take * takePerLot;
    }
    cash += pendingNoteCash[m] ?? 0;
    closedByMonth[m] = closed;

    const value = metric();
    const date = toIsoDate(calendar ? month.end : addMonths(asOf, m));
    series.push({
      monthIndex: m,
      date,
      lotsClosed: round2(closed),
      flatLotsClosed: round2(flatPace),
      scheduledLotsClosed: round2(schedClosed),
      seasonalFactor: Math.round(seasonalFactor * 1000) / 1000,
      inventory: round2(poolInventory + farmBatches.reduce((a, b) => a + b.lots, 0)),
      cumulativeNetProfit: round2(profit),
      cumulativeCash: round2(cash),
      farmsBought: farmsBoughtNow,
      capitalDeployed: round2(capitalNow),
      notesSold: round2(closedByMonth[m - noteLag] ?? 0),
      adSpend: conversion > 0 ? round2((closed / (conversion / 100)) * adPerClosing) : 0,
      cumulativeNet: round2(value),
      capitalOwed: round2(Math.max(0, owed)),
      capitalReturned: returned.map((r) => round2(r)),
      shortfall: closed + 1e-9 < pace,
    });

    if (!calendar) {
      if (monthsToGoal === null && value >= goal.goal) monthsToGoal = m;
      if (m <= legacyMonthsToDeadline) {
        netAtDeadline = profit;
        targetAtDeadline = value;
      }
      if (monthsToGoal !== null && m > legacyMonthsToDeadline + 1 && m >= monthsToGoal + 1) break;
    } else {
      if (crossMonth === null && monthsToGoal === null && value >= goal.goal) {
        crossMonth = m;
        crossFraction = value > prevValue ? Math.min(1, Math.max(0, (goal.goal - prevValue) / (value - prevValue))) : 1;
      }
      if (m === deadlineIndex) {
        targetAtDeadline = prevValue + grid.deadlineFraction * (value - prevValue);
        netAtDeadline = prevProfit + grid.deadlineFraction * (profit - prevProfit);
      }
      if ((crossMonth !== null || monthsToGoal === 0) && m > deadlineIndex && m >= (crossMonth ?? 0) + 1) break;
    }
    prevValue = value;
    prevProfit = profit;
  }

  let goalDate: string | null;
  if (calendar) {
    if (monthsToGoal === 0) goalDate = toIsoDate(asOf);
    else if (crossMonth !== null) {
      const month = grid.months[crossMonth - 1] as OracleMonth;
      const span = daysBetween(month.open, month.end);
      goalDate = toIsoDate(addDays(month.open, Math.min(span, Math.max(1, Math.ceil(crossFraction * span)))));
      let cum = 0;
      for (let j = 0; j < crossMonth - 1; j++) cum += (grid.months[j] as OracleMonth).fraction;
      monthsToGoal = round2(cum + crossFraction * month.fraction);
    } else goalDate = null;
  } else {
    goalDate = monthsToGoal === null ? null : monthsToGoal === 0 ? toIsoDate(asOf) : toIsoDate(addMonths(asOf, monthsToGoal));
  }

  // Per-farm conversion before the deadline.
  if (explicit) {
    const k = deadlineIndex;
    const frac = grid.deadlineFraction;
    for (const f of farms) {
      const batch = farmBatches.find((b) => b.farm === f);
      const closedAt = (mm: number) => batch?.closedByMonth[mm] ?? 0;
      let lotsClosed = 0;
      let notesSold = 0;
      for (let mm = 1; mm <= k; mm++) {
        const w = mm === k ? frac : 1;
        lotsClosed += w * closedAt(mm);
        notesSold += w * closedAt(mm - noteLag);
      }
      f.lotsClosedByDeadline = round2(lotsClosed);
      f.notesSoldByDeadline = round2(notesSold);
      f.tooLate = k === 0 || f.landMonth + (cashMode ? noteLag : 0) > k;
      f.unfunded = round2(f.unfunded);
      f.recycled = round2(f.recycled);
    }
  }

  const perLotForNeed = cashMode ? downPerLot + noteCashPerLot - poolTakePerLot : netProfitPerLot;
  const hitsDeadline =
    (goalDate !== null && goalDate <= goal.deadline) || (calendar && deadlineIndex > 0 && targetAtDeadline >= goal.goal);

  return {
    params,
    startNetProfit: goal.netProfitToDate,
    goal: goal.goal,
    deadline: goal.deadline,
    monthsToGoal,
    goalDate,
    hitsDeadline,
    netProfitAtDeadline: round2(netAtDeadline),
    netProfitPerLot,
    lotsNeeded: perLotForNeed > 0 ? Math.ceil(Math.max(0, goal.goal - targetStart) / perLotForNeed) : null,
    farmsBought,
    series,
    targetMode,
    targetStart: round2(targetStart),
    targetAtDeadline: round2(targetAtDeadline),
    monthsToDeadline: round2(calendar ? grid.monthsToDeadline : legacyMonthsToDeadline),
    deadlineMonthIndex: deadlineIndex,
    farms,
  };
}

/** Labeled assumption: every active farm is advertised at this daily budget. */
export const DEFAULT_AD_BUDGET_PER_FARM_PER_DAY = 250;

export type FarmStockKind = "existing" | "projected";
export type PerFarmBinding = "demand" | "inventory" | "capital";

/** A live reservation that should close on its expected date, before fall-through. */
export interface ReservedClosingSeed {
  date: string;
  lots: number;
  /** Gross-of-fall-through net at stake (conversion not applied). */
  netProfitAtStake: number;
}

/** One existing farm's on-hand lots for the per-farm selling model. */
export interface ExistingFarmSeed {
  id: string;
  name: string;
  availableLots: number;
  reservedLots: number;
  reservationsInLast90: number;
  reservedDue: ReservedClosingSeed[];
}

export interface PerFarmSellingParams {
  adBudgetPerFarmPerDay: number;
  costPerReservation: number;
  conversionPct: number;
  fallThroughPct: number;
  lotsPerFarm: number;
  farmToFirstCloseMonths: number;
  /** Purchase month indices (1-based) the cadence asked for. Unfunded if capital is short that month. */
  purchaseMonths: number[];
  farmCost: number;
  capitalAvailable: number;
  /** Extra cash on day one when notes are sold at the measured ratio. */
  noteCashNow: number;
  sellNotes: boolean;
  noteSaleRatio: number;
  downPaymentPct: number;
  avgSalePrice: number;
  investorTakePct: number;
  owedStart: number;
  startNetProfit: number;
  goal: number;
  asOf: Date;
  paceLagDays: number;
  noteLagMonths: number;
}

export interface FarmMonthStock {
  id: string;
  name: string;
  kind: FarmStockKind;
  available: number;
  reserved: number;
}

export interface PerFarmMonthPoint {
  monthIndex: number;
  date: string;
  fraction: number;
  activeFarms: number;
  reservationsPerFarm: number;
  lotsClosed: number;
  lotsClosedFromReserved: number;
  lotsClosedFromAvailable: number;
  adSpend: number;
  inventoryAvailable: number;
  inventoryReserved: number;
  inventory: number;
  farmsBought: number;
  farmsUnfunded: number;
  capitalDeployed: number;
  capitalOwed: number;
  interest: number;
  cumulativeAdSpend: number;
  cumulativeInterest: number;
  cumulativeBookedProfit: number;
  cumulativeNetProfit: number;
  binding: PerFarmBinding;
  farmInventory: FarmMonthStock[];
}

export interface FarmInventoryRow {
  id: string;
  name: string;
  kind: FarmStockKind;
  availableLots: number;
  reservedLots: number;
  arrivalMonth: number | null;
  arrivalDate: string | null;
  lastLotMonth: number | null;
  lastLotDate: string | null;
  stale90: boolean;
}

export interface PerFarmSellingResult {
  series: PerFarmMonthPoint[];
  farms: FarmInventoryRow[];
  inventoryZeroMonthIndex: number | null;
  inventoryZeroDate: string | null;
  activeFarmsToday: number;
  activeFarmsDropMonthIndex: number | null;
  activeFarmsDropDate: string | null;
  freedomDate: string | null;
  monthsToGoal: number | null;
  peakCapitalOwed: number;
  landCapitalDeployed: number;
  lotsSold: number;
  farmsBought: number;
  farmsUnfunded: number;
  unfundedCapital: number;
  totalAdSpend: number;
  interestPaid: number;
  netProfitAtDeadline: number;
  demandPerMonth: number;
  closingsPerMonth: number;
}

/**
 * Reservations one active farm receives in a 30-day month at the shared daily budget.
 * Doubling *one* farm's budget is not modeled — every active farm gets this same rate.
 */
export function reservationsPerFarmPerMonth(adBudgetPerFarmPerDay: number, costPerReservation: number): number {
  if (!(costPerReservation > 0)) return 0;
  return round2((Math.max(0, adBudgetPerFarmPerDay) * 30) / costPerReservation);
}

/** Total ad spend for a 30-day month: activeFarms × budget × 30. */
export function monthlyAdSpendForActiveFarms(activeFarms: number, adBudgetPerFarmPerDay: number): number {
  return round2(Math.max(0, activeFarms) * Math.max(0, adBudgetPerFarmPerDay) * 30);
}

function interpolateGoalDate(prevValue: number, prevDate: string, value: number, date: string, goal: number, asOf: Date): string {
  if (prevValue >= goal) return prevDate;
  if (value <= prevValue) return date;
  const frac = Math.min(1, Math.max(0, (goal - prevValue) / (value - prevValue)));
  const start = parseDate(prevDate) ?? asOf;
  const end = parseDate(date) ?? start;
  const span = Math.max(1, daysBetween(start, end));
  return toIsoDate(addDays(start, Math.min(span, Math.max(1, Math.ceil(frac * span)))));
}

interface LiveFarm {
  id: string;
  name: string;
  kind: FarmStockKind;
  available: number;
  reserved: number;
  startAvailable: number;
  startReserved: number;
  reservationsInLast90: number;
  arrivalMonth: number;
  lastLotMonth: number | null;
  pending: { month: number; lots: number }[];
  reservedDue: { month: number; lots: number; net: number }[];
}

/**
 * Per-farm selling model. Every farm with available lots is advertised at the same
 * daily budget; each receives the same reservations that month. A farm stops selling
 * and stops spending when it has no available lots. Closings are an output.
 *
 * Existing reservations close on their expected dates × (1 − fall-through).
 * New reservations close after the observed reservation→closing lag, × conversion,
 * capped at the farm's remaining lots.
 *
 * Outstanding capital is the running balance (start + purchases − returns), never a sum
 * of monthly balances. Recycled dollars that have not actually come back from closings
 * cannot fund a new farm.
 */
export function runPerFarmSellingModel(
  seeds: ExistingFarmSeed[],
  params: PerFarmSellingParams,
  grid: OracleMonthGrid,
  annualRatePct: number,
): PerFarmSellingResult {
  const conversion = Math.max(0, params.conversionPct) / 100;
  const fallThrough = Math.min(1, Math.max(0, params.fallThroughPct) / 100);
  const landLag = Math.max(0, Math.round(params.farmToFirstCloseMonths));
  const closeLag = Math.max(1, Math.round(Math.max(0, params.paceLagDays) / 30));
  const noteLag = Math.max(0, Math.round(params.noteLagMonths));
  const landPerLot = params.lotsPerFarm > 0 ? params.farmCost / params.lotsPerFarm : 0;
  const financed = params.avgSalePrice * (1 - Math.max(0, params.downPaymentPct) / 100);
  const discount = params.sellNotes ? financed * (1 - Math.min(1, Math.max(0, params.noteSaleRatio))) : 0;
  const noteCash = params.sellNotes ? financed * Math.min(1, Math.max(0, params.noteSaleRatio)) : 0;
  const netPerNewLot = round2((params.avgSalePrice - landPerLot) * (1 - params.investorTakePct / 100) - discount);
  const startInventory = round2(seeds.reduce((a, s) => a + Math.max(0, s.availableLots) + Math.max(0, s.reservedLots), 0));
  const existingReturnPerLot = startInventory > 0 ? params.owedStart / startInventory : 0;

  const farms: LiveFarm[] = seeds.map((s) => {
    const reservedDue: LiveFarm["reservedDue"] = [];
    for (const r of s.reservedDue) {
      const d = parseDate(r.date);
      const idx = !d || d <= params.asOf ? 1 : monthIndexFor(d, grid);
      if (idx === null) continue;
      reservedDue.push({ month: idx, lots: r.lots, net: r.netProfitAtStake });
    }
    const dueLots = reservedDue.reduce((a, r) => a + r.lots, 0);
    const reserved = Math.max(0, s.reservedLots);
    if (reserved > dueLots + 1e-9) {
      reservedDue.push({ month: 1, lots: reserved - dueLots, net: netPerNewLot * (reserved - dueLots) });
    }
    return {
      id: s.id,
      name: s.name,
      kind: "existing" as const,
      available: Math.max(0, s.availableLots),
      reserved: reserved,
      startAvailable: Math.max(0, s.availableLots),
      startReserved: reserved,
      reservationsInLast90: s.reservationsInLast90,
      arrivalMonth: 1,
      lastLotMonth: null,
      pending: [],
      reservedDue,
    };
  });

  const wanted = params.purchaseMonths.filter((m) => m >= 1 && m <= ORACLE_HORIZON_MONTHS).slice(0, 40);
  const wantedSet = new Map<number, number>();
  for (const m of wanted) wantedSet.set(m, (wantedSet.get(m) ?? 0) + 1);

  let nextProjected = 1;
  let freeCapital = Math.max(0, params.capitalAvailable) + (params.sellNotes ? Math.max(0, params.noteCashNow) : 0);
  let owed = Math.max(0, params.owedStart);
  let existingOwed = Math.max(0, params.owedStart);
  let landDeployed = 0;
  let peakOwed = owed;
  let profit = params.startNetProfit;
  let cumAds = 0;
  let cumInterest = 0;
  let lotsSold = 0;
  let farmsBought = 0;
  let farmsUnfunded = 0;
  let unfundedCapital = 0;
  const pendingNoteCash: number[] = [];
  const series: PerFarmMonthPoint[] = [];
  const rate = Math.max(0, annualRatePct) / 100;

  let freedomDate: string | null = params.startNetProfit >= params.goal ? toIsoDate(params.asOf) : null;
  let monthsToGoal: number | null = params.startNetProfit >= params.goal ? 0 : null;
  let prevNet = params.startNetProfit;
  let prevDate = toIsoDate(params.asOf);
  let inventoryZeroMonth: number | null = startInventory <= 0 ? 0 : null;
  let inventoryZeroDate: string | null = startInventory <= 0 ? toIsoDate(params.asOf) : null;
  const activeToday = farms.filter((f) => f.available > 1e-9).length;
  let activeDropMonth: number | null = null;
  let activeDropDate: string | null = null;
  const k = grid.deadlineIndex;

  const snapshot = (): FarmMonthStock[] =>
    farms.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      available: round2(Math.max(0, f.available)),
      reserved: round2(Math.max(0, f.reserved)),
    }));

  const inventoryOf = (list: LiveFarm[]) => {
    let available = 0;
    let reserved = 0;
    for (const f of list) {
      available += Math.max(0, f.available);
      reserved += Math.max(0, f.reserved);
    }
    return { available, reserved, total: available + reserved };
  };

  for (let m = 1; m <= ORACLE_HORIZON_MONTHS; m++) {
    const month = grid.months[m - 1];
    if (!month) break;
    const fraction = month.fraction;
    const date = toIsoDate(month.end);
    let boughtNow = 0;
    let unfundedNow = 0;
    let capitalNow = 0;

    const dueBuys = freedomDate !== null ? 0 : (wantedSet.get(m) ?? 0);
    for (let i = 0; i < dueBuys; i++) {
      if (params.farmCost > 0 && freeCapital + 1e-6 >= params.farmCost) {
        freeCapital -= params.farmCost;
        owed += params.farmCost;
        landDeployed += params.farmCost;
        boughtNow += 1;
        farmsBought += 1;
        const id = `projected-${nextProjected}`;
        const name = `Projected farm ${nextProjected}`;
        nextProjected += 1;
        farms.push({
          id,
          name,
          kind: "projected",
          available: 0,
          reserved: 0,
          startAvailable: params.lotsPerFarm,
          startReserved: 0,
          reservationsInLast90: 0,
          arrivalMonth: m + landLag,
          lastLotMonth: null,
          pending: [],
          reservedDue: [],
        });
        peakOwed = Math.max(peakOwed, owed);
      } else {
        unfundedNow += 1;
        farmsUnfunded += 1;
        unfundedCapital += params.farmCost;
      }
    }

    for (const f of farms) {
      if (f.kind === "projected" && f.arrivalMonth === m && f.available <= 0 && f.startAvailable > 0 && f.reserved <= 0 && f.pending.length === 0) {
        f.available += f.startAvailable;
      }
    }

    const arrived = farms.filter((f) => m >= f.arrivalMonth);
    const active = arrived.filter((f) => f.available > 1e-9);
    const resPerFarm = reservationsPerFarmPerMonth(params.adBudgetPerFarmPerDay, params.costPerReservation) * fraction;
    const ads = round2(monthlyAdSpendForActiveFarms(active.length, params.adBudgetPerFarmPerDay) * fraction);
    cumAds += ads;

    let closedReserved = 0;
    let closedAvailable = 0;
    let monthProfit = 0;

    for (const f of arrived) {
      const due = f.reservedDue.filter((r) => r.month === m);
      for (const r of due) {
        const close = r.lots * (1 - fallThrough);
        const cancel = r.lots * fallThrough;
        const take = Math.min(f.reserved, r.lots);
        f.reserved = Math.max(0, f.reserved - take);
        f.available += cancel * (take / (r.lots || 1));
        const closed = close * (take / (r.lots || 1));
        closedReserved += closed;
        monthProfit += r.net * (1 - fallThrough) * (take / (r.lots || 1));
        if (f.kind === "existing") {
          const ret = Math.min(existingOwed, closed * existingReturnPerLot);
          existingOwed -= ret;
          owed -= ret;
        }
      }

      const pendingNow = f.pending.filter((p) => p.month === m);
      f.pending = f.pending.filter((p) => p.month !== m);
      for (const p of pendingNow) {
        const close = Math.min(f.reserved, p.lots * conversion);
        const cancel = Math.min(f.reserved - close, p.lots - close);
        f.reserved = Math.max(0, f.reserved - close - cancel);
        f.available += Math.max(0, cancel);
        closedAvailable += close;
        monthProfit += close * netPerNewLot;
        if (f.kind === "existing") {
          const ret = Math.min(existingOwed, close * existingReturnPerLot);
          existingOwed -= ret;
          owed -= ret;
        } else {
          const ret = close * landPerLot;
          owed -= ret;
          freeCapital += ret;
        }
        if (noteCash > 0 && close > 0) {
          pendingNoteCash[m + noteLag] = (pendingNoteCash[m + noteLag] ?? 0) + close * noteCash;
        }
      }
    }

    for (const f of active) {
      const want = resPerFarm;
      const take = Math.min(want, f.available);
      if (take <= 1e-12) continue;
      f.available -= take;
      f.reserved += take;
      f.pending.push({ month: m + closeLag, lots: take });
    }

    const noteIn = pendingNoteCash[m] ?? 0;
    freeCapital += noteIn;

    profit += monthProfit;
    owed = Math.max(0, owed);
    peakOwed = Math.max(peakOwed, owed);
    const interest = round2(Math.max(0, owed) * rate / 12);
    cumInterest += interest;

    const inv = inventoryOf(farms);
    const closed = closedReserved + closedAvailable;
    if (m <= k) lotsSold += closed * (m === k ? grid.deadlineFraction : 1);
    const netAfter = round2(profit - cumAds);
    if (freedomDate === null && netAfter >= params.goal) {
      freedomDate = interpolateGoalDate(prevNet, prevDate, netAfter, date, params.goal, params.asOf);
      monthsToGoal = round2(monthsBetween(params.asOf, parseDate(freedomDate) ?? params.asOf));
    }

    if (inventoryZeroMonth === null && inv.total <= 1e-6) {
      inventoryZeroMonth = m;
      inventoryZeroDate = date;
    }

    const activeNow = arrived.filter((f) => f.available > 1e-9).length;
    if (activeDropMonth === null && m > 1 && activeNow < activeToday) {
      activeDropMonth = m;
      activeDropDate = date;
    }

    for (const f of farms) {
      if (f.lastLotMonth === null && m >= f.arrivalMonth && f.available <= 1e-9 && f.reserved <= 1e-9) {
        f.lastLotMonth = m;
      }
    }

    let binding: PerFarmBinding = "demand";
    if (unfundedNow > 0) binding = "capital";
    else if (resPerFarm > 1e-9 && active.length === 0 && inv.total <= 1e-6) binding = "inventory";
    else if (resPerFarm > 1e-9 && active.some((f) => f.available <= 1e-9) && inv.available <= 1e-6) binding = "inventory";
    else if (closed + 1e-9 < active.length * resPerFarm * conversion && inv.available <= 1e-6) binding = "inventory";

    series.push({
      monthIndex: m,
      date,
      fraction,
      activeFarms: active.length,
      reservationsPerFarm: round2(resPerFarm),
      lotsClosed: round2(closed),
      lotsClosedFromReserved: round2(closedReserved),
      lotsClosedFromAvailable: round2(closedAvailable),
      adSpend: ads,
      inventoryAvailable: round2(inv.available),
      inventoryReserved: round2(inv.reserved),
      inventory: round2(inv.total),
      farmsBought: boughtNow,
      farmsUnfunded: unfundedNow,
      capitalDeployed: round2(capitalNow + (boughtNow > 0 ? boughtNow * params.farmCost : 0)),
      capitalOwed: round2(owed),
      interest,
      cumulativeAdSpend: round2(cumAds),
      cumulativeInterest: round2(cumInterest),
      cumulativeBookedProfit: round2(profit),
      cumulativeNetProfit: netAfter,
      binding,
      farmInventory: snapshot(),
    });
    prevNet = netAfter;
    prevDate = date;
    capitalNow = 0;
  }

  const deadlinePoint = series.find((s) => s.monthIndex === k) ?? series[series.length - 1];
  const demand = reservationsPerFarmPerMonth(params.adBudgetPerFarmPerDay, params.costPerReservation) * conversion;

  const rows: FarmInventoryRow[] = farms.map((f) => {
    const arrival = f.kind === "projected" ? (grid.months[f.arrivalMonth - 1] ?? null) : null;
    const last = f.lastLotMonth !== null ? (grid.months[f.lastLotMonth - 1] ?? null) : null;
    return {
      id: f.id,
      name: f.name,
      kind: f.kind,
      availableLots: round2(f.startAvailable),
      reservedLots: round2(f.startReserved),
      arrivalMonth: f.kind === "projected" ? f.arrivalMonth : null,
      arrivalDate: arrival ? toIsoDate(arrival.end) : null,
      lastLotMonth: f.lastLotMonth,
      lastLotDate: last ? toIsoDate(last.end) : null,
      stale90: f.kind === "existing" && f.reservationsInLast90 <= 0 && f.startAvailable + f.startReserved > 0,
    };
  });

  return {
    series,
    farms: rows,
    inventoryZeroMonthIndex: inventoryZeroMonth,
    inventoryZeroDate,
    activeFarmsToday: activeToday,
    activeFarmsDropMonthIndex: activeDropMonth,
    activeFarmsDropDate: activeDropDate,
    freedomDate,
    monthsToGoal,
    peakCapitalOwed: round2(peakOwed),
    landCapitalDeployed: round2(landDeployed),
    lotsSold: round2(lotsSold),
    farmsBought,
    farmsUnfunded,
    unfundedCapital: round2(unfundedCapital),
    totalAdSpend: deadlinePoint?.cumulativeAdSpend ?? round2(cumAds),
    interestPaid: deadlinePoint?.cumulativeInterest ?? round2(cumInterest),
    netProfitAtDeadline: deadlinePoint?.cumulativeNetProfit ?? round2(params.startNetProfit),
    demandPerMonth: round2(demand * Math.max(1, activeToday)),
    closingsPerMonth: k > 0 ? round2(lotsSold / Math.max(1, grid.monthsToDeadline)) : 0,
  };
}
