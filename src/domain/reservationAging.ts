/**
 * Parked money — live reservations bucketed by days waiting, per farm.
 * Days gained if closed this month use today's oxygen pace, not the reservation-day pace.
 */

import type { Expected, ExpectedLot } from "./expected";
import type { FarmEconomics } from "./farm";
import type { Oxygen } from "./oxygen";
import { addDays, parseDate, toIsoDate } from "./dates";
import { round2, sum } from "./math";

export const AGING_STUCK_AFTER_DAYS = 90;

export type AgingBucketId = "0-30" | "31-60" | "61-90" | "90+";

export const AGING_BUCKETS: readonly AgingBucketId[] = ["0-30", "31-60", "61-90", "90+"];

export interface AgingLot {
  propertyId: string;
  farmId: string;
  farmName: string;
  lotName: string;
  lotNumber: string | null;
  reservationDate: string;
  daysWaiting: number;
  bucket: AgingBucketId;
  salePrice: number | null;
  expectedNetProfit: number;
  netProfitAtStake: number;
  /** Days the goal date moves if this reservation closes at today's oxygen pace. */
  daysIfClosedThisMonth: number;
  /** Null when the buyer is a test client or unknown. */
  buyerName: string | null;
  buyerIsTestClient: boolean;
}

export interface FarmAging {
  farmId: string;
  farmName: string;
  reserved: number;
  sold: number;
  available: number;
  totalLots: number;
  /** Every lot is reserved and none have closed. */
  fullyReservedUnsold: boolean;
  counts: Record<AgingBucketId, number>;
  salePrice: number;
  expectedNetProfit: number;
  daysIfClosedThisMonth: number;
}

export interface ScoreTask {
  title: string;
  description: string;
  due_date: string;
}

export interface ReservationAging {
  asOf: string;
  lots: AgingLot[];
  farms: FarmAging[];
  counts: Record<AgingBucketId, number>;
  salePriceByBucket: Record<AgingBucketId, number>;
  expectedNetByBucket: Record<AgingBucketId, number>;
  stuck: AgingLot[];
  stuckCount: number;
  stuckSalePrice: number;
  stuckExpectedNet: number;
  fullyReservedUnsold: FarmAging[];
}

export function agingBucket(daysWaiting: number): AgingBucketId {
  if (daysWaiting <= 30) return "0-30";
  if (daysWaiting <= 60) return "31-60";
  if (daysWaiting < 90) return "61-90";
  return "90+";
}

function emptyCounts(): Record<AgingBucketId, number> {
  return { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
}

function emptyMoney(): Record<AgingBucketId, number> {
  return { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
}

function daysIfClosedThisMonth(netProfitAtStake: number, pace: number | null): number {
  if (pace === null || pace <= 0) return 0;
  return Math.round(netProfitAtStake / pace);
}

function moneyEs(n: number): string {
  return n.toLocaleString("es-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * One Score task per reservation in the 90+ bucket. Description is always Spanish.
 * Does not call any API — the caller downloads the JSON.
 */
export function buildScoreTasks(stuck: AgingLot[], asOf: Date): ScoreTask[] {
  return stuck.map((lot) => {
    const reserved = parseDate(lot.reservationDate);
    const due = reserved ? toIsoDate(addDays(reserved, AGING_STUCK_AFTER_DAYS)) : toIsoDate(asOf);
    const buyer = lot.buyerName ? ` Cliente: ${lot.buyerName}.` : "";
    return {
      title: `Cerrar reserva — ${lot.lotName}`,
      description: `La reserva de ${lot.lotName} en ${lot.farmName} lleva ${lot.daysWaiting} días. Precio de venta ${moneyEs(lot.salePrice ?? 0)}. Utilidad neta esperada ${moneyEs(lot.expectedNetProfit)}. Si cierra este mes, ${lot.daysIfClosedThisMonth} días ganados hacia la meta.${buyer}`,
      due_date: due,
    };
  });
}

function toAgingLot(e: ExpectedLot, pace: number | null): AgingLot {
  return {
    propertyId: e.propertyId,
    farmId: e.farmId,
    farmName: e.farmName,
    lotName: e.lotName,
    lotNumber: e.lotNumber,
    reservationDate: e.reservationDate,
    daysWaiting: e.daysWaiting,
    bucket: agingBucket(e.daysWaiting),
    salePrice: null,
    expectedNetProfit: e.expectedNetProfit,
    netProfitAtStake: e.netProfitAtStake,
    daysIfClosedThisMonth: daysIfClosedThisMonth(e.netProfitAtStake, pace),
    buyerName: e.buyerIsTestClient ? null : e.buyerName,
    buyerIsTestClient: e.buyerIsTestClient,
  };
}

export function computeReservationAging(farms: FarmEconomics[], expected: Expected, oxygen: Oxygen, asOf: Date): ReservationAging {
  const pace = oxygen.netProfitPerDayAtPace;
  const saleById = new Map<string, number | null>();
  for (const farm of farms) {
    for (const lot of farm.lots) saleById.set(lot.propertyId, lot.salePrice);
  }

  const lots = expected.lots.map((e) => {
    const row = toAgingLot(e, pace);
    row.salePrice = saleById.get(e.propertyId) ?? null;
    return row;
  });
  lots.sort((a, b) => b.daysWaiting - a.daysWaiting || a.farmName.localeCompare(b.farmName) || a.lotName.localeCompare(b.lotName));

  const counts = emptyCounts();
  const salePriceByBucket = emptyMoney();
  const expectedNetByBucket = emptyMoney();
  for (const lot of lots) {
    counts[lot.bucket] += 1;
    salePriceByBucket[lot.bucket] = round2(salePriceByBucket[lot.bucket] + (lot.salePrice ?? 0));
    expectedNetByBucket[lot.bucket] = round2(expectedNetByBucket[lot.bucket] + lot.expectedNetProfit);
  }

  const byFarm = new Map<string, AgingLot[]>();
  for (const lot of lots) {
    const list = byFarm.get(lot.farmId) ?? [];
    list.push(lot);
    byFarm.set(lot.farmId, list);
  }

  const farmRows: FarmAging[] = farms.map((farm) => {
    const reservedLots = byFarm.get(farm.farmId) ?? [];
    const farmCounts = emptyCounts();
    for (const lot of reservedLots) farmCounts[lot.bucket] += 1;
    const reserved = farm.stages.reserved;
    const sold = farm.soldLots;
    const available = farm.stages.available;
    return {
      farmId: farm.farmId,
      farmName: farm.name,
      reserved,
      sold,
      available,
      totalLots: farm.totalLots,
      fullyReservedUnsold: reserved > 0 && sold === 0 && available === 0 && reserved === farm.totalLots,
      counts: farmCounts,
      salePrice: round2(sum(reservedLots.map((l) => l.salePrice))),
      expectedNetProfit: round2(sum(reservedLots.map((l) => l.expectedNetProfit))),
      daysIfClosedThisMonth: reservedLots.reduce((s, l) => s + l.daysIfClosedThisMonth, 0),
    };
  });
  farmRows.sort((a, b) => Number(b.fullyReservedUnsold) - Number(a.fullyReservedUnsold) || b.counts["90+"] - a.counts["90+"] || a.farmName.localeCompare(b.farmName));

  const stuck = lots.filter((l) => l.bucket === "90+");
  return {
    asOf: toIsoDate(asOf),
    lots,
    farms: farmRows,
    counts,
    salePriceByBucket,
    expectedNetByBucket,
    stuck,
    stuckCount: stuck.length,
    stuckSalePrice: round2(sum(stuck.map((l) => l.salePrice))),
    stuckExpectedNet: round2(sum(stuck.map((l) => l.expectedNetProfit))),
    fullyReservedUnsold: farmRows.filter((f) => f.fullyReservedUnsold),
  };
}
