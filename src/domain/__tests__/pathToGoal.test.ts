import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deadlineForHorizon } from "../../config/goal";
import { buildRealm } from "../realm";
import { sharedFarmsStillNeeded } from "../horizonFigures";
import { farmsStillNeededWithTurns } from "../goal";
import type { PaymentsSnapshot } from "../types";

const snap = JSON.parse(
  readFileSync(new URL("../__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;
const asOf = new Date("2026-09-11T12:00:00Z");

function realmFor(year: 2027 | 2028 | 2029) {
  return buildRealm(snap, asOf, { deadline: deadlineForHorizon(year) });
}

describe("pathToGoal — one farms/capital source of truth", () => {
  it("Throne, War Plan required, shared helper and pathToGoal all return the same farms and capital", () => {
    for (const year of [2027, 2028, 2029] as const) {
      const realm = realmFor(year);
      const path = realm.pathToGoal;
      expect(path.farmsToBuy).toBe(realm.warPlan.required.farmsToBuy);
      expect(path.farmsToBuy).toBe(realm.goal.farmsStillNeeded);
      expect(path.farmsToBuy).toBe(sharedFarmsStillNeeded(realm));
      expect(path.capitalToRaise).toBe(realm.warPlan.rotation.peakOutstanding);
      expect(path.lotsToSell).toBe(realm.goal.lotsStillNeeded);
    }
  });

  it("farms-to-buy comes from the rotation schedule, not the closed-form turns formula", () => {
    const realm = realmFor(2027);
    const closedForm = farmsStillNeededWithTurns(
      realm.goal.inventoryGap,
      realm.goal.avgLotsPerFarm,
      realm.goal.monthsToDeadline,
      realm.rotation.cycleMonths,
    );
    // Fixture: closed-form is 4; War Plan required schedule is 5.
    expect(closedForm).toBe(4);
    expect(realm.pathToGoal.farmsToBuy).toBe(5);
    expect(realm.pathToGoal.farmsToBuy).not.toBe(closedForm);
  });

  it("inventory runway is a time question, not a gap against lotsToSell", () => {
    const realm = realmFor(2027);
    const path = realm.pathToGoal;
    expect(path.inventoryOnHand).toBe(realm.goal.availableLots);
    expect(path.inventoryRunwayMonths).toBeGreaterThan(0);
    expect(path.inventoryZeroDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(path.nextFarmFundByDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Fund-by is before zero-date by the farm→first-close lag.
    expect(path.nextFarmFundByDate! < path.inventoryZeroDate!).toBe(true);
    expect(path.lotsToSell).toBeGreaterThan(path.inventoryOnHand);
  });

  it("reports old vs new figures across the three horizons", () => {
    const rows = ([2027, 2028, 2029] as const).map((year) => {
      const realm = realmFor(year);
      const oldFarms = farmsStillNeededWithTurns(
        realm.goal.inventoryGap,
        realm.goal.avgLotsPerFarm,
        realm.goal.monthsToDeadline,
        realm.rotation.cycleMonths,
      );
      const path = realm.pathToGoal;
      return {
        year,
        lotsToSell: path.lotsToSell,
        farmsToBuy_new: path.farmsToBuy,
        farmsToBuy_oldClosedForm: oldFarms,
        capitalToRaise: path.capitalToRaise,
        inventoryRunwayMonths: path.inventoryRunwayMonths,
        nextFarmFundByDate: path.nextFarmFundByDate,
      };
    });
    // Stable fixture snapshot for the report in the PR / PROGRESS note.
    expect(rows).toEqual([
      {
        year: 2027,
        lotsToSell: 132,
        farmsToBuy_new: 5,
        farmsToBuy_oldClosedForm: 4,
        capitalToRaise: 2342600,
        inventoryRunwayMonths: 10.57,
        nextFarmFundByDate: "2027-04-28",
      },
      {
        year: 2028,
        lotsToSell: 132,
        farmsToBuy_new: 5,
        farmsToBuy_oldClosedForm: 3,
        capitalToRaise: 1874080,
        inventoryRunwayMonths: 10.57,
        nextFarmFundByDate: "2027-04-28",
      },
      {
        year: 2029,
        lotsToSell: 132,
        farmsToBuy_new: 4,
        farmsToBuy_oldClosedForm: 2,
        capitalToRaise: 937040,
        inventoryRunwayMonths: 10.57,
        nextFarmFundByDate: "2027-04-28",
      },
    ]);
  });
});
