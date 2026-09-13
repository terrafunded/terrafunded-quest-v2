import type { InvestorDistributionRow } from "./types";
import type { FarmEconomics } from "./farm";
import type { InvestorSummary } from "./investors";
import { round2 } from "./math";
import { daysBetween, parseDate } from "./dates";

/**
 * INVESTOR LIBERATION (Phase 2 §3). Every sponsor position (one investor on one farm, funded
 * with money that is owed back) is a hostage of the realm. `capital_return` distributions fill
 * the bar; at 100 % the position is freed. A sponsor is free when every position is freed.
 * Own-capital farms are not hostages: nobody is owed.
 */
export interface Hostage {
  investorId: string;
  investorName: string;
  farmId: string;
  farmName: string;
  dealType: string | null;
  capital: number;
  capitalReturned: number;
  /** 0–100, capped. */
  pctReturned: number;
  freed: boolean;
  /** Date of the capital_return distribution that reached 100 %. */
  freedAt: string | null;
  /** How many days the capital was held before being fully returned (fundingDate → freedAt). */
  daysHeld: number | null;
  capitalOutstanding: number;
  /** Non-capital distributions paid on this farm (interest or profit share). */
  paidOnTop: number;
}

export interface SponsorLiberation {
  investorId: string;
  name: string;
  dealType: string;
  hostages: Hostage[];
  capital: number;
  capitalReturned: number;
  pctReturned: number;
  freed: boolean;
  freedAt: string | null;
}

export interface Liberation {
  hostages: Hostage[];
  sponsors: SponsorLiberation[];
  freedHostages: Hostage[];
  captiveHostages: Hostage[];
  freedSponsors: SponsorLiberation[];
  totalCapital: number;
  totalReturned: number;
  pctReturned: number;
  /** Chronological list of liberation moments (one per freed hostage). */
  moments: { id: string; date: string; hostage: Hostage }[];
}

const pctOf = (part: number, whole: number) => (whole <= 0 ? 0 : round2(Math.min(100, (part / whole) * 100)));

/** Date on which cumulative capital_return reached the farm's capital, or null. */
export function liberationDate(capital: number, farmDistributions: InvestorDistributionRow[]): string | null {
  if (capital <= 0) return null;
  const returns = farmDistributions
    .filter((d) => d.kind === "capital_return" && d.distribution_date)
    .sort((a, b) => (a.distribution_date as string).localeCompare(b.distribution_date as string));
  let cum = 0;
  for (const d of returns) {
    cum += d.amount ?? 0;
    // tolerate cent-level rounding in the ledger
    if (cum >= capital - 0.01) return d.distribution_date;
  }
  return null;
}

export function computeLiberation(farms: FarmEconomics[], investors: InvestorSummary[], distributions: InvestorDistributionRow[]): Liberation {
  const hostages: Hostage[] = [];

  for (const f of farms) {
    if (f.dealType === "own_capital" || !f.investorId || f.capitalDeployed <= 0 || f.capitalBasisSource !== "investor_capital") continue;
    const farmDists = distributions.filter((d) => d.farm_acquisition_id === f.farmId);
    const returned = f.capitalReturned;
    const freed = returned >= f.capitalDeployed - 0.01;
    const freedAt = freed ? liberationDate(f.capitalDeployed, farmDists) : null;
    const funded = f.fundingDate ?? f.closingDate;
    const fundedDate = parseDate(funded);
    const freedDate = parseDate(freedAt);
    const daysHeld = fundedDate && freedDate ? daysBetween(fundedDate, freedDate) : null;
    hostages.push({
      investorId: f.investorId,
      investorName: f.investorName ?? "Unnamed sponsor",
      farmId: f.farmId,
      farmName: f.name,
      dealType: f.dealType,
      capital: f.capitalDeployed,
      capitalReturned: round2(returned),
      pctReturned: pctOf(returned, f.capitalDeployed),
      freed,
      freedAt,
      daysHeld,
      capitalOutstanding: f.capitalOutstanding,
      paidOnTop: round2(farmDists.filter((d) => d.kind !== "capital_return").reduce((s, d) => s + (d.amount ?? 0), 0)),
    });
  }

  const sponsors: SponsorLiberation[] = investors
    .map((inv) => {
      const mine = hostages.filter((h) => h.investorId === inv.investorId);
      if (mine.length === 0) return null;
      const capital = round2(mine.reduce((s, h) => s + h.capital, 0));
      const returned = round2(mine.reduce((s, h) => s + h.capitalReturned, 0));
      const freed = mine.every((h) => h.freed);
      return {
        investorId: inv.investorId,
        name: inv.name,
        dealType: inv.dealType,
        hostages: mine,
        capital,
        capitalReturned: returned,
        pctReturned: pctOf(returned, capital),
        freed,
        freedAt: freed ? mine.map((h) => h.freedAt ?? "").sort().at(-1) || null : null,
      };
    })
    .filter((s): s is SponsorLiberation => s !== null)
    .sort((a, b) => b.pctReturned - a.pctReturned || b.capital - a.capital);

  const totalCapital = round2(hostages.reduce((s, h) => s + h.capital, 0));
  const totalReturned = round2(hostages.reduce((s, h) => s + h.capitalReturned, 0));
  const freedHostages = hostages.filter((h) => h.freed);

  return {
    hostages,
    sponsors,
    freedHostages,
    captiveHostages: hostages.filter((h) => !h.freed).sort((a, b) => b.pctReturned - a.pctReturned),
    freedSponsors: sponsors.filter((s) => s.freed),
    totalCapital,
    totalReturned,
    pctReturned: pctOf(totalReturned, totalCapital),
    moments: freedHostages
      .filter((h) => h.freedAt)
      .map((h) => ({ id: `liberation:${h.farmId}`, date: h.freedAt as string, hostage: h }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
