import { describe, expect, it } from "vitest";
import { buildRealm } from "../realm";
import { computeQualityIssues } from "../quality";
import { latestEvents } from "../events";
import { ASOF, client, distribution, farm, fileCase, investor, note, noteSale, property, snapshot } from "./builders";

describe("computeQualityIssues", () => {
  it("flags price, down-payment and date disagreements between a file case and its note", () => {
    const f = farm();
    const p = property(f.id, 1);
    const issues = computeQualityIssues({
      farms: [f],
      properties: [p],
      fileCases: [fileCase(p.id, { sale_price: 141_802, down_payment: 7_090.1, reservation_date: "2026-09-07" })],
      notes: [note(p.id, { original_amount: 140_000, down_payment: 5_000, start_date: "2025-11-05" })],
      noteSales: [],
      clients: [client()],
    });
    const kinds = issues.map((i) => i.kind);
    expect(kinds).toContain("price_mismatch");
    expect(kinds).toContain("down_payment_mismatch");
    expect(kinds).toContain("reservation_after_note_start");
    expect(kinds).toContain("active_file_case_with_note");
    expect(issues.find((i) => i.kind === "price_mismatch")?.severity).toBe("error");
  });

  it("flags NULL investor_capital, sold notes without sales, and sales without the sold flag", () => {
    const f = farm({ investor_capital: null });
    const p1 = property(f.id, 1);
    const p2 = property(f.id, 2);
    const n1 = note(p1.id, { is_sold: true });
    const n2 = note(p2.id, { is_sold: false });
    const issues = computeQualityIssues({
      farms: [f],
      properties: [p1, p2],
      fileCases: [fileCase(p1.id, { status: "completed", closing_date: "2026-03-01" }), fileCase(p2.id, { status: "completed", closing_date: "2026-03-01" })],
      notes: [n1, n2],
      noteSales: [noteSale(n2.id)],
      clients: [client()],
    });
    const kinds = issues.map((i) => i.kind);
    expect(kinds).toContain("farm_capital_null");
    expect(kinds).toContain("sold_note_without_sale");
    expect(kinds).toContain("sale_without_sold_flag");
  });

  it("flags lot-count mismatches and completed cases without closing dates", () => {
    const f = farm({ total_lots: 3 });
    const p = property(f.id, 1);
    const issues = computeQualityIssues({
      farms: [f],
      properties: [p],
      fileCases: [fileCase(p.id, { status: "completed", closing_date: null, deal_type: "cash", down_payment: null })],
      notes: [],
      noteSales: [],
      clients: [client()],
    });
    const kinds = issues.map((i) => i.kind);
    expect(kinds).toContain("lot_count_mismatch");
    expect(kinds).toContain("completed_without_closing_date");
    expect(kinds).toContain("cash_deal_missing_down_payment");
  });

  it("is empty for clean data", () => {
    const f = farm({ total_lots: 1 });
    expect(computeQualityIssues({ farms: [f], properties: [property(f.id, 1)], fileCases: [], notes: [], noteSales: [], clients: [] })).toEqual([]);
  });
});

describe("events and treasury (buildRealm on synthetic rows)", () => {
  const inv = investor({ name: "Townson Family" });
  const f = farm({ deal_type: "profit_share", profit_share_pct: 50, investor_capital: 100_000, total_lots: 2, funding_date: "2026-01-15", investor_id: inv.id });
  const p1 = property(f.id, 1);
  const p2 = property(f.id, 2);
  const fc1 = fileCase(p1.id, { status: "completed", sale_price: 2_100_000, down_payment: 50_000, reservation_date: "2026-02-01", closing_date: "2026-03-10" });
  const n1 = note(p1.id, { original_amount: 2_100_000, down_payment: 50_000, start_date: "2026-03-10", is_sold: true });
  const s1 = noteSale(n1.id, { sale_price: 800_000, sale_date: "2026-05-20" });
  const fc2 = fileCase(p2.id, { status: "active", reservation_date: "2026-08-01", sale_price: 120_000 });
  const d1 = distribution(f.id, { distribution_date: "2026-04-02", amount: 100_000, kind: "capital_return", investor_id: inv.id });
  const d2 = distribution(f.id, { distribution_date: "2026-05-25", amount: 25_000, kind: "profit_share", investor_id: inv.id });
  const future = farm({ farm_name: "Future Farm", funding_date: null, closing_date: "2026-12-01", total_lots: 5 });

  const realm = buildRealm(
    snapshot({
      farmAcquisitions: [f, future],
      properties: [p1, p2],
      fileCases: [fc1, fc2],
      notes: [n1],
      noteSales: [s1],
      investorDistributions: [d1, d2],
      investors: [inv],
    }),
    ASOF,
  );

  it("orders events chronologically with cumulative net profit and a $1M milestone", () => {
    const kinds = realm.events.filter((e) => !e.future).map((e) => e.kind);
    expect(kinds).toEqual(["farm_acquired", "reservation", "closing", "milestone", "distribution", "note_sale", "distribution", "reservation"]);
    const closing = realm.events.find((e) => e.kind === "closing")!;
    // land cost 50,000 → gross 2,050,000 → 50% share → net 1,025,000
    expect(closing.amount).toBe(1_025_000);
    expect(closing.cumulativeNetProfit).toBe(1_025_000);
    const milestone = realm.events.find((e) => e.kind === "milestone")!;
    expect(milestone.milestone).toBe(1_000_000);
    expect(milestone.date).toBe("2026-03-10");
  });

  it("marks future-dated events and hides them from the live chronicle", () => {
    const fut = realm.events.find((e) => e.title.startsWith("Future Farm"));
    expect(fut?.future).toBe(true);
    expect(latestEvents(realm.events).some((e) => e.future)).toBe(false);
    expect(latestEvents(realm.events, 2).map((e) => e.kind)).toEqual(["reservation", "distribution"]);
    expect(latestEvents(realm.events, 5, ["distribution"])).toHaveLength(2);
  });

  it("buckets cash in and out by month with running totals", () => {
    const t = realm.treasury;
    expect(t.months.map((m) => m.month)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(t.months[0]).toMatchObject({ downPayments: 50_000, cashIn: 50_000, cashOut: 0, cumulativeNet: 50_000 });
    expect(t.months[1]).toMatchObject({ capitalReturns: 100_000, cashOut: 100_000, cumulativeNet: -50_000 });
    expect(t.months[2]).toMatchObject({ noteSales: 800_000, profitShares: 25_000, cumulativeCashIn: 850_000, cumulativeCashOut: 125_000 });
    expect(t.totalCashIn).toBe(850_000);
    expect(t.totalCashOut).toBe(125_000);
    expect(t.net).toBe(725_000);
  });

  it("rolls the investor up with profit share separate from interest", () => {
    const townson = realm.investors.find((i) => i.name === "Townson Family")!;
    expect(townson.dealType).toBe("profit_share");
    expect(townson.capitalDeployed).toBe(100_000);
    expect(townson.capitalReturned).toBe(100_000);
    expect(townson.capitalOutstanding).toBe(0);
    expect(townson.profitShareEarned).toBe(1_025_000);
    expect(townson.profitSharePaid).toBe(25_000);
    expect(townson.interestAccrued).toBe(0);
    expect(townson.totalPaidOut).toBe(125_000);
  });

  it("computes farm rollups", () => {
    const farmEcon = realm.farms[0]!;
    expect(farmEcon.stages).toEqual({ available: 0, reserved: 1, closed: 0, note_sold: 1 });
    expect(farmEcon.revenue).toBe(2_100_000);
    expect(farmEcon.pipelineRevenue).toBe(120_000);
    expect(farmEcon.netProfit).toBe(1_025_000);
    expect(farmEcon.investorTake).toBe(1_025_000);
    expect(farmEcon.netProfitInPipeline).toBe(35_000);
    expect(farmEcon.pctClosed).toBe(50);
    expect(farmEcon.monthsSinceFunding).toBeGreaterThan(7);
  });
});
