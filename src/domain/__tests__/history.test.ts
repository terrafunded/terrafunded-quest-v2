import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { computeMonthlyHistory } from "../history";
import { isSold, type Lot } from "../lot";
import { round2, sum } from "../math";

const fixture = raw as unknown as PaymentsSnapshot;
const ASOF = new Date("2026-09-11T00:00:00Z");
const realm = buildRealm(fixture, ASOF);

describe("computeMonthlyHistory on the fixture", () => {
  it("Σ closings equals the sold-lot count and Σ netProfit equals goal.netProfitToDate", () => {
    const sold = realm.lots.filter(isSold);
    expect(sum(realm.history.map((p) => p.closings))).toBe(sold.length);
    expect(sold.every((l) => l.closeDate)).toBe(true);
    expect(round2(sum(realm.history.map((p) => p.netProfit)))).toBe(realm.goal.netProfitToDate);
  });

  it("runs from the first active month through the as-of month, flags the current month partial, and does not invent future months", () => {
    expect(realm.history.length).toBeGreaterThan(0);
    expect(realm.history.length).toBeLessThanOrEqual(24);
    expect(realm.history.at(-1)).toMatchObject({ month: "2026-09-01", partial: true });
    expect(realm.history.filter((p) => p.partial)).toHaveLength(1);
    expect(realm.history.every((p) => p.month <= "2026-09-01")).toBe(true);
    // Feb 2026 ends before ERA_START (2026-03-01); March does not.
    const feb = realm.history.find((p) => p.month === "2026-02-01");
    const mar = realm.history.find((p) => p.month === "2026-03-01");
    if (feb) expect(feb.beforeEra).toBe(true);
    if (mar) expect(mar.beforeEra).toBe(false);
  });

  it("is identical across exit horizons — the bars are history, only the required lines move", () => {
    const r2029 = buildRealm(fixture, ASOF, { deadline: "2029-12-31" });
    expect(r2029.history).toEqual(realm.history);
    expect(r2029.goal.requiredLotsPerMonthToHitDeadline).not.toBe(realm.goal.requiredLotsPerMonthToHitDeadline);
  });
});

describe("computeMonthlyHistory", () => {
  const lot = (partial: Partial<Lot> & Pick<Lot, "propertyId" | "stage">): Lot =>
    ({
      farmId: "f",
      farmName: "F",
      farmDealType: null,
      investorId: null,
      investorName: null,
      lotNumber: "1",
      name: partial.propertyId,
      acres: null,
      priceSource: null,
      dealType: null,
      landCost: 0,
      salePrice: null,
      downPayment: null,
      fileCaseSalePrice: null,
      fileCaseDownPayment: null,
      noteOriginalAmount: null,
      noteDownPayment: null,
      grossProfit: null,
      investorTake: null,
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
      ...partial,
    }) as Lot;

  it("counts a reservation in its month even after the lot closed, and does not extrapolate the current month", () => {
    const lots = [
      lot({ propertyId: "a", stage: "closed", reservationDate: "2026-03-10", closeDate: "2026-05-02", netProfit: 100 }),
      lot({ propertyId: "b", stage: "reserved", reservationDate: "2026-05-20", netProfit: null }),
    ];
    const points = computeMonthlyHistory(lots, new Date("2026-05-15T00:00:00Z"));
    expect(points.map((p) => p.month)).toEqual(["2026-03-01", "2026-04-01", "2026-05-01"]);
    expect(points[0]).toMatchObject({ reservations: 1, closings: 0, netProfit: 0, partial: false });
    expect(points[1]).toMatchObject({ reservations: 0, closings: 0, netProfit: 0, partial: false });
    // asOf is May 15: the May 20 reservation has not happened yet; the May 2 closing has.
    expect(points[2]).toMatchObject({ reservations: 0, closings: 1, netProfit: 100, partial: true });
  });

  it("counts a later-cancelled lot only from Lot.reservationDate, not cancelledReservationDate", () => {
    const withDate = [
      lot({ propertyId: "kept", stage: "available", reservationDate: "2026-03-10" }),
    ];
    const invented = [
      lot({
        propertyId: "ghost",
        stage: "available",
        reservationDate: null,
        cancelledReservationDate: "2026-03-10",
      }),
    ];
    const asOf = new Date("2026-03-20T00:00:00Z");
    expect(computeMonthlyHistory(withDate, asOf)[0]).toMatchObject({ reservations: 1, month: "2026-03-01" });
    expect(computeMonthlyHistory(invented, asOf)).toEqual([]);
  });

  it("caps at the last 24 months", () => {
    const lots = [
      lot({ propertyId: "old", stage: "closed", reservationDate: "2023-01-01", closeDate: "2023-01-15", netProfit: 1 }),
      lot({ propertyId: "now", stage: "closed", reservationDate: "2026-09-01", closeDate: "2026-09-02", netProfit: 2 }),
    ];
    const points = computeMonthlyHistory(lots, new Date("2026-09-11T00:00:00Z"));
    expect(points).toHaveLength(24);
    expect(points[0]?.month).toBe("2024-10-01");
    expect(points.at(-1)?.month).toBe("2026-09-01");
    expect(sum(points.map((p) => p.closings))).toBe(1);
    expect(sum(points.map((p) => p.netProfit))).toBe(2);
  });
});
