import { describe, expect, it } from "vitest";
import { buildVerdict, computeGoal, farmsStillNeededWithTurns, trailingClosedLots } from "../goal";
import type { Lot } from "../lot";
import type { FarmEconomics } from "../farm";
import { ASOF } from "./builders";

function lot(over: Partial<Lot>): Lot {
  return {
    propertyId: Math.random().toString(36).slice(2),
    farmId: "f",
    farmName: "Testland",
    farmDealType: "own_capital",
    investorId: null,
    investorName: null,
    lotNumber: "1",
    name: "Testland — Lot 1",
    acres: 10,
    stage: "available",
    priceSource: null,
    dealType: null,
    landCost: 50_000,
    salePrice: null,
    downPayment: null,
    fileCaseSalePrice: null,
    fileCaseDownPayment: null,
    noteOriginalAmount: null,
    noteDownPayment: null,
    grossProfit: null,
    investorTake: 0,
    netProfit: null,
    cashRealized: 0,
    fileCaseId: null,
    fileCaseStatus: null,
    clientId: null,
    buyerName: null,
    buyerIsTestClient: false,
    reservationDate: null,
    cancelledFileCases: 0,
    cancellations: [],
    cancelledReservationDate: null,
    closeDate: null,
    estimatedClosingDate: null,
    daysInPipeline: null,
    currentStageName: null,
    currentStageNumber: null,
    progressPct: null,
    hasBlockedStages: false,
    hasOverdueStages: false,
    fileCaseUpdatedAt: null,
    noteId: null,
    noteCode: null,
    noteFinancedAmount: null,
    noteStartDate: null,
    noteIsSold: false,
    noteSaleId: null,
    noteSalePrice: null,
    noteSaleDate: null,
    noteBuyerName: null,
    ...over,
  };
}

const closed = (netProfit: number, closeDate: string, cash = 0): Lot =>
  lot({ stage: "closed", salePrice: 50_000 + netProfit, grossProfit: netProfit, netProfit, closeDate, cashRealized: cash });

const farms = [{ totalLots: 10, capitalOutstanding: 100_000 }, { totalLots: 20, capitalOutstanding: 0 }] as FarmEconomics[];

describe("trailingClosedLots", () => {
  it("keeps only sold lots with a close date inside the window", () => {
    const lots = [closed(1, "2026-09-01"), closed(1, "2026-06-01"), closed(1, "2026-09-11"), lot({ stage: "reserved" }), lot({ stage: "closed", closeDate: null })];
    expect(trailingClosedLots(lots, ASOF, 90)).toHaveLength(2);
  });
});

describe("computeGoal", () => {
  it("handles an empty realm without dividing by zero", () => {
    const g = computeGoal([], [], ASOF);
    expect(g.netProfitToDate).toBe(0);
    expect(g.remaining).toBe(10_000_000);
    expect(g.avgNetProfitPerClosedLot).toBeNull();
    expect(g.lotsStillNeeded).toBeNull();
    expect(g.projectedDate).toBeNull();
    expect(g.onTrack).toBeNull();
    expect(buildVerdict(g)).toMatch(/No closed lots/);
  });

  it("sums net profit to date and pipeline separately", () => {
    const lots = [closed(100_000, "2026-08-01"), closed(50_000, "2026-08-15"), lot({ stage: "reserved", grossProfit: 40_000, investorTake: 10_000 }), lot({ stage: "available" })];
    const g = computeGoal(lots, farms, ASOF);
    expect(g.netProfitToDate).toBe(150_000);
    expect(g.netProfitInPipeline).toBe(30_000);
    expect(g.remaining).toBe(9_850_000);
    expect(g.pctComplete).toBe(1.5);
    expect(g.closedLots).toBe(2);
    expect(g.reservedLots).toBe(1);
    expect(g.availableLots).toBe(1);
    expect(g.capitalOutstanding).toBe(100_000);
  });

  it("derives pace, lots still needed, projection and inventory gap", () => {
    const lots = [
      closed(100_000, "2026-08-01"),
      closed(100_000, "2026-08-15"),
      closed(100_000, "2026-09-01"),
      closed(100_000, "2026-01-01"), // outside the window, still counts toward totals
      lot({ stage: "available" }),
      lot({ stage: "available" }),
    ];
    const g = computeGoal(lots, farms, ASOF, { goal: 1_000_000, deadline: "2027-09-11" });
    expect(g.closedLotsTrailing).toBe(3);
    expect(g.closedLotsPerMonth).toBe(1.01); // 3 / (90 / 30.4375)
    expect(g.avgNetProfitPerClosedLot).toBe(100_000);
    expect(g.lotsStillNeeded).toBe(6);
    expect(g.monthsAtCurrentPace).toBe(5.94);
    expect(g.projectedDate).toBe("2027-03-12");
    expect(g.requiredLotsPerMonthToHitDeadline).toBe(0.5);
    expect(g.inventoryGap).toBe(4);
    expect(g.avgLotsPerFarm).toBe(15);
    expect(g.farmsStillNeeded).toBe(1);
    expect(g.onTrack).toBe(true);
    expect(buildVerdict(g)).toBe("At the current pace of 1.01 lots/month you reach the goal on 2027-03-12.");
  });

  it("says what pace is needed when behind", () => {
    const lots = [closed(10_000, "2026-09-01")];
    const g = computeGoal(lots, farms, ASOF);
    expect(g.onTrack).toBe(false);
    expect(buildVerdict(g)).toMatch(/^You need [\d.]+ lots\/month; you are doing 0\.34\.$/);
  });

  it("calls out zero recent pace explicitly", () => {
    const lots = [closed(10_000, "2025-01-01")];
    const g = computeGoal(lots, farms, ASOF);
    expect(g.closedLotsPerMonth).toBe(0);
    expect(g.monthsAtCurrentPace).toBeNull();
    expect(buildVerdict(g)).toMatch(/closed none in the last 90 days/);
  });

  it("declares victory when the goal is met", () => {
    const g = computeGoal([closed(10_000_000, "2026-09-01")], farms, ASOF);
    expect(g.remaining).toBe(0);
    expect(g.pctComplete).toBe(100);
    expect(g.onTrack).toBe(true);
    expect(buildVerdict(g)).toMatch(/goal is met/);
  });

  it("profit on paper is net profit not yet realized as cash", () => {
    const g = computeGoal([closed(100_000, "2026-09-01", 30_000)], farms, ASOF);
    expect(g.cashRealized).toBe(30_000);
    expect(g.profitOnPaper).toBe(70_000);
  });
});


describe("farmsStillNeededWithTurns", () => {
  it("matches the flat inventory formula when no cycle is given", () => {
    expect(farmsStillNeededWithTurns(82, 12.1, 15, null)).toBe(7);
    expect(farmsStillNeededWithTurns(82, 12.1, 40, undefined)).toBe(7);
  });

  it("strictly decreases as the horizon lengthens, all else equal", () => {
    const cycle = 7.21;
    const a = farmsStillNeededWithTurns(82, 12.1, 15.64, cycle);
    const b = farmsStillNeededWithTurns(82, 12.1, 27.66, cycle);
    const c = farmsStillNeededWithTurns(82, 12.1, 39.66, cycle);
    expect(a).toBeGreaterThan(b as number);
    expect(b).toBeGreaterThan(c as number);
    expect(c).toBeGreaterThan(0);
  });
});
