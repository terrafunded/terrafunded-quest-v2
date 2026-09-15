import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deadlineForHorizon } from "../../config/goal";
import { buildRealm } from "../realm";
import { captureHorizonFigures, sharedFarmsStillNeeded } from "../horizonFigures";
import { farmsStillNeededWithTurns } from "../goal";
import {
  computePathToGoal,
  extraInterestVersus2027,
  interestCarryToDeadline,
  projectedExitAtCurrentPace,
} from "../pathToGoal";
import { buildPlatformExport } from "../../lib/platformExport";
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
      expect(path.capitalToRaise).toBe(realm.warPlan.required.capitalToRaise);
      expect(path.peakOutstanding).toBe(realm.warPlan.rotation.peakOutstanding);
      expect(path.lotsToSell).toBe(realm.goal.lotsStillNeeded);
    }
  });

  it("fails if capitalToRaise and peakOutstanding are swapped again", () => {
    const realm = realmFor(2027);
    const path = computePathToGoal(
      realm.goal,
      {
        ...realm.warPlan,
        required: { ...realm.warPlan.required, capitalToRaise: 111_111 },
        rotation: { ...realm.warPlan.rotation, peakOutstanding: 222_222 },
      },
      asOf,
    );
    expect(path.capitalToRaise).toBe(111_111);
    expect(path.peakOutstanding).toBe(222_222);
    expect(path.capitalToRaise).not.toBe(path.peakOutstanding);
    expect(path.capitalToRaise).not.toBe(realm.warPlan.rotation.peakOutstanding);
    expect(path.peakOutstanding).not.toBe(realm.warPlan.required.capitalToRaise);
  });

  it("farms-to-buy comes from the rotation schedule, not the closed-form turns formula", () => {
    const realm = realmFor(2027);
    const closedForm = farmsStillNeededWithTurns(
      realm.goal.inventoryGap,
      realm.goal.avgLotsPerFarm,
      realm.goal.monthsToDeadline,
      realm.rotation.cycleMonths,
    );
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
    expect(path.nextFarmFundByDate! < path.inventoryZeroDate!).toBe(true);
    expect(path.lotsToSell).toBeGreaterThan(path.inventoryOnHand);
  });

  it("pins fixture farms, lots, capital and the authoritative exit date at all three horizons", () => {
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
        remaining: realm.goal.remaining,
        lotsToSell: path.lotsToSell,
        lotsStillNeededRecent: realm.goal.lotsStillNeededRecent,
        warPlanLotsNeeded: realm.warPlan.required.lotsNeeded,
        farmsToBuy_new: path.farmsToBuy,
        farmsToBuy_oldClosedForm: oldFarms,
        capitalToRaise: path.capitalToRaise,
        peakOutstanding: path.peakOutstanding,
        projectedExitAtCurrentPace: path.projectedExitAtCurrentPace,
        lifetimeProjectedDate: realm.goal.projectedDate,
        oracleCurrentExit: realm.futures.current.exitDate,
        inventoryRunwayMonths: path.inventoryRunwayMonths,
        nextFarmFundByDate: path.nextFarmFundByDate,
      };
    });
    expect(rows).toEqual([
      {
        year: 2027,
        remaining: 7_763_621.66,
        lotsToSell: 132,
        lotsStillNeededRecent: 120,
        warPlanLotsNeeded: 132.88,
        farmsToBuy_new: 5,
        farmsToBuy_oldClosedForm: 4,
        capitalToRaise: 2_342_600,
        peakOutstanding: 2_342_600,
        projectedExitAtCurrentPace: "2028-10-22",
        lifetimeProjectedDate: "2029-01-08",
        oracleCurrentExit: "2028-01-11",
        inventoryRunwayMonths: 10.57,
        nextFarmFundByDate: "2027-04-28",
      },
      {
        year: 2028,
        remaining: 7_763_621.66,
        lotsToSell: 132,
        lotsStillNeededRecent: 120,
        warPlanLotsNeeded: 124.07,
        farmsToBuy_new: 5,
        farmsToBuy_oldClosedForm: 3,
        capitalToRaise: 1_874_080,
        peakOutstanding: 1_874_080,
        projectedExitAtCurrentPace: "2028-10-22",
        lifetimeProjectedDate: "2029-01-08",
        oracleCurrentExit: "2028-01-11",
        inventoryRunwayMonths: 10.57,
        nextFarmFundByDate: "2027-04-28",
      },
      {
        year: 2029,
        remaining: 7_763_621.66,
        lotsToSell: 132,
        lotsStillNeededRecent: 120,
        warPlanLotsNeeded: 120.49,
        farmsToBuy_new: 4,
        farmsToBuy_oldClosedForm: 2,
        capitalToRaise: 937_040,
        peakOutstanding: 937_040,
        projectedExitAtCurrentPace: "2028-10-22",
        lifetimeProjectedDate: "2029-01-08",
        oracleCurrentExit: "2028-01-11",
        inventoryRunwayMonths: 10.57,
        nextFarmFundByDate: "2027-04-28",
      },
    ]);
  });

  it("every page reads the same authoritative projected exit at current pace", () => {
    for (const year of [2027, 2028, 2029] as const) {
      const realm = realmFor(year);
      const date = realm.pathToGoal.projectedExitAtCurrentPace;
      expect(date).toBe("2028-10-22");
      expect(date).toBe(projectedExitAtCurrentPace(realm.goal));
      expect(date).toBe(realm.goal.projectedDateRecent);
      const doc = buildPlatformExport(realm, { lang: "en", exitHorizon: year });
      expect(doc.figures.find((f) => f.id === "throne.projectedExitAtCurrentPace")?.raw).toBe(date);
      const set = captureHorizonFigures(realm, year);
      for (const id of [
        "/.projectedExitAtCurrentPace",
        "/oracle.projectedExitAtCurrentPace",
        "/council.projectedExitAtCurrentPace",
        "/exodus.projectedExitAtCurrentPace",
      ]) {
        expect(set.figures.find((f) => f.id === id)?.value, id).toBe(date);
      }
    }
  });

  it("pins interest carry on existing capital and the extra versus 2027 — not deducted from remaining", () => {
    const perDay = realmFor(2027).debt.interestPerDay as number;
    expect(perDay).toBe(1279.96);
    expect(interestCarryToDeadline(perDay, asOf, 2027)).toBe(609_260.96);
    expect(interestCarryToDeadline(perDay, asOf, 2028)).toBe(1_077_726.32);
    expect(interestCarryToDeadline(perDay, asOf, 2029)).toBe(1_544_911.72);
    expect(extraInterestVersus2027(perDay, asOf, 2027)).toBe(0);
    expect(extraInterestVersus2027(perDay, asOf, 2028)).toBe(468_465.36);
    expect(extraInterestVersus2027(perDay, asOf, 2029)).toBe(935_650.76);
    for (const year of [2027, 2028, 2029] as const) {
      expect(realmFor(year).goal.remaining).toBe(7_763_621.66);
    }
  });
});
