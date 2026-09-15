/**
 * Farm scorecard — one row per subdivided farm from FarmEconomics + lot dates.
 * Grades A–D from net profit per sold lot and funding→closing velocity.
 * See AUDIT.md §7 for the grading rule.
 */

import type { FarmEconomics } from "./farm";
import { isSold } from "./lot";
import { addDays, daysBetween, parseDate, toIsoDate } from "./dates";
import { median, round2 } from "./math";

/** A farm with no reservation dated in this many days is flagged stale. */
export const SCORECARD_STALE_AFTER_DAYS = 90;

export const SCORECARD_NET_A = 70_000;
export const SCORECARD_NET_B = 55_000;
export const SCORECARD_NET_C = 40_000;
export const SCORECARD_VEL_A = 60;
export const SCORECARD_VEL_B = 120;
export const SCORECARD_VEL_C = 180;

export type ScorecardGrade = "A" | "B" | "C" | "D";
export type SponsorTakeKind = "profit_share" | "interest" | "own_capital";

export interface FarmScorecardRow {
  farmId: string;
  name: string;
  landCostPerLot: number;
  avgSalePrice: number | null;
  netProfitPerSoldLot: number | null;
  netOverLandCost: number | null;
  soldLots: number;
  reservedLots: number;
  availableLots: number;
  totalLots: number;
  sellThroughPct: number;
  /** Median calendar days from farm funding (or farm closing) to each sold lot's close. */
  medianDaysFundingToClose: number | null;
  lastReservationDate: string | null;
  daysSinceLastReservation: number | null;
  reservationsInLast90: number;
  stale: boolean;
  dealType: string | null;
  sponsorTakeKind: SponsorTakeKind;
  profitSharePct: number | null;
  annualRatePct: number;
  sponsorTakePerSoldLot: number | null;
  grade: ScorecardGrade | null;
  netPoints: number | null;
  velocityPoints: number | null;
}

export interface FarmScorecard {
  asOf: string;
  staleAfterDays: number;
  rows: FarmScorecardRow[];
  staleCount: number;
  gradedCount: number;
  gradeACount: number;
  /** Graded farms to buy more like — every A, else the highest grade present. */
  buyLike: FarmScorecardRow[];
}

export function netPoints(netPerSoldLot: number): 1 | 2 | 3 | 4 {
  if (netPerSoldLot >= SCORECARD_NET_A) return 4;
  if (netPerSoldLot >= SCORECARD_NET_B) return 3;
  if (netPerSoldLot >= SCORECARD_NET_C) return 2;
  return 1;
}

export function velocityPoints(medianDays: number | null): 1 | 2 | 3 | 4 {
  if (medianDays === null) return 1;
  if (medianDays <= SCORECARD_VEL_A) return 4;
  if (medianDays <= SCORECARD_VEL_B) return 3;
  if (medianDays <= SCORECARD_VEL_C) return 2;
  return 1;
}

/** Half-up on .5 (JS Math.round for positives). 4 → A … 1 → D. */
export function letterFromAverage(netPts: number, velPts: number): ScorecardGrade {
  const rounded = Math.round((netPts + velPts) / 2);
  if (rounded >= 4) return "A";
  if (rounded >= 3) return "B";
  if (rounded >= 2) return "C";
  return "D";
}

export function gradeFarm(netPerSoldLot: number | null, medianDays: number | null, soldLots: number): {
  grade: ScorecardGrade | null;
  netPoints: number | null;
  velocityPoints: number | null;
} {
  if (soldLots < 1 || netPerSoldLot === null) return { grade: null, netPoints: null, velocityPoints: null };
  const np = netPoints(netPerSoldLot);
  const vp = velocityPoints(medianDays);
  return { grade: letterFromAverage(np, vp), netPoints: np, velocityPoints: vp };
}

function sponsorTakeKind(dealType: string | null): SponsorTakeKind {
  if (dealType === "profit_share") return "profit_share";
  if (dealType === "own_capital") return "own_capital";
  return "interest";
}

function daysFundingToClose(farm: FarmEconomics, closeDate: string | null): number | null {
  if (!closeDate) return null;
  const funding = parseDate(farm.fundingDate) ?? parseDate(farm.closingDate);
  const close = parseDate(closeDate);
  if (!funding || !close) return null;
  const d = daysBetween(funding, close);
  return d >= 0 ? d : null;
}

function lastReservationIso(farm: FarmEconomics): string | null {
  const dates: string[] = [];
  for (const lot of farm.lots) {
    if (lot.reservationDate) dates.push(lot.reservationDate);
    for (const c of lot.cancellations) {
      if (c.reservationDate) dates.push(c.reservationDate);
    }
  }
  dates.sort();
  return dates.at(-1) ?? null;
}

function reservationsInWindow(farm: FarmEconomics, from: Date, to: Date): number {
  let n = 0;
  const count = (iso: string | null) => {
    const d = parseDate(iso);
    if (d && d > from && d <= to) n += 1;
  };
  for (const lot of farm.lots) {
    count(lot.reservationDate);
    for (const c of lot.cancellations) count(c.reservationDate);
  }
  return n;
}

export function scorecardRow(farm: FarmEconomics, asOf: Date): FarmScorecardRow {
  const soldLots = farm.soldLots;
  const reservedLots = farm.stages.reserved;
  const availableLots = farm.stages.available;
  const avgSalePrice = soldLots > 0 ? round2(farm.revenue / soldLots) : null;
  const netProfitPerSoldLot = soldLots > 0 ? round2(farm.netProfit / soldLots) : null;
  const netOverLandCost =
    netProfitPerSoldLot !== null && farm.landCostPerLot > 0 ? round2(netProfitPerSoldLot / farm.landCostPerLot) : null;
  const durations = farm.lots.filter(isSold).map((l) => daysFundingToClose(farm, l.closeDate)).filter((d): d is number => d !== null);
  const medianDaysFundingToClose = median(durations);
  const lastReservationDate = lastReservationIso(farm);
  const lastRes = parseDate(lastReservationDate);
  const daysSinceLastReservation = lastRes ? daysBetween(lastRes, asOf) : null;
  const cutoff = addDays(asOf, -SCORECARD_STALE_AFTER_DAYS);
  const inLast90 = reservationsInWindow(farm, cutoff, asOf);
  const graded = gradeFarm(netProfitPerSoldLot, medianDaysFundingToClose, soldLots);
  const takePer = soldLots > 0 ? round2(farm.investorTake / soldLots) : null;
  return {
    farmId: farm.farmId,
    name: farm.name,
    landCostPerLot: farm.landCostPerLot,
    avgSalePrice,
    netProfitPerSoldLot,
    netOverLandCost,
    soldLots,
    reservedLots,
    availableLots,
    totalLots: farm.totalLots,
    sellThroughPct: farm.pctClosed,
    medianDaysFundingToClose,
    lastReservationDate,
    daysSinceLastReservation,
    reservationsInLast90: inLast90,
    stale: inLast90 === 0,
    dealType: farm.dealType,
    sponsorTakeKind: sponsorTakeKind(farm.dealType),
    profitSharePct: farm.profitSharePct,
    annualRatePct: farm.annualRatePct,
    sponsorTakePerSoldLot: takePer,
    grade: graded.grade,
    netPoints: graded.netPoints,
    velocityPoints: graded.velocityPoints,
  };
}

const GRADE_RANK: Record<ScorecardGrade, number> = { A: 4, B: 3, C: 2, D: 1 };

function buyLikeRows(rows: FarmScorecardRow[]): FarmScorecardRow[] {
  const graded = rows.filter((r) => r.grade !== null);
  if (graded.length === 0) return [];
  const a = graded.filter((r) => r.grade === "A");
  if (a.length > 0) return a.sort((x, y) => (y.netProfitPerSoldLot ?? 0) - (x.netProfitPerSoldLot ?? 0) || x.name.localeCompare(y.name));
  const best = Math.max(...graded.map((r) => GRADE_RANK[r.grade as ScorecardGrade]));
  return graded
    .filter((r) => GRADE_RANK[r.grade as ScorecardGrade] === best)
    .sort((x, y) => (y.netProfitPerSoldLot ?? 0) - (x.netProfitPerSoldLot ?? 0) || x.name.localeCompare(y.name));
}

export function computeFarmScorecard(farms: FarmEconomics[], asOf: Date): FarmScorecard {
  const rows = farms.map((f) => scorecardRow(f, asOf)).sort((a, b) => {
    const ga = a.grade ? GRADE_RANK[a.grade] : 0;
    const gb = b.grade ? GRADE_RANK[b.grade] : 0;
    return gb - ga || (b.netProfitPerSoldLot ?? -1) - (a.netProfitPerSoldLot ?? -1) || a.name.localeCompare(b.name);
  });
  return {
    asOf: toIsoDate(asOf),
    staleAfterDays: SCORECARD_STALE_AFTER_DAYS,
    rows,
    staleCount: rows.filter((r) => r.stale).length,
    gradedCount: rows.filter((r) => r.grade !== null).length,
    gradeACount: rows.filter((r) => r.grade === "A").length,
    buyLike: buyLikeRows(rows),
  };
}
