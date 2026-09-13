/**
 * The War Plan's editable prefills. Versioned in git like the goal itself.
 */
import type { MixDealType } from "../domain/oracle";

/** Lots a new farm is planned at. The real average (≈12.1) is shown next to it. */
export const WARPLAN_DEFAULT_LOTS_PER_FARM = 10;

/** Marketing dollars per closing; there is no ad-spend table in Payments to derive this from. */
export const WARPLAN_DEFAULT_AD_SPEND_PER_CLOSING = 2_500;

/** Hard cap on the pace the solver will search. Beyond this the plan is declared unreachable. */
export const WARPLAN_MAX_CLOSINGS_PER_MONTH = 60;

/**
 * Funding order and terms for the next farms, matched to `investors.name`. Capital is prefilled
 * from what each sponsor has already put into farm_acquisitions. Every value is editable on the page.
 * Rony Schumann's real farm (Freestone) carries 20 %; the brief prefills the next deal at 18.
 */
export const WARPLAN_INVESTOR_PREFILL: readonly { name: string; dealType: MixDealType; ratePct: number }[] = [
  { name: "Kevin Concua", dealType: "fixed_interest", ratePct: 20 },
  { name: "Townson Family", dealType: "profit_share", ratePct: 50 },
  { name: "Julio Arriola", dealType: "fixed_interest", ratePct: 25 },
  { name: "Rony Schumann", dealType: "fixed_interest", ratePct: 18 },
  { name: "Doctores Motta", dealType: "fixed_interest", ratePct: 20 },
];
