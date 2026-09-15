import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deadlineForHorizon } from "../../config/goal";
import { ENGINE_DEFAULT_COST_PER_RESERVATION } from "../../config/engine";
import { buildRealm } from "../realm";
import {
  DEFAULT_AD_BUDGET_PER_FARM_PER_DAY,
  monthlyAdSpendForActiveFarms,
  reservationsPerFarmPerMonth,
} from "../oracle";
import { farmSeedsFromRealm, simulatorContextFromRealm } from "../simulator";
import type { PaymentsSnapshot } from "../types";

const snap = JSON.parse(
  readFileSync(new URL("../__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;
const ASOF = new Date("2026-09-11T12:00:00Z");

describe("per-farm selling model", () => {
  it("derives equal reservations per farm from the shared daily budget and CPR", () => {
    expect(DEFAULT_AD_BUDGET_PER_FARM_PER_DAY).toBe(250);
    expect(ENGINE_DEFAULT_COST_PER_RESERVATION).toBe(2_000);
    expect(reservationsPerFarmPerMonth(250, 2_000)).toBe(3.75);
    expect(monthlyAdSpendForActiveFarms(8, 250)).toBe(60_000);
  });

  it("fixture on-hand lots are 50 available + 33 reserved = 83", () => {
    const realm = buildRealm(snap, ASOF, { deadline: deadlineForHorizon(2027) });
    const seeds = farmSeedsFromRealm(realm.farmScorecard, realm.expected);
    const available = seeds.reduce((a, f) => a + f.availableLots, 0);
    const reserved = seeds.reduce((a, f) => a + f.reservedLots, 0);
    expect(available).toBe(50);
    expect(reserved).toBe(33);
    expect(available + reserved).toBe(83);
    expect(realm.goal.availableLots).toBe(50);
    expect(realm.goal.reservedLots).toBe(33);
  });

  it("active farms today are farms with available lots (8 on the fixture)", () => {
    const realm = buildRealm(snap, ASOF, { deadline: deadlineForHorizon(2027) });
    const ctx = simulatorContextFromRealm(realm);
    expect(ctx.farmSeeds.filter((f) => f.availableLots > 0)).toHaveLength(8);
    expect(ctx.farmSeeds.filter((f) => f.availableLots + f.reservedLots > 0)).toHaveLength(9);
  });
});
