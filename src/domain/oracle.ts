import type { FarmEconomics } from "./farm";
import type { GoalStatus } from "./goal";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import { addMonths, monthsBetween, parseDate, toIsoDate } from "./dates";
import { mean, round2 } from "./math";

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
}

export interface OraclePoint {
  monthIndex: number;
  date: string;
  lotsClosed: number;
  inventory: number;
  cumulativeNetProfit: number;
  cumulativeCash: number;
}

export interface OracleResult {
  params: OracleParams;
  startNetProfit: number;
  goal: number;
  deadline: string;
  /** Month index at which the goal is met, or null if not within the horizon. */
  monthsToGoal: number | null;
  goalDate: string | null;
  hitsDeadline: boolean;
  netProfitAtDeadline: number;
  netProfitPerLot: number;
  lotsNeeded: number | null;
  farmsBought: number;
  series: OraclePoint[];
}

export const ORACLE_HORIZON_MONTHS = 120;

/** Real trailing averages the sliders start from. */
export function deriveOracleDefaults(lots: Lot[], farms: FarmEconomics[], goal: GoalStatus): OracleParams {
  const sold = lots.filter(isSold);
  const avgSalePrice = mean(sold.map((l) => l.salePrice ?? 0).filter((n) => n > 0)) ?? 0;
  const avgLandCost = mean(sold.map((l) => l.landCost)) ?? mean(farms.map((f) => f.landCostPerLot)) ?? 0;

  const noteDelays = sold
    .filter((l) => l.noteSaleDate && l.closeDate)
    .map((l) => monthsBetween(parseDate(l.closeDate) as Date, parseDate(l.noteSaleDate) as Date))
    .filter((m) => m >= 0);
  const avgMonthsToSellNote = mean(noteDelays) ?? 3;

  const fundingDates = farms
    .map((f) => parseDate(f.fundingDate) ?? parseDate(f.closingDate))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < fundingDates.length; i++) {
    gaps.push(monthsBetween(fundingDates[i - 1] as Date, fundingDates[i] as Date));
  }
  const newFarmEveryMonths = mean(gaps) ?? 3;

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
    newFarmEveryMonths: round2(newFarmEveryMonths),
    avgLotsPerFarm: round2(goal.avgLotsPerFarm ?? mean(farms.map((f) => f.totalLots)) ?? 10),
    investorTakePct: round2(investorTakePct),
    downPaymentPct: round2(downPaymentPct),
    noteSalePct: round2(noteSalePct),
  };
}

/**
 * Month-by-month simulation. Inventory starts at available + reserved lots;
 * every `newFarmEveryMonths` a farm of `avgLotsPerFarm` lots is added. Each lot
 * closed recognizes (price − land) × (1 − take) as net profit; cash arrives as
 * the down payment now and the note sale `avgMonthsToSellNote` later.
 */
export function runOracle(params: OracleParams, goal: GoalStatus, startInventory: number, asOf: Date): OracleResult {
  const deadline = parseDate(goal.deadline) ?? asOf;
  const monthsToDeadline = Math.max(0, monthsBetween(asOf, deadline));
  const grossPerLot = params.avgSalePrice - params.avgLandCost;
  const netProfitPerLot = round2(grossPerLot * (1 - params.investorTakePct / 100));
  const downPerLot = params.avgSalePrice * (params.downPaymentPct / 100);
  const noteCashPerLot = (params.avgSalePrice - downPerLot) * (params.noteSalePct / 100);
  const noteLag = Math.max(0, Math.round(params.avgMonthsToSellNote));

  const series: OraclePoint[] = [];
  let inventory = startInventory;
  let profit = goal.netProfitToDate;
  let cash = goal.cashRealized;
  let farmsBought = 0;
  let monthsToGoal: number | null = profit >= goal.goal ? 0 : null;
  let netAtDeadline = profit;
  const pendingNoteCash: number[] = [];
  const farmEvery = params.newFarmEveryMonths > 0 ? params.newFarmEveryMonths : Infinity;
  let nextFarmAt = farmEvery;

  for (let m = 1; m <= ORACLE_HORIZON_MONTHS; m++) {
    while (m >= nextFarmAt && Number.isFinite(nextFarmAt)) {
      inventory += params.avgLotsPerFarm;
      farmsBought += 1;
      nextFarmAt += farmEvery;
    }
    const closed = Math.min(Math.max(0, params.lotsPerMonth), inventory);
    inventory -= closed;
    profit += closed * netProfitPerLot;
    cash += closed * downPerLot;
    pendingNoteCash[m + noteLag] = (pendingNoteCash[m + noteLag] ?? 0) + closed * noteCashPerLot;
    cash += pendingNoteCash[m] ?? 0;

    const date = toIsoDate(addMonths(asOf, m));
    series.push({
      monthIndex: m,
      date,
      lotsClosed: round2(closed),
      inventory: round2(inventory),
      cumulativeNetProfit: round2(profit),
      cumulativeCash: round2(cash),
    });
    if (monthsToGoal === null && profit >= goal.goal) monthsToGoal = m;
    if (m <= monthsToDeadline) netAtDeadline = profit;
    if (monthsToGoal !== null && m > monthsToDeadline + 1 && m >= monthsToGoal + 1) break;
  }

  const goalDate = monthsToGoal === null ? null : monthsToGoal === 0 ? toIsoDate(asOf) : toIsoDate(addMonths(asOf, monthsToGoal));
  return {
    params,
    startNetProfit: goal.netProfitToDate,
    goal: goal.goal,
    deadline: goal.deadline,
    monthsToGoal,
    goalDate,
    hitsDeadline: goalDate !== null && goalDate <= goal.deadline,
    netProfitAtDeadline: round2(netAtDeadline),
    netProfitPerLot,
    lotsNeeded: netProfitPerLot > 0 ? Math.ceil(Math.max(0, goal.goal - goal.netProfitToDate) / netProfitPerLot) : null,
    farmsBought,
    series,
  };
}
