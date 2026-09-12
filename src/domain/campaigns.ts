import type { FarmEconomics } from "./farm";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import { addDays, daysBetween, parseDate, toIsoDate } from "./dates";
import { mean, round2 } from "./math";

export type CampaignState = "conquered" | "under_siege" | "closing_pending" | "losing_ground";

/**
 * FARM CAMPAIGNS (Phase 2 §4). Each territory fights its own war: sell enough lots to cover the
 * capital that funded it plus the interest that capital has accrued so far.
 */
export interface Campaign {
  farmId: string;
  farmName: string;
  state: CampaignState;
  /** Capital basis + accrued interest (fixed-interest farms) — what the farm must recover. */
  target: number;
  /** Σ salePrice on closed / note_sold lots. */
  recovered: number;
  /** target − recovered, floored at 0. */
  shortfall: number;
  pctCovered: number;
  /** Average sale price on this farm's sold lots, else the realm's average. */
  avgSalePrice: number | null;
  avgSalePriceSource: "farm" | "realm" | "none";
  /** ceil(shortfall ÷ avgSalePrice); 0 when covered. */
  lotsLeftToCover: number | null;
  lotsUnsold: number;
  /** lotsLeftToCover − lotsUnsold when positive: the farm cannot cover itself even if it sells out. */
  lotsShort: number;
  lastClosingDate: string | null;
  daysSinceLastClosing: number | null;
  /** True when interest is accruing today on capital not yet returned. */
  interestAccruing: boolean;
  accruedInterest: number;
  capitalOutstanding: number;
  soldLots: number;
  /** Live reservations on this farm — a farm with any is never "losing ground". */
  reservedLots: number;
  totalLots: number;
  reason: string;
}

export const LOSING_GROUND_DAYS = 60;

export function computeCampaigns(farms: FarmEconomics[], lots: Lot[], asOf: Date, losingGroundDays = LOSING_GROUND_DAYS): Campaign[] {
  const realmAvg = mean(lots.filter(isSold).map((l) => l.salePrice ?? 0).filter((n) => n > 0));
  const asOfIso = toIsoDate(asOf);
  const staleBefore = toIsoDate(addDays(asOf, -losingGroundDays));

  return farms.map((f): Campaign => {
    const sold = f.lots.filter(isSold);
    const accrued = f.dealType === "fixed_interest" ? f.interest.accruedToDate : 0;
    const target = round2(f.capitalDeployed + accrued);
    const recovered = f.revenue;
    const shortfall = round2(Math.max(0, target - recovered));
    const pctCovered = target > 0 ? round2(Math.min(100, (recovered / target) * 100)) : 100;

    const farmAvg = mean(sold.map((l) => l.salePrice ?? 0).filter((n) => n > 0));
    const avgSalePrice = farmAvg ?? realmAvg ?? null;
    const avgSalePriceSource: Campaign["avgSalePriceSource"] = farmAvg !== null ? "farm" : realmAvg !== null ? "realm" : "none";
    const lotsUnsold = f.lots.length - sold.length;
    const lotsLeftToCover = shortfall === 0 ? 0 : avgSalePrice && avgSalePrice > 0 ? Math.ceil(shortfall / avgSalePrice) : null;
    const lotsShort = lotsLeftToCover !== null ? Math.max(0, lotsLeftToCover - lotsUnsold) : 0;

    const lastClosingDate = sold.map((l) => l.closeDate).filter((d): d is string => !!d && d <= asOfIso).sort().at(-1) ?? null;
    const last = parseDate(lastClosingDate);
    const daysSinceLastClosing = last ? daysBetween(last, asOf) : null;

    const funded = parseDate(f.fundingDate) ?? parseDate(f.closingDate);
    const interestAccruing = f.dealType === "fixed_interest" && f.capitalOutstanding > 0 && !!funded && funded <= asOf;
    const reservedLots = f.lots.filter((l) => l.stage === "reserved").length;

    let state: CampaignState;
    let reason: string;
    if (shortfall === 0 || lotsUnsold === 0) {
      state = "conquered";
      reason = shortfall === 0 ? "sales already cover capital and interest" : "every lot is sold";
    } else if (interestAccruing && (lastClosingDate === null || lastClosingDate < staleBefore)) {
      if (reservedLots > 0) {
        // Reservations are waiting to close: the ground is held, not lost.
        state = "closing_pending";
        reason = `${reservedLots} ${reservedLots === 1 ? "reservation" : "reservations"} waiting to close${lastClosingDate === null ? ", no closing yet" : `, none in ${daysSinceLastClosing} days`}`;
      } else {
        state = "losing_ground";
        reason =
          lastClosingDate === null
            ? `interest accruing at ${f.annualRatePct}% with no closing yet`
            : `interest accruing at ${f.annualRatePct}% and no closing in ${daysSinceLastClosing} days`;
      }
    } else {
      state = "under_siege";
      reason = lotsLeftToCover !== null ? `${lotsLeftToCover} more ${lotsLeftToCover === 1 ? "lot" : "lots"} to cover the capital` : "no sale price to measure against";
    }

    return {
      farmId: f.farmId,
      farmName: f.name,
      state,
      target,
      recovered,
      shortfall,
      pctCovered,
      avgSalePrice: avgSalePrice === null ? null : round2(avgSalePrice),
      avgSalePriceSource,
      lotsLeftToCover,
      lotsUnsold,
      lotsShort,
      lastClosingDate,
      daysSinceLastClosing,
      interestAccruing,
      accruedInterest: round2(accrued),
      capitalOutstanding: f.capitalOutstanding,
      soldLots: sold.length,
      reservedLots,
      totalLots: f.totalLots,
      reason,
    };
  });
}
