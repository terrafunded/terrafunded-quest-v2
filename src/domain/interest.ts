import type { FarmAcquisitionRow, InvestorDistributionRow } from "./types";
import { daysBetween, parseDate, toIsoDate } from "./dates";
import { round2, sum, toPercent } from "./math";

/**
 * Interest accrual for `fixed_interest` farms.
 *
 * Capital accrues daily at `annual_interest_rate / 365` on the *outstanding*
 * investor capital from `funding_date` (fallback `closing_date`) until principal
 * is returned. Principal returned = Σ `investor_distributions.amount` where
 * `kind = 'capital_return'` for the farm. Each capital return reduces the balance
 * that accrues from that day forward.
 */
export interface InterestLedger {
  farmId: string;
  dealType: string | null;
  principal: number;
  /** Percent, e.g. 20 for 20%. */
  annualRatePct: number;
  /** ISO date accrual starts (funding_date ?? closing_date), or null when unknown. */
  accrualStart: string | null;
  /** ISO date the ledger is evaluated at. */
  asOf: string;
  daysAccruing: number;
  capitalReturned: number;
  outstandingPrincipal: number;
  /** Interest owed so far (never negative). */
  accruedToDate: number;
  /** Non-capital distributions paid to the investor on this farm. */
  paidToDate: number;
  /** Accrued − paid. */
  unpaidInterest: number;
  /** What one more day costs at the current outstanding balance. */
  dailyAccrual: number;
  /** Raw distribution rows for this farm, oldest first — surfaced, never interpreted away. */
  distributions: InvestorDistributionRow[];
}

export interface CapitalReturn {
  date: Date;
  amount: number;
}

export function accrualStartDate(farm: FarmAcquisitionRow): Date | null {
  return parseDate(farm.funding_date) ?? parseDate(farm.closing_date);
}

/**
 * Accrues simple daily interest between `start` and `asOf` on a balance that
 * steps down at each capital return. Exposed for direct unit testing.
 */
export function accrueOnSteppedBalance(
  principal: number,
  annualRatePct: number,
  start: Date,
  asOf: Date,
  capitalReturns: CapitalReturn[],
): { accrued: number; outstanding: number } {
  const dailyRate = annualRatePct / 100 / 365;
  const sorted = [...capitalReturns].sort((a, b) => a.date.getTime() - b.date.getTime());
  let outstanding = principal;
  let cursor = start;
  let accrued = 0;

  for (const ret of sorted) {
    const at = ret.date < start ? start : ret.date;
    if (at > asOf) break;
    accrued += outstanding * dailyRate * Math.max(0, daysBetween(cursor, at));
    outstanding = Math.max(0, outstanding - ret.amount);
    cursor = at;
  }
  if (asOf > cursor) {
    accrued += outstanding * dailyRate * Math.max(0, daysBetween(cursor, asOf));
  }
  return { accrued, outstanding };
}

export function buildInterestLedger(
  farm: FarmAcquisitionRow,
  allDistributions: InvestorDistributionRow[],
  asOf: Date,
): InterestLedger {
  const distributions = allDistributions
    .filter((d) => d.farm_acquisition_id === farm.id)
    .sort((a, b) => (a.distribution_date ?? "").localeCompare(b.distribution_date ?? ""));

  const capitalReturns: CapitalReturn[] = distributions
    .filter((d) => d.kind === "capital_return")
    .map((d) => ({ date: parseDate(d.distribution_date) ?? asOf, amount: d.amount ?? 0 }));
  const capitalReturned = sum(capitalReturns.map((r) => r.amount));
  const paidToDate = sum(distributions.filter((d) => d.kind !== "capital_return").map((d) => d.amount));

  const principal = farm.investor_capital ?? 0;
  const ratePct = farm.deal_type === "fixed_interest" ? toPercent(farm.annual_interest_rate) : 0;
  const start = accrualStartDate(farm);

  let accrued = 0;
  let outstanding = Math.max(0, principal - capitalReturned);
  let daysAccruing = 0;
  if (start && ratePct > 0 && asOf > start) {
    const r = accrueOnSteppedBalance(principal, ratePct, start, asOf, capitalReturns);
    accrued = r.accrued;
    outstanding = r.outstanding;
    daysAccruing = daysBetween(start, asOf);
  }

  const dailyAccrual = ratePct > 0 ? (outstanding * ratePct) / 100 / 365 : 0;

  return {
    farmId: farm.id,
    dealType: farm.deal_type,
    principal,
    annualRatePct: ratePct,
    accrualStart: start ? toIsoDate(start) : null,
    asOf: toIsoDate(asOf),
    daysAccruing,
    capitalReturned: round2(capitalReturned),
    outstandingPrincipal: round2(outstanding),
    accruedToDate: round2(accrued),
    paidToDate: round2(paidToDate),
    unpaidInterest: round2(accrued - paidToDate),
    dailyAccrual: round2(dailyAccrual),
    distributions,
  };
}

/** Projects the accrued figure forward `days` days at the current balance (used by the Oracle). */
export function projectAccrued(ledger: InterestLedger, days: number): number {
  return round2(ledger.accruedToDate + ledger.dailyAccrual * Math.max(0, days));
}
