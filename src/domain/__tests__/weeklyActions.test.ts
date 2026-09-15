import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { COUNCIL_RULES, computeCouncil } from "../council";
import { STUCK_AFTER_DAYS } from "../pipeline";
import { WEEKLY_MIN_DAYS } from "../../config/weeklyActions";
import {
  computeWeeklyActions,
  daysTowardGoalFromReservations,
  evaluateWeekResult,
  fingerprintStillHolds,
  freezeWeeklyActions,
  qualityProfitAffected,
  resolvedConversionRatio,
} from "../weeklyActions";
import { round2, sum } from "../math";

const fixture = raw as unknown as PaymentsSnapshot;
const ASOF = new Date("2026-09-11T00:00:00Z");
const realm = buildRealm(fixture, ASOF);

describe("weeklyActions detectors", () => {
  const generated = computeWeeklyActions(realm, ASOF, "en");
  const avery = realm.farmScorecard.rows.find((r) => r.name === "Avery");
  const averyAction = generated.candidates.find((c) => c.detector === "farm_fully_reserved_no_closings" && c.records.farmNames.includes("Avery"));

  it("pins Avery's fully reserved farm as the top action and matches the days formula", () => {
    expect(avery).toBeDefined();
    expect(avery?.soldLots).toBe(0);
    expect(avery?.reservedLots).toBeGreaterThan(0);
    expect(averyAction).toBeDefined();
    expect(generated.candidates[0]?.id).toBe(averyAction?.id);
    expect(generated.candidates[0]?.detector).toBe("farm_fully_reserved_no_closings");

    const lots = realm.expected.lots.filter((l) => l.farmName === "Avery");
    const stake = round2(sum(lots.map((l) => l.netProfitAtStake)));
    const conversion = resolvedConversionRatio(realm);
    const perDay = realm.debt.requiredNetProfitPerDay ?? 0;
    const expectedDays = daysTowardGoalFromReservations(stake, conversion, perDay);
    expect(averyAction?.daysTowardGoal).toBe(expectedDays);
    expect(averyAction?.formula.dollars).toBe(round2(stake * conversion));
    expect(averyAction?.formula.requiredNetProfitPerDay).toBe(perDay);
    expect(averyAction?.formula.expression).toContain("netProfitAtStake");
    expect(averyAction?.records.propertyIds.length).toBe(lots.length);
  });

  it("keeps every Council insight as a detector candidate so nothing is lost", () => {
    const council = computeCouncil(realm, "en");
    expect(council.map((i) => i.rule)).toEqual([...COUNCIL_RULES]);
    for (const insight of council) {
      const hit = generated.candidates.find((c) => c.councilRule === insight.rule);
      expect(hit, `missing detector for council rule ${insight.rule}`).toBeDefined();
    }
  });

  it("ties every primary detector to real record ids", () => {
    const primaries = generated.candidates.filter((c) => !c.id.startsWith("council:"));
    expect(primaries.length).toBeGreaterThan(0);
    for (const c of primaries) {
      const hasIds =
        c.records.farmIds.length + c.records.propertyIds.length + c.records.qualityIds.length + c.records.dates.length > 0;
      expect(hasIds, c.id).toBe(true);
    }
  });

  it("groups stuck reservations per farm when the farm has 3 or more", () => {
    const averyStuck = generated.candidates.find((c) => c.id === `stuck_reservation:farm:${avery?.farmId}`);
    expect(averyStuck).toBeDefined();
    expect(averyStuck?.records.propertyIds.length).toBeGreaterThanOrEqual(3);
    const titus = generated.candidates.filter((c) => c.detector === "stuck_reservation" && c.records.farmNames.includes("Titus"));
    expect(titus.every((c) => c.id.startsWith("stuck_reservation:lot:"))).toBe(true);
  });

  it("flags Lakeview as idle inventory (days parked) and committed unfunded capital", () => {
    const idle = generated.candidates.find((c) => c.detector === "idle_farm" && c.records.farmNames.includes("Lakeview"));
    expect(idle).toBeDefined();
    expect(idle?.daysLabel).toBe("parked");
    const unfunded = generated.candidates.find((c) => c.detector === "committed_unfunded_capital");
    expect(unfunded).toBeDefined();
    expect(unfunded?.records.amounts[0]).toBe(realm.debt.capitalCommittedUnfunded);
  });

  it("does not fire next_farm_fund_by when the fund-by date is outside 120 days", () => {
    expect(realm.pathToGoal.nextFarmFundByDate).toBe("2027-04-28");
    expect(generated.candidates.some((c) => c.detector === "next_farm_fund_by")).toBe(false);
    expect(generated.candidates.some((c) => c.detector === "inventory")).toBe(true);
  });

  it("scores quality blockers from price_mismatch profit affected", () => {
    const quality = generated.candidates.find((c) => c.detector === "quality_blocker");
    expect(quality).toBeDefined();
    expect(quality?.formula.dollars).toBe(qualityProfitAffected(realm));
    expect(qualityProfitAffected(realm)).toBe(19_999.5);
  });

  it("writes Score descriptions in Spanish without a spaced hyphen", () => {
    for (const c of generated.candidates) {
      expect(c.scoreDescription).toMatch(/^Necesito que/);
      expect(c.scoreDescription.includes(" - ")).toBe(false);
      const sentences = c.scoreDescription.split(/(?<=\.)\s+/).filter(Boolean);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.length).toBeLessThanOrEqual(4);
    }
  });

  it("applies urgency 1.5 when a due date is already past", () => {
    const stuck = generated.candidates.find((c) => c.detector === "stuck_reservation" && c.dueDate);
    expect(stuck?.urgency).toBe(1.5);
    expect(stuck?.score).toBe(round2((stuck?.daysTowardGoal ?? 0) * 1.5));
  });

  it("freezes order and does not reshuffle on a second compute", () => {
    const frozen = freezeWeeklyActions(generated, "2026-09-11T12:00:00.000Z", 2027);
    const again = computeWeeklyActions(realm, ASOF, "en");
    expect(again.candidates.map((c) => c.id)).toEqual(generated.candidates.map((c) => c.id));
    expect(frozen.actions.map((a) => a.status).every((s) => s === "pending")).toBe(true);
    expect(frozen.week).toBe("2026-W37");
    expect(STUCK_AFTER_DAYS).toBe(60);
  });

  it("counts days gained only when the underlying record changed", () => {
    const frozen = freezeWeeklyActions(generated, "2026-09-11T12:00:00.000Z", 2027);
    frozen.actions[0]!.status = "done";
    const untouched = evaluateWeekResult(frozen, realm);
    expect(untouched.doneCount).toBe(1);
    expect(untouched.daysGained).toBe(0);

    const closed = {
      ...realm,
      farmScorecard: {
        ...realm.farmScorecard,
        rows: realm.farmScorecard.rows.map((r) => (r.name === "Avery" ? { ...r, soldLots: 1, reservedLots: r.reservedLots - 1 } : r)),
      },
    };
    expect(fingerprintStillHolds(frozen.actions[0]!, closed)).toBe(false);
    const gained = evaluateWeekResult(frozen, closed);
    expect(gained.daysGained).toBe(frozen.actions[0]!.daysTowardGoal);
  });

  it("says so when nothing exceeds the 3-day minimum", () => {
    expect(WEEKLY_MIN_DAYS).toBe(3);
    expect(generated.belowMinimum).toBe(false);
    const emptyRealm = {
      ...realm,
      pipeline: { ...realm.pipeline, stuck: [] },
      farmScorecard: { ...realm.farmScorecard, rows: realm.farmScorecard.rows.map((r) => ({ ...r, reservedLots: 0, availableLots: 0, reservationsInLast90: 1, soldLots: r.soldLots || 1 })) },
      debt: { ...realm.debt, capitalCommittedUnfunded: 0, requiredNetProfitPerDay: 1_000_000 },
      noteStrategies: { ...realm.noteStrategies, notes: [] },
      quality: [],
      expected: { ...realm.expected, lots: [] },
      pathToGoal: { ...realm.pathToGoal, nextFarmFundByDate: "2028-01-01", inventoryZeroDate: "2028-04-01" },
    };
    const weak = computeWeeklyActions(emptyRealm, ASOF, "en");
    expect(weak.belowMinimum).toBe(true);
    expect(weak.lever).not.toBeNull();
  });
});
