/**
 * Numeric audit — coverage of every exported domain function that had no test, each against a
 * value computed by hand from the raw rows of one small realm ("Wold"), plus the edge cases the
 * audit brief lists: zero closings, a single closing, a null netProfit, a reservation with no
 * reservationDate, a farm with no funding date, asOf before the first event, asOf after the
 * deadline, and a horizon in the past.
 *
 * The Wold realm, as of 2026-09-11 (deadline 2027-12-31, 476 days away):
 *  - Ashdown (Wold county, own capital $500,000, 10 lots, funded 2026-01-01; land cost $50,000/lot)
 *      Lot 1: reserved 2026-03-01, closed 2026-04-10 on a $120,000 note ($6,000 down)  → net $70,000
 *      Lot 2: reserved 2026-05-01, closed 2026-06-15 on a $130,000 note ($6,500 down), note sold
 *             2026-08-01 to Abbey Notes for $95,000                                   → net $80,000
 *      Lot 3: reserved 2026-08-20 at $125,000 (live)                                  → $75,000 at stake
 *      Lot 4: active file case at $110,000 with NO reservation date (live)            → $60,000 at stake
 *  - Blackmoor (Wold, Sir Percival, profit share 50 %, $400,000, 8 lots, NO funding date, acquired 2026-02-01)
 *      Lot 1: reserved 2026-05-15, closed 2026-07-01 at $104,000 ($5,200 down), no note → gross $54,000, take $27,000, net $27,000
 *      Lot 2: a $100,000 reservation of 2026-04-01 cancelled on 2026-04-20 (19 days)
 *      $100,000 of capital returned and $12,500 of profit shared to Sir Percival on 2026-08-01
 *  - Cragmere (Fen, own capital $200,000, 4 lots, funded 2026-12-01 — in the future)
 *  - Olney (legacy one-off, 1 lot, $90,000, 2025-06-01) — no lot economics, but a farm event
 *  - A legacy note with no property, sold 2026-05-10 for $40,000 (treasury "other note sales")
 *  - Lady Aveline: a sponsor with no farm.
 */
import { describe, expect, it } from "vitest";
import { buildRealm } from "../realm";
import { addDays, daysInUtcMonth, endOfUtcMonth, maxDate, minDate, parseDate, startOfUtcDay, toIsoDate } from "../dates";
import { eraMonthLabel } from "../era";
import { historyMonthLabel } from "../history";
import { accrualStartDate, buildInterestLedger } from "../interest";
import { buildFarmContexts, lotNumberValue, type Lot } from "../lot";
import { computeFarms, countStages } from "../farm";
import { computeInvestors } from "../investors";
import { computeTreasury } from "../treasury";
import { cancellationEventId, cancelledFileCaseId, cancelledPledgeEventId, computeEvents, isCancelledPledge, type RealmEvent } from "../events";
import { narrateAll } from "../narrative";
import { buildStory } from "../story";
import { computeGoal, withVerdict, type GoalStatus } from "../goal";
import { buildMonthGrid, deriveOracleDefaults, monthIndexFor, type InvestorMixEntry, type OracleFarm } from "../oracle";
import { scheduledClosings } from "../futures";
import { severityLabel } from "../quality_human";
import { prefillInvestorMix, rotationPlan, warPlanVerdict, type WarPlan, type WarPlanColumn } from "../warplan";
import { compareVersusCash, exodusMonthLabel, futureNoteTerms, noteSaleRatioReal, prepareExodus, reconcileWithWarPlan, runExodus, type ExodusScenario } from "../exodus";
import { round2, sum } from "../math";
import type { Liberation } from "../liberation";
import { ASOF, cost, distribution, farm, fileCase, investor, note, noteSale, property, snapshot } from "./builders";

const DEADLINE = "2027-12-31";
const d = (iso: string) => parseDate(iso) as Date;

function wold() {
  const percival = investor({ name: "Sir Percival" });
  const aveline = investor({ name: "Lady Aveline" });
  const ashdown = farm({ farm_name: "Ashdown", county: "Wold", investor_capital: 500_000, total_lots: 10, funding_date: "2026-01-01", closing_date: "2026-01-01" });
  const blackmoor = farm({
    farm_name: "Blackmoor",
    county: "Wold",
    deal_type: "profit_share",
    profit_share_pct: 50,
    investor_id: percival.id,
    investor_capital: 400_000,
    total_lots: 8,
    funding_date: null,
    closing_date: "2026-02-01",
    annual_interest_rate: 0,
  });
  const cragmere = farm({ farm_name: "Cragmere", county: "Fen", investor_capital: 200_000, total_lots: 4, funding_date: "2026-12-01", closing_date: "2026-12-01" });
  const olney = farm({ farm_name: "Olney", county: "Fen", investor_capital: 90_000, total_lots: 1, funding_date: "2025-06-01", closing_date: "2025-06-01" });

  const a = Array.from({ length: 10 }, (_, i) => property(ashdown.id, i + 1, { name: `Ashdown — Lot ${i + 1}`, county: "Wold" }));
  const b = Array.from({ length: 8 }, (_, i) => property(blackmoor.id, i + 1, { name: `Blackmoor — Lot ${i + 1}`, county: "Wold" }));
  const c = Array.from({ length: 4 }, (_, i) => property(cragmere.id, i + 1, { name: `Cragmere — Lot ${i + 1}`, county: "Fen" }));
  const o1 = property(olney.id, 1, { name: "Olney — Lot 1", county: "Fen" });
  const [a1, a2, a3, a4] = a as [typeof a[0], typeof a[0], typeof a[0], typeof a[0]];
  const [b1, b2] = b as [typeof b[0], typeof b[0]];

  const fcA1 = fileCase(a1.id, { status: "completed", sale_price: 120_000, down_payment: 6_000, reservation_date: "2026-03-01", closing_date: "2026-04-10", created_at: "2026-03-01T00:00:00Z" });
  const fcA2 = fileCase(a2.id, { status: "completed", sale_price: 130_000, down_payment: 6_500, reservation_date: "2026-05-01", closing_date: "2026-06-15", created_at: "2026-05-01T00:00:00Z" });
  const fcA3 = fileCase(a3.id, { status: "active", sale_price: 125_000, down_payment: 6_250, reservation_date: "2026-08-20", created_at: "2026-08-20T00:00:00Z" });
  const fcA4 = fileCase(a4.id, { status: "active", sale_price: 110_000, down_payment: 5_500, reservation_date: null, created_at: "2026-08-25T00:00:00Z" });
  const fcB1 = fileCase(b1.id, { status: "completed", sale_price: 104_000, down_payment: 5_200, reservation_date: "2026-05-15", closing_date: "2026-07-01", created_at: "2026-05-15T00:00:00Z" });
  const fcB2c = fileCase(b2.id, { status: "cancelled", sale_price: 100_000, down_payment: 5_000, reservation_date: "2026-04-01", created_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-20T10:00:00Z" });

  const nA1 = note(a1.id, { note_code: "ASH-L01", original_amount: 120_000, down_payment: 6_000, financed_amount: 114_000, interest_rate: 0.1, term_months: 120, start_date: "2026-04-10" });
  const nA2 = note(a2.id, { note_code: "ASH-L02", original_amount: 130_000, down_payment: 6_500, financed_amount: 123_500, interest_rate: 0.12, term_months: 180, start_date: "2026-06-15", is_sold: true });
  const nOrphan = note("", { property_id: null, note_code: "LEG-01", original_amount: 50_000, down_payment: null, financed_amount: null, interest_rate: null, term_months: null, start_date: "2025-07-01", is_sold: true });

  const sA2 = noteSale(nA2.id, { sale_price: 95_000, sale_date: "2026-08-01", buyer_name: "Abbey Notes" });
  const sLeg = noteSale(nOrphan.id, { sale_price: 40_000, sale_date: "2026-05-10", buyer_name: "Legacy Buyer" });

  const dCap = distribution(blackmoor.id, { investor_id: percival.id, distribution_date: "2026-08-01", amount: 100_000, kind: "capital_return" });
  const dPS = distribution(blackmoor.id, { investor_id: percival.id, distribution_date: "2026-08-01", amount: 12_500, kind: "profit_share" });

  const snap = snapshot({
    farmAcquisitions: [ashdown, blackmoor, cragmere, olney],
    properties: [...a, ...b, ...c, o1],
    fileCases: [fcA1, fcA2, fcA3, fcA4, fcB1, fcB2c],
    notes: [nA1, nA2, nOrphan],
    noteSales: [sA2, sLeg],
    investorDistributions: [dCap, dPS],
    investors: [percival, aveline],
  });
  return { snap, percival, aveline, ashdown, blackmoor, cragmere, olney, a, b, c, a1, a2, a3, a4, b1, b2, fcA1, fcA2, fcA3, fcA4, fcB1, fcB2c, nA1, nA2, nOrphan, sA2, sLeg, dCap, dPS };
}

const W = wold();
const realm = buildRealm(W.snap, ASOF);
const lotOf = (propertyId: string): Lot => realm.lots.find((l) => l.propertyId === propertyId) as Lot;
const eventById = (id: string): RealmEvent => realm.events.find((e) => e.id === id) as RealmEvent;

// ———————————————————————————————————————————————————————————————————————————————————————————————
// The realm's headline figures, by hand from the rows above (so the fixture is what the comment says)
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("Wold realm: the figures every test below leans on", () => {
  it("has 22 lots in the stages the rows describe", () => {
    expect(realm.lots).toHaveLength(22);
    expect(countStages(realm.lots)).toEqual({ available: 17, reserved: 2, closed: 2, note_sold: 1 });
    expect(lotOf(W.a1.id)).toMatchObject({ stage: "closed", salePrice: 120_000, downPayment: 6_000, landCost: 50_000, grossProfit: 70_000, investorTake: 0, netProfit: 70_000, cashRealized: 6_000, closeDate: "2026-04-10", daysInPipeline: 40 });
    expect(lotOf(W.a2.id)).toMatchObject({ stage: "note_sold", netProfit: 80_000, cashRealized: 101_500, noteSaleDate: "2026-08-01", noteSalePrice: 95_000 });
    expect(lotOf(W.b1.id)).toMatchObject({ stage: "closed", priceSource: "file_case", salePrice: 104_000, grossProfit: 54_000, investorTake: 27_000, netProfit: 27_000, cashRealized: 5_200, daysInPipeline: 47 });
    expect(lotOf(W.a3.id)).toMatchObject({ stage: "reserved", grossProfit: 75_000, netProfit: null, reservationDate: "2026-08-20", daysInPipeline: 22 });
  });

  it("goal: $177,000 booked on 3 closings, 2 of them in the trailing 90 days → 0.68 lots/month against 10.68 required", () => {
    expect(realm.goal).toMatchObject({
      netProfitToDate: 177_000,
      netProfitInPipeline: 135_000,
      grossProfitToDate: 204_000,
      investorTakeToDate: 27_000,
      revenueToDate: 354_000,
      cashRealized: 112_700,
      profitOnPaper: 64_300,
      capitalOutstanding: 1_000_000,
      remaining: 9_823_000,
      pctComplete: 1.77,
      daysToDeadline: 476,
      monthsToDeadline: 15.64,
      closedLots: 3,
      reservedLots: 2,
      availableLots: 17,
      noteSoldLots: 1,
      closedLotsTrailing: 2,
      trailingDays: 90,
      trailingEraClipped: false,
      closedLotsPerMonth: 0.68, // 2 ÷ (90 ÷ 30.4375) = 0.6764
      avgNetProfitPerClosedLot: 59_000,
      lotsStillNeeded: 167, // ceil(9,823,000 ÷ 59,000 = 166.49)
      monthsAtCurrentPace: 245.59, // 167 ÷ 0.68
      projectedDate: "2047-03-01", // 2026-09-11 + 245 months + round(0.59 × 30.44) = 18 days
      requiredLotsPerMonthToHitDeadline: 10.68, // 167 ÷ 15.6386
      inventoryGap: 150,
      avgLotsPerFarm: 7.33,
      farmsStillNeeded: 21, // ceil(150 ÷ 7.333)
      onTrack: false,
      verdict: "You need 10.68 lots/month; you are doing 0.68.",
    });
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// dates.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("dates: startOfUtcDay, addDays, endOfUtcMonth, daysInUtcMonth, maxDate, minDate", () => {
  it("startOfUtcDay truncates to UTC midnight", () => {
    expect(startOfUtcDay(new Date("2026-09-11T17:45:30.123Z")).toISOString()).toBe("2026-09-11T00:00:00.000Z");
    expect(startOfUtcDay(new Date("2026-09-11T00:00:00Z")).toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });

  it("addDays crosses month and year ends in UTC (2026 is not a leap year)", () => {
    expect(toIsoDate(addDays(d("2026-02-28"), 1))).toBe("2026-03-01");
    expect(toIsoDate(addDays(d("2028-02-28"), 1))).toBe("2028-02-29");
    expect(toIsoDate(addDays(d("2026-01-01"), -1))).toBe("2025-12-31");
    expect(toIsoDate(addDays(new Date("2026-09-11T23:59:59Z"), 0))).toBe("2026-09-11");
  });

  it("endOfUtcMonth / daysInUtcMonth", () => {
    expect(toIsoDate(endOfUtcMonth(d("2026-02-10")))).toBe("2026-02-28");
    expect(toIsoDate(endOfUtcMonth(d("2028-02-10")))).toBe("2028-02-29");
    expect(toIsoDate(endOfUtcMonth(d("2026-12-31")))).toBe("2026-12-31");
    expect(daysInUtcMonth(d("2026-09-01"))).toBe(30);
    expect(daysInUtcMonth(d("2026-10-15"))).toBe(31);
    expect(daysInUtcMonth(d("2028-02-01"))).toBe(29);
  });

  it("maxDate / minDate ignore nulls and return null with nothing to compare", () => {
    const a = d("2026-01-05");
    const b = d("2026-03-01");
    expect(maxDate(null, a, undefined, b)).toBe(b);
    expect(minDate(null, a, undefined, b)).toBe(a);
    expect(maxDate(a)).toBe(a);
    expect(maxDate()).toBeNull();
    expect(minDate(null, undefined)).toBeNull();
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// Labels: era, history, exodus, quality
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("labels", () => {
  it("eraMonthLabel", () => {
    expect(eraMonthLabel("2026-03-01")).toBe("Mar 2026");
    expect(eraMonthLabel("2027-12-31")).toBe("Dec 2027");
    expect(eraMonthLabel("garbage")).toBe("garbage");
  });

  it("historyMonthLabel accepts YYYY-MM and ISO dates", () => {
    expect(historyMonthLabel("2026-09")).toBe("Sep 26");
    expect(historyMonthLabel("2026-09-01")).toBe("Sep 26");
    expect(historyMonthLabel("2025-01")).toBe("Jan 25");
    expect(historyMonthLabel("nope")).toBe("nope");
  });

  it("exodusMonthLabel in English and Spanish", () => {
    expect(exodusMonthLabel("2027-03-15", "en")).toBe("Mar 2027");
    expect(exodusMonthLabel("2027-03-15", "es")).toBe("mar 2027");
    expect(exodusMonthLabel("2026-12-31", "es")).toBe("dic 2026");
    expect(exodusMonthLabel("bad", "en")).toBe("bad");
    expect(exodusMonthLabel("bad", "es")).toBe("bad");
  });

  it("severityLabel", () => {
    expect(severityLabel("error", "es")).toBe("Error");
    expect(severityLabel("warning", "es")).toBe("Aviso");
    expect(severityLabel("info", "es")).toBe("Dato");
    expect(severityLabel("error", "en")).toBe("Error");
    expect(severityLabel("warning", "en")).toBe("Warning");
    expect(severityLabel("info", "en")).toBe("Info");
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// interest.ts / lot.ts / farm.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("accrualStartDate", () => {
  it("funding_date wins, closing_date is the fallback, nothing → null", () => {
    expect(toIsoDate(accrualStartDate(W.ashdown) as Date)).toBe("2026-01-01");
    expect(toIsoDate(accrualStartDate(W.blackmoor) as Date)).toBe("2026-02-01");
    expect(accrualStartDate(farm({ funding_date: null, closing_date: null }))).toBeNull();
    expect(toIsoDate(accrualStartDate(farm({ funding_date: "2026-05-05", closing_date: "2026-01-01" })) as Date)).toBe("2026-05-05");
  });
});

describe("lotNumberValue", () => {
  it("parses the leading integer and pushes unparseable numbers to the end", () => {
    expect(lotNumberValue("14")).toBe(14);
    expect(lotNumberValue("7A")).toBe(7);
    expect(lotNumberValue("Lot")).toBe(Number.MAX_SAFE_INTEGER);
    expect(lotNumberValue(null)).toBe(Number.MAX_SAFE_INTEGER);
    expect(lotNumberValue("2") < lotNumberValue("10")).toBe(true);
  });
});

describe("buildFarmContexts", () => {
  it("keeps subdivided farms with a ledger, takes the basis from investor_capital or property_costs, and skips legacy farms", () => {
    const ghost = farm({ farm_name: "Ghost", investor_capital: null, total_lots: 6 });
    const noCap = farm({ farm_name: "NoCap", investor_capital: null, total_lots: 5 });
    const noLedger = farm({ farm_name: "NoLedger", total_lots: 5 });
    const farms = [W.ashdown, W.olney, ghost, noCap, noLedger];
    const propertyCosts = [cost(ghost.id, { amount: 180_000 }), cost(ghost.id, { amount: 120_000 })];
    const interestByFarm = new Map([W.ashdown, W.olney, ghost, noCap].map((f) => [f.id, buildInterestLedger(f, [], ASOF)]));
    const ctx = buildFarmContexts({ farms, properties: [...W.a, property(ghost.id, 1), property(ghost.id, 2)], propertyCosts, interestByFarm, asOf: ASOF });
    expect([...ctx.keys()].sort()).toEqual([W.ashdown.id, ghost.id, noCap.id].sort());
    expect(ctx.get(W.ashdown.id)).toMatchObject({ landCostPerLot: 50_000, capitalBasis: 500_000, capitalBasisSource: "investor_capital", lotCount: 10 });
    expect(ctx.get(ghost.id)).toMatchObject({ landCostPerLot: 50_000, capitalBasis: 300_000, capitalBasisSource: "property_costs", lotCount: 2 });
    expect(ctx.get(noCap.id)).toMatchObject({ landCostPerLot: 0, capitalBasis: 0, capitalBasisSource: "none", lotCount: 0 });
  });
});

describe("countStages", () => {
  it("counts every stage and returns zeros for no lots", () => {
    expect(countStages([])).toEqual({ available: 0, reserved: 0, closed: 0, note_sold: 0 });
    expect(countStages([{ stage: "closed" }, { stage: "closed" }, { stage: "reserved" }])).toEqual({ available: 0, reserved: 1, closed: 2, note_sold: 0 });
  });
});

describe("computeFarms", () => {
  const byName = (name: string) => realm.farms.find((f) => f.name === name)!;

  it("orders by funding date (acquisition date when there is none) and leaves the legacy farm out", () => {
    expect(realm.farms.map((f) => f.name)).toEqual(["Ashdown", "Blackmoor", "Cragmere"]);
  });

  it("Ashdown: 2 sold of 10, $250,000 of revenue, $150,000 net, $107,500 of cash, 8.31 months since funding", () => {
    expect(byName("Ashdown")).toMatchObject({
      county: "Wold",
      dealType: "own_capital",
      totalLots: 10,
      lotRows: 10,
      capitalDeployed: 500_000,
      capitalBasisSource: "investor_capital",
      landCostPerLot: 50_000,
      stages: { available: 6, reserved: 2, closed: 1, note_sold: 1 },
      soldLots: 2,
      pctClosed: 20,
      revenue: 250_000,
      pipelineRevenue: 235_000,
      grossProfit: 150_000,
      investorTake: 0,
      netProfit: 150_000,
      netProfitInPipeline: 135_000,
      cashRealized: 107_500,
      capitalReturned: 0,
      capitalOutstanding: 500_000,
      monthsSinceFunding: 8.31, // 253 days ÷ 30.4375
    });
  });

  it("Blackmoor (no funding date): dated by its acquisition, 50 % profit share on $54,000 gross, $100,000 of capital back", () => {
    expect(byName("Blackmoor")).toMatchObject({
      investorName: "Sir Percival",
      fundingDate: null,
      closingDate: "2026-02-01",
      annualRatePct: 0,
      profitSharePct: 50,
      stages: { available: 7, reserved: 0, closed: 1, note_sold: 0 },
      soldLots: 1,
      pctClosed: 12.5,
      revenue: 104_000,
      pipelineRevenue: 0,
      grossProfit: 54_000,
      investorTake: 27_000,
      netProfit: 27_000,
      cashRealized: 5_200,
      capitalReturned: 100_000,
      capitalOutstanding: 300_000,
      monthsSinceFunding: 7.29, // 222 days from 2026-02-01
    });
    expect(byName("Blackmoor").interest.accrualStart).toBe("2026-02-01");
  });

  it("Cragmere (funded after asOf): no months since funding yet, capital fully outstanding", () => {
    expect(byName("Cragmere")).toMatchObject({ monthsSinceFunding: null, capitalOutstanding: 200_000, soldLots: 0, stages: { available: 4, reserved: 0, closed: 0, note_sold: 0 } });
  });

  it("is the same function the realm calls", () => {
    const direct = computeFarms(W.snap.farmAcquisitions, realm.lots, W.snap.propertyCosts, W.snap.investors, realm.interestByFarm, ASOF);
    expect(direct.map((f) => [f.name, f.netProfit, f.capitalOutstanding])).toEqual(realm.farms.map((f) => [f.name, f.netProfit, f.capitalOutstanding]));
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// investors.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("computeInvestors", () => {
  it("Sir Percival: one profit-share position, $400,000 in, $100,000 back, $27,000 earned, $12,500 paid; Lady Aveline has none", () => {
    const [percival, aveline] = realm.investors;
    expect(percival).toMatchObject({
      name: "Sir Percival",
      dealType: "profit_share",
      capitalDeployed: 400_000,
      capitalReturned: 100_000,
      capitalOutstanding: 300_000,
      interestAccrued: 0,
      interestPaid: 0,
      profitShareEarned: 27_000,
      profitSharePaid: 12_500,
      totalPaidOut: 112_500,
    });
    expect(percival?.farms).toHaveLength(1);
    expect(percival?.farms[0]).toMatchObject({ farmName: "Blackmoor", dealType: "profit_share", capitalDeployed: 400_000, profitSharePct: 50, fundingDate: null, profitSharePaid: 12_500, capitalReturned: 100_000, capitalOutstanding: 300_000, lotsSold: 1, totalLots: 8, investorTakeEarned: 27_000 });
    expect(percival?.distributions.map((x) => x.amount)).toEqual([100_000, 12_500]);
    expect(aveline).toMatchObject({ name: "Lady Aveline", dealType: "none", farms: [], capitalDeployed: 0, capitalOutstanding: 0, profitShareEarned: 0, totalPaidOut: 0, distributions: [] });
  });

  it("sorts by capital deployed and reads 'mixed' when a sponsor holds two deal types", () => {
    expect(realm.investors.map((i) => i.name)).toEqual(["Sir Percival", "Lady Aveline"]);
    const ashdownAsFixed = { ...realm.farms[0]!, investorId: W.percival.id, dealType: "fixed_interest" };
    const mixed = computeInvestors(W.snap.investors, [ashdownAsFixed, realm.farms[1]!], W.snap.investorDistributions);
    expect(mixed[0]).toMatchObject({ name: "Sir Percival", dealType: "mixed", capitalDeployed: 900_000, capitalOutstanding: 800_000 });
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// treasury.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("computeTreasury", () => {
  it("buckets down payments by close month, note sales by sale month, legacy sales apart, distributions out — cumulative to the cent", () => {
    const t = realm.treasury;
    expect(t.months.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(t.months[0]).toMatchObject({ downPayments: 6_000, noteSales: 0, otherNoteSales: 0, cashIn: 6_000, cashOut: 0, net: 6_000, cumulativeCashIn: 6_000, cumulativeCashOut: 0, cumulativeNet: 6_000 });
    expect(t.months[1]).toMatchObject({ downPayments: 0, otherNoteSales: 40_000, cashIn: 40_000, cumulativeCashIn: 46_000, cumulativeNet: 46_000 });
    expect(t.months[2]).toMatchObject({ downPayments: 6_500, cumulativeCashIn: 52_500 });
    expect(t.months[3]).toMatchObject({ downPayments: 5_200, cumulativeCashIn: 57_700 });
    expect(t.months[4]).toMatchObject({ downPayments: 0, noteSales: 95_000, cashIn: 95_000, capitalReturns: 100_000, profitShares: 12_500, cashOut: 112_500, net: -17_500, cumulativeCashIn: 152_700, cumulativeCashOut: 112_500, cumulativeNet: 40_200 });
    expect(t).toMatchObject({
      totalDownPayments: 17_700,
      totalNoteSales: 95_000,
      totalOtherNoteSales: 40_000,
      totalAllNoteSales: 135_000,
      undatedCashIn: 0,
      totalCashIn: 152_700,
      totalCashOut: 112_500,
      totalCapitalReturns: 100_000,
      totalProfitShares: 12_500,
      net: 40_200,
    });
  });

  it("a sold lot with no close date and no note start lands in undatedCashIn, not in a month", () => {
    const undated = { ...lotOf(W.a1.id), closeDate: null, noteSaleDate: null };
    const t = computeTreasury([undated], [], []);
    expect(t.months).toEqual([]);
    expect(t).toMatchObject({ undatedCashIn: 6_000, totalDownPayments: 6_000, totalCashIn: 6_000, totalCashOut: 0, net: 6_000 });
  });

  it("a cash deal brings the whole price at closing", () => {
    const cashLot = { ...lotOf(W.b1.id), dealType: "cash" as const };
    expect(computeTreasury([cashLot], []).months[0]).toMatchObject({ month: "2026-07", downPayments: 104_000 });
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// events.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("event ids", () => {
  it("cancelled pledges carry the file case in a three-part id; cancellations carry only the case", () => {
    expect(cancelledPledgeEventId("prop-9", "fc-3")).toBe("reservation:prop-9:fc-3");
    expect(cancellationEventId("fc-3")).toBe("cancellation:fc-3");
    expect(isCancelledPledge({ kind: "reservation", id: "reservation:prop-9:fc-3" })).toBe(true);
    expect(isCancelledPledge({ kind: "reservation", id: "reservation:prop-9" })).toBe(false);
    expect(isCancelledPledge({ kind: "cancellation", id: "cancellation:fc-3" })).toBe(false);
    expect(cancelledFileCaseId({ kind: "cancellation", id: "cancellation:fc-3" })).toBe("fc-3");
    expect(cancelledFileCaseId({ kind: "reservation", id: "reservation:prop-9:fc-3" })).toBe("fc-3");
    expect(cancelledFileCaseId({ kind: "reservation", id: "reservation:prop-9" })).toBeNull();
    expect(cancelledFileCaseId({ kind: "closing", id: "closing:prop-9" })).toBeNull();
    expect(cancelledFileCaseId({ kind: "cancellation", id: "cancellation:" })).toBeNull();
  });
});

describe("computeEvents", () => {
  const events = computeEvents(realm.lots, W.snap.farmAcquisitions, W.snap.investorDistributions, W.snap.investors, ASOF);

  it("emits 16 events in date order, legacy farm included, the lot with no reservation date excluded", () => {
    expect(events).toHaveLength(16);
    expect(events.map((e) => e.date)).toEqual([...events.map((e) => e.date)].sort());
    expect(events.map((e) => e.kind)).toEqual([
      "farm_acquired", // Olney 2025-06-01
      "farm_acquired", // Ashdown 2026-01-01
      "farm_acquired", // Blackmoor 2026-02-01
      "reservation", // Ashdown 1 2026-03-01
      "reservation", // Blackmoor 2 (cancelled pledge) 2026-04-01
      "closing", // Ashdown 1 2026-04-10
      "cancellation", // Blackmoor 2 2026-04-20
      "reservation", // Ashdown 2 2026-05-01
      "reservation", // Blackmoor 1 2026-05-15
      "closing", // Ashdown 2 2026-06-15
      "closing", // Blackmoor 1 2026-07-01
      "note_sale", // Ashdown 2 2026-08-01
      "distribution",
      "distribution",
      "reservation", // Ashdown 3 2026-08-20
      "farm_acquired", // Cragmere 2026-12-01 (future)
    ]);
    expect(events.some((e) => e.propertyId === W.a4.id)).toBe(false);
    expect(events.filter((e) => e.kind === "milestone")).toEqual([]);
  });

  it("farm events: funding date, else acquisition date; capital and deal in the description; future when after asOf", () => {
    expect(events[0]).toMatchObject({ id: `farm:${W.olney.id}`, date: "2025-06-01", title: "Olney joins the realm", description: "1 lots · own_capital", amount: 90_000, future: false });
    expect(events[1]).toMatchObject({ date: "2026-01-01", title: "Ashdown joins the realm", description: "10 lots · own_capital", amount: 500_000, farmName: "Ashdown", cumulativeNetProfit: 0 });
    expect(events[2]).toMatchObject({ date: "2026-02-01", description: "8 lots · profit_share · Sir Percival", amount: 400_000 });
    expect(events[15]).toMatchObject({ date: "2026-12-01", title: "Cragmere joins the realm", description: "4 lots · own_capital", amount: 200_000, future: true, cumulativeNetProfit: 177_000 });
  });

  it("reservations, the cancelled pledge and its cancellation (19 days)", () => {
    expect(events[3]).toMatchObject({ id: `reservation:${W.a1.id}`, date: "2026-03-01", title: "Ashdown — Lot 1 reserved", description: "by Buyer One", amount: 120_000, propertyId: W.a1.id });
    expect(events[4]).toMatchObject({ id: cancelledPledgeEventId(W.b2.id, W.fcB2c.id), date: "2026-04-01", kind: "reservation", title: "Blackmoor — Lot 2 reserved", description: "by Buyer One · later cancelled", amount: 100_000 });
    expect(events[6]).toMatchObject({ id: cancellationEventId(W.fcB2c.id), date: "2026-04-20", title: "Blackmoor — Lot 2 reservation cancelled", description: "Buyer One withdrew after 19 days", amount: 100_000 });
    expect(events[14]).toMatchObject({ id: `reservation:${W.a3.id}`, date: "2026-08-20", amount: 125_000 });
  });

  it("closings carry their net profit and the running cumulative: 70,000 → 150,000 → 177,000", () => {
    expect(events[5]).toMatchObject({ id: `closing:${W.a1.id}`, date: "2026-04-10", title: "Ashdown — Lot 1 closed", description: "financed · net $70,000", amount: 70_000, cumulativeNetProfit: 70_000 });
    expect(events[9]).toMatchObject({ id: `closing:${W.a2.id}`, date: "2026-06-15", amount: 80_000, cumulativeNetProfit: 150_000 });
    expect(events[10]).toMatchObject({ id: `closing:${W.b1.id}`, date: "2026-07-01", description: "financed · net $27,000", amount: 27_000, cumulativeNetProfit: 177_000 });
    // the cancellation between two closings does not move the cumulative
    expect(events[6]?.cumulativeNetProfit).toBe(70_000);
  });

  it("note sale and distributions", () => {
    expect(events[11]).toMatchObject({ id: `note_sale:${W.sA2.id}`, date: "2026-08-01", title: "Ashdown — Lot 2 note sold", description: "to Abbey Notes", amount: 95_000, propertyId: W.a2.id });
    const dists = events.filter((e) => e.kind === "distribution").map((e) => ({ id: e.id, title: e.title, description: e.description, amount: e.amount, farmName: e.farmName }));
    expect(dists).toEqual(
      expect.arrayContaining([
        { id: `distribution:${W.dCap.id}`, title: "Capital returned to Sir Percival", description: "Blackmoor", amount: 100_000, farmName: "Blackmoor" },
        { id: `distribution:${W.dPS.id}`, title: "Profit shared to Sir Percival", description: "Blackmoor", amount: 12_500, farmName: "Blackmoor" },
      ]),
    );
    expect(dists).toHaveLength(2);
  });

  it("a $50,000 milestone step marks 50,000 with Lot 1 and both 100,000 and 150,000 with Lot 2", () => {
    const withMilestones = computeEvents(realm.lots, W.snap.farmAcquisitions, W.snap.investorDistributions, W.snap.investors, ASOF, 50_000);
    const milestones = withMilestones.filter((e) => e.kind === "milestone");
    expect(milestones.map((e) => [e.id, e.date, e.milestone, e.description, e.cumulativeNetProfit])).toEqual([
      ["milestone:50000", "2026-04-10", 50_000, "Crossed with Ashdown — Lot 1", 70_000],
      ["milestone:100000", "2026-06-15", 100_000, "Crossed with Ashdown — Lot 2", 150_000],
      ["milestone:150000", "2026-06-15", 150_000, "Crossed with Ashdown — Lot 2", 150_000],
    ]);
    expect(withMilestones).toHaveLength(19);
    // a milestone sits right behind the closing that crossed it
    expect(withMilestones[withMilestones.findIndex((e) => e.id === `closing:${W.a1.id}`) + 1]?.id).toBe("milestone:50000");
  });

  it("asOf before every farm but Olney: everything is future and the cumulative never moves", () => {
    const early = computeEvents(realm.lots, W.snap.farmAcquisitions, W.snap.investorDistributions, W.snap.investors, d("2025-12-01"));
    expect(early.filter((e) => !e.future).map((e) => e.id)).toEqual([`farm:${W.olney.id}`]);
    expect(early.every((e) => e.cumulativeNetProfit === 0)).toBe(true);
  });

  it("the realm's events are these plus nothing (no liberation happened)", () => {
    expect(realm.events.map((e) => e.id)).toEqual(events.map((e) => e.id));
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// narrative.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("narrateAll", () => {
  const ctx = {
    lotsById: new Map(realm.lots.map((l) => [l.propertyId, l])),
    farmDealTypeByName: new Map(W.snap.farmAcquisitions.map((f) => [f.farm_name ?? "", f.deal_type])),
    currentYear: 2026,
    asOf: "2026-09-11",
  };
  const prose = narrateAll(realm.events, ctx);

  it("writes one line per event", () => {
    expect(prose.size).toBe(realm.events.length);
    for (const e of realm.events) expect(prose.get(e.id)).toBeTruthy();
  });

  it("farms: own gold vs sponsor gold, the year only when it is not the current one, 'will claim' for a future farm", () => {
    expect(prose.get(`farm:${W.olney.id}`)).toBe("On June 1, 2025, the realm claimed the lands of Olney with $90,000 of its own gold.");
    expect(prose.get(`farm:${W.ashdown.id}`)).toBe("On January 1, the realm claimed the lands of Ashdown with $500,000 of its own gold.");
    expect(prose.get(`farm:${W.blackmoor.id}`)).toBe("On February 1, the realm claimed the lands of Blackmoor with $400,000 of sponsor gold.");
    expect(prose.get(`farm:${W.cragmere.id}`)).toBe("On December 1, the realm will claim the lands of Cragmere, $200,000 of its own gold pledged.");
  });

  it("pledges, the withdrawn pledge and the withdrawal", () => {
    expect(prose.get(`reservation:${W.a1.id}`)).toBe("On March 1, Buyer One pledged for Lot 1 of Ashdown at $120,000.");
    expect(prose.get(`reservation:${W.a3.id}`)).toBe("On August 20, Buyer One pledged for Lot 3 of Ashdown at $125,000.");
    expect(prose.get(cancelledPledgeEventId(W.b2.id, W.fcB2c.id))).toBe("On April 1, Buyer One pledged for Lot 2 of Blackmoor at $100,000; the pledge was later withdrawn.");
    expect(prose.get(cancellationEventId(W.fcB2c.id))).toBe(
      "On April 20, Buyer One withdrew the pledge for Lot 2 of Blackmoor after 19 days; the lot returned to the market and the days it promised went with it.",
    );
  });

  it("closings without an oxygen map say nothing about days; with the realm's map they add the days gained", () => {
    expect(prose.get(`closing:${W.a1.id}`)).toBe("On April 10, Buyer One claimed Lot 1 of Ashdown for $120,000, 40 days after Buyer's reservation.");
    expect(prose.get(`closing:${W.b1.id}`)).toBe("On July 1, Buyer One claimed Lot 1 of Blackmoor for $104,000, 47 days after Buyer's reservation.");
    expect(realm.narrative.get(`closing:${W.a1.id}`)).toBe("On April 10, Buyer One claimed Lot 1 of Ashdown for $120,000, 40 days after Buyer's reservation. The realm gained 90 days.");
    expect(realm.narrative.get(`closing:${W.b1.id}`)).toBe("On July 1, Buyer One claimed Lot 1 of Blackmoor for $104,000, 47 days after Buyer's reservation. The realm gained 14 days.");
  });

  it("the live reservation in the realm carries its expected close (Aug 20 + 43 median days) and provisional days (57 × 75 %)", () => {
    expect(realm.narrative.get(`reservation:${W.a3.id}`)).toBe("On August 20, Buyer One pledged for Lot 3 of Ashdown at $125,000 — the closing is expected around October 2, 43 provisional days gained.");
  });

  it("note sale and distributions", () => {
    expect(prose.get(`note_sale:${W.sA2.id}`)).toBe("On August 1, the note on Lot 2 of Ashdown was sold to Abbey Notes for $95,000, and the gold came home.");
    expect(prose.get(`distribution:${W.dCap.id}`)).toBe("On August 1, $100,000 of capital was returned to Sir Percival for Blackmoor.");
    expect(prose.get(`distribution:${W.dPS.id}`)).toBe("On August 1, $12,500 of the spoils was shared with Sir Percival for Blackmoor.");
  });

  it("a milestone line", () => {
    const withMilestones = computeEvents(realm.lots, W.snap.farmAcquisitions, W.snap.investorDistributions, W.snap.investors, ASOF, 50_000);
    expect(narrateAll(withMilestones, ctx).get("milestone:100000")).toBe("On June 15, the chroniclers marked $100,000 of net profit, crossed with Ashdown — Lot 2. Bells rang.");
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// goal.ts withVerdict, oxygen and debt figures the story reads
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("withVerdict", () => {
  it("adds the verdict and changes nothing else", () => {
    const bare = computeGoal(realm.lots, realm.farms, ASOF);
    expect(bare.verdict).toBe("");
    const spoken = withVerdict(bare);
    expect(spoken.verdict).toBe("You need 10.68 lots/month; you are doing 0.68.");
    expect({ ...spoken, verdict: "" }).toEqual(bare);
  });

  it("formats the projected date with the formatter it is given", () => {
    const onTrack: GoalStatus = { ...realm.goal, onTrack: true, projectedDate: "2027-06-01" };
    expect(withVerdict(onTrack, (iso) => `<${iso}>`).verdict).toBe("At the current pace of 0.68 lots/month you reach the goal on <2027-06-01>.");
    expect(withVerdict({ ...realm.goal, remaining: 0 }).verdict).toBe("The goal is met. The realm is yours.");
  });
});

describe("oxygen and debt on the Wold realm (inputs to the story)", () => {
  it("scores each closing at the pace of its own day: 90 + 48 + 14 = 152 days", () => {
    // Lot 1 (Apr 10): 1 closing in its 90 days → 0.34/month × $70,000 × 12 ÷ 365.25 = $781.93/day → 70,000 ÷ 781.93 = 89.5 → 90
    // Lot 2 (Jun 15): 2 closings → 0.68/month × $75,000 avg → $1,675.56/day → 80,000 ÷ 1,675.56 = 47.7 → 48
    // Blackmoor 1 (Jul 1): 3 closings → 1.01/month × $59,000 avg → $1,957.78/day → 27,000 ÷ 1,957.78 = 13.8 → 14
    expect(realm.oxygen.perLot.get(W.a1.id)).toMatchObject({ daysGained: 90, paceThatDay: 781.93, measuredOn: "2026-04-10" });
    expect(realm.oxygen.perLot.get(W.a2.id)).toMatchObject({ daysGained: 48, paceThatDay: 1675.56 });
    expect(realm.oxygen.perLot.get(W.b1.id)).toMatchObject({ daysGained: 14, paceThatDay: 1957.78 });
    expect(realm.oxygen.totalDaysGained).toBe(152);
    expect(realm.oxygen.trailingDaysGained).toBe(62);
    expect(realm.oxygen.best?.propertyId).toBe(W.a1.id);
    expect(realm.oxygen.latest?.propertyId).toBe(W.b1.id);
  });

  it("debt: $300,000 owed to Sir Percival, $700,000 of own capital out, $20,636.55 needed per day over 476 days", () => {
    expect(realm.debt).toMatchObject({
      capitalOwed: 300_000,
      ownCapitalOutstanding: 700_000,
      openPositions: 1,
      daysLeft: 476,
      remainingNetProfit: 9_823_000,
      requiredNetProfitPerDay: 20_636.55,
      firstCloseDate: "2026-04-10",
      actualSince: "2026-04-10",
      actualDays: 154,
      actualNetProfitPerDay: 1_149.35, // 177,000 ÷ 154
      actualEraClipped: false,
      interestPerDay: 0,
    });
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// story.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("buildStory", () => {
  it("tells the Wold realm in five cards, every number from the realm", () => {
    expect(realm.story.hasData).toBe(true);
    expect(realm.story.cards.map((c) => [c.id, c.kicker, c.line])).toEqual([
      ["lands", "Since 2026", "3 farms across 2 counties, cut into 22 lots."],
      ["gold", "Sponsor gold", "$400,000 lent by 1 sponsor. $300,000 still owed."],
      ["claimed", "Claimed", "3 lots closed for $177,000 of net profit — 1.8% of the ten million."],
      ["oxygen", "Oxygen", "Every closing bought time. 152 days gained toward the exit."],
      ["debt", "The Debt", "476 days left. $20,637 of net profit needed every single day."],
    ]);
    expect(buildStory(realm.goal, realm.farms, realm.debt, realm.oxygen, realm.liberation)).toEqual(realm.story);
  });

  it("adds the liberation card for one freed sponsor, and counts positions when there are several", () => {
    const hostage = { ...realm.liberation.hostages[0]!, freed: true };
    const oneFreed: Liberation = { ...realm.liberation, freedHostages: [hostage], captiveHostages: [] };
    expect(buildStory(realm.goal, realm.farms, realm.debt, realm.oxygen, oneFreed).cards.find((c) => c.id === "freed")).toEqual({
      id: "freed",
      kicker: "Liberated",
      line: "Sir Percival walked free of Blackmoor. 0 remain in chains.",
    });
    const twoFreed: Liberation = { ...realm.liberation, freedHostages: [hostage, hostage], captiveHostages: [realm.liberation.hostages[0]!] };
    expect(buildStory(realm.goal, realm.farms, realm.debt, realm.oxygen, twoFreed).cards.find((c) => c.id === "freed")?.line).toBe("2 sponsor positions repaid in full. 1 remains in chains.");
  });

  it("lost days and no farms", () => {
    const lost = buildStory(realm.goal, realm.farms, realm.debt, { ...realm.oxygen, totalDaysGained: -3 }, realm.liberation);
    expect(lost.cards.find((c) => c.id === "oxygen")?.line).toBe("Every closing bought time. 3 days lost toward the exit.");
    expect(buildStory(realm.goal, [], realm.debt, realm.oxygen, realm.liberation)).toEqual({ cards: [], hasData: false });
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// oracle.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("deriveOracleDefaults", () => {
  it("reads the realm's real averages", () => {
    expect(realm.oracleDefaults).toEqual({
      lotsPerMonth: 0.68,
      avgSalePrice: 118_000, // (120,000 + 130,000 + 104,000) ÷ 3
      avgLandCost: 50_000,
      avgMonthsToSellNote: 1.54, // 47 days ÷ 30.4375
      newFarmEveryMonths: 3, // only Cragmere is funded since the era start → default
      avgLotsPerFarm: 7.33,
      investorTakePct: 13.24, // 27,000 ÷ 204,000
      downPaymentPct: 5,
      noteSalePct: 76.92, // 95,000 ÷ 123,500
    });
    expect(deriveOracleDefaults(realm.lots, realm.farms, realm.goal, { eraStart: undefined })).toEqual(realm.oracleDefaults);
  });

  it("without an era the cadence is the mean gap between all three fundings: (31 + 303 days) ÷ 2 = 5.49 months", () => {
    expect(deriveOracleDefaults(realm.lots, realm.farms, realm.goal, { eraStart: null }).newFarmEveryMonths).toBe(5.49);
  });

  it("an empty realm falls back to the documented defaults", () => {
    const emptyGoal = computeGoal([], [], ASOF);
    expect(deriveOracleDefaults([], [], emptyGoal)).toEqual({
      lotsPerMonth: 0,
      avgSalePrice: 0,
      avgLandCost: 0,
      avgMonthsToSellNote: 3,
      newFarmEveryMonths: 3,
      avgLotsPerFarm: 10,
      investorTakePct: 0,
      downPaymentPct: 5,
      noteSalePct: 80,
    });
  });
});

describe("monthIndexFor", () => {
  it("calendar grid from 2026-09-11: September is month 1, the deadline month is 16, past dates are 1, beyond the horizon null", () => {
    const grid = buildMonthGrid(ASOF, d(DEADLINE), true);
    expect(grid.deadlineIndex).toBe(16);
    expect(monthIndexFor(d("2026-09-20"), grid)).toBe(1);
    expect(monthIndexFor(d("2026-09-30"), grid)).toBe(1);
    expect(monthIndexFor(d("2026-10-01"), grid)).toBe(2);
    expect(monthIndexFor(d("2026-01-01"), grid)).toBe(1);
    expect(monthIndexFor(d("2027-12-31"), grid)).toBe(16);
    expect(monthIndexFor(d("2028-01-01"), grid)).toBe(17);
    expect(monthIndexFor(d("2040-01-01"), grid)).toBeNull();
  });

  it("whole-month grid: month 1 ends one month after asOf", () => {
    const grid = buildMonthGrid(ASOF, d(DEADLINE), false);
    expect(monthIndexFor(d("2026-10-11"), grid)).toBe(1);
    expect(monthIndexFor(d("2026-10-12"), grid)).toBe(2);
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// futures.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("scheduledClosings", () => {
  it("one live reservation with a date: Lot 3 expected on 2026-10-02 (Aug 20 + Ashdown's 43-day median), 0.75 of a lot at 75 % conversion, $56,250 expected", () => {
    expect(realm.expected.conversionPct).toBe(75); // 3 closed ÷ (3 matured + 1 cancelled)
    expect(realm.expected.lots.map((l) => l.propertyId)).toEqual([W.a3.id]); // Lot 4 has no reservation date
    expect(scheduledClosings(realm.expected)).toEqual([{ date: "2026-10-02", lots: 0.75, netProfit: 56_250 }]);
  });

  it("no dated reservation → nothing scheduled", () => {
    expect(scheduledClosings({ ...realm.expected, lots: realm.expected.lots.map((l) => ({ ...l, expectedCloseDate: null })) })).toEqual([]);
    expect(scheduledClosings({ ...realm.expected, lots: [] })).toEqual([]);
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// warplan.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("prefillInvestorMix", () => {
  it("the five named prefills (unmatched → no id, $0) then Sir Percival with his profit-share terms; Lady Aveline has no position", () => {
    const mix = prefillInvestorMix(realm.investors);
    expect(mix.map((m) => [m.name, m.dealType, m.ratePct, m.capital, m.investorId])).toEqual([
      ["Kevin Concua", "fixed_interest", 20, 0, null],
      ["Townson Family", "profit_share", 50, 0, null],
      ["Julio Arriola", "fixed_interest", 25, 0, null],
      ["Rony Schumann", "fixed_interest", 18, 0, null],
      ["Doctores Motta", "fixed_interest", 20, 0, null],
      ["Sir Percival", "profit_share", 50, 400_000, W.percival.id],
    ]);
    expect(realm.warPlanDefaults.inputs.investorMix).toEqual(mix);
  });

  it("a matched prefill takes the sponsor's id and deployed capital", () => {
    const kevin = { ...realm.investors[0]!, name: "Kevin Concua", capitalDeployed: 1_234_567.4 };
    const mix = prefillInvestorMix([kevin]);
    expect(mix[0]).toEqual({ investorId: kevin.investorId, name: "Kevin Concua", dealType: "fixed_interest", ratePct: 20, capital: 1_234_567 });
    expect(mix).toHaveLength(5);
  });
});

function oracleFarm(over: Partial<OracleFarm>): OracleFarm {
  return { index: 0, purchaseMonth: 1, landMonth: 1, lots: 10, cost: 500_000, funding: [], unfunded: 0, recycled: 0, turnCompletesMonth: null, turnComplete: false, lotsClosedByDeadline: 0, notesSoldByDeadline: 0, tooLate: false, ...over };
}
const kevinMix: InvestorMixEntry[] = [{ investorId: "kevin", name: "Kevin Concua", dealType: "fixed_interest", ratePct: 20, capital: 500_000 }];
const column = (over: Partial<WarPlanColumn>): WarPlanColumn => ({ schedule: [], totalDeployed: 0, capitalToRaise: 0, turnsIncomplete: 0, targetAtDeadline: 0, ...over }) as unknown as WarPlanColumn;

describe("rotationPlan", () => {
  const grid = buildMonthGrid(ASOF, d(DEADLINE), true);
  const farm0 = oracleFarm({ index: 0, purchaseMonth: 3, turnCompletesMonth: 9, turnComplete: true, funding: [{ mixIndex: 0, investorId: "kevin", name: "Kevin Concua", dealType: "fixed_interest", ratePct: 20, amount: 500_000 }] });
  const farm1 = oracleFarm({ index: 1, purchaseMonth: 10, turnCompletesMonth: 16, turnComplete: true, recycled: 500_000, funding: [{ mixIndex: 0, investorId: "kevin", name: "Kevin Concua", dealType: "fixed_interest", ratePct: 20, amount: 500_000 }] });
  const twoTurns = column({ schedule: [farm0, farm1], totalDeployed: 1_000_000, capitalToRaise: 500_000, targetAtDeadline: 10_000_000 });

  it("two farms on the same $500K, six months apart: peak $500K, 2 turns, first turn by Nov 2026, last completes Dec 2027", () => {
    const plan = rotationPlan(twoTurns, kevinMix, 6, 0, grid.deadlineIndex, grid, realm.goal, true, 30);
    expect(plan).toMatchObject({
      cycleMonths: 6,
      totalDeployed: 1_000_000,
      peakOutstanding: 500_000,
      newMoney: 500_000,
      recycled: 500_000,
      turnsNeeded: 2,
      turnsCompleted: 0,
      turnsIncomplete: 0,
      farms: 2,
      firstTurnStartBy: "2026-11-30",
      lastTurnCompletes: "2027-12-31",
      perInvestor: [{ mixIndex: 0, name: "Kevin Concua", deployed: 1_000_000, fresh: 500_000, peakOutstanding: 500_000, turns: 2 }],
      headline: "With $500K of land capital rotating every 6.0 months you reach $10.0M by the deadline; you need 2 turns; the first turn must start by Nov 2026.",
    });
  });

  it("an incomplete turn is called out", () => {
    const plan = rotationPlan(column({ ...twoTurns, turnsIncomplete: 1 }), kevinMix, 6, 0, grid.deadlineIndex, grid, realm.goal, true, 30);
    expect(plan.headline).toBe("With $500K of land capital rotating every 6.0 months you reach $10.0M by the deadline; you need 2 turns; the first turn must start by Nov 2026. 1 of the 2 turns cannot complete before the deadline.");
  });

  it("without a cycle nothing rotates: both farms' capital is out at once", () => {
    const noCycle = column({ schedule: [oracleFarm({ ...farm0, turnCompletesMonth: null }), oracleFarm({ ...farm1, turnCompletesMonth: null, recycled: 0 })], totalDeployed: 1_000_000, capitalToRaise: 1_000_000 });
    const plan = rotationPlan(noCycle, kevinMix, null, 0, grid.deadlineIndex, grid, realm.goal, true, 30);
    expect(plan).toMatchObject({ cycleMonths: null, peakOutstanding: 1_000_000, turnsNeeded: 1, lastTurnCompletes: null, firstTurnStartBy: "2026-11-30" });
    expect(plan.headline).toBe(
      "The length of a capital turn is unknown — no freed farm to measure it, none projectable, or the input left blank — so the plan needs $1.0M of land capital across 2 farms with nothing rotating; the first must be bought by Nov 2026.",
    );
  });

  it("deadline not in the future", () => {
    expect(rotationPlan(twoTurns, kevinMix, 6, 0, 0, grid, realm.goal, true, 30).headline).toBe("The target is already met: no land capital has to turn.");
    expect(rotationPlan(twoTurns, kevinMix, 6, 0, 0, grid, realm.goal, false, 30).headline).toBe(`The deadline ${DEADLINE} is not in the future: no capital turn can start before it.`);
  });

  it("no farm planned", () => {
    const none = column({ schedule: [], totalDeployed: 0 });
    expect(rotationPlan(none, kevinMix, 6, 0, grid.deadlineIndex, grid, realm.goal, true, 30)).toMatchObject({ turnsNeeded: null, farms: 0, firstTurnStartBy: null, lastTurnCompletes: null, headline: `Today's 30 lots reach $10.0M by ${DEADLINE} without a new farm: no land capital has to turn.` });
    expect(rotationPlan(none, kevinMix, 6, 0, grid.deadlineIndex, grid, realm.goal, false, 30).headline).toBe(`No pace reaches $10.0M by ${DEADLINE} from today's 30 lots, and no farm bought now could convert in time: no capital turn helps.`);
  });

  it("unreachable target", () => {
    const plan = rotationPlan(column({ ...twoTurns, targetAtDeadline: 4_200_000 }), kevinMix, 6, 0, grid.deadlineIndex, grid, realm.goal, false, 30);
    expect(plan.headline).toBe(`No pace reaches $10.0M by ${DEADLINE}: even $500K of land capital rotating every 6.0 months (2 turns across 2 farms) lands at $4.2M.`);
  });
});

describe("warPlanVerdict", () => {
  const required = (over: Partial<WarPlanColumn>): WarPlanColumn =>
    column({ closingsPerMonth: 2.6, farmsToBuy: 2, lastPurchaseDate: "2027-04-30", capitalToRaise: 1_000_000, funding: [{ mixIndex: 0, investorId: "kevin", name: "Kevin Concua", amount: 1_000_000, deployed: 1_000_000 }], unfunded: 0, noteSalesPerMonth: 2.6, adSpendPerMonth: 7_000, targetAtDeadline: 10_000_000, ...over });
  const plan = (r: WarPlanColumn, over: Partial<WarPlan> = {}): WarPlan =>
    ({ required: r, goal: realm.goal, deadlineMonthIndex: 16, feasible: true, startInventory: 30, lastClosingDate: null, ...over }) as unknown as WarPlan;

  it("the full sentence", () => {
    expect(warPlanVerdict(plan(required({})))).toBe("Buy 2 farms, the last one no later than Apr 2027, raise $1.0M (Kevin Concua $1.0M), close 2.6 lots/month, sell 2.6 notes/month and spend at least $7K/month on ads.");
    expect(warPlanVerdict(plan(required({ farmsToBuy: 1 })))).toBe("Buy 1 farm, the last one no later than Apr 2027, raise $1.0M (Kevin Concua $1.0M), close 2.6 lots/month, sell 2.6 notes/month and spend at least $7K/month on ads.");
  });

  it("no farm needed, cash mode stops closing early", () => {
    const r = required({ farmsToBuy: 0, lastPurchaseDate: null, capitalToRaise: 0, funding: [], closingsPerMonth: 1.5, noteSalesPerMonth: 1.5, adSpendPerMonth: 4_000 });
    expect(warPlanVerdict(plan(r, { lastClosingDate: "2027-10-31" }))).toBe("Buy 0 farms — today's 30 lots are enough, raise $0, close 1.5 lots/month until Oct 2027 (then only note sales), sell 1.5 notes/month and spend at least $4K/month on ads.");
  });

  it("target met / deadline passed", () => {
    expect(warPlanVerdict(plan(required({}), { deadlineMonthIndex: 0, feasible: true }))).toBe("The target is already met: $10.0M is in hand, buy 0 farms and raise $0.");
    expect(warPlanVerdict(plan(required({ closingsPerMonth: 0 })))).toBe("The target is already met: $10.0M is in hand, buy 0 farms and raise $0.");
    expect(warPlanVerdict(plan(required({}), { deadlineMonthIndex: 0, feasible: false }))).toBe(`The deadline ${DEADLINE} is not in the future: no plan can add closings before it, so buy 0 farms and raise $0.`);
  });

  it("unreachable, with the unfunded remainder named", () => {
    const r = required({ closingsPerMonth: 60, farmsToBuy: 3, capitalToRaise: 1_500_000, unfunded: 500_000, targetAtDeadline: 4_200_000 });
    expect(warPlanVerdict(plan(r, { feasible: false }))).toBe(`No pace reaches $10.0M by ${DEADLINE}: even 60.0 lots/month with 3 farms and $1.5M raised (Kevin Concua $1.0M, unfunded $500K) lands at $4.2M. Push the deadline or lower the target.`);
  });

  it("is what the solved realm speaks", () => {
    expect(realm.warPlan.verdict).toBe(warPlanVerdict(realm.warPlan));
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// exodus.ts
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("noteSaleRatioReal", () => {
  it("Wold: one farm-note sale at $95,000 on $123,500 financed → 0.7692; the legacy sale has no financed amount and only counts as a sale", () => {
    expect(noteSaleRatioReal(W.snap.notes, W.snap.noteSales, 0.8)).toEqual({
      used: 0.7692,
      basis: "combined",
      combined: 0.7692,
      discountBased: null,
      financedBased: 0.7692,
      literal: null,
      sales: 2,
      salesWithDiscount: 0,
      salesWithFinanced: 1,
      discountIsPercent: false,
    });
  });

  it("a recorded discount of 20 % on a $100,000 balance sold for $80,000 reads 0.8; the brief's literal formula reads ≈ 1", () => {
    const n = note("p", { financed_amount: 100_000, current_upb: 100_000 });
    const s = noteSale(n.id, { sale_price: 80_000, discount_from_upb: 20 });
    expect(noteSaleRatioReal([n], [s], 0.5)).toEqual({
      used: 0.8,
      basis: "combined",
      combined: 0.8,
      discountBased: 0.8,
      financedBased: 0.8,
      literal: 0.9998, // 80,000 ÷ (80,000 + 20)
      sales: 1,
      salesWithDiscount: 1,
      salesWithFinanced: 1,
      discountIsPercent: true,
    });
  });

  it("no sale → the fallback, on the Oracle basis", () => {
    expect(noteSaleRatioReal(W.snap.notes, [], 0.8)).toEqual({ used: 0.8, basis: "oracle", combined: null, discountBased: null, financedBased: null, literal: null, sales: 0, salesWithDiscount: 0, salesWithFinanced: 0, discountIsPercent: false });
    expect(noteSaleRatioReal([], [noteSale("nope", { sale_price: 0 })], 0.8).sales).toBe(0);
  });
});

describe("futureNoteTerms", () => {
  it("Wold: two farm notes at 10 % / 120 and 12 % / 180 → 11 % over 150 months on $118,000 less 5 % down", () => {
    const t = futureNoteTerms(W.snap, 118_000, 5);
    expect(t).toMatchObject({ annualRate: 0.11, termMonths: 150, faceValue: 112_100, notes: 2, avgSalePrice: 118_000, downPaymentPct: 5 });
    // level payment: 112,100 × (0.11/12) ÷ (1 − (1 + 0.11/12)^−150)
    expect(t.monthlyPayment).toBe(1_378.25);
  });

  it("no farm note → 10 % over 120 months", () => {
    const t = futureNoteTerms(snapshot(), 120_000, 5);
    expect(t).toMatchObject({ annualRate: 0.1, termMonths: 120, faceValue: 114_000, monthlyPayment: 1_506.52, notes: 0 });
  });
});

describe("compareVersusCash", () => {
  const scenario = { notesDelivered: 3_000_000, hitDate: "2027-06-15", hitMonthIndex: 10, lotsNeeded: 40 } as unknown as ExodusScenario;
  const baseline = { notesDelivered: 0, hitDate: "2027-10-20", hitMonthIndex: 14, lotsNeeded: 55, lotsClosedTotal: 60 } as unknown as ExodusScenario;

  it("$3M of notes at a 0.8 sale ratio saves $600,000 of discount, 15 lots and 127 days (4.17 months)", () => {
    expect(compareVersusCash(scenario, baseline, 0.8)).toEqual({ discountSaved: 600_000, lotsNotNeeded: 15, monthsEarlier: 4.17, daysEarlier: 127, baselineHitDate: "2027-10-20", scenarioHitDate: "2027-06-15" });
  });

  it("a baseline that never returns the capital compares against every lot it closes; a scenario that never does has no lots not needed", () => {
    const never = { ...baseline, hitDate: null, hitMonthIndex: null };
    expect(compareVersusCash(scenario, never, 0.8)).toMatchObject({ lotsNotNeeded: 20, monthsEarlier: null, daysEarlier: null, baselineHitDate: null });
    expect(compareVersusCash({ ...scenario, hitDate: null, hitMonthIndex: null }, baseline, 0.8)).toMatchObject({ lotsNotNeeded: null, monthsEarlier: null, daysEarlier: null });
  });

  it("clamps the ratio to [0, 1]", () => {
    expect(compareVersusCash(scenario, baseline, 1.5).discountSaved).toBe(0);
    expect(compareVersusCash(scenario, baseline, -0.5).discountSaved).toBe(3_000_000);
  });
});

describe("reconcileWithWarPlan", () => {
  const warPlan = realm.warPlanDefaults.inputs;
  const base = prepareExodus({ lpCapital: 1_000_000, deadline: DEADLINE, warPlan, excludedNoteCodes: [] }, realm);
  const baseline = runExodus(base, { lpCapital: 1_000_000, notesPct: 0, noteSaleRatio: 0.8, startingCash: 0 });
  const rec = reconcileWithWarPlan(base, baseline);

  it("production is the War Plan's, month for month, and the farms bought are the sources replayed", () => {
    const rows = base.warPlan.required.rows.filter((r) => r.monthIndex <= base.k);
    const wpLots = round2(sum(rows.map((r) => r.lotsClosed * (r.monthIndex === base.k ? base.grid.deadlineFraction : 1))));
    const wpAds = round2(sum(rows.map((r) => r.adSpend * (r.monthIndex === base.k ? base.grid.deadlineFraction : 1))));
    expect(rec.production).toEqual({
      lotsClosed: round2(baseline.lotsClosedTotal),
      warPlanLotsClosed: wpLots,
      farmsBought: base.sources.filter((s) => s.kind === "wp_farm").length,
      warPlanFarmsBought: base.warPlan.required.farmsToBuy,
      adSpend: round2(baseline.adSpend),
      warPlanAdSpend: wpAds,
      closingsMatch: true,
    });
    expect(rec.production.lotsClosed).toBeCloseTo(rec.production.warPlanLotsClosed, 1);
    expect(rec.production.adSpend).toBeCloseTo(rec.production.warPlanAdSpend, 0);
    expect(rec.production.farmsBought).toBe(rec.production.warPlanFarmsBought);
  });

  it("the bridge walks from the War Plan's cash figure to the baseline's cash paid, to the cent, with the residual closing whatever is left", () => {
    const b = rec.bridge;
    const explained = rec.warPlanCash.warPlanTargetAtDeadline + b.replayDrift + b.startingPosition + b.receipts + b.existingNotes + b.partnerPayments + b.settlementSpend + b.adSpend + b.unpaidCarry + b.residual;
    expect(explained).toBeCloseTo(rec.baselineCashPaid, 1);
    expect(rec.baselineCashPaid).toBe(baseline.cashPaidToLPs);
    expect(rec.warPlanCash).toBe(base.warPlanCash);
    // a 0 % notes baseline settles nothing and pays the plan's ad spend
    expect(b.settlementSpend).toBeCloseTo(0, 6);
    expect(b.adSpend).toBeCloseTo(-baseline.adSpend, 2);
    expect(b.startingPosition).toBe(round2(0 - rec.warPlanCash.start));
    expect(b.existingNotes).toBe(round2(baseline.flows.existingReceipts - baseline.flows.existingPartnerPaid));
    expect(b.unpaidCarry).toBe(round2(baseline.flows.cashCarriedAtDeadline));
  });
});

// ———————————————————————————————————————————————————————————————————————————————————————————————
// Edge cases the audit brief lists
// ———————————————————————————————————————————————————————————————————————————————————————————————

describe("edge: zero closings", () => {
  const snap = snapshot({ farmAcquisitions: [W.ashdown], properties: W.a, investors: [] });
  const r = buildRealm(snap, ASOF);

  it("the goal has no pace to measure and every derived figure is null or zero", () => {
    expect(r.goal).toMatchObject({
      netProfitToDate: 0,
      closedLots: 0,
      availableLots: 10,
      remaining: 10_000_000,
      pctComplete: 0,
      closedLotsTrailing: 0,
      closedLotsPerMonth: 0,
      avgNetProfitPerClosedLot: null,
      lotsStillNeeded: null,
      monthsAtCurrentPace: null,
      projectedDate: null,
      requiredLotsPerMonthToHitDeadline: null,
      inventoryGap: null,
      farmsStillNeeded: null,
      onTrack: null,
      verdict: "No closed lots yet — the chronicle has no pace to measure.",
    });
    expect(r.oxygen).toMatchObject({ totalDaysGained: 0, best: null, latest: null, netProfitPerDayAtPace: null, trailingDaysGained: 0, provisionalDaysGained: 0 });
    expect(r.history).toEqual([]);
    expect(r.events.map((e) => e.kind)).toEqual(["farm_acquired"]);
    expect(r.debt).toMatchObject({ firstCloseDate: null, actualNetProfitPerDay: null, actualSince: null, actualDays: 0, requiredNetProfitPerDay: 21_008.4 }); // 10,000,000 ÷ 476
    expect(r.story.cards.find((c) => c.id === "claimed")?.line).toBe("0 lots closed for $0 of net profit — 0.0% of the ten million.");
    expect(r.story.cards.some((c) => c.id === "oxygen")).toBe(false);
    expect(r.treasury).toMatchObject({ months: [], totalCashIn: 0, net: 0 });
  });
});

describe("edge: a single closing", () => {
  const snap = snapshot({ farmAcquisitions: [W.ashdown], properties: W.a, fileCases: [W.fcA1], notes: [W.nA1], investors: [] });
  const r = buildRealm(snap, ASOF);

  it("average from one lot, no closing in the trailing window → 142 lots still needed at 9.08/month, nothing projectable", () => {
    expect(r.goal).toMatchObject({
      netProfitToDate: 70_000,
      closedLots: 1,
      avgNetProfitPerClosedLot: 70_000,
      closedLotsTrailing: 0,
      closedLotsPerMonth: 0,
      lotsStillNeeded: 142, // ceil(9,930,000 ÷ 70,000 = 141.86)
      requiredLotsPerMonthToHitDeadline: 9.08, // 142 ÷ 15.6386
      monthsAtCurrentPace: null,
      projectedDate: null,
      onTrack: null,
      verdict: "You need 9.08 lots/month; you closed none in the last 90 days.",
    });
    expect(r.oxygen.perLot.get(W.a1.id)?.daysGained).toBe(90);
    expect(r.oxygen).toMatchObject({ totalDaysGained: 90, trailingDaysGained: 0, netProfitPerDayAtPace: null });
    expect(r.history.map((h) => [h.label, h.reservations, h.closings, h.netProfit])).toEqual([
      ["Mar 26", 1, 0, 0],
      ["Apr 26", 0, 1, 70_000],
      ["May 26", 0, 0, 0],
      ["Jun 26", 0, 0, 0],
      ["Jul 26", 0, 0, 0],
      ["Aug 26", 0, 0, 0],
      ["Sep 26", 0, 0, 0],
    ]);
    expect(r.debt).toMatchObject({ firstCloseDate: "2026-04-10", actualDays: 154, actualNetProfitPerDay: 454.55 }); // 70,000 ÷ 154
  });
});

describe("edge: a closing with a null netProfit (completed file case without a price)", () => {
  const a5 = W.a[4]!;
  const fcA5 = fileCase(a5.id, { status: "completed", sale_price: null, down_payment: null, reservation_date: "2026-07-01", closing_date: "2026-08-05", created_at: "2026-07-01T00:00:00Z" });
  const r = buildRealm({ ...W.snap, fileCases: [...W.snap.fileCases, fcA5] }, ASOF);
  const a5Lot = r.lots.find((l) => l.propertyId === a5.id) as Lot;

  it("counts as a closing with $0 of profit: 4 closed, still $177,000, average $44,250", () => {
    expect(a5Lot).toMatchObject({ stage: "closed", salePrice: null, grossProfit: null, netProfit: null, cashRealized: 0, closeDate: "2026-08-05" });
    expect(r.goal).toMatchObject({ closedLots: 4, netProfitToDate: 177_000, avgNetProfitPerClosedLot: 44_250, revenueToDate: 354_000, closedLotsTrailing: 3, closedLotsPerMonth: 1.01 });
    const ev = r.events.find((e) => e.id === `closing:${a5.id}`) as RealmEvent;
    expect(ev).toMatchObject({ amount: null, description: "financed · net —", cumulativeNetProfit: 177_000 });
    expect(r.oxygen.perLot.get(a5.id)).toMatchObject({ netProfit: 0, daysGained: 0 });
    expect(r.oxygen.totalDaysGained).toBe(152);
    expect(r.narrative.get(`closing:${a5.id}`)).toBe("On August 5, Buyer One claimed Lot 5 of Ashdown, 35 days after Buyer's reservation. The exit date did not move.");
    expect(r.history.find((h) => h.month === "2026-08-01")).toMatchObject({ closings: 1, netProfit: 0, reservations: 1 });
    expect(r.treasury.months.find((m) => m.month === "2026-08")?.downPayments).toBe(0);
  });
});

describe("edge: a reservation with no reservationDate (Ashdown Lot 4)", () => {
  const lot4 = lotOf(W.a4.id);

  it("is reserved with money at stake but has no date-derived figure anywhere", () => {
    expect(lot4).toMatchObject({ stage: "reserved", reservationDate: null, daysInPipeline: null, grossProfit: 60_000, netProfit: null, salePrice: 110_000 });
    expect(realm.goal.reservedLots).toBe(2);
    expect(realm.goal.netProfitInPipeline).toBe(135_000); // 75,000 + 60,000: it counts toward the pipeline
    expect(realm.pipeline.pipelineNetProfit).toBe(135_000);
    expect(realm.pipeline.conversion).toMatchObject({ cohort: 3, closed: 3, cancelled: 1, pctWithCancellations: 75 }); // not in the cohort
    expect(realm.pipeline.stuck.some((s) => s.propertyId === W.a4.id)).toBe(false);
    expect(realm.expected.lots.some((l) => l.propertyId === W.a4.id)).toBe(false);
    expect(realm.events.some((e) => e.propertyId === W.a4.id)).toBe(false);
    expect(realm.oxygen.provisional.has(W.a4.id)).toBe(false);
    expect(realm.history.reduce((s, h) => s + h.reservations, 0)).toBe(4); // Lots 1, 2, 3 and Blackmoor 1 — not Lot 4, not the cancelled pledge
  });
});

describe("edge: a farm with no funding date (Blackmoor)", () => {
  it("is dated by its acquisition everywhere a date is needed", () => {
    expect(realm.interestByFarm.get(W.blackmoor.id)).toMatchObject({ accrualStart: "2026-02-01", capitalReturned: 100_000, outstandingPrincipal: 300_000, paidToDate: 12_500, accruedToDate: 0 });
    expect(realm.farms[1]).toMatchObject({ name: "Blackmoor", fundingDate: null, monthsSinceFunding: 7.29 });
    expect(eventById(`farm:${W.blackmoor.id}`).date).toBe("2026-02-01");
    expect(realm.farmCadence).toMatchObject({ months: 3, measured: false, farms: 1, excluded: 2, fundingDates: ["2026-12-01"] });
    expect(deriveOracleDefaults(realm.lots, realm.farms, realm.goal, { eraStart: null }).newFarmEveryMonths).toBe(5.49); // 2026-02-01 counted
    expect(realm.liberation.hostages[0]).toMatchObject({ farmName: "Blackmoor", capital: 400_000, capitalReturned: 100_000, pctReturned: 25, freed: false, daysHeld: null, capitalOutstanding: 300_000, paidOnTop: 12_500 });
  });
});

describe("edge: asOf before the first event (2025-12-01)", () => {
  const early = buildRealm(W.snap, d("2025-12-01"));

  it("totals keep every closing, rates have nothing to measure, everything but Olney is in the future", () => {
    expect(early.era).toBeNull();
    expect(early.goal).toMatchObject({ netProfitToDate: 177_000, closedLots: 3, closedLotsTrailing: 0, closedLotsPerMonth: 0, daysToDeadline: 760, monthsToDeadline: 24.97, requiredLotsPerMonthToHitDeadline: 6.69 }); // 167 ÷ 24.9692
    expect(early.goal.verdict).toBe("You need 6.69 lots/month; you closed none in the last 90 days.");
    expect(early.events.filter((e) => !e.future).map((e) => e.id)).toEqual([`farm:${W.olney.id}`]);
    expect(early.events.every((e) => e.cumulativeNetProfit === 0)).toBe(true);
    expect(early.history).toEqual([]);
    expect(early.oxygen).toMatchObject({ totalDaysGained: 0, netProfitPerDayAtPace: null });
    expect([...early.oxygen.perLot.values()].map((o) => o.measuredOn)).toEqual(["2025-12-01", "2025-12-01", "2025-12-01"]);
    expect(early.farms.map((f) => f.monthsSinceFunding)).toEqual([null, null, null]);
    expect(early.debt).toMatchObject({ daysLeft: 760, requiredNetProfitPerDay: 12_925, actualNetProfitPerDay: null }); // 9,823,000 ÷ 760
    expect(early.treasury.totalCashIn).toBe(152_700); // the treasury is a ledger, not a measurement
    expect(early.narrative.get(`farm:${W.ashdown.id}`)).toBe("On January 1, 2026, the realm will claim the lands of Ashdown, $500,000 of its own gold pledged.");
  });
});

describe("edge: asOf after the deadline (2028-03-01)", () => {
  const late = buildRealm(W.snap, d("2028-03-01"));

  it("negative days, no required pace, the debt has no per-day figure, the plans say the deadline has passed", () => {
    expect(late.goal).toMatchObject({ daysToDeadline: -61, monthsToDeadline: -2, requiredLotsPerMonthToHitDeadline: null, lotsStillNeeded: 167, closedLotsTrailing: 0 });
    expect(late.goal.verdict).toBe("You need ? lots/month; you closed none in the last 90 days.");
    expect(late.debt).toMatchObject({ daysLeft: 0, requiredNetProfitPerDay: null, remainingNetProfit: 9_823_000 });
    expect(late.story.cards.find((c) => c.id === "debt")?.line).toBe("The deadline has passed. $9,823,000 was still missing.");
    expect(late.warPlan.deadlineMonthIndex).toBe(0);
    expect(late.warPlan.verdict).toBe(`The deadline ${DEADLINE} is not in the future: no plan can add closings before it, so buy 0 farms and raise $0.`);
    expect(late.warPlan.rotation.headline).toBe(`The deadline ${DEADLINE} is not in the future: no capital turn can start before it.`);
    expect(buildMonthGrid(d("2028-03-01"), d(DEADLINE), true)).toMatchObject({ deadlineIndex: 0, deadlineFraction: 0, monthsToDeadline: 0 });
    expect(late.farms[2]).toMatchObject({ name: "Cragmere", monthsSinceFunding: 14.98 }); // 2026-12-01 → 2028-03-01 = 456 days
  });
});

describe("edge: horizon in the past (deadline 2026-01-01 with asOf 2026-09-11)", () => {
  const past = buildRealm(W.snap, ASOF, { deadline: "2026-01-01" });

  it("the goal counts backwards, the futures fall back to the trailing pace, the plans refuse", () => {
    expect(past.goal).toMatchObject({ deadline: "2026-01-01", daysToDeadline: -253, monthsToDeadline: -8.31, requiredLotsPerMonthToHitDeadline: null, netProfitToDate: 177_000 });
    expect(past.goal.verdict).toBe("You need ? lots/month; you are doing 0.68.");
    expect(past.futures.required.params.lotsPerMonth).toBe(0.68);
    expect(past.warPlan.deadlineMonthIndex).toBe(0);
    expect(past.warPlan.verdict).toBe("The deadline 2026-01-01 is not in the future: no plan can add closings before it, so buy 0 farms and raise $0.");
    expect(past.warPlan.rotation.headline).toBe("The deadline 2026-01-01 is not in the future: no capital turn can start before it.");
    expect(past.debt).toMatchObject({ deadline: "2026-01-01", daysLeft: 0, requiredNetProfitPerDay: null });
    expect(past.story.cards.find((c) => c.id === "debt")?.line).toBe("The deadline has passed. $9,823,000 was still missing.");
  });
});