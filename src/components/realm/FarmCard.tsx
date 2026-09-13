import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import type { Campaign, FarmEconomics, ParcelReconciliation, Pipeline } from "@/domain";
import type { GeometryResult } from "@/data/useFarmGeometry";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FarmGridMap } from "./FarmGridMap";
import { FarmParcelMap } from "./FarmParcelMap";
import { mapModeOf } from "./mapMode";
import { CAMPAIGN_META, DEAL_SHORT, MAP_BOX_ASPECT, campaignTag } from "./realmTokens";

/** Border style per campaign state — the same long/short dash the packed map used on its territory outline. */
const CAMPAIGN_BORDER: Partial<Record<Campaign["state"], string>> = { losing_ground: "border-dashed", closing_pending: "border-dotted" };

/**
 * One farm: the header framing its campaign (unchanged), then the map box — the surveyed parcel
 * map when Payments' drawing agrees with the ledger, the schematic plat otherwise — and, under a
 * schematic, one line saying why. Every box shares MAP_BOX_ASPECT so the skeleton shown while the
 * geometry is still loading is exactly the size of what replaces it; nothing on the page jumps.
 * Entrance (card and lot stagger) runs the first time the card scrolls into view, not on mount.
 */
export function FarmCard({
  farm,
  campaign,
  pipeline,
  geometry,
  reconciliation,
  hoveredLotId,
  index,
  wide,
  onOpen,
}: {
  farm: FarmEconomics;
  campaign: Campaign | undefined;
  pipeline: Pipeline | undefined;
  geometry: GeometryResult;
  reconciliation: ParcelReconciliation;
  hoveredLotId: string | null;
  index: number;
  wide: boolean;
  onOpen: () => void;
}) {
  const [ref, inView] = useInViewOnce<HTMLElement>(0.15);
  const meta = campaign ? CAMPAIGN_META[campaign.state] : null;
  const mode = mapModeOf(geometry, reconciliation);

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ delay: Math.min(index, 6) * 0.05, duration: 0.5 }}
      className={cn("parchment-card flex cursor-pointer flex-col rounded-xl border bg-card/80 p-3 text-left sm:p-4", campaign && CAMPAIGN_BORDER[campaign.state], wide && "sm:col-span-2")}
      style={{ borderColor: meta?.stroke ?? "hsl(var(--gold) / 0.35)" }}
      role="button"
      tabIndex={0}
      aria-label={`${farm.name} territory${meta ? `, ${meta.label}` : ""}`}
      data-testid="territory"
      data-campaign={campaign?.state}
      data-map={mode}
      data-farm={farm.name}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-base text-[hsl(var(--map-label))]">{farm.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground tabular">
            {farm.soldLots}/{farm.totalLots} closed · {pct(farm.pctClosed, 0)} · {DEAL_SHORT[farm.dealType ?? ""] ?? farm.dealType}
          </p>
        </div>
        {campaign && meta && (
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]", meta.badge)} data-testid="campaign-label">
            {meta.label}
            {campaignTag(campaign)}
          </span>
        )}
      </header>

      <div className="relative mt-3 overflow-hidden rounded-lg bg-[hsl(var(--territory-from)/0.35)]" style={{ aspectRatio: `${MAP_BOX_ASPECT}` }} data-testid="map-box">
        {mode === "loading" && <div className="absolute inset-0 animate-pulse bg-muted/40" aria-hidden="true" data-testid="map-skeleton" />}
        {mode === "parcels" && reconciliation.status === "ok" && (
          <FarmParcelMap farm={farm} geometry={reconciliation.geometry} lotByPolygon={reconciliation.lotByPolygon} pipeline={pipeline} hoveredLotId={hoveredLotId} inView={inView} onSelect={onOpen} />
        )}
        {mode === "grid" && <FarmGridMap farm={farm} pipeline={pipeline} hoveredLotId={hoveredLotId} inView={inView} onSelect={onOpen} />}
      </div>

      {mode === "grid" && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground" data-testid="map-fallback-reason" data-reason={reconciliation.status === "mismatch" ? "mismatch" : geometry.status === "error" ? "error" : "no_geometry"}>
          {reconciliation.status === "mismatch" ? (
            <>
              Schematic · the survey drawing has {reconciliation.polygons} parcel{reconciliation.polygons === 1 ? "" : "s"}, the ledger {reconciliation.lotRows} lot{reconciliation.lotRows === 1 ? "" : "s"} —{" "}
              <Link to="/quality" className="underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                see Data Quality
              </Link>
            </>
          ) : geometry.status === "error" ? (
            <>Schematic · the survey drawing could not be loaded from Payments</>
          ) : (
            <>Schematic · Payments has no survey drawing for this farm</>
          )}
        </p>
      )}
    </motion.article>
  );
}
