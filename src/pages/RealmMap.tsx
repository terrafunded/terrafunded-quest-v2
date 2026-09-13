import { useMemo, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { useRealm } from "@/data/useRealm";
import { useFarmGeometries } from "@/data/useFarmGeometry";
import { reconcileParcels, type Campaign, type CampaignState, type FarmEconomics, type FarmPipeline, type Lot, type LotStage } from "@/domain";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { StageBadge } from "@/components/realm/StageBadge";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { PointerTooltip } from "@/components/realm/PointerTooltip";
import { FarmCard } from "@/components/realm/FarmCard";
import { CAMPAIGN_META, RING_STROKE, STAGE_FILL } from "@/components/realm/realmTokens";
import { DEAL_LABEL, STAGE_LABEL, date, money, moneyExact, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Farms with at least this many lots take two columns so a 32-lot plat is not drawn at the size of a 6-lot one. */
const WIDE_FROM_LOTS = 16;

export default function RealmMap() {
  const { data, isLoading, error, refetch } = useRealm();
  const [hover, setHover] = useState<{ lot: Lot; x: number; y: number } | null>(null);
  const [openFarm, setOpenFarm] = useState<FarmEconomics | null>(null);

  const farms = useMemo(() => [...(data?.realm.farms ?? [])].sort((a, b) => b.totalLots - a.totalLots), [data]);
  const farmNames = useMemo(() => farms.map((f) => f.name), [farms]);
  const geometries = useFarmGeometries(farmNames);
  // The assertion runs per farm on every render input change: a polygon count that does not equal
  // the lot count Quest computes (or wrong numbers) sends the farm to the schematic.
  const reconciliations = useMemo(() => farms.map((farm, i) => reconcileParcels(farm, geometries[i]?.status === "ready" ? geometries[i].geometry : null)), [farms, geometries]);
  const lotById = useMemo(() => new Map(farms.flatMap((f) => f.lots).map((l) => [l.propertyId, l])), [farms]);
  const farmById = useMemo(() => new Map(farms.map((f) => [f.farmId, f])), [farms]);
  const campaignByFarm = data?.realm.campaignByFarm;
  const pipeline = data?.realm.pipeline;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;
  if (farms.length === 0) return <EmptyState title="No territories" body="No subdivided farms were found." />;

  /**
   * One move handler for the whole realm, not enter/leave per lot: the tooltip follows whichever
   * lot is under the pointer and retargets when the pointer crosses into a neighbour, so it never
   * closes and reopens at a seam. Lot shapes never change geometry on hover, so the element under
   * a still pointer stays put and no enter/leave loop can start.
   */
  const onRealmMove = (e: MouseEvent<HTMLDivElement>) => {
    const id = (e.target as Element).closest<SVGElement>("[data-lot-id]")?.dataset.lotId;
    const lot = id ? lotById.get(id) : undefined;
    if (!lot) {
      if (hover) setHover(null);
      return;
    }
    setHover({ lot, x: e.clientX, y: e.clientY });
  };

  const realMaps = reconciliations.filter((r) => r.status === "ok").length;

  return (
    <div>
      <PageHeader
        title="The Realm"
        subtitle={`One card per farm on its surveyed parcel map — the same drawing Payments' availability map uses, over the aerial it serves — with every lot tinted by its Quest state. Farms whose drawing is missing or disagrees with the ledger get a schematic plat instead (${realMaps} of ${farms.length} mapped). Each farm fights its own campaign: sell enough lots to cover its capital and accrued interest. Hover a lot for its economics; click a farm for the campaign.`}
      >
        <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
          {(Object.keys(STAGE_FILL) as LotStage[]).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              {s === "reserved" ? (
                <span className="inline-block h-3 w-3 rounded-sm border-2" style={{ borderColor: RING_STROKE.reserved, background: "hsl(var(--stage-reserved) / 0.2)" }} />
              ) : (
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: STAGE_FILL[s] }} />
              )}
              {STAGE_LABEL[s]}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border-2 border-dashed" style={{ borderColor: RING_STROKE.stuck }} />
            Stuck 60+ days
          </li>
          {(Object.keys(CAMPAIGN_META) as CampaignState[]).map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: CAMPAIGN_META[c].stroke }} />
              {CAMPAIGN_META[c].label}
            </li>
          ))}
        </ul>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      <div className="grid grid-flow-dense gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="realm-map" onMouseMove={onRealmMove} onMouseLeave={() => setHover(null)}>
        {farms.map((farm, i) => (
          <FarmCard
            key={farm.farmId}
            farm={farm}
            campaign={campaignByFarm?.get(farm.farmId)}
            pipeline={pipeline}
            geometry={geometries[i] ?? { status: "loading" }}
            reconciliation={reconciliations[i] ?? { status: "no_geometry" }}
            hoveredLotId={hover?.lot.farmId === farm.farmId ? hover.lot.propertyId : null}
            index={i}
            wide={farm.totalLots >= WIDE_FROM_LOTS}
            onOpen={() => setOpenFarm(farmById.get(farm.farmId) ?? farm)}
          />
        ))}
      </div>

      {hover && (
        <PointerTooltip x={hover.x} y={hover.y} data-testid="lot-tooltip">
          <LotEconomics lot={hover.lot} />
        </PointerTooltip>
      )}

      <Sheet open={!!openFarm} onOpenChange={(o) => !o && setOpenFarm(null)}>
        {openFarm && (
          <SheetContent title={openFarm.name} description={`${openFarm.county ?? ""} · ${DEAL_LABEL[openFarm.dealType ?? ""] ?? openFarm.dealType} · ${openFarm.investorName ?? "own capital"}`}>
            <FarmDetail farm={openFarm} campaign={campaignByFarm?.get(openFarm.farmId)} pipeline={pipeline?.farmById.get(openFarm.farmId)} realmMedianDaysToClose={pipeline?.medianDaysToClose ?? null} />
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

export function FarmDetail({
  farm,
  campaign,
  pipeline,
  realmMedianDaysToClose = null,
}: {
  farm: FarmEconomics;
  campaign?: Campaign;
  pipeline?: FarmPipeline;
  realmMedianDaysToClose?: number | null;
}) {
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
      {pipeline && (
        <div className="rounded-lg border border-siege/24 bg-siege/8 p-3" data-testid="farm-pipeline">
          <div className="stat-label">Reservation → closing</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-heading text-xl tabular" data-testid="farm-median-days" data-value={pipeline.medianDaysToClose ?? ""}>
              {pipeline.medianDaysToClose === null ? "—" : `${pipeline.medianDaysToClose} days`}
            </span>
            <span className="text-xs text-muted-foreground">
              median over {pipeline.closedWithBothDates} closed lot{pipeline.closedWithBothDates === 1 ? "" : "s"}
              {realmMedianDaysToClose !== null && ` · realm ${realmMedianDaysToClose}d`}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {pipeline.reserved} reserved · <span className={cn(pipeline.stuck > 0 && "text-siege")}>{pipeline.stuck} stuck</span>
            {pipeline.stuck > 0 && <> · {money(pipeline.netProfitTrapped)} of profit trapped</>}
          </div>
        </div>
      )}
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
        <dt className="text-muted-foreground">Reservations waiting</dt>
        <dd className={cn("text-right tabular", c.reservedLots > 0 && "text-stage-reserved")} data-testid="campaign-reserved" data-value={c.reservedLots}>
          {c.reservedLots}
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
