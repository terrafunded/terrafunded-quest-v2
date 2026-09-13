import type { InvestorFarmPosition, InvestorSummary } from "./investors";
import { round2, sum } from "./math";

/**
 * CAPITAL COMPOSITION — who put the money in, on what kind of deal, and how concentrated it is.
 *
 * One reading of `computeInvestors` for the Sponsors donut and for any rule that judges sponsor
 * concentration (the Council reads `Realm.capitalComposition.concentration`; the page draws the
 * same object). Nothing here re-derives a dollar: every figure is a sum of positions the
 * investors module already priced.
 */

/** The three ways a farm is funded; anything else Payments may invent lands in `other`. */
export type CapitalKind = "own_capital" | "profit_share" | "fixed_interest" | "other";

export const CAPITAL_KINDS: readonly CapitalKind[] = ["own_capital", "profit_share", "fixed_interest", "other"];

/**
 * Above this share of total deployed capital for one sponsor, the concentration line is flagged.
 * One third: the point past which losing that single sponsor's appetite removes more than a
 * third of the realm's funding base. Read by the Sponsors page and the Council alike.
 */
export const SPONSOR_CONCENTRATION_WARN_PCT = 33.33;

/** One arc of the donut: one sponsor's positions of one kind. A mixed sponsor yields two arcs. */
export interface SponsorCapitalArc {
  /** `${investorId}:${kind}` — stable across renders and horizons. */
  id: string;
  investorId: string;
  name: string;
  kind: CapitalKind;
  capitalDeployed: number;
  capitalReturned: number;
  capitalOutstanding: number;
  /** Percentage of total deployed capital (own + outside), 0–100. */
  share: number;
  farms: InvestorFarmPosition[];
}

export interface CapitalKindSlice {
  kind: CapitalKind;
  capitalDeployed: number;
  /** Percentage of total deployed capital, 0–100. */
  share: number;
  sponsors: number;
}

export interface SponsorShare {
  investorId: string;
  name: string;
  capitalDeployed: number;
  /** Percentage of total deployed capital, 0–100. */
  share: number;
}

export interface SponsorConcentration {
  /** Denominator of every share: own + outside capital deployed on subdivided farms. */
  totalDeployed: number;
  /** Outside sponsors ranked by capital deployed, descending. Own capital is not a sponsor. */
  ranked: SponsorShare[];
  largest: SponsorShare | null;
  /** The two largest outside sponsors combined; equals `largest` when there is only one. */
  topTwo: { names: string[]; capitalDeployed: number; share: number } | null;
  thresholdPct: number;
  /** `largest.share > thresholdPct`. */
  flagged: boolean;
}

export interface CapitalComposition {
  totalDeployed: number;
  totalReturned: number;
  totalOutstanding: number;
  ownDeployed: number;
  outsideDeployed: number;
  /** Arcs in descending order of capital deployed; ties broken by name. */
  arcs: SponsorCapitalArc[];
  /** Kind slices with capital, descending; empty kinds are omitted. */
  byKind: CapitalKindSlice[];
  concentration: SponsorConcentration;
}

export function capitalKindOf(dealType: string | null | undefined): CapitalKind {
  return dealType === "own_capital" || dealType === "profit_share" || dealType === "fixed_interest" ? dealType : "other";
}

const pctOf = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);

export function computeCapitalComposition(investors: InvestorSummary[]): CapitalComposition {
  const arcs: SponsorCapitalArc[] = [];
  for (const inv of investors) {
    const byKind = new Map<CapitalKind, InvestorFarmPosition[]>();
    for (const f of inv.farms) {
      const kind = capitalKindOf(f.dealType);
      byKind.set(kind, [...(byKind.get(kind) ?? []), f]);
    }
    for (const [kind, farms] of byKind) {
      const deployed = round2(sum(farms.map((f) => f.capitalDeployed)));
      if (deployed <= 0) continue;
      arcs.push({
        id: `${inv.investorId}:${kind}`,
        investorId: inv.investorId,
        name: inv.name,
        kind,
        capitalDeployed: deployed,
        capitalReturned: round2(sum(farms.map((f) => f.capitalReturned))),
        capitalOutstanding: round2(sum(farms.map((f) => f.capitalOutstanding))),
        share: 0,
        farms,
      });
    }
  }
  const totalDeployed = round2(sum(arcs.map((a) => a.capitalDeployed)));
  for (const a of arcs) a.share = pctOf(a.capitalDeployed, totalDeployed);
  arcs.sort((a, b) => b.capitalDeployed - a.capitalDeployed || a.name.localeCompare(b.name));

  const byKind: CapitalKindSlice[] = CAPITAL_KINDS.map((kind) => {
    const of = arcs.filter((a) => a.kind === kind);
    const deployed = round2(sum(of.map((a) => a.capitalDeployed)));
    return { kind, capitalDeployed: deployed, share: pctOf(deployed, totalDeployed), sponsors: new Set(of.map((a) => a.investorId)).size };
  })
    .filter((s) => s.capitalDeployed > 0)
    .sort((a, b) => b.capitalDeployed - a.capitalDeployed);

  const ownDeployed = round2(sum(arcs.filter((a) => a.kind === "own_capital").map((a) => a.capitalDeployed)));

  const perSponsor = new Map<string, SponsorShare>();
  for (const a of arcs) {
    if (a.kind === "own_capital") continue;
    const cur = perSponsor.get(a.investorId) ?? { investorId: a.investorId, name: a.name, capitalDeployed: 0, share: 0 };
    cur.capitalDeployed = round2(cur.capitalDeployed + a.capitalDeployed);
    perSponsor.set(a.investorId, cur);
  }
  const ranked = [...perSponsor.values()]
    .map((s) => ({ ...s, share: pctOf(s.capitalDeployed, totalDeployed) }))
    .sort((a, b) => b.capitalDeployed - a.capitalDeployed || a.name.localeCompare(b.name));
  const largest = ranked[0] ?? null;
  const two = ranked.slice(0, 2);
  const topTwoDeployed = round2(sum(two.map((s) => s.capitalDeployed)));
  const topTwo = two.length > 0 ? { names: two.map((s) => s.name), capitalDeployed: topTwoDeployed, share: pctOf(topTwoDeployed, totalDeployed) } : null;

  return {
    totalDeployed,
    totalReturned: round2(sum(arcs.map((a) => a.capitalReturned))),
    totalOutstanding: round2(sum(arcs.map((a) => a.capitalOutstanding))),
    ownDeployed,
    outsideDeployed: round2(totalDeployed - ownDeployed),
    arcs,
    byKind,
    concentration: {
      totalDeployed,
      ranked,
      largest,
      topTwo,
      thresholdPct: SPONSOR_CONCENTRATION_WARN_PCT,
      flagged: largest !== null && largest.share > SPONSOR_CONCENTRATION_WARN_PCT,
    },
  };
}
