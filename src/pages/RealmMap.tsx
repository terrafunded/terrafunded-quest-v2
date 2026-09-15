import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
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
import { useCommonStrings } from "@/i18n/common";
import { useRealmMapStrings } from "@/i18n/realmMap";
import { dealLabel, date, money, moneyExact, pct, stageLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Farms with at least this many lots take two columns so a 32-lot plat is not drawn at the size of a 6-lot one. */
const WIDE_FROM_LOTS = 16;

/**
 * One move handler for the whole realm, not enter/leave per lot. The lot id is React state and
 * only updates when the pointer crosses a boundary (same id → bail-out, no farm-card render).
 * Tooltip coordinates live in a child that listens to `window` mousemove, so they never climb
 * the tree.
 */
function RealmPointer({
  lotById,
  children,
}: {
  lotById: Map<string, Lot>;
  children: (hoveredLotId: string | null) => ReactNode;
}) {
  const [lotId, setLotId] = useState<string | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    origin.current = { x: e.clientX, y: e.clientY };
    const id = (e.target as Element).closest<SVGElement>("[data-lot-id]")?.dataset.lotId ?? null;
    setLotId((prev) => (prev === id ? prev : id));
  };
  const lot = lotId ? lotById.get(lotId) : undefined;
  return (
    <div onMouseMove={onMove} onMouseLeave={() => setLotId(null)}>
      {children(lotId)}
      {lot && <FollowTooltip lot={lot} origin={origin.current} />}
    </div>
  );
}

function FollowTooltip({ lot, origin }: { lot: Lot; origin: { x: number; y: number } }) {
  const [pos, setPos] = useState(origin);
  useEffect(() => {
    const move = (e: globalThis.MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);
  return (
    <PointerTooltip x={pos.x} y={pos.y} data-testid="lot-tooltip">
      <LotEconomics lot={lot} />
    </PointerTooltip>
  );
}

export default function RealmMap() {
  const { data, isLoading, error, refetch } = useRealm();
  const t = useRealmMapStrings();
  const common = useCommonStrings();
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
  if (farms.length === 0) return <EmptyState title={t.emptyTitle} body={t.emptyBody} />;

  const realMaps = reconciliations.filter((r) => r.status === "ok").length;

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle(realMaps, farms.length)}>
        <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label={t.legendAria}>
          {(Object.keys(STAGE_FILL) as LotStage[]).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              {s === "reserved" ? (
                <span className="inline-block h-3 w-3 rounded-sm border-2" style={{ borderColor: RING_STROKE.reserved, background: "hsl(var(--stage-reserved) / 0.2)" }} />
              ) : (
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: STAGE_FILL[s] }} />
              )}
              {stageLabel(s)}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border-2 border-dashed" style={{ borderColor: RING_STROKE.stuck }} />
            {t.stuck60}
          </li>
          {(Object.keys(CAMPAIGN_META) as CampaignState[]).map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: CAMPAIGN_META[c].stroke }} />
              {common.campaign[c]}
            </li>
          ))}
        </ul>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      <RealmPointer lotById={lotById}>
        {(hoveredLotId) => (
          <div className="grid grid-flow-dense gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="realm-map">
            {farms.map((farm, i) => (
              <FarmCard
                key={farm.farmId}
                farm={farm}
                campaign={campaignByFarm?.get(farm.farmId)}
                pipeline={pipeline}
                geometry={geometries[i] ?? { status: "loading" }}
                reconciliation={reconciliations[i] ?? { status: "no_geometry" }}
                hoveredLotId={hoveredLotId && lotById.get(hoveredLotId)?.farmId === farm.farmId ? hoveredLotId : null}
                index={i}
                wide={farm.totalLots >= WIDE_FROM_LOTS}
                onOpen={() => setOpenFarm(farmById.get(farm.farmId) ?? farm)}
              />
            ))}
          </div>
        )}
      </RealmPointer>

      <Sheet open={!!openFarm} onOpenChange={(o) => !o && setOpenFarm(null)}>
        {openFarm && (
          <SheetContent title={openFarm.name} description={`${openFarm.county ?? ""} · ${openFarm.dealType ? dealLabel(openFarm.dealType) : ""} · ${openFarm.investorName ?? t.ownCapital}`}>
            <FarmDetail farm={openFarm} campaign={campaignByFarm?.get(openFarm.farmId)} pipeline={pipeline?.farmById.get(openFarm.farmId)} realmMedianDaysToClose={pipeline?.medianDaysToClose ?? null} />
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}

export function LotEconomics({ lot }: { lot: Lot }) {
  const t = useRealmMapStrings().lot;
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
      {lot.buyerName && <div className="text-muted-foreground">{t.buyer(lot.buyerName)}</div>}
      {row(t.salePrice, moneyExact(lot.salePrice))}
      {row(t.landCost, moneyExact(lot.landCost))}
      {row(t.gross, moneyExact(lot.grossProfit))}
      {row(t.investorTake, moneyExact(lot.investorTake))}
      {row(t.net, moneyExact(lot.netProfit), "font-medium")}
      {row(t.cashRealized, moneyExact(lot.cashRealized), "text-stage-closed")}
      {lot.noteSalePrice !== null && row(t.noteSoldFor, moneyExact(lot.noteSalePrice))}
      {lot.reservationDate && row(t.reserved, date(lot.reservationDate))}
      {lot.closeDate && row(t.closed, date(lot.closeDate))}
      {lot.daysInPipeline !== null && row(t.daysInPipeline, `${lot.daysInPipeline}`)}
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
  const t = useRealmMapStrings().farm;
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
        {stat(t.capitalDeployed, money(farm.capitalDeployed))}
        {stat(t.landCostPerLot, money(farm.landCostPerLot))}
        {stat(t.revenue, money(farm.revenue))}
        {stat(t.netProfit, money(farm.netProfit), "text-gold")}
        {stat(t.cashRealized, money(farm.cashRealized), "text-stage-closed")}
        {stat(t.capitalOutstanding, money(farm.capitalOutstanding))}
        {farm.dealType === "fixed_interest" && stat(t.interestAccrued(farm.annualRatePct ?? 0), money(farm.interest.accruedToDate))}
        {farm.dealType === "profit_share" && stat(t.investorShare(farm.profitSharePct ?? 0), money(farm.investorTake))}
        {stat(t.funded, date(farm.fundingDate ?? farm.closingDate))}
        {stat(t.monthsSinceFunding, farm.monthsSinceFunding === null ? t.notYet : `${farm.monthsSinceFunding}`)}
      </div>
      {pipeline && (
        <div className="rounded-lg border border-siege/24 bg-siege/8 p-3" data-testid="farm-pipeline">
          <div className="stat-label">{t.reservationClosing}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-heading text-xl tabular" data-testid="farm-median-days" data-value={pipeline.medianDaysToClose ?? ""}>
              {pipeline.medianDaysToClose === null ? "—" : `${pipeline.medianDaysToClose}d`}
            </span>
            <span className="text-xs text-muted-foreground">
              {t.medianOver(pipeline.closedWithBothDates, realmMedianDaysToClose !== null ? `${realmMedianDaysToClose}d` : null)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t.reservedStuck(pipeline.reserved, pipeline.stuck)}
            {pipeline.stuck > 0 && <>{t.profitTrapped(money(pipeline.netProfitTrapped))}</>}
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
                <div className="truncate">{t.lotNumber(String(l.lotNumber ?? "?"))}</div>
                <div className="truncate text-xs text-muted-foreground">{l.buyerName ?? (l.stage === "available" ? t.unsold : "—")}</div>
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
  const common = useCommonStrings();
  const t = useRealmMapStrings().campaign;
  const label = common.campaign[c.state];
  return (
    <section className={cn("rounded-lg border p-3", meta.badge)} aria-label={t.aria} data-testid="campaign" data-state={c.state}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-heading text-xs uppercase tracking-[0.2em]">{t.title(label)}</div>
        <div className="text-xs tabular">{t.covered(pct(c.pctCovered, 0))}</div>
      </div>
      <div className="mt-1 text-xs text-foreground/80">{c.reason}</div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
        <motion.div className="h-full rounded-full bg-current" initial={{ width: 0 }} animate={{ width: `${c.pctCovered}%` }} transition={{ duration: 1 }} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-foreground/90">
        <dt className="text-muted-foreground">{t.goal}</dt>
        <dd className="text-right tabular">{money(c.target)}</dd>
        <dt className="text-muted-foreground">{t.soldSoFar}</dt>
        <dd className="text-right tabular">{money(c.recovered)}</dd>
        <dt className="text-muted-foreground">{t.lotsLeft}</dt>
        <dd className="text-right tabular">
          {t.ofUnsold(String(c.lotsLeftToCover ?? "—"), c.lotsUnsold)}
          {c.lotsShort > 0 ? t.short(c.lotsShort) : ""}
        </dd>
        <dt className="text-muted-foreground">{t.reservationsWaiting}</dt>
        <dd className={cn("text-right tabular", c.reservedLots > 0 && "text-stage-reserved")} data-testid="campaign-reserved" data-value={c.reservedLots}>
          {c.reservedLots}
        </dd>
        <dt className="text-muted-foreground">{t.lastClosing}</dt>
        <dd className="text-right tabular">{c.lastClosingDate ? `${date(c.lastClosingDate)} · ${t.daysAgo(c.daysSinceLastClosing ?? 0)}` : t.noneYet}</dd>
        {c.interestAccruing && (
          <>
            <dt className="text-muted-foreground">{t.interestAccrued}</dt>
            <dd className="text-right tabular">{money(c.accruedInterest)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
