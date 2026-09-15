/**
 * Three readings of the same closings: booked net profit at closing, cash
 * actually in hand after land and sponsor take, and notes still held.
 * Derived from lot fields the realm already computes — no new goal math.
 */

import { isSold, type Lot } from "./lot";
import { round2, sum } from "./math";

export interface LotProfitLayer {
  propertyId: string;
  /** Sale price − land − sponsor take. Null only if the lot has no booked profit. */
  netProfitAtClosing: number;
  /** Down payment + note-sale proceeds − land − sponsor take. */
  netCashRealized: number;
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
  netCashRealized: number;
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

export function lotProfitLayer(lot: Lot): LotProfitLayer | null {
  if (!isSold(lot)) return null;
  const salePrice = lot.salePrice ?? 0;
  const cashAtClosing = lot.dealType === "cash" ? salePrice : (lot.downPayment ?? 0);
  const noteSaleProceeds = lot.noteSalePrice ?? 0;
  return {
    propertyId: lot.propertyId,
    netProfitAtClosing: lot.netProfit ?? 0,
    netCashRealized: round2(lot.cashRealized - lot.landCost - (lot.investorTake ?? 0)),
    notesHeldFace: noteIsHeld(lot) ? (lot.noteFinancedAmount ?? 0) : 0,
    noteSaleProceeds,
    cashAtClosing,
    salePrice,
  };
}

/**
 * @param noteSaleRatio measured sale ÷ financed (oracle `noteSalePct / 100`)
 */
export function computeProfitLayers(lots: Lot[], noteSaleRatio: number): ProfitLayers {
  const layers = lots.map(lotProfitLayer).filter((l): l is LotProfitLayer => l !== null);
  const notesHeldFace = round2(sum(layers.map((l) => l.notesHeldFace)));
  const cashAtClosing = round2(sum(layers.map((l) => l.cashAtClosing)));
  const noteSaleProceeds = round2(sum(layers.map((l) => l.noteSaleProceeds)));
  const salePriceSoldLots = round2(sum(layers.map((l) => l.salePrice)));
  const ratio = Number.isFinite(noteSaleRatio) ? Math.max(0, noteSaleRatio) : 0;
  return {
    netProfitAtClosing: round2(sum(layers.map((l) => l.netProfitAtClosing))),
    netCashRealized: round2(sum(layers.map((l) => l.netCashRealized))),
    notesHeldCount: layers.filter((l) => l.notesHeldFace > 0).length,
    notesHeldFace,
    noteSaleRatio: Math.round(ratio * 10_000) / 10_000,
    notesHeldAtRatio: round2(notesHeldFace * ratio),
    cashAtClosing,
    noteSaleProceeds,
    salePriceSoldLots,
    salePriceResidual: round2(salePriceSoldLots - cashAtClosing - notesHeldFace - noteSaleProceeds),
    lots: layers,
  };
}
