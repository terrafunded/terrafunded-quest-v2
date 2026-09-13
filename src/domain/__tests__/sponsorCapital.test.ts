/**
 * The capital donut's figures against independent arithmetic on the fixture: the arcs sum to
 * the capital deployed, the concentration figure is recomputed by hand from the raw
 * `farm_acquisitions` rows, and the Council and the page read the very same object.
 */
import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { computeCapitalComposition, SPONSOR_CONCENTRATION_WARN_PCT } from "../sponsorCapital";
import { round2, sum } from "../math";
import { isSubdividedFarm } from "../lot";
import { ASOF } from "./builders";

const fixture = raw as unknown as PaymentsSnapshot;
const realm = buildRealm(fixture, ASOF, { deadline: "2027-12-31" });
const composition = realm.capitalComposition;

/**
 * Independent: capital per investor from the raw rows — subdivided farms only, `investor_capital`
 * when present, else the farm's `property_costs` (the same basis rule the farms module states).
 */
function rawCapitalByInvestor(): Map<string, { name: string; dealTypes: Set<string>; capital: number }> {
  const names = new Map(fixture.investors.map((i) => [i.id, i.name ?? "Unnamed sponsor"]));
  const out = new Map<string, { name: string; dealTypes: Set<string>; capital: number }>();
  for (const f of fixture.farmAcquisitions) {
    if (!f.investor_id || !isSubdividedFarm(f)) continue;
    const basis = f.investor_capital ?? sum(fixture.propertyCosts.filter((c) => c.farm_acquisition_id === f.id).map((c) => c.amount));
    if (basis <= 0) continue;
    const cur = out.get(f.investor_id) ?? { name: names.get(f.investor_id) ?? "Unnamed sponsor", dealTypes: new Set<string>(), capital: 0 };
    cur.capital = round2(cur.capital + basis);
    cur.dealTypes.add(f.deal_type ?? "unknown");
    out.set(f.investor_id, cur);
  }
  return out;
}

describe("computeCapitalComposition on the fixture", () => {
  it("arc values sum to the total capital deployed, which is the investors' own total", () => {
    const arcSum = round2(composition.arcs.reduce((s, a) => s + a.capitalDeployed, 0));
    expect(arcSum).toBe(composition.totalDeployed);
    const investorsTotal = round2(realm.investors.reduce((s, i) => s + i.capitalDeployed, 0));
    expect(composition.totalDeployed).toBe(investorsTotal);
    const rawTotal = round2([...rawCapitalByInvestor().values()].reduce((s, v) => s + v.capital, 0));
    expect(composition.totalDeployed).toBe(rawTotal);
    // Own + outside partition the total; outside is what the hostages strip calls capital.
    expect(round2(composition.ownDeployed + composition.outsideDeployed)).toBe(composition.totalDeployed);
    expect(composition.outsideDeployed).toBe(realm.liberation.totalCapital);
  });

  it("orders arcs descending, one per sponsor and kind, with shares that sum to 100", () => {
    const amounts = composition.arcs.map((a) => a.capitalDeployed);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(new Set(composition.arcs.map((a) => a.id)).size).toBe(composition.arcs.length);
    for (const a of composition.arcs) expect(a.farms.every((f) => (f.dealType ?? "other") === a.kind || a.kind === "other")).toBe(true);
    expect(Math.round(composition.arcs.reduce((s, a) => s + a.share, 0))).toBe(100);
    expect(Math.round(composition.byKind.reduce((s, k) => s + k.share, 0))).toBe(100);
  });

  it("separates own capital from profit share and fixed interest in the kind ring", () => {
    const kinds = composition.byKind.map((k) => k.kind);
    expect(kinds).toContain("own_capital");
    expect(kinds).toContain("profit_share");
    expect(kinds).toContain("fixed_interest");
    const own = composition.byKind.find((k) => k.kind === "own_capital")!;
    expect(own.capitalDeployed).toBe(composition.ownDeployed);
    expect(own.capitalDeployed).toBe(round2(sum(realm.farms.filter((f) => f.dealType === "own_capital").map((f) => f.capitalDeployed))));
  });

  it("concentration: the largest outside sponsor and the top two, over total deployed, recomputed from the raw rows", () => {
    const byInvestor = [...rawCapitalByInvestor().entries()]
      .filter(([, v]) => !v.dealTypes.has("own_capital"))
      .sort((a, b) => b[1].capital - a[1].capital);
    const total = composition.totalDeployed;
    const [largestId, largest] = byInvestor[0]!;
    const second = byInvestor[1]![1];
    const c = composition.concentration;
    expect(c.totalDeployed).toBe(total);
    expect(c.largest?.investorId).toBe(largestId);
    expect(c.largest?.name).toBe(largest.name);
    expect(c.largest?.share).toBe(round2((largest.capital / total) * 100));
    expect(c.topTwo?.names).toEqual([largest.name, second.name]);
    expect(c.topTwo?.share).toBe(round2(((largest.capital + second.capital) / total) * 100));
    expect(c.thresholdPct).toBe(SPONSOR_CONCENTRATION_WARN_PCT);
    expect(c.flagged).toBe(c.largest!.share > SPONSOR_CONCENTRATION_WARN_PCT);
    // Own capital is not a sponsor: it never ranks.
    expect(c.ranked.some((s) => s.name === "Portafolio Diversificado")).toBe(false);
  });

  it("the Council and the page read one object: the realm's composition is computeCapitalComposition(realm.investors)", () => {
    expect(composition).toEqual(computeCapitalComposition(realm.investors));
  });

  it("a realm with no sponsor capital renders empty, not NaN", () => {
    const empty = computeCapitalComposition([]);
    expect(empty.totalDeployed).toBe(0);
    expect(empty.arcs).toEqual([]);
    expect(empty.byKind).toEqual([]);
    expect(empty.concentration.largest).toBeNull();
    expect(empty.concentration.topTwo).toBeNull();
    expect(empty.concentration.flagged).toBe(false);
    expect(JSON.stringify(empty)).not.toMatch(/NaN|Infinity/);
  });
});
