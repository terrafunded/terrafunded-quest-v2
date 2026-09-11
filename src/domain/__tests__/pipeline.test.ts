/**
 * The reservations layer, on a small synthetic realm built from raw rows. Own-capital farm,
 * landCost 50,000 per lot (500,000 ÷ 10), so a 120,000 reservation carries 70,000 of net profit at stake.
 */
import { describe, expect, it } from "vitest";
import { ASOF, farm, fileCase, note, property, snapshot } from "./builders";
import { buildRealm } from "../realm";
import { computeConversion, computePipeline, computeStuckLots, netProfitAtStake, STUCK_AFTER_DAYS } from "../pipeline";

function realm() {
  const f = farm({ farm_name: "Northfield", total_lots: 10 });
  const props = Array.from({ length: 10 }, (_, i) => property(f.id, i + 1, { farm_acquisition_id: f.id, name: `Northfield — Lot ${i + 1}` }));
  const p = (i: number) => props[i - 1]!.id;
  const fileCases = [
    // closed, both dates: 40 days
    fileCase(p(1), { status: "completed", reservation_date: "2026-01-01", closing_date: "2026-02-10", sale_price: 100_000 }),
    // closed, both dates: 80 days
    fileCase(p(2), { status: "completed", reservation_date: "2026-01-01", closing_date: "2026-03-22", sale_price: 100_000 }),
    // closed via note (no closing_date on the case): note start 2026-04-01 → 60 days
    fileCase(p(3), { status: "active", reservation_date: "2026-01-31", closing_date: null }),
    // reservation dated after the close: excluded from durations, still counts as converted
    fileCase(p(4), { status: "completed", reservation_date: "2026-05-01", closing_date: "2026-04-01" }),
    // stuck: reserved 132 days ago
    fileCase(p(5), { status: "active", reservation_date: "2026-05-02", sale_price: 120_000 }),
    // stuck: exactly 60 days ago
    fileCase(p(6), { status: "active", reservation_date: "2026-07-13", sale_price: 130_000 }),
    // not stuck: 59 days ago; inside the trailing window
    fileCase(p(7), { status: "active", reservation_date: "2026-07-14", sale_price: 110_000 }),
    // fresh reservation, 10 days ago; inside the window
    fileCase(p(8), { status: "active", reservation_date: "2026-09-01", sale_price: 115_000 }),
    // cancelled case: the lot is available, never part of the pipeline
    fileCase(p(9), { status: "cancelled", reservation_date: "2026-08-01" }),
  ];
  const notes = [note(p(3), { start_date: "2026-04-01", original_amount: 100_000 })];
  return buildRealm(snapshot({ farmAcquisitions: [f], properties: props, fileCases, notes }), ASOF);
}

describe("pipeline: stuck reservations", () => {
  it("lists reserved lots waiting 60+ days, sorted by days waiting, with net profit at stake", () => {
    const r = realm();
    const stuck = r.pipeline.stuck;
    expect(stuck.map((s) => [s.lotName, s.daysWaiting])).toEqual([
      ["Northfield — Lot 5", 132],
      ["Northfield — Lot 6", 60],
    ]);
    expect(stuck[0]?.salePrice).toBe(120_000);
    expect(stuck[0]?.netProfitAtStake).toBe(70_000);
    expect(stuck[0]?.buyerName).toBe("Buyer One");
    expect(r.pipeline.netProfitTrapped).toBe(150_000);
    expect(r.pipeline.salePriceTrapped).toBe(250_000);
    expect(r.pipeline.stuckIds).toEqual(new Set(stuck.map((s) => s.propertyId)));
  });

  it("uses the same net-profit formula as the goal's pipeline", () => {
    const r = realm();
    expect(r.pipeline.pipelineNetProfit).toBe(r.goal.netProfitInPipeline);
    expect(r.pipeline.reserved).toBe(4);
    const reservedSum = r.lots.filter((l) => l.stage === "reserved").reduce((a, l) => a + netProfitAtStake(l), 0);
    expect(r.pipeline.pipelineNetProfit).toBe(reservedSum);
  });

  it("the threshold is configurable and defaults to 60 days", () => {
    const r = realm();
    expect(STUCK_AFTER_DAYS).toBe(60);
    expect(computeStuckLots(r.lots, ASOF, 100)).toHaveLength(1);
    expect(computeStuckLots(r.lots, ASOF, 59)).toHaveLength(3);
  });
});

describe("pipeline: leading indicator", () => {
  it("counts reservations made in the trailing 90 days that are still waiting, per month", () => {
    const r = realm();
    // Lots 7 and 8 were reserved inside the window and are still reserved; lot 6 (60 days) too.
    expect(r.pipeline.newReservationsTrailing).toBe(3);
    expect(r.pipeline.reservationsPerMonth).toBe(1.01);
    expect(r.pipeline.reservationsMadeTrailing).toBe(3);
    expect(r.pipeline.closedLotsPerMonth).toBe(r.goal.closedLotsPerMonth);
  });
});

describe("pipeline: conversion", () => {
  it("of reservations made 90+ days ago, reports the share that closed", () => {
    const r = realm();
    const c = r.pipeline.conversion;
    // Cohort: lots 1, 2, 3, 4 (closed) + 5 (reserved 132 d) = 5; lot 6 (60 d) and later are too young.
    expect(c.cutoff).toBe("2026-06-13");
    expect(c.cohort).toBe(5);
    expect(c.closed).toBe(4);
    expect(c.stillReserved).toBe(1);
    expect(c.pct).toBe(80);
  });

  it("is null with an empty cohort", () => {
    expect(computeConversion([], ASOF).pct).toBeNull();
  });
});

describe("pipeline: median days from reservation to closing", () => {
  it("uses closed lots with both dates and ignores negative durations", () => {
    const r = realm();
    // 40, 80, 60 → median 60; lot 4 (reservation after close) is excluded.
    expect(r.pipeline.medianDaysToClose).toBe(60);
    expect(r.pipeline.closedWithBothDates).toBe(3);
    const north = r.pipeline.farms.find((f) => f.farmName === "Northfield");
    expect(north?.medianDaysToClose).toBe(60);
    expect(north?.stuck).toBe(2);
    expect(north?.netProfitTrapped).toBe(150_000);
    expect(r.pipeline.farmById.get(north!.farmId)).toBe(north);
  });

  it("is null for a farm with no closed lot", () => {
    const f = farm({ farm_name: "Empty" });
    const props = [property(f.id, 1, { farm_acquisition_id: f.id })];
    const p = computePipeline(buildRealm(snapshot({ farmAcquisitions: [f], properties: props, fileCases: [fileCase(props[0]!.id)] }), ASOF).lots, ASOF);
    expect(p.medianDaysToClose).toBeNull();
    expect(p.farms[0]?.medianDaysToClose).toBeNull();
    expect(p.farms[0]?.reserved).toBe(1);
  });
});

describe("pipeline: never touches the goal", () => {
  it("net profit, pace, oxygen and the goal date are identical with and without reservations", () => {
    const f = farm({ farm_name: "Northfield", total_lots: 10 });
    const props = Array.from({ length: 4 }, (_, i) => property(f.id, i + 1, { farm_acquisition_id: f.id }));
    const closedCases = [
      fileCase(props[0]!.id, { status: "completed", reservation_date: "2026-06-01", closing_date: "2026-08-01", sale_price: 100_000 }),
      fileCase(props[1]!.id, { status: "completed", reservation_date: "2026-06-15", closing_date: "2026-08-20", sale_price: 110_000 }),
    ];
    const reservedCases = [
      fileCase(props[2]!.id, { status: "active", reservation_date: "2026-05-01", sale_price: 120_000 }),
      fileCase(props[3]!.id, { status: "active", reservation_date: "2026-09-01", sale_price: 120_000 }),
    ];
    const without = buildRealm(snapshot({ farmAcquisitions: [f], properties: props, fileCases: closedCases }), ASOF);
    const withRes = buildRealm(snapshot({ farmAcquisitions: [f], properties: props, fileCases: [...closedCases, ...reservedCases] }), ASOF);

    expect(withRes.pipeline.stuckCount).toBe(1);
    expect(without.pipeline.stuckCount).toBe(0);
    expect(withRes.goal.netProfitToDate).toBe(without.goal.netProfitToDate);
    expect(withRes.goal.closedLotsPerMonth).toBe(without.goal.closedLotsPerMonth);
    expect(withRes.goal.projectedDate).toBe(without.goal.projectedDate);
    expect(withRes.oxygen.totalDaysGained).toBe(without.oxygen.totalDaysGained);
    expect(withRes.debt.requiredNetProfitPerDay).toBe(without.debt.requiredNetProfitPerDay);
  });
});
