/**
 * Booked net profit at closing, the cost of turning notes into cash at the
 * measured sale ratio, and notes still held at face. Derived from lot fields
 * the realm already computes — no new goal math.
 */

import { isSold, type Lot } from "./lot";
import { round2, sum } from "./math";

export interface LotProfitLayer {
  propertyId: string;
  /** Sale price − land − sponsor take. */
  netProfitAtClosing: number;
  /** Financed − sale price, if this lot's note was sold. Else 0. */
  liquidityCostRealized: number;
  /** Financed × (1 − measured ratio), if this lot's note is still held. Else 0. */
  liquidityCostUnrealized: number;
  /** Financed balance still on the books. Zero once the note is sold or the deal was cash. */
  notesHeldFace: number;
  /** Note-sale proceeds received. Zero while the note is held. */
  noteSaleProceeds: number;
  /** Cash at closing: full price on a cash deal, down payment on a financed deal. */
  cashAtClosing: number;
  salePrice: number;
}

export interface ProfitLayers {
  netProfitAtClosing: number;
  /** Σ (financed − sale price) over lots whose note was sold. */
  liquidityCostRealized: number;
  notesSoldCount: number;
  /** Σ financed × (1 − measured ratio) over lots whose note is still held. */
  liquidityCostUnrealized: number;
  liquidityCostTotal: number;
  /** Total liquidity cost ÷ net profit at closing, as a percent (0–100). Null if profit ≤ 0. */
  liquidityCostSharePct: number | null;
  notesHeldCount: number;
  notesHeldFace: number;
  /** Measured note-sale price ÷ financed balance (0–1). */
  noteSaleRatio: number;
  notesHeldAtRatio: number;
  cashAtClosing: number;
  noteSaleProceeds: number;
  salePriceSoldLots: number;
  /**
   * salePrice − (cash at closing + notes held + notes sold).
   * Almost entirely the discount on notes already sold.
   */
  salePriceResidual: number;
  lots: LotProfitLayer[];
}

export function noteIsHeld(lot: Lot): boolean {
  return lot.stage === "closed" && lot.dealType === "financed" && !lot.noteIsSold && !lot.noteSaleId;
}

export function noteIsSoldLot(lot: Lot): boolean {
  return Boolean(lot.noteIsSold || lot.noteSaleId);
}

export function lotLiquidityCostRealized(lot: Lot): number {
  if (!noteIsSoldLot(lot)) return 0;
  return round2((lot.noteFinancedAmount ?? 0) - (lot.noteSalePrice ?? 0));
}

function snappedNoteSaleRatio(noteSaleRatio: number): number {
  const ratio = Number.isFinite(noteSaleRatio) ? Math.max(0, noteSaleRatio) : 0;
  return Math.round(ratio * 10_000) / 10_000;
}

export function lotProfitLayer(lot: Lot, noteSaleRatio = 0): LotProfitLayer | null {
  if (!isSold(lot)) return null;
  const salePrice = lot.salePrice ?? 0;
  const cashAtClosing = lot.dealType === "cash" ? salePrice : (lot.downPayment ?? 0);
  const noteSaleProceeds = lot.noteSalePrice ?? 0;
  const financed = lot.noteFinancedAmount ?? 0;
  const ratio = snappedNoteSaleRatio(noteSaleRatio);
  return {
    propertyId: lot.propertyId,
    netProfitAtClosing: lot.netProfit ?? 0,
    liquidityCostRealized: lotLiquidityCostRealized(lot),
    liquidityCostUnrealized: noteIsHeld(lot) ? round2(financed * (1 - ratio)) : 0,
    notesHeldFace: noteIsHeld(lot) ? financed : 0,
    noteSaleProceeds,
    cashAtClosing,
    salePrice,
  };
}

/**
 * @param noteSaleRatio measured sale ÷ financed (oracle `noteSalePct / 100`)
 */
export function computeProfitLayers(lots: Lot[], noteSaleRatio: number): ProfitLayers {
  const ratio = snappedNoteSaleRatio(noteSaleRatio);
  const layers = lots.map((l) => lotProfitLayer(l, ratio)).filter((l): l is LotProfitLayer => l !== null);
  const notesHeldFace = round2(sum(layers.map((l) => l.notesHeldFace)));
  const cashAtClosing = round2(sum(layers.map((l) => l.cashAtClosing)));
  const noteSaleProceeds = round2(sum(layers.map((l) => l.noteSaleProceeds)));
  const salePriceSoldLots = round2(sum(layers.map((l) => l.salePrice)));
  const netProfitAtClosing = round2(sum(layers.map((l) => l.netProfitAtClosing)));
  const liquidityCostRealized = round2(sum(layers.map((l) => l.liquidityCostRealized)));
  const liquidityCostUnrealized = round2(sum(layers.map((l) => l.liquidityCostUnrealized)));
  const liquidityCostTotal = round2(liquidityCostRealized + liquidityCostUnrealized);
  return {
    netProfitAtClosing,
    liquidityCostRealized,
    notesSoldCount: lots.filter((l) => isSold(l) && noteIsSoldLot(l)).length,
    liquidityCostUnrealized,
    liquidityCostTotal,
    liquidityCostSharePct: netProfitAtClosing > 0 ? round2((liquidityCostTotal / netProfitAtClosing) * 100) : null,
    notesHeldCount: layers.filter((l) => l.notesHeldFace > 0).length,
    notesHeldFace,
    noteSaleRatio: ratio,
    notesHeldAtRatio: round2(notesHeldFace * ratio),
    cashAtClosing,
    noteSaleProceeds,
    salePriceSoldLots,
    salePriceResidual: round2(salePriceSoldLots - cashAtClosing - notesHeldFace - noteSaleProceeds),
    lots: layers,
  };
}
