import type { InvestorDistributionRow, NoteSaleRow } from "./types";
import type { Lot } from "./lot";
import { isSold } from "./lot";
import { monthKey, parseDate } from "./dates";
import { round2 } from "./math";

export interface TreasuryMonth {
  /** "YYYY-MM" */
  month: string;
  downPayments: number;
  /** Note sales on subdivided-farm lots. */
  noteSales: number;
  /** Note sales on notes that are not on a subdivided-farm lot (houses, legacy). Surfaced, not blended. */
  otherNoteSales: number;
  cashIn: number;
  capitalReturns: number;
  profitShares: number;
  cashOut: number;
  net: number;
  cumulativeCashIn: number;
  cumulativeCashOut: number;
  cumulativeNet: number;
}

export interface Treasury {
  months: TreasuryMonth[];
  totalDownPayments: number;
  totalNoteSales: number;
  totalOtherNoteSales: number;
  /** Every note_sales row, farm or not — reconciles to the verified Σ note_sales.sale_price. */
  totalAllNoteSales: number;
  /** Cash realized on closed lots with no closing_date and no note start_date; cannot be bucketed by month. */
  undatedCashIn: number;
  totalCashIn: number;
  totalCashOut: number;
  totalCapitalReturns: number;
  totalProfitShares: number;
  net: number;
}

/**
 * Real cash in (down payments at closing + note sales) vs real cash out to
 * investors (`investor_distributions`), bucketed by month. Monthly buyer
 * collections are out of scope by design.
 */
export function computeTreasury(lots: Lot[], distributions: InvestorDistributionRow[], allNoteSales: NoteSaleRow[] = []): Treasury {
  const buckets = new Map<string, TreasuryMonth>();
  const bucket = (key: string): TreasuryMonth => {
    let b = buckets.get(key);
    if (!b) {
      b = {
        month: key,
        downPayments: 0,
        noteSales: 0,
        otherNoteSales: 0,
        cashIn: 0,
        capitalReturns: 0,
        profitShares: 0,
        cashOut: 0,
        net: 0,
        cumulativeCashIn: 0,
        cumulativeCashOut: 0,
        cumulativeNet: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };

  let undatedCashIn = 0;
  for (const lot of lots) {
    if (!isSold(lot)) continue;
    const closeDate = parseDate(lot.closeDate);
    const cashAtClosing = lot.dealType === "cash" ? lot.salePrice ?? 0 : lot.downPayment ?? 0;
    if (closeDate) bucket(monthKey(closeDate)).downPayments += cashAtClosing;
    else undatedCashIn += cashAtClosing;
    const saleDate = parseDate(lot.noteSaleDate);
    if (saleDate && lot.noteSalePrice) {
      bucket(monthKey(saleDate)).noteSales += lot.noteSalePrice;
    }
  }

  const lotNoteSaleIds = new Set(lots.map((l) => l.noteSaleId).filter((id): id is string => !!id));
  for (const s of allNoteSales) {
    if (lotNoteSaleIds.has(s.id)) continue;
    const date = parseDate(s.sale_date);
    if (!date) continue;
    bucket(monthKey(date)).otherNoteSales += s.sale_price ?? 0;
  }

  for (const d of distributions) {
    const date = parseDate(d.distribution_date);
    if (!date) continue;
    const b = bucket(monthKey(date));
    if (d.kind === "capital_return") b.capitalReturns += d.amount ?? 0;
    else b.profitShares += d.amount ?? 0;
  }

  const months = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
  let cumIn = 0;
  let cumOut = 0;
  for (const m of months) {
    m.downPayments = round2(m.downPayments);
    m.noteSales = round2(m.noteSales);
    m.otherNoteSales = round2(m.otherNoteSales);
    m.capitalReturns = round2(m.capitalReturns);
    m.profitShares = round2(m.profitShares);
    m.cashIn = round2(m.downPayments + m.noteSales + m.otherNoteSales);
    m.cashOut = round2(m.capitalReturns + m.profitShares);
    m.net = round2(m.cashIn - m.cashOut);
    cumIn = round2(cumIn + m.cashIn);
    cumOut = round2(cumOut + m.cashOut);
    m.cumulativeCashIn = cumIn;
    m.cumulativeCashOut = cumOut;
    m.cumulativeNet = round2(cumIn - cumOut);
  }

  const totalDownPayments = round2(months.reduce((s, m) => s + m.downPayments, 0));
  const totalNoteSales = round2(months.reduce((s, m) => s + m.noteSales, 0));
  const totalOtherNoteSales = round2(months.reduce((s, m) => s + m.otherNoteSales, 0));
  const totalCapitalReturns = round2(months.reduce((s, m) => s + m.capitalReturns, 0));
  const totalProfitShares = round2(months.reduce((s, m) => s + m.profitShares, 0));
  const totalCashIn = round2(totalDownPayments + totalNoteSales + totalOtherNoteSales + undatedCashIn);
  const totalCashOut = round2(totalCapitalReturns + totalProfitShares);

  return {
    months,
    totalDownPayments: round2(totalDownPayments + undatedCashIn),
    totalNoteSales,
    totalOtherNoteSales,
    totalAllNoteSales: round2(totalNoteSales + totalOtherNoteSales),
    undatedCashIn: round2(undatedCashIn),
    totalCashIn,
    totalCashOut,
    totalCapitalReturns,
    totalProfitShares,
    net: round2(totalCashIn - totalCashOut),
  };
}
