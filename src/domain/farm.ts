import type { FarmAcquisitionRow, InvestorRow, PropertyCostRow } from "./types";
import type { InterestLedger } from "./interest";
import type { Lot, LotStage } from "./lot";
import { farmCapitalBasis, isSold, isSubdividedFarm } from "./lot";
import { monthsBetween, parseDate } from "./dates";
import { groupBy, indexBy, round2, sum } from "./math";

/**
 * Capital is drawn today only when money has already left: a funding_date on or
 * before `asOf`, or — if Payments never wrote funding_date — a closing_date on or
 * before `asOf`. A future closing with no funding_date is committed, not outstanding.
 */
export function isCapitalDrawn(
  farm: { funding_date?: string | null; closing_date?: string | null; fundingDate?: string | null; closingDate?: string | null },
  asOf: Date,
): boolean {
  const funding = parseDate(farm.funding_date ?? farm.fundingDate ?? null);
  if (funding) return funding <= asOf;
  const closing = parseDate(farm.closing_date ?? farm.closingDate ?? null);
  return closing !== null && closing <= asOf;
}

export interface StageCounts {
  available: number;
  reserved: number;
  closed: number;
  note_sold: number;
}

export interface FarmEconomics {
  farmId: string;
  name: string;
  county: string | null;
  dealType: string | null;
  investorId: string | null;
  investorName: string | null;
  annualRatePct: number;
  profitSharePct: number | null;
  fundingDate: string | null;
  closingDate: string | null;
  totalLots: number;
  /** Actual `properties` rows found for this farm (should equal totalLots). */
  lotRows: number;
  totalAcres: number | null;
  capitalDeployed: number;
  capitalBasisSource: "investor_capital" | "property_costs" | "none";
  purchaseCosts: number;
  landCostPerLot: number;
  stages: StageCounts;
  soldLots: number;
  pctClosed: number;
  /** Σ salePrice on closed + note_sold lots. */
  revenue: number;
  /** Σ salePrice on reserved lots. */
  pipelineRevenue: number;
  grossProfit: number;
  /** Investor take attributable to sold lots (profit share of realized gross, or interest share of sold lots). */
  investorTake: number;
  netProfit: number;
  netProfitInPipeline: number;
  cashRealized: number;
  capitalReturned: number;
  /** Investor capital still out *today* — zero when the farm is not yet funded. */
  capitalOutstanding: number;
  /** Investor capital signed but not drawn (no funding_date, closing still in the future). */
  capitalCommittedUnfunded: number;
  /** True when capital has already been drawn as of `asOf`. */
  funded: boolean;
  monthsSinceFunding: number | null;
  interest: InterestLedger;
  lots: Lot[];
}

export function countStages(lots: Pick<Lot, "stage">[]): StageCounts {
  const c: StageCounts = { available: 0, reserved: 0, closed: 0, note_sold: 0 };
  for (const l of lots) c[l.stage as LotStage] += 1;
  return c;
}

export function computeFarms(
  farms: FarmAcquisitionRow[],
  lots: Lot[],
  propertyCosts: PropertyCostRow[],
  investors: InvestorRow[],
  interestByFarm: Map<string, InterestLedger>,
  asOf: Date,
): FarmEconomics[] {
  const lotsByFarm = groupBy(lots, (l) => l.farmId);
  const investorById = indexBy(investors, (i) => i.id);
  const out: FarmEconomics[] = [];

  for (const farm of farms) {
    if (!isSubdividedFarm(farm)) continue;
    const interest = interestByFarm.get(farm.id);
    if (!interest) continue;
    const farmLots = lotsByFarm.get(farm.id) ?? [];
    const sold = farmLots.filter(isSold);
    const reserved = farmLots.filter((l) => l.stage === "reserved");
    const { basis, source } = farmCapitalBasis(farm, propertyCosts);
    const stages = countStages(farmLots);
    const totalLots = farm.total_lots ?? farmLots.length;
    const funding = parseDate(farm.funding_date) ?? parseDate(farm.closing_date);
    const drawn = isCapitalDrawn(farm, asOf);
    const committed = round2(Math.max(0, (farm.investor_capital ?? 0) - interest.capitalReturned));

    out.push({
      farmId: farm.id,
      name: farm.farm_name ?? "Unnamed farm",
      county: farm.county,
      dealType: farm.deal_type,
      investorId: farm.investor_id,
      investorName: farm.investor_id ? investorById.get(farm.investor_id)?.name ?? null : null,
      annualRatePct: interest.annualRatePct,
      profitSharePct: farm.profit_share_pct,
      fundingDate: farm.funding_date,
      closingDate: farm.closing_date,
      totalLots,
      lotRows: farmLots.length,
      totalAcres: farm.total_acres,
      capitalDeployed: round2(basis),
      capitalBasisSource: source,
      purchaseCosts: round2(sum(propertyCosts.filter((c) => c.farm_acquisition_id === farm.id).map((c) => c.amount))),
      landCostPerLot: round2(totalLots > 0 ? basis / totalLots : 0),
      stages,
      soldLots: sold.length,
      pctClosed: totalLots > 0 ? round2((sold.length / totalLots) * 100) : 0,
      revenue: round2(sum(sold.map((l) => l.salePrice))),
      pipelineRevenue: round2(sum(reserved.map((l) => l.salePrice))),
      grossProfit: round2(sum(sold.map((l) => l.grossProfit))),
      investorTake: round2(sum(sold.map((l) => l.investorTake))),
      netProfit: round2(sum(sold.map((l) => l.netProfit))),
      netProfitInPipeline: round2(sum(reserved.map((l) => (l.grossProfit ?? 0) - (l.investorTake ?? 0)))),
      cashRealized: round2(sum(farmLots.map((l) => l.cashRealized))),
      capitalReturned: interest.capitalReturned,
      capitalOutstanding: drawn ? committed : 0,
      capitalCommittedUnfunded: drawn ? 0 : committed,
      funded: drawn,
      monthsSinceFunding: funding && funding <= asOf ? round2(monthsBetween(funding, asOf)) : null,
      interest,
      lots: farmLots,
    });
  }

  return out.sort((a, b) => (a.fundingDate ?? a.closingDate ?? "9999").localeCompare(b.fundingDate ?? b.closingDate ?? "9999"));
}
