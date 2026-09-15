import type { Campaign, CampaignState, Lot, LotStage, Pipeline } from "@/domain";
import { DATA_AXIS, DATA_GOAL, DATA_STATUS_FAR, GREEN } from "./chartTokens";

const STAGE_RESERVED = "hsl(var(--stage-reserved))";
const STAGE_AVAILABLE = "hsl(var(--stage-available))";
const STAGE_CLOSED = "hsl(var(--stage-closed))";
const STAGE_NOTE_SOLD = "hsl(var(--stage-note-sold))";

/** Farm-level framing: stroke colour and badge classes per campaign state. Labels live in `common.campaign`. */
export const CAMPAIGN_META: Record<CampaignState, { stroke: string; text: string; badge: string }> = {
  conquered: { stroke: GREEN, text: "text-stage-closed", badge: "bg-stage-closed/15 text-stage-closed border-stage-closed/40" },
  under_siege: { stroke: DATA_GOAL, text: "text-gold", badge: "bg-gold/15 text-gold border-gold/40" },
  closing_pending: { stroke: STAGE_RESERVED, text: "text-stage-reserved", badge: "bg-stage-reserved/15 text-stage-reserved border-stage-reserved/40" },
  losing_ground: { stroke: DATA_STATUS_FAR, text: "text-ember", badge: "bg-ember/15 text-ember border-ember/40" },
};

/** Losing ground is a long dash; closing pending a short one — both mean "no closing for a while", only one means nothing is in the works. */
export const CAMPAIGN_DASH: Partial<Record<CampaignState, string>> = { losing_ground: "6 4", closing_pending: "2 4" };

/** @deprecated Prefer `useCommonStrings().campaignPending` / `campaignToCover`. */
export function campaignTag(c: Campaign): string {
  if (c.state === "closing_pending") return ` · ${c.reservedLots} pending`;
  if (c.state !== "conquered" && c.lotsLeftToCover !== null) return ` · ${c.lotsLeftToCover} to cover`;
  return "";
}

/** @deprecated Prefer `useCommonStrings().dealShort`. */
export const DEAL_SHORT: Record<string, string> = { fixed_interest: "Fixed", profit_share: "Share", own_capital: "Own" };

/** Reserved lots are drawn as a hollow ring so they never read as closed; stuck reservations get a dashed amber ring. */
export const RING_STROKE = { reserved: STAGE_RESERVED, stuck: DATA_STATUS_FAR } as const;
export type LotRing = keyof typeof RING_STROKE;

export const STAGE_FILL: Record<LotStage, string> = {
  available: STAGE_AVAILABLE,
  reserved: STAGE_RESERVED,
  closed: STAGE_CLOSED,
  note_sold: STAGE_NOTE_SOLD,
};

/** The Quest state a lot is tinted by: its stage, plus "stuck 60+ days" for reservations the pipeline flags. */
export function ringFor(lot: Lot, pipeline: Pipeline | undefined): LotRing | null {
  if (lot.stage !== "reserved") return null;
  return pipeline?.stuckIds.has(lot.propertyId) ? "stuck" : "reserved";
}

export const HOVER_STROKE = DATA_GOAL;
export const MAP_GRID_STROKE = DATA_AXIS;
export const MAP_PLATE_STROKE = DATA_GOAL;

export function territoryFill(pctClosed: number): string {
  // From the theme's untouched ground to its gold as the farm sells out (tokens: --territory-from/--territory-to).
  const t = Math.max(0, Math.min(1, pctClosed / 100));
  return `color-mix(in oklab, hsl(var(--territory-to)) ${Math.round(t * 100)}%, hsl(var(--territory-from)))`;
}

/** Every map box on the Realm shares this aspect so a skeleton is exactly the size of the map that replaces it. */
export const MAP_BOX_ASPECT = 4 / 3;
