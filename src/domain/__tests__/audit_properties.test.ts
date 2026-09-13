/**
 * Numeric audit — property tests for the monotonic invariants the brief names:
 *  - a longer horizon never increases the required lots per month (goal.ts and futures.ts);
 *  - adding a closing never decreases netProfitToDate;
 *  - adding a closing never decreases the oxygen score — true for a closing entered in
 *    chronological order (dated after every closing already on the ledger). A closing dated on or
 *    before an existing one re-scores every later lot, because each lot's days are measured at the
 *    pace of its own closing day on "the ledger as it stood that day" (oxygen.ts). The last two
 *    tests pin that behaviour down (AUDIT.md finding F19, a model decision — not changed here).
 *
 * No property-testing library is a dependency, so the cases come from a small seeded generator:
 * every run sees the same cases, and a failing seed can be replayed by hand.
 */
import { describe, expect, it } from "vitest";
import { computeGoal } from "../goal";
import { computeOxygen } from "../oxygen";
import { computeFutures } from "../futures";
import type { OracleParams } from "../oracle";
import type { Lot } from "../lot";
import { addDays, daysBetween, parseDate, toIsoDate } from "../dates";
import { ASOF } from "./builders";

/** mulberry32 — a tiny seeded PRNG, enough to spread cases around. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

let seq = 0;
function lot(over: Partial<Lot>): Lot {
  seq += 1;
  return {
    propertyId: `p${seq}`,
    farmId: "f",
    farmName: "Testland",
    farmDealType: "own_capital",
    investorId: null,
    investorName: null,
    lotNumber: String(seq),
    name: `Testland — Lot ${seq}`,
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

function closed(closeDate: string, netProfit: number | null): Lot {
  const price = netProfit === null ? null : 50_000 + netProfit;
  return lot({
    stage: "closed",
    dealType: "financed",
    priceSource: "file_case",
    salePrice: price,
    downPayment: price === null ? null : Math.round(price * 0.05),
    grossProfit: netProfit,
    investorTake: 0,
    netProfit,
    cashRealized: price === null ? 0 : Math.round(price * 0.05),
    closeDate,
    reservationDate: toIsoDate(addDays(parseDate(closeDate) as Date, -30)),
  });
}

const iso = (daysFromAsOf: number) => toIsoDate(addDays(ASOF, daysFromAsOf));

/** 1–8 sold lots closed in the 250 days before asOf, nets 0..200,000 (a tenth of them exactly 0). */
function randomLedger(r: () => number): Lot[] {
  const n = int(r, 1, 8);
  return Array.from({ length: n }, () => closed(iso(-int(r, 1, 250)), r() < 0.1 ? 0 : int(r, 1, 200) * 1_000)).concat(
    Array.from({ length: int(r, 0, 5) }, () => lot({ stage: "available" })),
  );
}

const CASES = 200;

describe("property: a longer horizon never increases requiredLotsPerMonthToHitDeadline (computeGoal)", () => {
  it(`holds on ${CASES} random ledgers and deadline pairs`, () => {
    const r = rng(20260911);
    let checked = 0;
    for (let i = 0; i < CASES; i++) {
      const lots = randomLedger(r);
      const a = int(r, 1, 1400);
      const b = a + int(r, 1, 400);
      const near = computeGoal(lots, [], ASOF, { deadline: iso(a) });
      const far = computeGoal(lots, [], ASOF, { deadline: iso(b) });
      if (near.lotsStillNeeded === null) continue; // no positive average: nothing to require
      expect(far.lotsStillNeeded).toBe(near.lotsStillNeeded);
      expect(near.requiredLotsPerMonthToHitDeadline).not.toBeNull();
      expect(far.requiredLotsPerMonthToHitDeadline).not.toBeNull();
      expect(far.requiredLotsPerMonthToHitDeadline as number).toBeLessThanOrEqual(near.requiredLotsPerMonthToHitDeadline as number);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(CASES * 0.8);
  });

  it("is null once the deadline is not in the future, whatever the ledger", () => {
    const r = rng(7);
    for (let i = 0; i < 50; i++) {
      const lots = randomLedger(r);
      expect(computeGoal(lots, [], ASOF, { deadline: iso(-int(r, 0, 500)) }).requiredLotsPerMonthToHitDeadline).toBeNull();
    }
  });
});

describe("property: a longer horizon never increases the required pace of the Oracle's futures", () => {
  const params = (r: () => number): OracleParams => ({
    lotsPerMonth: int(r, 0, 30) / 10,
    avgSalePrice: 100_000 + int(r, 0, 60) * 1_000,
    avgLandCost: 30_000 + int(r, 0, 40) * 1_000,
    avgMonthsToSellNote: int(r, 0, 6),
    newFarmEveryMonths: int(r, 1, 12),
    avgLotsPerFarm: int(r, 4, 20),
    investorTakePct: int(r, 0, 50),
    downPaymentPct: 5,
    noteSalePct: 80,
  });

  it("holds while at least one whole month is left under both horizons", () => {
    const r = rng(1234);
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      const lots = randomLedger(r);
      const p = params(r);
      const a = int(r, 31, 900);
      const b = a + int(r, 1, 600);
      const near = computeFutures(p, computeGoal(lots, [], ASOF, { deadline: iso(a) }), 20, ASOF, 1);
      const far = computeFutures(p, computeGoal(lots, [], ASOF, { deadline: iso(b) }), 20, ASOF, 1);
      if (near.closingsOnly.result.lotsNeeded === null) continue; // no positive net profit per lot in these economics
      expect(far.closingsOnly.result.lotsNeeded).toBe(near.closingsOnly.result.lotsNeeded);
      expect(far.required.params.lotsPerMonth).toBeLessThanOrEqual(near.required.params.lotsPerMonth);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("property: adding a closing never decreases netProfitToDate", () => {
  it("a closing with a non-negative net profit adds exactly its net; a null net adds nothing", () => {
    const r = rng(99);
    for (let i = 0; i < CASES; i++) {
      const lots = randomLedger(r);
      const before = computeGoal(lots, [], ASOF).netProfitToDate;
      const net = int(r, 0, 300) * 1_000;
      const withOne = computeGoal([...lots, closed(iso(-int(r, 0, 300)), net)], [], ASOF).netProfitToDate;
      expect(withOne).toBeGreaterThanOrEqual(before);
      expect(withOne).toBe(before + net);
      const withNull = computeGoal([...lots, closed(iso(-int(r, 0, 300)), null)], [], ASOF);
      expect(withNull.netProfitToDate).toBe(before);
      expect(withNull.closedLots).toBe(lots.filter((l) => l.stage === "closed").length + 1);
    }
  });
});

describe("property: a closing entered in chronological order never decreases the oxygen score", () => {
  it("appending a closing dated after every closing on the ledger leaves every existing score untouched and adds a non-negative one", () => {
    const r = rng(2027);
    let checked = 0;
    for (let i = 0; i < CASES; i++) {
      const lots = randomLedger(r);
      const latest = lots
        .filter((l) => l.stage === "closed")
        .map((l) => l.closeDate as string)
        .sort()
        .at(-1) as string;
      const gap = daysBetween(parseDate(latest) as Date, ASOF);
      if (gap < 1) continue;
      const newDate = toIsoDate(addDays(parseDate(latest) as Date, int(r, 1, gap)));
      const extra = closed(newDate, r() < 0.1 ? 0 : int(r, 1, 300) * 1_000);

      const before = computeOxygen(lots, [], ASOF);
      const after = computeOxygen([...lots, extra], [], ASOF);
      for (const [id, o] of before.perLot) expect(after.perLot.get(id)?.daysGained).toBe(o.daysGained);
      expect(after.perLot.get(extra.propertyId)?.daysGained ?? -1).toBeGreaterThanOrEqual(0);
      expect(after.totalDaysGained).toBeGreaterThanOrEqual(before.totalDaysGained);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(CASES * 0.9);
  });

  it("a single closing is always worth 90 days: at its own pace (one closing in 90 days) its net profit is exactly 365.25 ÷ (0.34 × 12) = 89.5 days", () => {
    for (const net of [1_000, 27_000, 70_000, 300_000, 2_000_000]) {
      expect(computeOxygen([closed("2026-04-10", net)], [], ASOF).totalDaysGained).toBe(90);
    }
  });
});

describe("F19 (model decision): a closing dated on or before an existing one re-scores the later lots", () => {
  // The Wold trio from audit_coverage: 90 + 48 + 14 = 152 days.
  const trio = [closed("2026-04-10", 70_000), closed("2026-06-15", 80_000), closed("2026-07-01", 27_000)];

  it("backdating a $300,000 closing to 2026-04-01 lowers the total from 152 to 130", () => {
    const before = computeOxygen(trio, [], ASOF);
    expect(before.ranked.map((o) => o.daysGained)).toEqual([90, 48, 14]);
    expect(before.totalDaysGained).toBe(152);

    const z = closed("2026-04-01", 300_000);
    const after = computeOxygen([z, ...trio], [], ASOF);
    // Z alone on its day → 90. Then on Apr 10 the ledger holds Z and Lot 1: avg $185,000 × 0.68/month → $4,133.06/day → 70,000 ÷ 4,133.06 = 17.
    // Jun 15: {Z, 1, 2} avg $150,000 × 1.01 → $4,977.41/day → 80,000 ÷ 4,977.41 = 16. Jul 1: Z drops out of the 90-day window (dated Apr 1,
    // window opens after Apr 2) but still lifts the average: $119,250 × 1.01 → $3,957.04/day → 27,000 ÷ 3,957.04 = 7.
    expect([z, ...trio].map((l) => after.perLot.get(l.propertyId)?.daysGained)).toEqual([90, 17, 16, 7]);
    expect([z, ...trio].map((l) => after.perLot.get(l.propertyId)?.paceThatDay)).toEqual([3_351.13, 4_133.06, 4_977.41, 3_957.04]);
    expect(after.totalDaysGained).toBe(130);
    expect(after.totalDaysGained).toBeLessThan(before.totalDaysGained);
  });

  it("a second closing on the same day shares that day's ledger, and rounding can cost a day: 90 → 81 + 8 = 89", () => {
    const x = closed("2026-05-05", 100_000);
    const y = closed("2026-05-05", 10_000);
    expect(computeOxygen([x], [], ASOF).totalDaysGained).toBe(90);
    const both = computeOxygen([x, y], [], ASOF);
    expect(both.perLot.get(x.propertyId)?.daysGained).toBe(81);
    expect(both.perLot.get(y.propertyId)?.daysGained).toBe(8);
    expect(both.totalDaysGained).toBe(89);
  });
});
