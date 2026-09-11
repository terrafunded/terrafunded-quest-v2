import { describe, expect, it } from "vitest";
import { computeLotEconomics, computeLots, deriveStage, farmCapitalBasis, isSubdividedFarm, landCostPerLot, pickFileCase, pickNote } from "../lot";
import { buildInterestLedger } from "../interest";
import { ASOF, client, cost, farm, fileCase, investor, note, noteSale, property } from "./builders";

describe("isSubdividedFarm", () => {
  it("requires total_lots > 1", () => {
    expect(isSubdividedFarm(farm({ total_lots: 1 }))).toBe(false);
    expect(isSubdividedFarm(farm({ total_lots: null }))).toBe(false);
    expect(isSubdividedFarm(farm({ total_lots: 2 }))).toBe(true);
  });

  it("excludes documented legacy one-offs", () => {
    expect(isSubdividedFarm(farm({ farm_name: "Red River 1", total_lots: 2 }))).toBe(false);
    expect(isSubdividedFarm(farm({ farm_name: "Olney", total_lots: 3 }))).toBe(false);
  });
});

describe("land cost", () => {
  it("divides investor_capital by total_lots", () => {
    expect(landCostPerLot(farm({ investor_capital: 550_000, total_lots: 11 }), [])).toBe(50_000);
  });

  it("falls back to Σ property_costs when investor_capital is NULL", () => {
    const f = farm({ investor_capital: null, total_lots: 4 });
    const costs = [cost(f.id, { amount: 100_000 }), cost(f.id, { amount: 60_000 }), cost("other", { amount: 999 })];
    expect(farmCapitalBasis(f, costs)).toEqual({ basis: 160_000, source: "property_costs" });
    expect(landCostPerLot(f, costs)).toBe(40_000);
  });

  it("is zero when nothing is known", () => {
    expect(farmCapitalBasis(farm({ investor_capital: null }), [])).toEqual({ basis: 0, source: "none" });
    expect(landCostPerLot(farm({ total_lots: 0 }), [])).toBe(0);
  });
});

describe("pickFileCase / pickNote", () => {
  it("ignores cancelled cases and prefers completed, then newest", () => {
    const a = fileCase("p", { status: "cancelled" });
    const b = fileCase("p", { status: "active", created_at: "2026-01-01" });
    const c = fileCase("p", { status: "active", created_at: "2026-03-01" });
    expect(pickFileCase([a])).toBeNull();
    expect(pickFileCase([a, b, c])?.id).toBe(c.id);
    const d = fileCase("p", { status: "completed", created_at: "2025-01-01" });
    expect(pickFileCase([b, c, d])?.id).toBe(d.id);
  });

  it("prefers a sold note, then the newest start_date", () => {
    const older = note("p", { start_date: "2025-01-01" });
    const newer = note("p", { start_date: "2026-01-01" });
    const sold = note("p", { start_date: "2024-01-01", is_sold: true });
    expect(pickNote([])).toBeNull();
    expect(pickNote([older, newer])?.id).toBe(newer.id);
    expect(pickNote([older, newer, sold])?.id).toBe(sold.id);
  });
});

describe("deriveStage", () => {
  it("is available with no file case and no note", () => {
    expect(deriveStage(null, null, null)).toBe("available");
  });
  it("is reserved for an active case without closing_date", () => {
    expect(deriveStage(fileCase("p"), null, null)).toBe("reserved");
  });
  it("is closed when completed or closing_date is set, cash or financed", () => {
    expect(deriveStage(fileCase("p", { status: "completed" }), null, null)).toBe("closed");
    expect(deriveStage(fileCase("p", { closing_date: "2026-05-01" }), null, null)).toBe("closed");
    expect(deriveStage(fileCase("p", { status: "completed", deal_type: "cash" }), null, null)).toBe("closed");
  });
  it("is closed when a note exists even if the case is still active", () => {
    expect(deriveStage(fileCase("p"), note("p"), null)).toBe("closed");
  });
  it("is note_sold when the note is flagged sold or has a note_sales row", () => {
    const n = note("p", { is_sold: true });
    expect(deriveStage(fileCase("p"), n, null)).toBe("note_sold");
    expect(deriveStage(null, note("p"), noteSale("x"))).toBe("note_sold");
  });
});

describe("computeLotEconomics", () => {
  const base = {
    landCost: 50_000,
    interestShare: 0,
    salePrice: 120_000,
    downPayment: 6_000,
    dealType: "financed" as const,
    noteSalePrice: null,
    profitSharePct: null,
  };

  it("returns nulls and zero cash for an unsold lot", () => {
    const e = computeLotEconomics({ ...base, stage: "available", farmDealType: "own_capital", salePrice: null, downPayment: null });
    expect(e).toEqual({ grossProfit: null, investorTake: 0, netProfit: null, cashRealized: 0 });
  });

  it("computes gross for a reserved lot but no net and no cash", () => {
    const e = computeLotEconomics({ ...base, stage: "reserved", farmDealType: "own_capital" });
    expect(e.grossProfit).toBe(70_000);
    expect(e.netProfit).toBeNull();
    expect(e.cashRealized).toBe(0);
  });

  it("own_capital: net = gross, cash = down payment at closing", () => {
    const e = computeLotEconomics({ ...base, stage: "closed", farmDealType: "own_capital" });
    expect(e).toEqual({ grossProfit: 70_000, investorTake: 0, netProfit: 70_000, cashRealized: 6_000 });
  });

  it("profit_share: investor takes pct of gross", () => {
    const e = computeLotEconomics({ ...base, stage: "closed", farmDealType: "profit_share", profitSharePct: 50 });
    expect(e.investorTake).toBe(35_000);
    expect(e.netProfit).toBe(35_000);
  });

  it("fixed_interest: investor take is the lot's interest share, independent of price", () => {
    const e = computeLotEconomics({ ...base, stage: "closed", farmDealType: "fixed_interest", interestShare: 4_321.123 });
    expect(e.investorTake).toBe(4_321.12);
    expect(e.netProfit).toBe(70_000 - 4_321.12);
  });

  it("adds the note sale price to cash once the note is sold", () => {
    const e = computeLotEconomics({ ...base, stage: "note_sold", farmDealType: "own_capital", noteSalePrice: 95_000 });
    expect(e.cashRealized).toBe(101_000);
  });

  it("cash deals realize the full sale price at closing even with NULL down payment", () => {
    const e = computeLotEconomics({ ...base, stage: "closed", farmDealType: "own_capital", dealType: "cash", downPayment: null });
    expect(e.cashRealized).toBe(120_000);
  });

  it("a lot sold below land cost yields a negative net", () => {
    const e = computeLotEconomics({ ...base, stage: "closed", farmDealType: "own_capital", salePrice: 40_000 });
    expect(e.grossProfit).toBe(-10_000);
    expect(e.netProfit).toBe(-10_000);
  });
});

describe("computeLots (rows → lots)", () => {
  const inv = investor({ name: "Sponsor A" });
  const f = farm({ deal_type: "fixed_interest", annual_interest_rate: 20, investor_capital: 365_000, total_lots: 2, funding_date: "2026-01-01", investor_id: inv.id });
  const p1 = property(f.id, 1);
  const p2 = property(f.id, 2);
  const fc1 = fileCase(p1.id, { status: "active", sale_price: 200_000, down_payment: 10_000, reservation_date: "2026-01-10" });
  const n1 = note(p1.id, { original_amount: 195_000, down_payment: 9_000, start_date: "2026-03-01", is_sold: true });
  const sale1 = noteSale(n1.id, { sale_price: 150_000, sale_date: "2026-06-01" });
  const legacy = farm({ farm_name: "Olney", total_lots: 3 });
  const pLegacy = property(legacy.id, 1);

  const interestByFarm = new Map([f, legacy].map((x) => [x.id, buildInterestLedger(x, [], ASOF)]));
  const lots = computeLots({
    farms: [f, legacy],
    properties: [p1, p2, pLegacy],
    fileCases: [fc1],
    notes: [n1],
    noteSales: [sale1],
    propertyCosts: [],
    clients: [client()],
    investors: [inv],
    interestByFarm,
    asOf: ASOF,
  });

  it("only yields lots for subdivided, non-legacy farms", () => {
    expect(lots).toHaveLength(2);
    expect(lots.every((l) => l.farmId === f.id)).toBe(true);
  });

  it("prefers the note's price and down payment over the file case, and keeps both", () => {
    const l1 = lots.find((l) => l.propertyId === p1.id)!;
    expect(l1.priceSource).toBe("note");
    expect(l1.salePrice).toBe(195_000);
    expect(l1.downPayment).toBe(9_000);
    expect(l1.fileCaseSalePrice).toBe(200_000);
    expect(l1.noteOriginalAmount).toBe(195_000);
    expect(l1.stage).toBe("note_sold");
  });

  it("allocates accrued interest pro-rata (1/N) and computes net and cash", () => {
    const l1 = lots.find((l) => l.propertyId === p1.id)!;
    const l2 = lots.find((l) => l.propertyId === p2.id)!;
    const ledger = interestByFarm.get(f.id)!;
    // 365,000 × 20% / 365 = $200/day × 253 days (2026-01-01 → 2026-09-11)
    expect(ledger.accruedToDate).toBe(50_600);
    expect(l1.investorTake).toBe(25_300);
    expect(l2.investorTake).toBe(25_300);
    expect(l1.landCost).toBe(182_500);
    expect(l1.grossProfit).toBe(12_500);
    expect(l1.netProfit).toBe(12_500 - 25_300);
    expect(l1.cashRealized).toBe(9_000 + 150_000);
    expect(l2.stage).toBe("available");
    expect(l2.netProfit).toBeNull();
  });

  it("derives close date, pipeline days, buyer and investor names", () => {
    const l1 = lots.find((l) => l.propertyId === p1.id)!;
    expect(l1.closeDate).toBe("2026-03-01");
    expect(l1.daysInPipeline).toBe(50);
    expect(l1.buyerName).toBe("Buyer One");
    expect(l1.investorName).toBe("Sponsor A");
    expect(l1.noteSalePrice).toBe(150_000);
  });

  it("leaves days-in-pipeline unknown when the reservation is dated after the close", () => {
    const fcLate = fileCase(p2.id, { reservation_date: "2026-09-07" });
    const nEarly = note(p2.id, { start_date: "2025-11-05" });
    const out = computeLots({
      farms: [f],
      properties: [p2],
      fileCases: [fcLate],
      notes: [nEarly],
      noteSales: [],
      propertyCosts: [],
      clients: [client()],
      investors: [],
      interestByFarm,
      asOf: ASOF,
    });
    expect(out[0]?.stage).toBe("closed");
    expect(out[0]?.closeDate).toBe("2025-11-05");
    expect(out[0]?.daysInPipeline).toBeNull();
  });

  it("marks buyers that are not in the (non-test) clients list", () => {
    const fcGhost = fileCase(p2.id, { client_id: "ghost" });
    const out = computeLots({
      farms: [f],
      properties: [p2],
      fileCases: [fcGhost],
      notes: [],
      noteSales: [],
      propertyCosts: [],
      clients: [client()],
      investors: [],
      interestByFarm,
      asOf: ASOF,
    });
    expect(out[0]?.buyerIsTestClient).toBe(true);
    expect(out[0]?.buyerName).toBeNull();
    expect(out[0]?.daysInPipeline).toBe(222);
  });
});
