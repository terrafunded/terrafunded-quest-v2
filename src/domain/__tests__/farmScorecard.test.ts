import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealm } from "../realm";
import {
  computeFarmScorecard,
  gradeFarm,
  letterFromAverage,
  netPoints,
  SCORECARD_STALE_AFTER_DAYS,
  velocityPoints,
} from "../farmScorecard";
import type { PaymentsSnapshot } from "../types";

const fixture = JSON.parse(
  readFileSync(new URL("../__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;

const asOf = new Date("2026-09-11T00:00:00Z");

describe("farm scorecard grading rule", () => {
  it("scores net per lot at $70k / $55k / $40k and velocity at 60 / 120 / 180 days", () => {
    expect(netPoints(70_000)).toBe(4);
    expect(netPoints(69_999.99)).toBe(3);
    expect(netPoints(55_000)).toBe(3);
    expect(netPoints(40_000)).toBe(2);
    expect(netPoints(39_999)).toBe(1);
    expect(velocityPoints(60)).toBe(4);
    expect(velocityPoints(61)).toBe(3);
    expect(velocityPoints(120)).toBe(3);
    expect(velocityPoints(180)).toBe(2);
    expect(velocityPoints(181)).toBe(1);
    expect(velocityPoints(null)).toBe(1);
  });

  it("letters the half-up average of net and velocity points; unsold farms are ungraded", () => {
    expect(letterFromAverage(4, 4)).toBe("A");
    expect(letterFromAverage(2, 3)).toBe("B");
    expect(letterFromAverage(1, 3)).toBe("C");
    expect(letterFromAverage(1, 1)).toBe("D");
    expect(gradeFarm(82_291.82, 47, 7)).toEqual({ grade: "A", netPoints: 4, velocityPoints: 4 });
    expect(gradeFarm(43_923.16, 93, 7)).toEqual({ grade: "B", netPoints: 2, velocityPoints: 3 });
    expect(gradeFarm(null, null, 0)).toEqual({ grade: null, netPoints: null, velocityPoints: null });
  });
});

describe("farm scorecard fixture", () => {
  it("pins Freestone ≈ $82K, Wichita ≈ $44K, Lakeview 0 of 12 sold", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2027-12-31" });
    const card = realm.farmScorecard;
    expect(card).toEqual(computeFarmScorecard(realm.farms, realm.asOf));
    expect(card.staleAfterDays).toBe(SCORECARD_STALE_AFTER_DAYS);

    const freestone = card.rows.find((r) => r.name === "Freestone");
    const wichita = card.rows.find((r) => r.name === "Wichita");
    const lakeview = card.rows.find((r) => r.name === "Lakeview");
    expect(freestone).toBeDefined();
    expect(wichita).toBeDefined();
    expect(lakeview).toBeDefined();

    expect(freestone!.netProfitPerSoldLot).toBeCloseTo(82_000, -3);
    expect(freestone!.netProfitPerSoldLot).toBeCloseTo(82_291.82, 2);
    expect(freestone!.soldLots).toBe(7);
    expect(freestone!.totalLots).toBe(7);
    expect(freestone!.grade).toBe("A");
    expect(freestone!.stale).toBe(true);

    expect(wichita!.netProfitPerSoldLot).toBeCloseTo(44_000, -3);
    expect(wichita!.netProfitPerSoldLot).toBeCloseTo(43_923.16, 2);
    expect(wichita!.soldLots).toBe(7);
    expect(wichita!.reservedLots).toBe(8);
    expect(wichita!.availableLots).toBe(17);
    expect(wichita!.grade).toBe("B");
    expect(wichita!.sponsorTakeKind).toBe("profit_share");
    expect(wichita!.profitSharePct).toBe(50);

    expect(lakeview!.soldLots).toBe(0);
    expect(lakeview!.totalLots).toBe(12);
    expect(lakeview!.reservedLots).toBe(0);
    expect(lakeview!.availableLots).toBe(12);
    expect(lakeview!.grade).toBeNull();
    expect(lakeview!.stale).toBe(true);

    expect(card.buyLike.map((r) => r.name)).toEqual(["Freestone"]);
    expect(card.buyLike[0]?.grade).toBe("A");
  });
});
