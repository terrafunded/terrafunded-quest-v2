import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { isCapitalDrawn } from "../farm";
import { emptySourceTableIssues } from "../quality";
import { humanizeIssue } from "../quality_human";
import { snapshot } from "./builders";

const fixture = raw as unknown as PaymentsSnapshot;
const ASOF = new Date("2026-09-11T00:00:00Z");

describe("ten defects: unfunded capital, empty tables, profit-share interest", () => {
  const realm = buildRealm(fixture, ASOF, { deadline: "2028-12-31" });

  it("unfunded farms sit in committed, not today's outstanding or daily accrual", () => {
    const unfunded = realm.farms.filter((f) => !f.funded && f.dealType !== "own_capital");
    expect(unfunded.map((f) => f.name).sort()).toEqual(["Franklin 2", "Lakeview"]);
    expect(unfunded.every((f) => f.capitalOutstanding === 0)).toBe(true);
    expect(round2(sum(unfunded.map((f) => f.capitalCommittedUnfunded)))).toBe(realm.debt.capitalCommittedUnfunded);
    expect(realm.debt.capitalCommittedUnfunded).toBe(824_400);
    expect(realm.debt.capitalOwed).toBe(round2(sum(realm.farms.filter((f) => f.dealType !== "own_capital").map((f) => f.capitalOutstanding))));
    expect(unfunded.every((f) => f.monthsSinceFunding === null)).toBe(true);
    expect(realm.liberation.hostages.some((h) => h.farmName === "Lakeview")).toBe(false);
    expect(realm.liberation.hostages.some((h) => h.farmName === "Franklin 2")).toBe(false);
  });

  it("isCapitalDrawn: future closing with no funding_date is committed, not drawn", () => {
    expect(isCapitalDrawn({ funding_date: null, closing_date: "2026-10-22" }, ASOF)).toBe(false);
    expect(isCapitalDrawn({ funding_date: null, closing_date: "2026-09-02" }, ASOF)).toBe(true);
    expect(isCapitalDrawn({ funding_date: "2026-04-14", closing_date: "2026-10-22" }, ASOF)).toBe(true);
    expect(isCapitalDrawn({ funding_date: "2026-10-02", closing_date: "2026-09-01" }, ASOF)).toBe(false);
  });

  it("empty source tables raise a Data Quality warning", () => {
    const issues = emptySourceTableIssues({ notes: 0, properties: 12, note_sales: 0 }, "en");
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.kind === "empty_source_table")).toBe(true);
    const human = humanizeIssue(issues[0]!, "en");
    expect(human.title).toMatch(/empty/i);
    expect(human.explanation).toMatch(/0 rows|nothing/i);
    const emptyRealm = buildRealm(snapshot(), ASOF);
    expect(emptyRealm.quality.some((q) => q.kind === "empty_source_table")).toBe(true);
  });

  it("profit-share farms on the fixture never report negative unpaid interest", () => {
    const profitShare = realm.farms.filter((f) => f.dealType === "profit_share");
    expect(profitShare.length).toBeGreaterThan(0);
    for (const f of profitShare) {
      expect(f.interest.unpaidInterest, f.name).toBeGreaterThanOrEqual(0);
    }
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
