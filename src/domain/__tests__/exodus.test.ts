/**
 * The Exodus engine on a synthetic realm: the rules the brief fixes, each on a case built by hand.
 *
 * Three farms, one per deal type, each with a few closed lots carrying active notes:
 *  - Own (own_capital): OWN-L01..03 at $100,000 of UPB — free, deliverable at once; OWN-L04 sold at $90,000.
 *  - Fixed (Kevin Concua, 20 % fixed interest, $300,000 on 10 lots): FIX-L01 and FIX-L02 at $100,000,
 *    FIX-L03 at $150,000, every lot credited with a $10,000 down payment — deliverable after a partial release.
 *  - Townson (profit share 50 %): TWN-L01 and TWN-L02 at $100,000 — never deliverable.
 * The as-of date is 2026-09-11 and the deadline 2027-12-31 (16 months).
 */
import { describe, expect, it } from "vitest";
import { buildRealm } from "../realm";
import {
  amortizationPayment,
  compareAllocationOptions,
  computeNoteInventory,
  deriveExodusDefaults,
  lotClaimAt,
  prepareExodus,
  projectUpb,
  runExodus,
  upbSchedule,
  type ExodusScenario,
} from "../exodus";
import { outstandingAt } from "../lotLedger";
import { round2 } from "../math";
import { toIsoDate } from "../dates";
import type { FarmAcquisitionRow, FileCaseRow, NoteRow, NoteSaleRow, PropertyRow } from "../types";
import { ASOF, cost, farm, fileCase, investor, note, noteSale, property, snapshot } from "./builders";

const DEADLINE = "2027-12-31";

function buildSyntheticRealm() {
  const kevin = investor({ name: "Kevin Concua" });
  const townson = investor({ name: "Townson Family" });
  const own = farm({ farm_name: "Own", total_lots: 10, investor_id: null, investor_capital: 300_000, deal_type: "own_capital", annual_interest_rate: 0, funding_date: "2026-01-01", closing_date: "2026-01-01" });
  const fixed = farm({ farm_name: "Fixed", total_lots: 10, investor_id: kevin.id, investor_capital: 300_000, deal_type: "fixed_interest", annual_interest_rate: 20, funding_date: "2026-01-01", closing_date: "2026-01-01" });
  const twn = farm({ farm_name: "Townson", total_lots: 10, investor_id: townson.id, investor_capital: 300_000, deal_type: "profit_share", annual_interest_rate: 0, profit_share_pct: 50, funding_date: "2026-03-01", closing_date: "2026-03-01" });

  const properties: PropertyRow[] = [];
  const fileCases: FileCaseRow[] = [];
  const notes: NoteRow[] = [];
  const noteSales: NoteSaleRow[] = [];
  const propertyCosts = [cost(own.id, { amount: 300_000, cost_date: "2026-01-01" }), cost(fixed.id, { amount: 300_000, cost_date: "2026-01-01" }), cost(twn.id, { amount: 300_000, cost_date: "2026-03-01" })];

  const closed = (f: FarmAcquisitionRow, prefix: string, i: number, close: string, over: Partial<NoteRow> = {}) => {
    const p = property(f.id, i, { name: `${f.farm_name} — Lot ${i}` });
    properties.push(p);
    fileCases.push(fileCase(p.id, { status: "completed", reservation_date: "2026-04-01", closing_date: close, project_name: f.farm_name }));
    const n = note(p.id, {
      note_code: `${prefix}-L0${i}`,
      start_date: close,
      current_upb: 100_000,
      monthly_payment: 1_000,
      interest_rate: 0.1,
      term_months: 120,
      down_payment: 10_000,
      financed_amount: 100_000,
      original_amount: 110_000,
      ...over,
    });
    notes.push(n);
    return n;
  };
  const unsold = (f: FarmAcquisitionRow, from: number) => {
    for (let i = from; i <= 10; i++) properties.push(property(f.id, i, { name: `${f.farm_name} — Lot ${i}` }));
  };

  closed(own, "OWN", 1, "2026-05-15");
  closed(own, "OWN", 2, "2026-06-15");
  closed(own, "OWN", 3, "2026-07-15");
  const soldNote = closed(own, "OWN", 4, "2026-08-15", { is_sold: true });
  noteSales.push(noteSale(soldNote.id, { sale_date: "2026-09-01", sale_price: 90_000 }));
  unsold(own, 5);
  closed(fixed, "FIX", 1, "2026-06-01");
  closed(fixed, "FIX", 2, "2026-07-01");
  closed(fixed, "FIX", 3, "2026-08-01", { current_upb: 150_000, financed_amount: 150_000, original_amount: 160_000 });
  unsold(fixed, 4);
  closed(twn, "TWN", 1, "2026-07-20");
  closed(twn, "TWN", 2, "2026-08-25");
  unsold(twn, 3);

  const realm = buildRealm(snapshot({ farmAcquisitions: [own, fixed, twn], properties, fileCases, notes, noteSales, propertyCosts, investors: [kevin, townson] }), ASOF);
  return { realm, warPlan: realm.warPlanDefaults.inputs };
}

const { realm, warPlan } = buildSyntheticRealm();
const defaults = deriveExodusDefaults(realm, warPlan);
const RATIO = 0.9;
const AMPLE_CASH = 1_000_000;

const labels = (s: ExodusScenario) => s.deliveries.map((d) => d.label);
const monthEnd = (t: number) => toIsoDate(prepareExodus({ lpCapital: 1, deadline: DEADLINE, warPlan, excludedNoteCodes: [] }, realm).grid.months[t - 1]!.end);

describe("Exodus: the real values a synthetic realm gives the inputs", () => {
  it("prefills the LP capital, the deadline, the real note-sale ratio and the default exclusion", () => {
    expect(defaults.inputs).toMatchObject({ lpCapital: 10_000_000, notesPct: 30, deadline: "2027-12-31", noteSaleRatio: 0.9, excludedNoteCodes: ["EAS-L04"], startingCash: 0 });
    // one sale at $90,000 on a $100,000 financed amount, no discount recorded
    expect(defaults.real.noteSaleRatio).toMatchObject({ used: 0.9, basis: "combined", combined: 0.9, financedBased: 0.9, discountBased: null, literal: null, sales: 1, salesWithDiscount: 0, salesWithFinanced: 1 });
    // projected notes get the realm's means: 9 farm notes at 10 % over 120 months
    expect(defaults.real.futureNote).toMatchObject({ annualRate: 0.1, termMonths: 120, notes: 9 });
  });
});

describe("Exodus: note eligibility", () => {
  const inventory = computeNoteInventory(realm.snapshot, ASOF, ["own-l01"]);
  const status = (code: string) => inventory.rows.find((r) => r.code === code)!;

  it("classifies today's notes by their farm's deal type: own capital is free, fixed interest needs a partial release, profit share never, and an excluded code is excluded whatever its farm", () => {
    expect(["OWN-L02", "OWN-L03"].map((c) => status(c).status)).toEqual(["free", "free"]);
    expect(["FIX-L01", "FIX-L02", "FIX-L03"].map((c) => status(c).status)).toEqual(["needs_release", "needs_release", "needs_release"]);
    expect(["TWN-L01", "TWN-L02"].map((c) => status(c).status)).toEqual(["profit_share", "profit_share"]);
    expect(status("OWN-L01").status).toBe("excluded");
    // the sold note is out of the inventory
    expect(inventory.rows.some((r) => r.code === "OWN-L04")).toBe(false);
    expect(inventory.sold).toBe(1);
    // release cost today = the lot's outstanding balance: $30,000 of capital + 20 % over 253 days − the $10,000 down payment
    expect(status("FIX-L01").releaseCostToday).toBe(24_158.9);
    expect(status("FIX-L01").settlementPerDollar).toBe(4.14);
    expect(status("FIX-L03").settlementPerDollar).toBe(6.21);
    expect(status("OWN-L02").releaseCostToday).toBe(0);
    expect(status("TWN-L01").releaseCostToday).toBeNull();
    expect(inventory.free).toEqual({ notes: 2, upb: 200_000, farms: ["Own"] });
    expect(inventory.needsRelease).toEqual({ notes: 3, upb: 350_000, costToday: 72_476.7 });
    expect(inventory.profitShare).toEqual({ notes: 2, upb: 200_000 });
    expect(inventory.excluded).toEqual({ notes: 1, upb: 100_000 });
  });

  it("profit_share notes are never delivered, at any percent — they are sold like today", () => {
    const base = prepareExodus({ lpCapital: 5_000_000, deadline: DEADLINE, warPlan, excludedNoteCodes: [] }, realm);
    for (const notesPct of [0, 10, 30, 45, 60]) {
      const s = runExodus(base, { lpCapital: 5_000_000, notesPct, noteSaleRatio: RATIO, startingCash: AMPLE_CASH });
      expect(s.notesDelivered, `pct ${notesPct}`).toBe(round2((5_000_000 * notesPct) / 100));
      expect(s.deliveries.some((d) => d.label.startsWith("TWN") || d.farmName.startsWith("Townson")), `pct ${notesPct}`).toBe(false);
      // both Townson notes are sold in the first month whatever the percent
      expect(s.rows[0]!.notesSold, `pct ${notesPct}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("excluded note codes are never delivered and never sold; matching is case-insensitive", () => {
    const base = prepareExodus({ lpCapital: 5_000_000, deadline: DEADLINE, warPlan, excludedNoteCodes: ["OWN-L01", "fix-l03"] }, realm);
    expect(base.existing.map((e) => e.row.code)).toEqual(["OWN-L02", "OWN-L03", "FIX-L01", "FIX-L02", "TWN-L01", "TWN-L02"]);
    const open = prepareExodus({ lpCapital: 5_000_000, deadline: DEADLINE, warPlan, excludedNoteCodes: [] }, realm);
    for (const notesPct of [0, 30, 60]) {
      const s = runExodus(base, { lpCapital: 5_000_000, notesPct, noteSaleRatio: RATIO, startingCash: AMPLE_CASH });
      expect(labels(s).some((l) => l === "OWN-L01" || l === "FIX-L03"), `pct ${notesPct}`).toBe(false);
      // without the exclusion both notes are in play: delivered at 60 %, sold at 0 %
      const o = runExodus(open, { lpCapital: 5_000_000, notesPct, noteSaleRatio: RATIO, startingCash: AMPLE_CASH });
      if (notesPct === 60) expect(labels(o)).toEqual(expect.arrayContaining(["OWN-L01", "FIX-L03"]));
      expect(o.notesSold.count - s.notesSold.count, `pct ${notesPct}`).toBeGreaterThanOrEqual(notesPct === 0 ? 2 : 0);
    }
  });
});

describe("Exodus: partial releases", () => {
  const base = prepareExodus({ lpCapital: 5_000_000, deadline: DEADLINE, warPlan, excludedNoteCodes: [] }, realm);

  it("the cost of releasing an unpaid lot grows every month: capital + interest to that day − the credits received", () => {
    const lot = base.existing.find((e) => e.row.code === "FIX-L01")!.ledgerLot!;
    const claims = Array.from({ length: 12 }, (_, i) => lotClaimAt(lot, monthEnd(i + 1)));
    // 2026-09-30: $30,000 + 20 % × 272/365 − $10,000
    expect(round2(claims[0]!)).toBe(24_471.23);
    expect(round2(claims[3]!)).toBe(25_983.56);
    for (let i = 1; i < claims.length; i++) expect(claims[i]!, `month ${i + 1}`).toBeGreaterThan(claims[i - 1]!);
    // with every cost booked before today the claim is the ledger's outstanding balance at that date
    for (let i = 0; i < claims.length; i++) expect(round2(claims[i]!)).toBe(round2(outstandingAt(lot, monthEnd(i + 1))));
    // a released lot costs nothing
    expect(lotClaimAt({ ...lot, released: "2026-09-15" }, monthEnd(1))).toBe(0);
  });

  it("the allocation takes the highest settlement per dollar first and breaks ties by the earliest date", () => {
    // Ample cash, 60 % of $5M: every candidate gets released in the first month, in rank order.
    const s = runExodus(base, { lpCapital: 5_000_000, notesPct: 60, noteSaleRatio: RATIO, startingCash: AMPLE_CASH });
    const first = s.partialReleases.list.filter((r) => r.monthIndex === 1);
    expect(first.map((r) => [r.label, r.ratio])).toEqual([
      ["FIX-L03", 6.13], // $150,000 of UPB for a $24,471 claim
      ["Fixed · Sep 2026", 4.33], // this month's Fixed closings: a new note at face value for a lot with no credits yet
      ["FIX-L01", 4.09], // same UPB and claim as FIX-L02 — started 2026-06-01
      ["FIX-L02", 4.09], // started 2026-07-01
    ]);
    for (let i = 1; i < first.length; i++) expect(first[i]!.ratio).toBeLessThanOrEqual(first[i - 1]!.ratio);
    expect(labels(s).indexOf("FIX-L01")).toBeLessThan(labels(s).indexOf("FIX-L02"));
    // cash farms rank below every release here (3.51 ×) and are bought only once the releases are done
    expect(s.cashFarms.purchases.map((p) => [p.label, p.monthIndex, p.cost, p.ratio])).toEqual([
      ["Farm 1 (own cash instead of Kevin Concua)", 1, 300_000, 3.51],
      ["Farm 2 (own cash instead of Townson Family)", 1, 300_000, 3.51],
    ]);
    expect(s.deliveries.filter((d) => d.via === "cashFarm").every((d) => d.monthIndex >= 6)).toBe(true);
    expect(base.latestViablePurchaseMonth).toBe(8);
  });

  it("the comparator itself: ratio first, then the earliest date, then the label", () => {
    const sorted = [
      { ratio: 2, sortDate: "2026-01-01", label: "b" },
      { ratio: 3, sortDate: "2026-06-01", label: "c" },
      { ratio: 2, sortDate: "2025-12-31", label: "a" },
      { ratio: 2, sortDate: "2025-12-31", label: "0" },
    ].sort(compareAllocationOptions);
    expect(sorted.map((o) => o.label)).toEqual(["c", "0", "a", "b"]);
  });

  it("without cash nothing is released: an indivisible note waits for the full amount while a divisible batch takes what there is", () => {
    const s = runExodus(base, { lpCapital: 5_000_000, notesPct: 30, noteSaleRatio: RATIO, startingCash: 0 });
    const first = s.rows[0]!;
    // Portafolio's month-1 cash barely covers the ads: $1,659 buys 0.07 of a Fixed lot; FIX-L03 ($24,471) waits for October
    expect(first.partialReleaseCost).toBe(1_659.21);
    expect(first.cashPaidToLPs).toBe(0);
    expect(s.partialReleases.list.slice(0, 2).map((r) => [r.label, r.monthIndex, r.units])).toEqual([
      ["Fixed · Sep 2026", 1, 0.07],
      ["FIX-L03", 2, 1],
    ]);
    // the release cost of the same note is higher a month later
    expect(s.partialReleases.list[1]!.cost).toBe(24_980.82);
  });
});

describe("Exodus: delivery arithmetic", () => {
  const base = prepareExodus({ lpCapital: 1_000_000, deadline: DEADLINE, warPlan, excludedNoteCodes: [] }, realm);
  const run = (notesPct: number) => runExodus(base, { lpCapital: 1_000_000, notesPct, noteSaleRatio: RATIO, startingCash: 0 });
  const closings = base.closingsByMonth.reduce((a, b) => a + b, 0);

  it("the last note is delivered as a fraction to hit the target exactly and the undelivered fraction is sold the same month", () => {
    const s = run(25);
    expect(s.noteTarget).toBe(250_000);
    expect(s.notesDelivered).toBe(250_000);
    expect(s.deliveries.map((d) => [d.label, d.units, d.value, d.via])).toEqual([
      ["OWN-L01", 1, 100_000, "existingFree"],
      ["OWN-L02", 1, 100_000, "existingFree"],
      ["OWN-L03", 0.5, 50_000, "existingFree"],
    ]);
    expect(s.package.notes).toBe(2.5);
    expect(s.package.totalUpb).toBe(250_000);
    // month 1 sells the other half of OWN-L03 plus the five notes not deliverable or not reserved
    expect(s.rows[0]!.notesSold).toBe(5.5);
    expect(s.rows[0]!.noteSaleProceeds).toBe(round2(0.5 * 100_000 * RATIO + 2 * 100_000 * RATIO + 150_000 * RATIO + 2 * 100_000 * RATIO));
    expect(s.partialReleases.count).toBe(0);
    expect(s.cashFarms.count).toBe(0);
  });

  it("Option A: once the target is reached every further free note is sold, none is held", () => {
    const s = run(10);
    expect(labels(s)).toEqual(["OWN-L01"]);
    // the other seven notes of today go in month 1
    expect(s.rows[0]!.notesSold).toBe(7);
    expect(s.rows.slice(1).every((r) => r.notesDelivered === 0)).toBe(true);
    // free notes keep landing from the Own farm's unsold lots and are sold, not held: everything not delivered is sold by the deadline
    expect(s.rows.slice(1).some((r) => r.freeNotesAvailable > 0)).toBe(true);
    expect(s.notesSold.count).toBe(round2(base.existing.length - 1 + closings));
  });

  it("at 0 % nothing is delivered and every note is sold", () => {
    const s = run(0);
    expect(s.deliveries).toEqual([]);
    expect(s.notesDelivered).toBe(0);
    expect(s.notesSold.count).toBe(round2(base.existing.length + closings));
    expect(s.cashPaidToLPs).toBe(s.totalReturned);
  });

  it("amortization matches a hand-computed 12-month schedule: $100,000 at 12 % with a $1,500 payment", () => {
    const hand = [100_000, 99_500, 98_995, 98_484.95, 97_969.8, 97_449.5, 96_923.99, 96_393.23, 95_857.16, 95_315.74, 94_768.89, 94_216.58, 93_658.75];
    const schedule = upbSchedule(100_000, 0.12, 1_500, 12);
    expect(schedule).toHaveLength(13);
    schedule.forEach((u, i) => expect(u, `month ${i}`).toBeCloseTo(hand[i]!, 2));
    expect(projectUpb(100_000, 0.12, 1_500, 12)).toBeCloseTo(93_658.75, 2);
    // closed form: P(1+r)^n − M((1+r)^n − 1)/r
    expect(projectUpb(100_000, 0.12, 1_500, 12)).toBeCloseTo(100_000 * 1.01 ** 12 - (1_500 * (1.01 ** 12 - 1)) / 0.01, 6);
    // floored at 0 once paid off
    expect(upbSchedule(1_000, 0.12, 2_000, 3)).toEqual([1_000, 0, 0, 0]);
    // the level payment that amortizes $100,000 at 12 % over 120 months
    expect(round2(amortizationPayment(100_000, 0.12, 120))).toBe(1_434.71);
    expect(amortizationPayment(120_000, 0, 120)).toBe(1_000);
  });
});
