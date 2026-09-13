import type { Campaign, CampaignState, Lot, LotStage, Pipeline } from "@/domain";

/** Farm-level framing, unchanged from the packed-territory map: a stroke colour and a dash per campaign state. */
export const CAMPAIGN_META: Record<CampaignState, { label: string; stroke: string; text: string; badge: string }> = {
  conquered: { label: "Conquered", stroke: "hsl(var(--stage-closed))", text: "text-stage-closed", badge: "bg-stage-closed/15 text-stage-closed border-stage-closed/40" },
  under_siege: { label: "Under siege", stroke: "hsl(var(--gold))", text: "text-gold", badge: "bg-gold/15 text-gold border-gold/40" },
  closing_pending: { label: "Closing pending", stroke: "hsl(var(--stage-reserved))", text: "text-stage-reserved", badge: "bg-stage-reserved/15 text-stage-reserved border-stage-reserved/40" },
  losing_ground: { label: "Losing ground", stroke: "hsl(var(--ember))", text: "text-ember", badge: "bg-ember/15 text-ember border-ember/40" },
};

/** Losing ground is a long dash; closing pending a short one — both mean "no closing for a while", only one means nothing is in the works. */
export const CAMPAIGN_DASH: Partial<Record<CampaignState, string>> = { losing_ground: "6 4", closing_pending: "2 4" };

export function campaignTag(c: Campaign): string {
  if (c.state === "closing_pending") return ` · ${c.reservedLots} pending`;
  if (c.state !== "conquered" && c.lotsLeftToCover !== null) return ` · ${c.lotsLeftToCover} to cover`;
  return "";
}

export const DEAL_SHORT: Record<string, string> = { fixed_interest: "Fixed", profit_share: "Share", own_capital: "Own" };

/** Reserved lots are drawn as a hollow ring so they never read as closed; stuck reservations get a dashed amber ring. */
export const RING_STROKE = { reserved: "hsl(var(--stage-reserved))", stuck: "hsl(var(--siege))" } as const;
export type LotRing = keyof typeof RING_STROKE;

export const STAGE_FILL: Record<LotStage, string> = {
  available: "hsl(var(--stage-available))",
  reserved: "hsl(var(--stage-reserved))",
  closed: "hsl(var(--stage-closed))",
  note_sold: "hsl(var(--stage-note-sold))",
};

/** The Quest state a lot is tinted by: its stage, plus "stuck 60+ days" for reservations the pipeline flags. */
export function ringFor(lot: Lot, pipeline: Pipeline | undefined): LotRing | null {
  if (lot.stage !== "reserved") return null;
  return pipeline?.stuckIds.has(lot.propertyId) ? "stuck" : "reserved";
}

export const HOVER_STROKE = "hsl(var(--gold))";

export function territoryFill(pctClosed: number): string {
  // From the theme's untouched ground to its gold as the farm sells out (tokens: --territory-from/--territory-to).
  const t = Math.max(0, Math.min(1, pctClosed / 100));
  return `color-mix(in oklab, hsl(var(--territory-to)) ${Math.round(t * 100)}%, hsl(var(--territory-from)))`;
}

/** Every map box on the Realm shares this aspect so a skeleton is exactly the size of the map that replaces it. */
export const MAP_BOX_ASPECT = 4 / 3;
