import { describe, expect, it } from "vitest";
import { accrueOnSteppedBalance, buildInterestLedger, projectAccrued } from "../interest";
import { ASOF, distribution, farm } from "./builders";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("accrueOnSteppedBalance", () => {
  it("accrues simple daily interest on a flat balance", () => {
    const r = accrueOnSteppedBalance(365_000, 20, d("2026-01-01"), d("2026-01-11"), []);
    expect(r.accrued).toBeCloseTo(2_000, 6); // $200/day × 10 days
    expect(r.outstanding).toBe(365_000);
  });

  it("steps the balance down at each capital return", () => {
    const r = accrueOnSteppedBalance(365_000, 20, d("2026-01-01"), d("2026-01-21"), [{ date: d("2026-01-11"), amount: 182_500 }]);
    // 10 days at 200/day + 10 days at 100/day
    expect(r.accrued).toBeCloseTo(3_000, 6);
    expect(r.outstanding).toBe(182_500);
  });

  it("ignores returns after asOf and clamps returns before start", () => {
    const r = accrueOnSteppedBalance(100_000, 10, d("2026-01-01"), d("2026-01-02"), [
      { date: d("2025-12-01"), amount: 50_000 },
      { date: d("2027-01-01"), amount: 50_000 },
    ]);
    expect(r.outstanding).toBe(50_000);
    expect(r.accrued).toBeCloseTo((50_000 * 0.1) / 365, 6);
  });

  it("never goes below zero outstanding", () => {
    const r = accrueOnSteppedBalance(1_000, 10, d("2026-01-01"), d("2026-02-01"), [{ date: d("2026-01-10"), amount: 5_000 }]);
    expect(r.outstanding).toBe(0);
  });
});

describe("buildInterestLedger", () => {
  it("accrues nothing for profit_share and own_capital farms", () => {
    expect(buildInterestLedger(farm({ deal_type: "profit_share", profit_share_pct: 50 }), [], ASOF).accruedToDate).toBe(0);
    expect(buildInterestLedger(farm({ deal_type: "own_capital" }), [], ASOF).accruedToDate).toBe(0);
  });

  it("a profit-share farm never reports negative unpaid interest", () => {
    const f = farm({ deal_type: "profit_share", profit_share_pct: 50, investor_capital: 484_000 });
    const l = buildInterestLedger(
      f,
      [distribution(f.id, { distribution_date: "2026-04-01", amount: 175_742, kind: "profit_share" })],
      ASOF,
    );
    expect(l.accruedToDate).toBe(0);
    expect(l.paidToDate).toBe(175_742);
    expect(l.unpaidInterest).toBe(0);
    expect(l.unpaidInterest).toBeGreaterThanOrEqual(0);
  });

  it("uses funding_date, falling back to closing_date", () => {
    const a = buildInterestLedger(farm({ deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: "2026-09-01", closing_date: "2026-01-01" }), [], ASOF);
    expect(a.accrualStart).toBe("2026-09-01");
    expect(a.daysAccruing).toBe(10);
    const b = buildInterestLedger(farm({ deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: null, closing_date: "2026-09-06" }), [], ASOF);
    expect(b.accrualStart).toBe("2026-09-06");
    expect(b.daysAccruing).toBe(5);
  });

  it("does not accrue before a future start date (Franklin 2 case)", () => {
    const l = buildInterestLedger(farm({ deal_type: "fixed_interest", annual_interest_rate: 25, funding_date: null, closing_date: "2026-10-15" }), [], ASOF);
    expect(l.accruedToDate).toBe(0);
    expect(l.daysAccruing).toBe(0);
    expect(l.outstandingPrincipal).toBe(500_000);
  });

  it("accepts the rate as a percent (20) or a fraction (0.2)", () => {
    const pct = buildInterestLedger(farm({ deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: "2026-09-01" }), [], ASOF);
    const frac = buildInterestLedger(farm({ deal_type: "fixed_interest", annual_interest_rate: 0.2, funding_date: "2026-09-01" }), [], ASOF);
    expect(pct.annualRatePct).toBe(20);
    expect(frac.annualRatePct).toBe(20);
    expect(pct.accruedToDate).toBe(frac.accruedToDate);
  });

  it("separates capital returns from interest/profit payments and only counts this farm", () => {
    const f = farm({ deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: "2026-01-01", investor_capital: 365_000 });
    const dists = [
      distribution(f.id, { distribution_date: "2026-03-01", amount: 65_000, kind: "capital_return" }),
      distribution(f.id, { distribution_date: "2026-04-01", amount: 5_000, kind: "profit_share" }),
      distribution("other-farm", { distribution_date: "2026-04-01", amount: 999_999, kind: "capital_return" }),
    ];
    const l = buildInterestLedger(f, dists, ASOF);
    expect(l.capitalReturned).toBe(65_000);
    expect(l.paidToDate).toBe(5_000);
    expect(l.outstandingPrincipal).toBe(300_000);
    expect(l.distributions).toHaveLength(2);
    expect(l.unpaidInterest).toBe(l.accruedToDate - 5_000);
    expect(l.dailyAccrual).toBeCloseTo((300_000 * 0.2) / 365, 2);
  });

  it("projects forward at the current daily accrual", () => {
    const l = buildInterestLedger(farm({ deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: "2026-09-01", investor_capital: 365_000 }), [], ASOF);
    expect(projectAccrued(l, 10)).toBe(l.accruedToDate + 2_000);
    expect(projectAccrued(l, -5)).toBe(l.accruedToDate);
  });
});
