import { useMemo, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { useRealm } from "@/data/useRealm";
import type { Campaign, CampaignState, FarmEconomics, Lot, LotStage } from "@/domain";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { StageBadge } from "@/components/realm/StageBadge";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { DEAL_LABEL, STAGE_LABEL, date, money, moneyExact, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const TILE = 26;
const GAP = 6;
const PAD = 16;
const TITLE_H = 56;
const MIN_W = 190;
const MAP_W = 1000;

const DEAL_SHORT: Record<string, string> = { fixed_interest: "Fixed", profit_share: "Share", own_capital: "Own" };

const CAMPAIGN_META: Record<CampaignState, { label: string; stroke: string; text: string; badge: string }> = {
  conquered: { label: "Conquered", stroke: "hsl(152 55% 50%)", text: "text-stage-closed", badge: "bg-stage-closed/15 text-stage-closed border-stage-closed/40" },
  under_siege: { label: "Under siege", stroke: "hsl(var(--gold))", text: "text-gold", badge: "bg-gold/15 text-gold border-gold/40" },
  losing_ground: { label: "Losing ground", stroke: "hsl(0 70% 60%)", text: "text-red-300", badge: "bg-red-500/15 text-red-300 border-red-500/40" },
};

const STAGE_FILL: Record<LotStage, string> = {
  available: "hsl(var(--stage-available))",
  reserved: "hsl(var(--stage-reserved))",
  closed: "hsl(var(--stage-closed))",
  note_sold: "hsl(var(--stage-note-sold))",
};

interface Territory {
  farm: FarmEconomics;
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  tiles: { lot: Lot; x: number; y: number }[];
}

/** Flow-packs one rounded territory per farm; area scales with lot count. */
function layoutTerritories(farms: FarmEconomics[]): { territories: Territory[]; height: number } {
  const sorted = [...farms].sort((a, b) => b.totalLots - a.totalLots);
  const territories: Territory[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;

  for (const farm of sorted) {
    const n = Math.max(farm.lots.length, 1);
    const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.7)));
    const rows = Math.ceil(n / cols);
    const w = Math.max(MIN_W, cols * (TILE + GAP) - GAP + PAD * 2);
    const h = rows * (TILE + GAP) - GAP + PAD * 2 + TITLE_H;
    if (cursorX + w > MAP_W && cursorX > 0) {
      cursorX = 0;
      cursorY += rowH + 18;
      rowH = 0;
    }
    const lots = [...farm.lots].sort((a, b) => Number(a.lotNumber ?? 0) - Number(b.lotNumber ?? 0));
    const tiles = lots.map((lot, i) => ({
      lot,
      x: cursorX + PAD + (i % cols) * (TILE + GAP),
      y: cursorY + TITLE_H + PAD + Math.floor(i / cols) * (TILE + GAP),
    }));
    territories.push({ farm, x: cursorX, y: cursorY, w, h, cols, tiles });
    cursorX += w + 18;
    rowH = Math.max(rowH, h);
  }
  return { territories, height: cursorY + rowH + 4 };
}

function territoryFill(pctClosed: number): string {
  // muted violet → deep gold as the farm sells out
  const t = Math.max(0, Math.min(1, pctClosed / 100));
  const h = 268 + (43 - 268) * t;
  const s = 30 + 35 * t;
  const l = 14 + 6 * t;
  return `hsl(${h} ${s}% ${l}%)`;
}

export default function RealmMap() {
  const { data, isLoading, error, refetch } = useRealm();
  const [hover, setHover] = useState<{ lot: Lot; x: number; y: number } | null>(null);
  const [openFarm, setOpenFarm] = useState<FarmEconomics | null>(null);

  const layout = useMemo(() => (data ? layoutTerritories(data.realm.farms) : null), [data]);
  const campaignByFarm = data?.realm.campaignByFarm;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || !layout) return null;
  if (layout.territories.length === 0) return <EmptyState title="No territories" body="No subdivided farms were found." />;

  const onMove = (e: MouseEvent, lot: Lot) => setHover({ lot, x: e.clientX, y: e.clientY });

  return (
    <div>
      <PageHeader title="The Realm" subtitle="One territory per farm, sized by lots and tinted by how much has closed. Each farm fights its own campaign: sell enough lots to cover its capital and accrued interest. Hover a lot for its economics; click a territory for the farm.">
        <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
          {(Object.keys(STAGE_FILL) as LotStage[]).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: STAGE_FILL[s] }} />
              {STAGE_LABEL[s]}
            </li>
          ))}
          {(Object.keys(CAMPAIGN_META) as CampaignState[]).map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: CAMPAIGN_META[c].stroke }} />
              {CAMPAIGN_META[c].label}
            </li>
          ))}
        </ul>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      <div className="parchment-card overflow-x-auto p-3 sm:p-5">
        <svg
          viewBox={`0 0 ${MAP_W} ${layout.height}`}
          className="mx-auto block h-auto w-full min-w-[640px]"
          role="img"
          aria-label="Map of the realm"
          data-testid="realm-map"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {layout.territories.map((t, i) => {
            const campaign = campaignByFarm?.get(t.farm.farmId);
            const meta = campaign ? CAMPAIGN_META[campaign.state] : null;
            return (
            <motion.g
              key={t.farm.farmId}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              style={{ transformOrigin: `${t.x + t.w / 2}px ${t.y + t.h / 2}px` }}
            >
              <rect
                x={t.x}
                y={t.y}
                width={t.w}
                height={t.h}
                rx={22}
                fill={territoryFill(t.farm.pctClosed)}
                stroke={meta?.stroke ?? "hsl(var(--gold) / 0.35)"}
                strokeWidth={campaign?.state === "losing_ground" ? 2 : 1.4}
                strokeDasharray={campaign?.state === "losing_ground" ? "6 4" : undefined}
                className="cursor-pointer transition-[stroke-width] hover:[stroke-width:3]"
                onClick={() => setOpenFarm(t.farm)}
                role="button"
                aria-label={`${t.farm.name} territory${meta ? `, ${meta.label}` : ""}`}
                data-testid="territory"
                data-campaign={campaign?.state}
              />
              {campaign && meta && (
                <text x={t.x + PAD} y={t.y + TITLE_H + 6} fontSize={9} fontWeight={600} className="pointer-events-none uppercase" style={{ fill: meta.stroke, letterSpacing: "0.08em" }}>
                  {meta.label}
                  {campaign.state !== "conquered" && campaign.lotsLeftToCover !== null ? ` · ${campaign.lotsLeftToCover} to cover` : ""}
                </text>
              )}
              <text x={t.x + PAD} y={t.y + 22} className="pointer-events-none fill-[hsl(var(--gold))] font-heading" fontSize={14} fontWeight={600}>
                {t.farm.name}
              </text>
              <text x={t.x + PAD} y={t.y + 37} className="pointer-events-none fill-[hsl(var(--muted-foreground))]" fontSize={10}>
                {t.farm.soldLots}/{t.farm.totalLots} closed · {pct(t.farm.pctClosed, 0)} · {DEAL_SHORT[t.farm.dealType ?? ""] ?? t.farm.dealType}
              </text>
              {t.tiles.map(({ lot, x, y }) => (
                <rect
                  key={lot.propertyId}
                  x={x}
                  y={y}
                  width={TILE}
                  height={TILE}
                  rx={4}
                  fill={STAGE_FILL[lot.stage]}
                  fillOpacity={lot.stage === "available" ? 0.45 : 0.95}
                  filter={lot.stage === "note_sold" ? "url(#glow)" : undefined}
                  className="cursor-pointer transition-transform hover:scale-110"
                  style={{ transformOrigin: `${x + TILE / 2}px ${y + TILE / 2}px`, transformBox: "fill-box" }}
                  onMouseEnter={(e) => onMove(e, lot)}
                  onMouseMove={(e) => onMove(e, lot)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenFarm(t.farm);
                  }}
                  aria-label={`${lot.name}: ${STAGE_LABEL[lot.stage]}`}
                  data-testid="lot-tile"
                />
              ))}
            </motion.g>
            );
          })}
        </svg>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 w-64 rounded-md border border-border bg-popover p-3 text-xs shadow-2xl"
          style={{ left: Math.min(hover.x + 14, window.innerWidth - 270), top: Math.min(hover.y + 14, window.innerHeight - 240) }}
          role="tooltip"
        >
          <LotEconomics lot={hover.lot} />
        </div>
      )}

      <Sheet open={!!openFarm} onOpenChange={(o) => !o && setOpenFarm(null)}>
        {openFarm && (
          <SheetContent title={openFarm.name} description={`${openFarm.county ?? ""} · ${DEAL_LABEL[openFarm.dealType ?? ""] ?? openFarm.dealType} · ${openFarm.investorName ?? "own capital"}`}>
            <FarmDetail farm={openFarm} campaign={campaignByFarm?.get(openFarm.farmId)} />
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}

export function LotEconomics({ lot }: { lot: Lot }) {
  const row = (label: string, value: string, className?: string) => (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular", className)}>{value}</span>
    </div>
  );
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="font-heading text-sm text-gold">{lot.name}</div>
        <StageBadge stage={lot.stage} />
      </div>
      {lot.buyerName && <div className="text-muted-foreground">Buyer: {lot.buyerName}</div>}
      {row("Sale price", moneyExact(lot.salePrice))}
      {row("Land cost", moneyExact(lot.landCost))}
      {row("Gross", moneyExact(lot.grossProfit))}
      {row("Investor take", moneyExact(lot.investorTake))}
      {row("Net", moneyExact(lot.netProfit), "font-medium")}
      {row("Cash realized", moneyExact(lot.cashRealized), "text-stage-closed")}
      {lot.noteSalePrice !== null && row("Note sold for", moneyExact(lot.noteSalePrice))}
      {lot.reservationDate && row("Reserved", date(lot.reservationDate))}
      {lot.closeDate && row("Closed", date(lot.closeDate))}
      {lot.daysInPipeline !== null && row("Days in pipeline", `${lot.daysInPipeline}`)}
    </div>
  );
}

export function FarmDetail({ farm, campaign }: { farm: FarmEconomics; campaign?: Campaign }) {
  const stat = (label: string, value: string, className?: string) => (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1 font-heading tabular", className)}>{value}</div>
    </div>
  );
  return (
    <div className="space-y-5 text-sm">
      {campaign && <CampaignPanel c={campaign} />}
      <div className="grid grid-cols-2 gap-2">
        {stat("Capital deployed", money(farm.capitalDeployed))}
        {stat("Land cost / lot", money(farm.landCostPerLot))}
        {stat("Revenue", money(farm.revenue))}
        {stat("Net profit", money(farm.netProfit), "text-gold")}
        {stat("Cash realized", money(farm.cashRealized), "text-stage-closed")}
        {stat("Capital outstanding", money(farm.capitalOutstanding))}
        {farm.dealType === "fixed_interest" && stat(`Interest accrued @ ${farm.annualRatePct}%`, money(farm.interest.accruedToDate))}
        {farm.dealType === "profit_share" && stat(`Investor share @ ${farm.profitSharePct}%`, money(farm.investorTake))}
        {stat("Funded", date(farm.fundingDate ?? farm.closingDate))}
        {stat("Months since funding", farm.monthsSinceFunding === null ? "not yet" : `${farm.monthsSinceFunding}`)}
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(farm.stages) as LotStage[]).map((s) => (
          <StageBadge key={s} stage={s} className="gap-1">
            {farm.stages[s]}
          </StageBadge>
        ))}
      </div>
      <ol className="divide-y divide-border/60">
        {[...farm.lots]
          .sort((a, b) => Number(a.lotNumber ?? 0) - Number(b.lotNumber ?? 0))
          .map((l) => (
            <li key={l.propertyId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate">Lot {l.lotNumber ?? "?"}</div>
                <div className="truncate text-xs text-muted-foreground">{l.buyerName ?? (l.stage === "available" ? "unsold" : "—")}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular text-xs">{moneyExact(l.netProfit)}</span>
                <StageBadge stage={l.stage} />
              </div>
            </li>
          ))}
      </ol>
    </div>
  );
}

export function CampaignPanel({ c }: { c: Campaign }) {
  const meta = CAMPAIGN_META[c.state];
  return (
    <section className={cn("rounded-lg border p-3", meta.badge)} aria-label="Campaign" data-testid="campaign" data-state={c.state}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-heading text-xs uppercase tracking-[0.2em]">Campaign · {meta.label}</div>
        <div className="text-xs tabular">{pct(c.pctCovered, 0)} covered</div>
      </div>
      <div className="mt-1 text-xs text-foreground/80">{c.reason}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
        <motion.div className="h-full rounded-full bg-current" initial={{ width: 0 }} animate={{ width: `${c.pctCovered}%` }} transition={{ duration: 1 }} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-foreground/90">
        <dt className="text-muted-foreground">Goal (capital + interest)</dt>
        <dd className="text-right tabular">{money(c.target)}</dd>
        <dt className="text-muted-foreground">Sold so far</dt>
        <dd className="text-right tabular">{money(c.recovered)}</dd>
        <dt className="text-muted-foreground">Lots left to cover</dt>
        <dd className="text-right tabular">
          {c.lotsLeftToCover ?? "—"} of {c.lotsUnsold} unsold
          {c.lotsShort > 0 ? ` (${c.lotsShort} short)` : ""}
        </dd>
        <dt className="text-muted-foreground">Last closing</dt>
        <dd className="text-right tabular">{c.lastClosingDate ? `${date(c.lastClosingDate)} · ${c.daysSinceLastClosing}d ago` : "none yet"}</dd>
        {c.interestAccruing && (
          <>
            <dt className="text-muted-foreground">Interest accrued</dt>
            <dd className="text-right tabular">{money(c.accruedInterest)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
