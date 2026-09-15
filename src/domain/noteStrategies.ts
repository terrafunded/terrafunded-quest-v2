/**
 * Sell / hold / deliver — numeric effect of the three ways to treat held notes.
 * Every dollar comes from computeProfitLayers. Does not invent a collection schedule.
 */

import type { Lot } from "./lot";
import { noteIsHeld, type ProfitLayers } from "./profitLayers";
import { round2 } from "./math";

export type NoteStrategyId = "sell" | "hold" | "deliver";

export interface NoteStrategy {
  id: NoteStrategyId;
  /** Farm-lot cash already realized, plus sale proceeds if this strategy sells the held book now. */
  cashInHandNow: number;
  /** Cash in hand now plus remaining note value this strategy keeps (face if held/delivered). */
  totalValue: number;
  /** Discount taken if notes are sold at the measured ratio. Zero if they are not sold. */
  liquidityCost: number;
  /** min(LP capital owed, cash and in-kind this strategy can apply by the exit deadline). */
  lpCapitalReturnable: number;
  /** Capital still owed after applying what this strategy can return. */
  lpCapitalStillOwed: number;
}

export interface HeldNoteRow {
  propertyId: string;
  farmName: string;
  lotName: string;
  lotNumber: string | null;
  faceBalance: number;
  measuredSaleValue: number;
  costOfSelling: number;
}

export interface NoteStrategies {
  liquidityCostRealized: number;
  liquidityCostUnrealized: number;
  liquidityCostTotal: number;
  notesHeldCount: number;
  notesHeldFace: number;
  notesHeldAtRatio: number;
  noteSaleRatio: number;
  /** cashAtClosing + noteSaleProceeds — farm-lot cash already on the books. */
  cashAlreadyRealized: number;
  lpCapitalOwed: number;
  sell: NoteStrategy;
  hold: NoteStrategy;
  deliver: NoteStrategy;
  notes: HeldNoteRow[];
}

function strategy(
  id: NoteStrategyId,
  cashInHandNow: number,
  totalValue: number,
  liquidityCost: number,
  lpCapitalOwed: number,
  returnablePool: number,
): NoteStrategy {
  const lpCapitalReturnable = round2(Math.min(lpCapitalOwed, Math.max(0, returnablePool)));
  return {
    id,
    cashInHandNow: round2(cashInHandNow),
    totalValue: round2(totalValue),
    liquidityCost: round2(liquidityCost),
    lpCapitalReturnable,
    lpCapitalStillOwed: round2(Math.max(0, lpCapitalOwed - lpCapitalReturnable)),
  };
}

export function heldNoteRows(lots: Lot[], noteSaleRatio: number): HeldNoteRow[] {
  const ratio = Number.isFinite(noteSaleRatio) ? Math.max(0, noteSaleRatio) : 0;
  const rows: HeldNoteRow[] = [];
  for (const lot of lots) {
    if (!noteIsHeld(lot)) continue;
    const face = lot.noteFinancedAmount ?? 0;
    const sale = round2(face * ratio);
    rows.push({
      propertyId: lot.propertyId,
      farmName: lot.farmName,
      lotName: lot.name,
      lotNumber: lot.lotNumber,
      faceBalance: face,
      measuredSaleValue: sale,
      costOfSelling: round2(face - sale),
    });
  }
  return rows.sort((a, b) => a.farmName.localeCompare(b.farmName) || a.lotName.localeCompare(b.lotName));
}

/**
 * @param layers output of computeProfitLayers
 * @param lots same lots the layers were built from (for farm / lot names)
 * @param lpCapitalOwed sponsor capital still owed (`debt.capitalOwed`)
 */
export function computeNoteStrategies(layers: ProfitLayers, lots: Lot[], lpCapitalOwed: number): NoteStrategies {
  const cashAlreadyRealized = round2(layers.cashAtClosing + layers.noteSaleProceeds);
  const heldFace = layers.notesHeldFace;
  const heldAtRatio = layers.notesHeldAtRatio;
  const unrealized = layers.liquidityCostUnrealized;
  const owed = round2(Math.max(0, lpCapitalOwed));

  // Sell now: convert held notes at the measured ratio. Cash rises; LP can be paid from that cash.
  // Hold: no invented collections by the deadline — cash stays what is already realized.
  // Deliver: notes go to LPs at face (in-kind). Cash unchanged; returnable pool includes face.
  const sellCash = round2(cashAlreadyRealized + heldAtRatio);
  const holdCash = cashAlreadyRealized;
  const deliverCash = cashAlreadyRealized;

  return {
    liquidityCostRealized: layers.liquidityCostRealized,
    liquidityCostUnrealized: unrealized,
    liquidityCostTotal: layers.liquidityCostTotal,
    notesHeldCount: layers.notesHeldCount,
    notesHeldFace: heldFace,
    notesHeldAtRatio: heldAtRatio,
    noteSaleRatio: layers.noteSaleRatio,
    cashAlreadyRealized,
    lpCapitalOwed: owed,
    sell: strategy("sell", sellCash, sellCash, unrealized, owed, sellCash),
    hold: strategy("hold", holdCash, round2(holdCash + heldFace), 0, owed, holdCash),
    deliver: strategy("deliver", deliverCash, round2(deliverCash + heldFace), 0, owed, round2(deliverCash + heldFace)),
    notes: heldNoteRows(lots, layers.noteSaleRatio),
  };
}
