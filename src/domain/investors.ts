import type { InvestorDistributionRow, InvestorRow } from "./types";
import type { FarmEconomics } from "./farm";
import { groupBy, round2, sum } from "./math";

export interface InvestorFarmPosition {
  farmId: string;
  farmName: string;
  dealType: string | null;
  capitalDeployed: number;
  annualRatePct: number;
  profitSharePct: number | null;
  fundingDate: string | null;
  interestAccrued: number;
  interestPaid: number;
  profitSharePaid: number;
  capitalReturned: number;
  capitalOutstanding: number;
  lotsSold: number;
  totalLots: number;
  investorTakeEarned: number;
}

export interface InvestorSummary {
  investorId: string;
  name: string;
  contact: string | null;
  /** "profit_share" | "fixed_interest" | "own_capital" | "mixed" | "none" */
  dealType: string;
  farms: InvestorFarmPosition[];
  capitalDeployed: number;
  capitalReturned: number;
  capitalOutstanding: number;
  interestAccrued: number;
  interestPaid: number;
  profitShareEarned: number;
  profitSharePaid: number;
  totalPaidOut: number;
  distributions: InvestorDistributionRow[];
}

export function computeInvestors(
  investors: InvestorRow[],
  farms: FarmEconomics[],
  distributions: InvestorDistributionRow[],
): InvestorSummary[] {
  const farmsByInvestor = groupBy(farms, (f) => f.investorId);
  const distByInvestor = groupBy(distributions, (d) => d.investor_id);

  return investors
    .map((inv): InvestorSummary => {
      const positions = (farmsByInvestor.get(inv.id) ?? []).map((f): InvestorFarmPosition => {
        const nonCapital = sum(f.interest.distributions.filter((d) => d.kind !== "capital_return").map((d) => d.amount));
        return {
          farmId: f.farmId,
          farmName: f.name,
          dealType: f.dealType,
          capitalDeployed: f.capitalDeployed,
          annualRatePct: f.annualRatePct,
          profitSharePct: f.profitSharePct,
          fundingDate: f.fundingDate,
          interestAccrued: f.dealType === "fixed_interest" ? f.interest.accruedToDate : 0,
          interestPaid: f.dealType === "fixed_interest" ? round2(nonCapital) : 0,
          profitSharePaid: f.dealType === "profit_share" ? round2(nonCapital) : 0,
          capitalReturned: f.capitalReturned,
          capitalOutstanding: f.capitalOutstanding,
          lotsSold: f.soldLots,
          totalLots: f.totalLots,
          investorTakeEarned: f.investorTake,
        };
      });
      const kinds = new Set(positions.map((p) => p.dealType ?? "unknown"));
      const dealType = kinds.size === 0 ? "none" : kinds.size === 1 ? [...kinds][0] ?? "none" : "mixed";
      const dists = [...(distByInvestor.get(inv.id) ?? [])].sort((a, b) => (a.distribution_date ?? "").localeCompare(b.distribution_date ?? ""));

      return {
        investorId: inv.id,
        name: inv.name ?? "Unnamed sponsor",
        contact: inv.contact,
        dealType,
        farms: positions,
        capitalDeployed: round2(sum(positions.map((p) => p.capitalDeployed))),
        capitalReturned: round2(sum(positions.map((p) => p.capitalReturned))),
        capitalOutstanding: round2(sum(positions.map((p) => p.capitalOutstanding))),
        interestAccrued: round2(sum(positions.map((p) => p.interestAccrued))),
        interestPaid: round2(sum(positions.map((p) => p.interestPaid))),
        profitShareEarned: round2(sum(positions.filter((p) => p.dealType === "profit_share").map((p) => p.investorTakeEarned))),
        profitSharePaid: round2(sum(positions.map((p) => p.profitSharePaid))),
        totalPaidOut: round2(sum(dists.map((d) => d.amount))),
        distributions: dists,
      };
    })
    .sort((a, b) => b.capitalDeployed - a.capitalDeployed || a.name.localeCompare(b.name));
}
