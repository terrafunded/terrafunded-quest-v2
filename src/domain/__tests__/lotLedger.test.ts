/**
 * The lot ledger: a pure port of Payments' `compute_lot_ledger(p_farm_id, p_as_of)`.
 * Parity is proven against the RPC's raw rows stored in the fixture (`lotLedgers`, one entry per
 * fixed-interest farm, called as the viewer by `scripts/snapshot.ts` on 2026-09-11).
 */
import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { LotLedgerRpcResult, PaymentsSnapshot } from "../types";
import { accruedOn, computeLotLedger, computeLotLedgers, outstandingAt } from "../lotLedger";
import { round2 } from "../math";
import { cost, farm, fileCase, note, noteSale, property, snapshot, ASOF } from "./builders";

const fixture = raw as unknown as PaymentsSnapshot & { snapshotAt: string; lotLedgers: LotLedgerRpcResult[] };

describe("lot ledger: parity with Payments' compute_lot_ledger RPC (fixture, 2026-09-11)", () => {
  it("the fixture carries the RPC result for every fixed_interest farm — Eastland, Titus, Freestone, Avery, Franklin, Franklin 2 — 49 lots as of 2026-09-11", () => {
    const fixedInterest = fixture.farmAcquisitions.filter((f) => f.deal_type === "fixed_interest");
    expect(fixture.lotLedgers.map((l) => l.farmName)).toEqual(["Eastland", "Titus", "Freestone", "Avery", "Franklin", "Franklin 2"]);
    expect(new Set(fixture.lotLedgers.map((l) => l.farmId))).toEqual(new Set(fixedInterest.map((f) => f.id)));
    expect(fixture.lotLedgers.every((l) => l.asOf === "2026-09-11")).toBe(true);
    expect(fixture.lotLedgers.reduce((a, l) => a + l.rows.length, 0)).toBe(49);
    // the real column names of the RPC (recorded in payments_schema.md)
    expect(Object.keys(fixture.lotLedgers[0]!.rows[0]!).sort()).toEqual(
      ["accrued_return", "credit_detail", "credits", "first_cost_date", "floor_amount", "lot_balance", "lot_capital", "lot_number", "property_id", "released_at", "residual"].sort(),
    );
  });

  it("every lot of every fixed_interest farm matches the RPC on capital, accrued interest, credits, outstanding, residual and release date within $0.01", () => {
    let compared = 0;
    for (const rpc of fixture.lotLedgers) {
      const ledger = computeLotLedger(rpc.farmId, fixture, new Date(`${rpc.asOf}T00:00:00Z`));
      expect(ledger, rpc.farmName ?? rpc.farmId).not.toBeNull();
      expect(ledger!.lots).toHaveLength(rpc.rows.length);
      for (const row of rpc.rows) {
        const lot = ledger!.lots.find((l) => l.propertyId === row.property_id);
        const label = `${rpc.farmName} lot ${row.lot_number}`;
        expect(lot, label).toBeDefined();
        expect(Math.abs(lot!.capital - row.lot_capital), `${label} capital`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(lot!.accruedInterest - row.accrued_return), `${label} accrued`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(lot!.credits - row.credits), `${label} credits`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(lot!.outstanding - row.lot_balance), `${label} outstanding`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(lot!.residual - row.residual), `${label} residual`).toBeLessThanOrEqual(0.01);
        expect(lot!.released, `${label} released`).toBe(row.released_at);
        expect(lot!.lotNumber, label).toBe(row.lot_number);
        expect(lot!.firstCostDate, `${label} first cost`).toBe(row.first_cost_date);
        // the credits themselves: same dates, amounts and kinds
        const mine = [...lot!.creditEntries].sort((a, b) => a.dt.localeCompare(b.dt) || a.amt - b.amt).map((c) => [c.dt, round2(c.amt), c.kind]);
        const theirs = [...(row.credit_detail ?? [])].sort((a, b) => a.dt.localeCompare(b.dt) || a.amt - b.amt).map((c) => [c.dt, round2(c.amt), c.kind]);
        expect(mine, `${label} credit detail`).toEqual(theirs);
        compared += 1;
      }
    }
    expect(compared).toBe(49);
  });

  it("Eastland as of 2026-09-11: 11 lots at $51,363.64 of capital each (purchase + survey split equally), 5 released, the rest accruing 20 % on 382 days", () => {
    const eastland = fixture.farmAcquisitions.find((f) => f.farm_name === "Eastland")!;
    const ledger = computeLotLedger(eastland.id, fixture, ASOF)!;
    expect(ledger.ratePct).toBe(20);
    expect(ledger.lots).toHaveLength(11);
    expect(ledger.lots.every((l) => round2(l.capital) === round2(565_000 / 11))).toBe(true);
    // released by a note sale (2, 5, 8 after a down payment; 3 with no down payment) or a cash closing (6)
    expect(ledger.lots.filter((l) => l.released).map((l) => [l.lotNumber, l.released])).toEqual([
      ["2", "2026-09-03"],
      ["3", "2026-06-11"],
      ["5", "2026-08-28"],
      ["6", "2026-07-09"],
      ["8", "2026-09-08"],
    ]);
    // one Eastland property has no lot number yet; it still carries its equal share of the farm costs
    expect(ledger.lots.filter((l) => l.lotNumber === null)).toHaveLength(1);
    // Lot 4: $45,000 down payment on 2025-10-31, still $17,114.82 short today
    const lot4 = ledger.lots.find((l) => l.lotNumber === "4")!;
    expect(round2(lot4.outstanding)).toBe(17_114.82);
    expect(lot4.released).toBeNull();
    const unreleased = ledger.lots.filter((l) => !l.released);
    for (const l of unreleased) expect(round2(l.accruedInterest)).toBe(round2((565_000 / 11) * 0.2 * (382 / 365)));
    // Lot 6 is the cash deal completed on 2026-07-09 with no note: its $90,000 sale price is the credit
    const lot6 = ledger.lots.find((l) => l.lotNumber === "6")!;
    expect(lot6.creditEntries).toEqual([{ dt: "2026-07-09", amt: 90_000, kind: "cash_sale" }]);
    expect(lot6.outstanding).toBe(0);
    expect(lot6.residual).toBeGreaterThan(0);
    // a released lot costs nothing to release; an unreleased one costs its outstanding balance today
    expect(outstandingAt(lot6, ASOF)).toBe(0);
    const lot1 = ledger.lots.find((l) => l.lotNumber === "1")!;
    expect(round2(outstandingAt(lot1, ASOF))).toBe(round2(lot1.outstanding));
  });

  it("computeLotLedgers builds one ledger per fixed_interest farm by default and can take any deal type", () => {
    const fixed = computeLotLedgers(fixture, ASOF);
    expect([...fixed.values()].map((l) => l.farmName)).toEqual(["Eastland", "Titus", "Freestone", "Avery", "Franklin", "Franklin 2"]);
    const profitShare = computeLotLedgers(fixture, ASOF, "profit_share");
    expect([...profitShare.values()].map((l) => l.farmName)).toEqual(["Lamar", "Wichita"]);
    const all = computeLotLedgers(fixture, ASOF, null);
    expect(all.size).toBe(fixture.farmAcquisitions.length);
  });
});

describe("lot ledger: the rule, on synthetic farms", () => {
  const rate20 = { deal_type: "fixed_interest", annual_interest_rate: 20 } as const;

  it("the rate is a PERCENT: 20 means 20 % a year, so $100,000 accrues $20,000 in 365 days", () => {
    const f = farm({ ...rate20, total_lots: 1 });
    const p = property(f.id, 1);
    const s = snapshot({ farmAcquisitions: [f], properties: [p], propertyCosts: [cost(f.id, { property_id: p.id, cost_date: "2025-01-01", amount: 100_000 })] });
    const ledger = computeLotLedger(f.id, s, new Date("2026-01-01T00:00:00Z"))!;
    expect(ledger.lots[0]).toMatchObject({ capital: 100_000, accruedInterest: 20_000, credits: 0, outstanding: 120_000, released: null, residual: 0 });
    expect(accruedOn([{ amt: 100_000, dt: "2025-01-01" }], 20, "2026-01-01")).toBe(20_000);
    // a fraction would be a hundred times too small — never mix notes.interest_rate (0.10) in here
    expect(accruedOn([{ amt: 100_000, dt: "2025-01-01" }], 0.2, "2026-01-01")).toBe(200);
  });

  it("a farm-level cost (property_id null) splits equally among the lots not yet released on that date; a lot-level cost goes to its lot", () => {
    const f = farm({ ...rate20, total_lots: 4 });
    const lots = [1, 2, 3, 4].map((n) => property(f.id, n));
    const s = snapshot({
      farmAcquisitions: [f],
      properties: lots,
      propertyCosts: [
        cost(f.id, { cost_date: "2026-01-01", amount: 400_000 }),
        cost(f.id, { cost_date: "2026-01-01", amount: 8_000, category: "survey" }),
        cost(f.id, { property_id: lots[0]!.id, cost_date: "2026-02-01", amount: 5_000, category: "fence" }),
      ],
    });
    const ledger = computeLotLedger(f.id, s, new Date("2026-03-01T00:00:00Z"))!;
    expect(ledger.lots.map((l) => l.capital)).toEqual([107_000, 102_000, 102_000, 102_000]);
    expect(ledger.lots[0]!.capitalEntries).toEqual([
      { amt: 100_000, dt: "2026-01-01" },
      { amt: 2_000, dt: "2026-01-01" },
      { amt: 5_000, dt: "2026-02-01" },
    ]);
    expect(ledger.lots[0]!.firstCostDate).toBe("2026-01-01");
  });

  it("a released lot takes no share of later farm-level costs; when every lot is released the cost is skipped", () => {
    const f = farm({ ...rate20, total_lots: 2 });
    const [a, b] = [property(f.id, 1), property(f.id, 2)];
    const s = snapshot({
      farmAcquisitions: [f],
      properties: [a, b],
      propertyCosts: [cost(f.id, { cost_date: "2026-01-01", amount: 20_000 }), cost(f.id, { cost_date: "2026-06-01", amount: 6_000, category: "road" })],
      notes: [note(a.id, { start_date: "2026-03-01", down_payment: 50_000 })],
    });
    const ledger = computeLotLedger(f.id, s, new Date("2026-07-01T00:00:00Z"))!;
    const lotA = ledger.lots.find((l) => l.propertyId === a.id)!;
    const lotB = ledger.lots.find((l) => l.propertyId === b.id)!;
    expect(lotA.released).toBe("2026-03-01");
    expect(lotA.capital).toBe(10_000);
    expect(lotB.capital).toBe(16_000);
    // both released before the road: nobody carries it
    const s2 = snapshot({ ...s, notes: [note(a.id, { start_date: "2026-03-01", down_payment: 50_000 }), note(b.id, { start_date: "2026-03-01", down_payment: 50_000 })] });
    const ledger2 = computeLotLedger(f.id, s2, new Date("2026-07-01T00:00:00Z"))!;
    expect(ledger2.lots.map((l) => l.capital)).toEqual([10_000, 10_000]);
  });

  it("on the same date costs are processed before credits, so a same-day credit pays the cost just booked", () => {
    const f = farm({ ...rate20, total_lots: 1 });
    const p = property(f.id, 1);
    const s = snapshot({
      farmAcquisitions: [f],
      properties: [p],
      notes: [note(p.id, { start_date: "2026-01-01", down_payment: 30_000 })],
      propertyCosts: [cost(f.id, { cost_date: "2026-01-01", amount: 25_000 })],
    });
    const lot = computeLotLedger(f.id, s, new Date("2026-06-01T00:00:00Z"))!.lots[0]!;
    // balance on Jan 1 = 25,000 + 0 interest − 30,000 = −5,000 → released that day, $5,000 residual, credits capped at 25,000
    expect(lot).toMatchObject({ capital: 25_000, credits: 25_000, released: "2026-01-01", residual: 5_000, outstanding: 0, accruedInterest: 0 });
  });

  it("credits are capped at the balance on the release day; every later credit is residual and never reopens the lot", () => {
    const f = farm({ ...rate20, total_lots: 1 });
    const p = property(f.id, 1);
    const n = note(p.id, { start_date: "2026-01-01", down_payment: 10_000 });
    const s = snapshot({
      farmAcquisitions: [f],
      properties: [p],
      propertyCosts: [cost(f.id, { cost_date: "2025-01-01", amount: 100_000 })],
      notes: [n],
      noteSales: [noteSale(n.id, { sale_date: "2026-07-01", sale_price: 150_000 }), noteSale(n.id, { sale_date: "2026-08-01", sale_price: 1_000 })],
    });
    const lot = computeLotLedger(f.id, s, new Date("2026-09-01T00:00:00Z"))!.lots[0]!;
    // 2026-07-01: 546 days of 20 % on 100,000 = 29,917.81; balance = 100,000 + 29,917.81 − 10,000 − 150,000 = −30,082.19
    const interest = (100_000 * 0.2 * 546) / 365;
    expect(round2(lot.accruedInterest)).toBe(round2(interest));
    expect(lot.released).toBe("2026-07-01");
    expect(round2(lot.credits)).toBe(round2(100_000 + interest));
    expect(round2(lot.residual)).toBe(round2(160_000 - (100_000 + interest) + 1_000));
    expect(lot.outstanding).toBe(0);
    // interest stops on the release day even though asOf is two months later
    expect(round2(lot.accruedInterest)).toBe(round2(accruedOn(lot.capitalEntries, 20, "2026-07-01")));
  });

  it("credits: a note's down payment on its start date; a note sale on its sale date; a completed cash case on its closing date only when the lot has no note", () => {
    const f = farm({ ...rate20, total_lots: 3 });
    const [a, b, c] = [property(f.id, 1), property(f.id, 2), property(f.id, 3)];
    const na = note(a.id, { start_date: "2026-02-01", down_payment: 6_000 });
    const nb = note(b.id, { start_date: "2026-02-01", down_payment: 6_000 });
    const s = snapshot({
      farmAcquisitions: [f],
      properties: [a, b, c],
      propertyCosts: [cost(f.id, { cost_date: "2026-01-01", amount: 300_000 })],
      notes: [na, nb],
      noteSales: [noteSale(na.id, { sale_date: "2026-05-01", sale_price: 90_000 })],
      fileCases: [
        fileCase(b.id, { deal_type: "cash", status: "completed", closing_date: "2026-04-01", sale_price: 80_000 }), // has a note → not a cash credit
        fileCase(c.id, { deal_type: "cash", status: "completed", closing_date: "2026-04-01", sale_price: 80_000 }),
        fileCase(c.id, { deal_type: "cash", status: "active", closing_date: "2026-04-15", sale_price: 999 }), // not completed
        fileCase(c.id, { deal_type: "cash", status: "completed", closing_date: null, sale_price: 999 }), // no date
      ],
    });
    const ledger = computeLotLedger(f.id, s, new Date("2026-06-01T00:00:00Z"))!;
    const by = new Map(ledger.lots.map((l) => [l.propertyId, l]));
    expect(by.get(a.id)!.creditEntries).toEqual([
      { dt: "2026-02-01", amt: 6_000, kind: "down_payment" },
      { dt: "2026-05-01", amt: 90_000, kind: "note_sale" },
    ]);
    expect(by.get(b.id)!.creditEntries).toEqual([{ dt: "2026-02-01", amt: 6_000, kind: "down_payment" }]);
    expect(by.get(c.id)!.creditEntries).toEqual([{ dt: "2026-04-01", amt: 80_000, kind: "cash_sale" }]);
  });

  it("test notes, notes without a start date and zero down payments credit nothing; events after asOf do not exist", () => {
    const f = farm({ ...rate20, total_lots: 1 });
    const p = property(f.id, 1);
    const s = snapshot({
      farmAcquisitions: [f],
      properties: [p],
      propertyCosts: [cost(f.id, { cost_date: "2026-01-01", amount: 50_000 }), cost(f.id, { cost_date: "2026-12-01", amount: 5_000 })],
      notes: [
        note(p.id, { start_date: "2026-02-01", down_payment: 6_000, is_test: true }),
        note(p.id, { start_date: null, down_payment: 6_000 }),
        note(p.id, { start_date: "2026-02-01", down_payment: 0 }),
        note(p.id, { start_date: "2026-11-01", down_payment: 60_000 }),
      ],
    });
    const lot = computeLotLedger(f.id, s, new Date("2026-06-01T00:00:00Z"))!.lots[0]!;
    expect(lot.creditEntries).toEqual([]);
    expect(lot.capital).toBe(50_000);
    expect(lot.released).toBeNull();
  });

  it("the release cost grows every month an unpaid lot waits and is exactly capital + interest to that day − credits", () => {
    const f = farm({ ...rate20, total_lots: 1 });
    const p = property(f.id, 1);
    const s = snapshot({
      farmAcquisitions: [f],
      properties: [p],
      propertyCosts: [cost(f.id, { cost_date: "2026-01-01", amount: 60_000 })],
      notes: [note(p.id, { start_date: "2026-03-01", down_payment: 5_000 })],
    });
    const lot = computeLotLedger(f.id, s, ASOF)!.lots[0]!;
    expect(lot.released).toBeNull();
    const months = ["2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31"];
    const costs = months.map((m) => outstandingAt(lot, m));
    for (let i = 1; i < costs.length; i++) expect(costs[i]!).toBeGreaterThan(costs[i - 1]!);
    expect(round2(outstandingAt(lot, "2026-12-31"))).toBe(round2(60_000 + (60_000 * 0.2 * 364) / 365 - 5_000));
    expect(round2(outstandingAt(lot, ASOF))).toBe(round2(lot.outstanding));
    // a Date works too
    expect(outstandingAt(lot, new Date("2026-12-31T00:00:00Z"))).toBe(outstandingAt(lot, "2026-12-31"));
  });

  it("returns null for an unknown farm and lists lots by lot number", () => {
    const f = farm({ ...rate20, total_lots: 3 });
    const s = snapshot({ farmAcquisitions: [f], properties: [property(f.id, 10), property(f.id, 2), property(f.id, 1)] });
    expect(computeLotLedger("nope", s, ASOF)).toBeNull();
    expect(computeLotLedger(f.id, s, ASOF)!.lots.map((l) => l.lotNumber)).toEqual(["1", "2", "10"]);
  });
});
