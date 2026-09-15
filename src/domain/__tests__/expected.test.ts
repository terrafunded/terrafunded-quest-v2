/**
 * Reservations as first-class citizens, on a small synthetic realm built from raw rows.
 * Northfield: own capital, landCost 50,000 per lot (500,000 ÷ 10). Southmoor: fixed interest, no closing yet.
 */
import { describe, expect, it } from "vitest";
import { ASOF, client, farm, fileCase, property, snapshot } from "./builders";
import { buildRealm } from "../realm";
import { computeExpected, reservationsMade } from "../expected";
import { computePipeline, netProfitAtStake } from "../pipeline";
import { computeGoal } from "../goal";
import { runOracle, type OracleParams } from "../oracle";
import { round2 } from "../math";

function build() {
  const north = farm({ farm_name: "Northfield", total_lots: 10 });
  const south = farm({ farm_name: "Southmoor", total_lots: 5, deal_type: "fixed_interest", investor_capital: 250_000, annual_interest_rate: 20, funding_date: "2026-03-01", closing_date: "2026-03-01" });
  const n = Array.from({ length: 6 }, (_, i) => property(north.id, i + 1, { name: `Northfield — Lot ${i + 1}` }));
  const s = [property(south.id, 1, { name: "Southmoor — Lot 1" })];
  const id = (i: number) => n[i - 1]!.id;
  const fileCases = [
    // closed: 40 and 80 days from reservation to closing → farm median 60
    fileCase(id(1), { status: "completed", reservation_date: "2026-01-01", closing_date: "2026-02-10", sale_price: 100_000 }),
    fileCase(id(2), { status: "completed", reservation_date: "2026-01-01", closing_date: "2026-03-22", sale_price: 100_000 }),
    // live, overdue: reserved 72 days ago, expected 60 days after
    fileCase(id(3), { status: "active", reservation_date: "2026-07-01", sale_price: 120_000 }),
    // live, fresh
    fileCase(id(4), { status: "active", reservation_date: "2026-09-01", sale_price: 120_000 }),
    // cancelled, matured: counts against conversion
    fileCase(id(5), { status: "cancelled", client_id: "client-2", reservation_date: "2026-03-01", updated_at: "2026-04-15T10:00:00Z", sale_price: 100_000 }),
    // cancelled then re-reserved by another buyer
    fileCase(id(6), { status: "cancelled", client_id: "client-2", reservation_date: "2026-08-01", updated_at: "2026-08-20T10:00:00Z", sale_price: 105_000 }),
    fileCase(id(6), { status: "active", reservation_date: "2026-08-25", sale_price: 110_000, created_at: "2026-08-25T00:00:00Z" }),
    // Southmoor: no closing on the farm, one live reservation → realm median
    fileCase(s[0]!.id, { status: "active", reservation_date: "2026-08-15", sale_price: 120_000 }),
  ];
  const snap = snapshot({
    farmAcquisitions: [north, south],
    properties: [...n, ...s],
    fileCases,
    clients: [client(), client({ id: "client-2", full_name: "Rocío Vega" })],
  });
  return { realm: buildRealm(snap, ASOF), snap, north, south, n, s };
}

describe("expected: reservations made", () => {
  it("lists every pledge — live, closed since, or cancelled — by reservation date", () => {
    const { realm } = build();
    const made = reservationsMade(realm.lots);
    expect(made.map((r) => [r.date, r.outcome])).toEqual([
      ["2026-01-01", "closed"],
      ["2026-01-01", "closed"],
      ["2026-03-01", "cancelled"],
      ["2026-07-01", "live"],
      ["2026-08-01", "cancelled"],
      ["2026-08-15", "live"],
      ["2026-08-25", "live"],
      ["2026-09-01", "live"],
    ]);
    expect(made.find((r) => r.date === "2026-07-01")?.netProfitAtStake).toBe(70_000);
    expect(made.filter((r) => r.outcome === "cancelled").every((r) => r.netProfitAtStake === 0)).toBe(true);
  });

  it("the lot keeps every cancelled case with buyer, dates and price", () => {
    const { realm } = build();
    const lot6 = realm.lots.find((l) => l.name === "Northfield — Lot 6")!;
    expect(lot6.stage).toBe("reserved");
    expect(lot6.cancelledFileCases).toBe(1);
    expect(lot6.cancellations).toHaveLength(1);
    expect(lot6.cancellations[0]).toMatchObject({ reservationDate: "2026-08-01", cancelledOn: "2026-08-20", buyerName: "Rocío Vega", buyerIsTestClient: false, salePrice: 105_000 });
    const lot5 = realm.lots.find((l) => l.name === "Northfield — Lot 5")!;
    expect(lot5.stage).toBe("available");
    expect(lot5.cancellations[0]?.cancelledOn).toBe("2026-04-15");
  });
});

describe("expected: per reservation", () => {
  const { realm } = build();
  const e = realm.expected;
  const by = new Map(e.lots.map((l) => [l.lotName, l]));

  it("uses the conversion with cancellations: 2 closed of 2 matured + 1 cancelled = 66.67 %", () => {
    expect(realm.pipeline.conversion).toMatchObject({ cohort: 2, closed: 2, cancelled: 1, pct: 100, pctWithCancellations: 66.67 });
    expect(e.conversionPct).toBe(66.67);
    expect(e.conversionSource).toBe("resolved");
  });

  it("expected close = reservation + the farm's median when it has closings, else the realm's", () => {
    expect(e.medianDaysToClose).toBe(60);
    expect(by.get("Northfield — Lot 3")).toMatchObject({ reservationDate: "2026-07-01", medianDaysToClose: 60, medianSource: "farm", expectedCloseDate: "2026-08-30", expectedMonth: "2026-08", overdue: true, daysWaiting: 72, daysToExpectedClose: -12 });
    expect(by.get("Northfield — Lot 4")).toMatchObject({ expectedCloseDate: "2026-10-31", expectedMonth: "2026-10", overdue: false, daysToExpectedClose: 50 });
    expect(by.get("Northfield — Lot 6")).toMatchObject({ reservationDate: "2026-08-25", expectedCloseDate: "2026-10-24" });
    expect(by.get("Southmoor — Lot 1")).toMatchObject({ medianSource: "realm", medianDaysToClose: 60, expectedCloseDate: "2026-10-14" });
  });

  it("expected net profit = net profit at stake × conversion", () => {
    expect(by.get("Northfield — Lot 3")).toMatchObject({ netProfitAtStake: 70_000, expectedNetProfit: 46_669 });
    expect(by.get("Northfield — Lot 6")).toMatchObject({ netProfitAtStake: 60_000, expectedNetProfit: 40_002 });
    const south = realm.lots.find((l) => l.name === "Southmoor — Lot 1")!;
    expect(by.get("Southmoor — Lot 1")?.netProfitAtStake).toBe(netProfitAtStake(south));
    expect(by.get("Southmoor — Lot 1")?.expectedNetProfit).toBe(round2(netProfitAtStake(south) * 0.6667));
    expect(e.committedNetProfit).toBe(round2(e.lots.reduce((a, l) => a + l.expectedNetProfit, 0)));
    expect(e.netProfitAtStake).toBe(realm.pipeline.pipelineNetProfit);
  });

  it("buckets the expected closings by month, flags past months and counts the overdue", () => {
    expect(e.expectedByMonth.map((m) => [m.month, m.count, m.expectedClosings, m.past])).toEqual([
      ["2026-08", 1, 0.67, true],
      ["2026-10", 3, 2, false],
    ]);
    expect(e.expectedByMonth[1]?.expectedNetProfit).toBe(round2(46_669 + 40_002 + (by.get("Southmoor — Lot 1")?.expectedNetProfit ?? 0)));
    expect(e.overdueCount).toBe(1);
    expect(e.overdueNetProfit).toBe(46_669);
    expect(e.landsBy).toBe("2026-10");
    expect(e.peakMonth).toBe("2026-10");
    expect(e.liveReservations).toBe(4);
    expect(e.undatedCount).toBe(0);
  });

  it("paces over the trailing 90 days: 5 reservations (1.69/month), 0 closings; required reservations = required closings ÷ conversion", () => {
    expect(e.reservationsTrailing).toBe(5);
    expect(e.reservationsPerMonth).toBe(1.69);
    expect(e.closingsTrailing).toBe(0);
    expect(e.closingsPerMonth).toBe(0);
    expect(e.requiredClosingsPerMonth).toBe(realm.goal.requiredLotsPerMonthToHitDeadline);
    expect(e.requiredClosingsPerMonth).toBe(12.66);
    expect(e.requiredReservationsPerMonth).toBe(round2(12.66 / 0.6667));
    expect(e.requiredReservationsPerMonth).toBe(18.99);
  });

  it("this month and next: reservations made, closings, and closings expected from reservations already made", () => {
    expect(e.thisMonth).toEqual({ month: "2026-09", reservations: 1, closings: 0, expectedReservations: 0, expectedClosings: 0, expectedNetProfit: 0 });
    expect(e.nextMonth).toMatchObject({ month: "2026-10", reservations: 0, closings: 0, expectedReservations: 3, expectedClosings: 2 });
  });

  it("without any closing there is no median and no measured conversion: dates are null, conversion assumed 100 %", () => {
    const f = farm({ farm_name: "Empty", total_lots: 4, investor_capital: 200_000 });
    const props = [property(f.id, 1), property(f.id, 2)];
    const lots = buildRealm(snapshot({ farmAcquisitions: [f], properties: props, fileCases: [fileCase(props[0]!.id, { reservation_date: "2026-08-01" })] }), ASOF).lots;
    const pipeline = computePipeline(lots, ASOF);
    const x = computeExpected(lots, pipeline, computeGoal(lots, [], ASOF), ASOF);
    expect(x.conversionPct).toBe(100);
    expect(x.conversionSource).toBe("assumed");
    expect(x.lots[0]).toMatchObject({ expectedCloseDate: null, expectedMonth: null, medianSource: null, overdue: false, expectedNetProfit: 70_000 });
    expect(x.undatedCount).toBe(1);
    expect(x.expectedByMonth).toEqual([]);
    expect(x.landsBy).toBeNull();
    expect(x.requiredReservationsPerMonth).toBeNull();
    expect(x.committedNetProfit).toBe(70_000);
  });
});

describe("expected: the rest of the realm reads it", () => {
  const { realm, south } = build();

  it("oxygen: live reservations earn provisional days; a closing has confirmed days instead; a cancelled one has none", () => {
    const o = realm.oxygen;
    const lot3 = realm.lots.find((l) => l.name === "Northfield — Lot 3")!;
    const lot1 = realm.lots.find((l) => l.name === "Northfield — Lot 1")!;
    const lot5 = realm.lots.find((l) => l.name === "Northfield — Lot 5")!;
    expect(o.provisional.size).toBe(4);
    expect(o.conversionPct).toBe(66.67);
    const p = o.provisional.get(lot3.propertyId)!;
    expect(p).toMatchObject({ reservationDate: "2026-07-01", measuredOn: "2026-07-01", netProfitAtStake: 70_000, conversionPct: 66.67 });
    // no closing in the 90 days before July 1 (nor before today): the realm had no pace to measure against, so no days
    expect(p.paceThatDay).toBeNull();
    expect(p.daysIfClosed).toBe(0);
    expect(p.provisionalDays).toBe(0);
    expect(o.provisionalDaysGained).toBe([...o.provisional.values()].reduce((a, x) => a + x.provisionalDays, 0));
    expect(o.provisional.has(lot1.propertyId)).toBe(false);
    expect(o.perLot.has(lot1.propertyId)).toBe(true);
    expect(o.provisional.has(lot5.propertyId)).toBe(false);
    // confirmed total is closings only
    expect(o.totalDaysGained).toBe([...o.perLot.values()].reduce((a, x) => a + x.daysGained, 0));
  });

  it("campaigns: Southmoor accrues interest with no closing but has a reservation waiting → closing pending", () => {
    const c = realm.campaignByFarm.get(south.id)!;
    expect(c.state).toBe("closing_pending");
    expect(c.reservedLots).toBe(1);
    expect(c.interestAccruing).toBe(true);
    expect(c.reason).toBe("1 reservation waiting to close, no closing yet");
  });

  it("chronicle: cancellations are events, narrated with the buyer and the days held; the pledge they cancel is narrated too", () => {
    const lot5 = realm.lots.find((l) => l.name === "Northfield — Lot 5")!;
    const lot6 = realm.lots.find((l) => l.name === "Northfield — Lot 6")!;
    const cancellations = realm.events.filter((ev) => ev.kind === "cancellation");
    expect(cancellations.map((ev) => [ev.date, ev.lotName, ev.description])).toEqual([
      ["2026-04-15", "Northfield — Lot 5", "Rocío Vega withdrew after 45 days"],
      ["2026-08-20", "Northfield — Lot 6", "Rocío Vega withdrew after 19 days"],
    ]);
    expect(realm.narrative.get(cancellations[0]!.id)).toBe(
      "On April 15, Rocío Vega withdrew the pledge for Lot 5 of Northfield after 45 days; the lot returned to the market and the days it promised went with it.",
    );
    const pledges = realm.events.filter((ev) => ev.kind === "reservation" && ev.propertyId === lot6.propertyId);
    expect(pledges.map((ev) => [ev.date, ev.description])).toEqual([
      ["2026-08-01", "by Rocío Vega · later cancelled"],
      ["2026-08-25", "by Buyer One"],
    ]);
    expect(realm.narrative.get(pledges[0]!.id)).toBe("On August 1, Rocío Vega pledged for Lot 6 of Northfield at $105,000; the pledge was later withdrawn.");
    expect(realm.narrative.get(pledges[1]!.id)).toMatch(/^On August 25, Buyer One pledged for Lot 6 of Northfield at \$110,000 — the closing is expected around October 24(, \d+ provisional days? gained)?\.$/);
    // the cancelled pledge on the available lot is narrated with its own buyer, not the lot's (none)
    const pledge5 = realm.events.find((ev) => ev.kind === "reservation" && ev.propertyId === lot5.propertyId)!;
    expect(realm.narrative.get(pledge5.id)).toBe("On March 1, Rocío Vega pledged for Lot 5 of Northfield at $100,000; the pledge was later withdrawn.");
    // an overdue reservation says how late it is
    const lot3 = realm.lots.find((l) => l.name === "Northfield — Lot 3")!;
    expect(realm.narrative.get(`reservation:${lot3.propertyId}`)).toMatch(/the closing was expected around August 30 and is 12 days late/);
    // a closing references its reservation
    const lot1 = realm.lots.find((l) => l.name === "Northfield — Lot 1")!;
    expect(realm.narrative.get(`closing:${lot1.propertyId}`)).toMatch(/^On February 10, Buyer One claimed Lot 1 of Northfield for \$100,000, 40 days after Buyer's reservation\./);
    // chronological: the cancellation sits between the pledge and the re-reservation
    const order = realm.events.filter((ev) => ev.propertyId === lot6.propertyId).map((ev) => ev.kind);
    expect(order).toEqual(["reservation", "cancellation", "reservation"]);
  });

  it("streaks and trophies: reservation streaks count every pledge, including the cancelled ones", () => {
    const r = realm.reservationStreaks;
    expect(r.months.map((m) => [m.month, m.count])).toEqual([
      ["2026-01", 2],
      ["2026-03", 1],
      ["2026-07", 1],
      ["2026-08", 3],
      ["2026-09", 1],
    ]);
    expect(r.currentMonths).toBe(3);
    expect(r.bestMonths).toBe(3);
    const ids = new Set(realm.trophies.filter((t) => t.earned).map((t) => t.id));
    expect(ids).toContain("pledge_streak_3");
    expect(ids).not.toContain("streak_3");
    expect(realm.trophies.find((t) => t.id === "busy_pledge_week_3")?.detail).toMatch(/^2 in week 2026-W01$|^\d in week/);
  });

  it("never touches the goal: net profit, pace and the oxygen score are closings only", () => {
    expect(realm.goal.netProfitToDate).toBe(100_000);
    expect(realm.goal.closedLotsPerMonth).toBe(0);
    expect(realm.oxygen.totalDaysGained).toBe([...realm.oxygen.perLot.values()].reduce((a, x) => a + x.daysGained, 0));
  });
});

describe("oracle: scheduled closings and the pace lag", () => {
  const params: OracleParams = {
    lotsPerMonth: 5,
    avgSalePrice: 130_000,
    avgLandCost: 50_000,
    avgMonthsToSellNote: 3,
    newFarmEveryMonths: 0,
    avgLotsPerFarm: 12,
    investorTakePct: 25,
    downPaymentPct: 5,
    noteSalePct: 80,
  };
  const goal = computeGoal([], [], ASOF, { goal: 1_200_000 });

  it("lands each scheduled closing in the month of its date (overdue ones in the first), booking its own net profit", () => {
    const r = runOracle(params, goal, 100, ASOF, {
      scheduled: [
        { date: "2026-09-06", lots: 0.5, netProfit: 30_000 }, // overdue → month 1
        { date: "2026-09-21", lots: 0.5, netProfit: 30_000 }, // month 1 (Sep 11 – Oct 11)
        { date: "2026-10-21", lots: 1, netProfit: 60_000 }, // month 2 (Oct 11 – Nov 11)
      ],
      paceLagDays: 45, // the pace starts 2026-10-26: 16 of month 2's 31 days
    });
    expect(r.series[0]).toMatchObject({ scheduledLotsClosed: 1, flatLotsClosed: 0, lotsClosed: 1, cumulativeNetProfit: 60_000 });
    expect(r.series[1]?.scheduledLotsClosed).toBe(1);
    expect(r.series[1]?.flatLotsClosed).toBeCloseTo((5 * 16) / 31, 2);
    expect(r.series[1]?.lotsClosed).toBeCloseTo(1 + (5 * 16) / 31, 2);
    expect(r.series[1]?.cumulativeNetProfit).toBeCloseTo(120_000 + ((5 * 16) / 31) * 60_000, 0);
    expect(r.series[2]).toMatchObject({ scheduledLotsClosed: 0, flatLotsClosed: 5, lotsClosed: 5 });
    // inventory is consumed by both
    expect(r.series[0]?.inventory).toBe(99);
  });

  it("is the original simulation when nothing is scheduled and there is no lag", () => {
    const plain = runOracle(params, goal, 100, ASOF);
    const explicit = runOracle(params, goal, 100, ASOF, { scheduled: [], paceLagDays: 0 });
    expect(explicit.series.map((p) => p.cumulativeNetProfit)).toEqual(plain.series.map((p) => p.cumulativeNetProfit));
    expect(plain.series.every((p) => p.scheduledLotsClosed === 0)).toBe(true);
  });

  it("scheduled closings beyond the inventory are cut like any other", () => {
    const r = runOracle({ ...params, lotsPerMonth: 0 }, goal, 1, ASOF, { scheduled: [{ date: "2026-09-20", lots: 2, netProfit: 100_000 }] });
    expect(r.series[0]).toMatchObject({ scheduledLotsClosed: 1, lotsClosed: 1, cumulativeNetProfit: 50_000, shortfall: true });
  });
});
