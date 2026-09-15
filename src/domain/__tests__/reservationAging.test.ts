import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealm } from "../realm";
import { agingBucket, AGING_BUCKETS, AGING_STUCK_AFTER_DAYS, buildScoreTasks, computeReservationAging } from "../reservationAging";
import type { PaymentsSnapshot } from "../types";

const fixture = JSON.parse(
  readFileSync(new URL("../__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;

const asOf = new Date("2026-09-11T00:00:00Z");

describe("reservation aging", () => {
  it("buckets 0-30 / 31-60 / 61-90 / 90+ without overlapping 90", () => {
    expect(agingBucket(0)).toBe("0-30");
    expect(agingBucket(30)).toBe("0-30");
    expect(agingBucket(31)).toBe("31-60");
    expect(agingBucket(60)).toBe("31-60");
    expect(agingBucket(61)).toBe("61-90");
    expect(agingBucket(89)).toBe("61-90");
    expect(agingBucket(90)).toBe("90+");
    expect(agingBucket(150)).toBe("90+");
    expect(AGING_BUCKETS).toEqual(["0-30", "31-60", "61-90", "90+"]);
    expect(AGING_STUCK_AFTER_DAYS).toBe(90);
  });

  it("fixture live reservations fill every bucket and Score tasks stay Spanish, no API", () => {
    const realm = buildRealm(fixture, asOf, { deadline: "2027-12-31" });
    const aging = realm.reservationAging;
    expect(aging).toEqual(computeReservationAging(realm.farms, realm.expected, realm.oxygen, realm.asOf));
    expect(aging.lots.length).toBe(realm.expected.liveReservations);
    expect(aging.counts["0-30"] + aging.counts["31-60"] + aging.counts["61-90"] + aging.counts["90+"]).toBe(aging.lots.length);
    expect(aging.stuckCount).toBe(aging.counts["90+"]);
    expect(aging.fullyReservedUnsold).toEqual([]);

    const pace = realm.oxygen.netProfitPerDayAtPace;
    expect(pace).toBeGreaterThan(0);
    for (const lot of aging.lots) {
      expect(lot.daysIfClosedThisMonth).toBe(Math.round(lot.netProfitAtStake / (pace as number)));
      if (lot.buyerIsTestClient) expect(lot.buyerName).toBeNull();
    }

    const tasks = buildScoreTasks(aging.stuck, realm.asOf);
    expect(tasks).toHaveLength(aging.stuckCount);
    for (const task of tasks) {
      expect(task.title).toMatch(/^Cerrar reserva — /);
      expect(task.description).toMatch(/lleva \d+ días/);
      expect(task.description).toMatch(/Utilidad neta esperada/);
      expect(task.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
