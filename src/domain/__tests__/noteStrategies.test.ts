import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealm } from "../realm";
import { computeNoteStrategies } from "../noteStrategies";
import { computeProfitLayers } from "../profitLayers";
import { round2 } from "../math";
import type { PaymentsSnapshot } from "../types";

const fixture = JSON.parse(
  readFileSync(new URL("../__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;

const asOf = new Date("2026-09-11T00:00:00Z");

describe("note strategies", () => {
  it("total liquidity cost $783,523.79 = realized $315,064.14 + unrealized $468,459.65", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2027-12-31" });
    const s = realm.noteStrategies;
    const ratio = realm.oracleDefaults.noteSalePct / 100;
    expect(s).toEqual(computeNoteStrategies(realm.profitLayers, realm.lots, realm.debt.capitalOwed));
    expect(s).toEqual(computeNoteStrategies(computeProfitLayers(realm.lots, ratio), realm.lots, realm.debt.capitalOwed));

    expect(s.liquidityCostRealized).toBe(315_064.14);
    expect(s.liquidityCostUnrealized).toBe(468_459.65);
    expect(s.liquidityCostTotal).toBe(783_523.79);
    expect(s.liquidityCostTotal).toBeCloseTo(s.liquidityCostRealized + s.liquidityCostUnrealized, 2);
    expect(s.liquidityCostTotal).toBe(realm.profitLayers.liquidityCostTotal);
    expect(s.notes).toHaveLength(s.notesHeldCount);
    expect(s.notes.every((n) => n.costOfSelling === round2(n.faceBalance - n.measuredSaleValue))).toBe(true);
  });

  it("sell / hold / deliver differ only in held-note cash, cost, and LP-returnable pool", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2027-12-31" });
    const s = realm.noteStrategies;
    const cash = s.cashAlreadyRealized;
    expect(s.sell.cashInHandNow).toBeCloseTo(cash + s.notesHeldAtRatio, 2);
    expect(s.sell.totalValue).toBe(s.sell.cashInHandNow);
    expect(s.sell.liquidityCost).toBe(s.liquidityCostUnrealized);
    expect(s.hold.cashInHandNow).toBe(cash);
    expect(s.hold.totalValue).toBeCloseTo(cash + s.notesHeldFace, 2);
    expect(s.hold.liquidityCost).toBe(0);
    expect(s.deliver.cashInHandNow).toBe(cash);
    expect(s.deliver.totalValue).toBeCloseTo(cash + s.notesHeldFace, 2);
    expect(s.deliver.liquidityCost).toBe(0);
    expect(s.deliver.lpCapitalReturnable).toBeGreaterThanOrEqual(s.hold.lpCapitalReturnable);
    expect(s.sell.lpCapitalReturnable + s.sell.lpCapitalStillOwed).toBeCloseTo(s.lpCapitalOwed, 2);
  });
});
