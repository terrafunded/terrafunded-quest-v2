import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Hourglass } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import type { StuckLot } from "@/domain";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stat } from "@/components/realm/Stat";
import { Ellipsize } from "@/components/realm/FitMoney";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { ReverseFunnel } from "@/components/realm/ReverseFunnel";
import { ReservationAgingSection } from "@/components/realm/ReservationAgingSection";
import { usePipelineStrings } from "@/i18n/pipeline";
import { date, money, moneyExact, monthLabel, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Pipeline() {
  const { data, isLoading, error, refetch } = useRealm();
  const t = usePipelineStrings();
  const [params] = useSearchParams();
  const [farm, setFarm] = useState(params.get("farm") ?? "all");

  const pipeline = data?.realm.pipeline;
  const farms = useMemo(() => (pipeline?.farms ?? []).filter((f) => f.stuck > 0).map((f) => f.farmName).sort(), [pipeline]);
  const byFarm = (rows: StuckLot[]) => rows.filter((s) => farm === "all" || s.farmName === farm);
  const stuck = useMemo<StuckLot[]>(() => byFarm(pipeline?.stuckActive ?? []), [pipeline, farm]);
  const nearClosing = useMemo<StuckLot[]>(() => byFarm(pipeline?.nearClosing ?? []), [pipeline, farm]);
  const flagged = useMemo<StuckLot[]>(() => byFarm(pipeline?.flagged ?? []), [pipeline, farm]);
  const bottleneck = useMemo(() => {
    const stages = pipeline?.stageBottleneck ?? [];
    if (farm === "all") return stages;
    return stages
      .map((s) => {
        const lots = s.lots.filter((l) => l.farmName === farm);
        return {
          ...s,
          lots,
          count: lots.length,
          salePrice: lots.reduce((a, l) => a + (l.salePrice ?? 0), 0),
        };
      })
      .filter((s) => s.count > 0)
      .sort((a, b) => b.salePrice - a.salePrice || b.count - a.count);
  }, [pipeline, farm]);

  if (isLoading) return <LoadingState rows={8} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || !pipeline) return null;

  const p = pipeline;
  const trappedShown = stuck.reduce((a, s) => a + s.netProfitAtStake, 0);
  const salesShown = stuck.reduce((a, s) => a + (s.salePrice ?? 0), 0);
  const paceHint = p.trailingEraClipped
    ? t.paceHintSince(monthLabel(p.trailingSince.slice(0, 7)), p.trailingDays, p.newReservationsTrailing, p.reservationsMadeTrailing)
    : t.paceHintTrailing(p.trailingWindowDays, p.newReservationsTrailing, p.reservationsMadeTrailing);

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle(p.stuckAfterDays)}>
        <Select value={farm} onChange={(e) => setFarm(e.target.value)} aria-label={t.filterFarm} className="w-44">
          <option value="all">{t.allFarms}</option>
          {farms.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Link to="/quests?filter=stuck" className="touch-link inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {t.inLedger} <ArrowRight className="h-3 w-3" />
        </Link>
      </PageHeader>

      <TableErrorsBanner errors={data.tableErrors} />

      <ReservationAgingSection aging={data.realm.reservationAging} asOf={data.realm.asOf} />

      <ReverseFunnel goal={data.realm.goal} expected={data.realm.expected} conversion={p.conversion} />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label={t.figuresAria}>
        <Stat
          label={t.trapped}
          value={money(p.netProfitTrapped)}
          hint={t.trappedHint(p.stuckCount, p.reserved, p.stuckAfterDays, money(p.salePriceTrapped))}
          valueClassName="text-siege"
          data-testid="pipeline-page-trapped"
        />
        <Stat
          label={t.reservationsVsClosings}
          value={
            <>
              <span className="text-siege">{p.reservationsPerMonth}</span> <span className="text-muted-foreground">vs</span>{" "}
              <span className="text-stage-closed">{p.closedLotsPerMonth}</span>
            </>
          }
          hint={paceHint}
        />
        <Stat
          label={t.resolvedConversion}
          value={
            <span className="text-pretty text-base leading-snug sm:text-xl" data-testid="pipeline-conversion-statement">
              {p.conversion.resolvedPct === null
                ? "—"
                : t.resolvedStatement(pct(p.conversion.resolvedPct), p.conversion.closed, p.conversion.resolvedDenominator, p.conversion.stillReserved)}
            </span>
          }
          hint={
            <>
              {t.resolvedHint(p.conversion.closed, String(p.conversion.resolvedDenominator || "—"), data.realm.expected.conversionSource === "resolved")}
              {p.conversion.thinSample && (
                <p className="mt-1 text-ember" data-testid="pipeline-conversion-warning">
                  {t.resolvedWarning}
                </p>
              )}
            </>
          }
          valueClassName="text-stage-closed"
          data-testid="pipeline-page-conversion-resolved"
        />
        <Stat
          label={t.blendedConversion}
          value={
            <>
              {p.conversion.pct === null ? "—" : pct(p.conversion.pct)}
              {p.conversion.pctWithCancellations !== null && p.conversion.pctWithCancellations !== p.conversion.pct && (
                <span className="text-muted-foreground">{t.inclCancellations(pct(p.conversion.pctWithCancellations))}</span>
              )}
            </>
          }
          hint={`${t.blendedLabel}. ${t.blendedHint(p.conversion.closed, p.conversion.cohort, p.conversion.stillReserved, p.conversion.cancelled)}`}
          data-testid="pipeline-page-conversion"
        />
        <Stat
          label={t.cancellationRate}
          value={p.conversion.cancellationRatePct === null ? "—" : pct(p.conversion.cancellationRatePct)}
          hint={t.cancellationHint(p.conversion.cancelled, p.conversion.cohortWithCancellations, p.cancelledReservations)}
          valueClassName={p.conversion.cancellationRatePct ? "text-ember" : undefined}
          data-testid="pipeline-page-cancellation-rate"
        />
        <Stat
          label={t.medianDays}
          value={p.medianDaysToClose === null ? "—" : `${p.medianDaysToClose}d`}
          hint={t.medianHint(p.closedWithBothDates)}
        />
      </section>

      <section className="mb-6 parchment-card p-4" aria-label={t.perFarm}>
        <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.perFarm}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {p.farms.map((f) => (
            <div key={f.farmId} className={cn("rounded-md border border-border/60 bg-background/40 p-3 text-sm", f.stuck > 0 && "border-siege/36")} data-testid="pipeline-farm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-heading">{f.farmName}</span>
                <span className="tabular text-xs text-muted-foreground">{t.median(f.medianDaysToClose === null ? "—" : `${f.medianDaysToClose}d`)}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                <span className={cn(f.stuck > 0 && "[&_*]:text-siege")}>{t.farmLine(f.reserved, f.stuck)}</span>
                {f.stuck > 0 && <>{t.trappedAmount(money(f.netProfitTrapped))}</>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {bottleneck.length > 0 && (
        <section className="mb-6 parchment-card p-4" aria-label={t.bottleneckAria} data-testid="stage-bottleneck">
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.bottleneckTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.bottleneckHint}</p>
          <div className="mt-3 overflow-x-auto">
            <Table className="min-w-[640px] max-sm:min-w-0" data-mobile="cards">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t.bottleneckStage}</TableHead>
                  <TableHead className="text-right">{t.bottleneckCount}</TableHead>
                  <TableHead className="text-right">{t.bottleneckValue}</TableHead>
                  <TableHead className="text-right">{t.bottleneckMedian}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bottleneck.map((s, i) => (
                  <TableRow key={s.stageName || "none"} data-testid="bottleneck-row" data-top={i === 0 ? "true" : "false"}>
                    <TableCell data-label={t.bottleneckStage} className={cn("font-medium", i === 0 && "text-siege")}>
                      {s.stageName || t.noStage}
                      {s.stageNumber !== null && <span className="ml-1 text-xs text-muted-foreground">· {s.stageNumber}</span>}
                    </TableCell>
                    <TableCell data-label={t.bottleneckCount} className="text-right tabular">{s.count}</TableCell>
                    <TableCell data-label={t.bottleneckValue} className="text-right tabular font-medium">{moneyExact(s.salePrice)}</TableCell>
                    <TableCell data-label={t.bottleneckMedian} className="text-right tabular">{s.medianDaysWaiting === null ? "—" : `${s.medianDaysWaiting}d`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {flagged.length > 0 && (
        <section className="mb-6 parchment-card border-ember/40 p-4" aria-label={t.flaggedAria} data-testid="flagged-stages">
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-ember">{t.flaggedTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.flaggedHint}</p>
          <ul className="mt-3 space-y-2">
            {flagged.map((s) => (
              <li key={s.propertyId} className="flex flex-wrap items-baseline justify-between gap-2 text-sm" data-testid="flagged-row" data-blocked={s.hasBlockedStages} data-overdue={s.hasOverdueStages}>
                <span className="font-medium">
                  {s.lotName}
                  {s.hasBlockedStages && <span className="ml-2 text-[11px] uppercase text-ember">{t.flagBlocked}</span>}
                  {s.hasOverdueStages && <span className="ml-2 text-[11px] uppercase text-ember">{t.flagOverdue}</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.currentStageName || t.noStage} · {moneyExact(s.salePrice)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nearClosing.length > 0 && (
        <section className="mb-6 parchment-card border-stage-closed/30 p-4" aria-label={t.nearClosingAria} data-testid="near-closing">
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-stage-closed">{t.nearClosingTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.nearClosingHint}</p>
          <ul className="mt-3 space-y-2">
            {nearClosing.map((s) => (
              <li key={s.propertyId} className="flex flex-wrap items-baseline justify-between gap-2 text-sm" data-testid="near-closing-row">
                <span className="font-medium">
                  {s.lotName}
                  <span className="ml-2 text-[11px] uppercase text-stage-closed">{t.flagNear}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.progressPct === null ? "—" : pct(s.progressPct, 0)}
                  {s.estimatedClosingDate ? ` · ${date(s.estimatedClosingDate)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stuck.length === 0 ? (
        <EmptyState title={t.emptyTitle} body={t.emptyBody(p.stuckAfterDays, farm !== "all" ? farm : "")} />
      ) : (
        <div className="parchment-card overflow-hidden">
          <h2 className="px-4 pt-4 font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.stuckTitle}</h2>
          <Table className="min-w-[1100px] max-sm:min-w-0" data-mobile="cards" data-testid="stuck-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-right">{t.col.daysWaiting}</TableHead>
                <TableHead>{t.col.lot}</TableHead>
                <TableHead>{t.col.stage}</TableHead>
                <TableHead className="text-right">{t.col.progress}</TableHead>
                <TableHead>{t.col.estClosing}</TableHead>
                <TableHead className="text-right">{t.col.lastUpdate}</TableHead>
                <TableHead className="text-right">{t.col.salePrice}</TableHead>
                <TableHead className="text-right">{t.col.netAtStake}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stuck.map((s) => (
                <TableRow key={s.propertyId} data-testid="stuck-row" data-days={s.daysWaiting} data-severity={s.severity}>
                  <TableCell data-label={t.col.daysWaiting} className="text-right">
                    <span className="inline-flex items-center gap-1 font-heading text-lg tabular text-siege">
                      <Hourglass className="h-3.5 w-3.5" />
                      {s.daysWaiting}
                    </span>
                  </TableCell>
                  <TableCell data-label={t.col.lot} className="font-medium">
                    <div className="text-[11px] text-muted-foreground">{s.farmName}</div>
                    <Ellipsize>{s.lotName}</Ellipsize>
                    {s.buyerName ? <div className="text-[11px] text-muted-foreground"><Ellipsize>{s.buyerName}</Ellipsize></div> : null}
                  </TableCell>
                  <TableCell data-label={t.col.stage}>
                    <span className="text-pretty">{s.currentStageName || t.noStage}</span>
                    {s.currentStageNumber !== null && <span className="ml-1 text-xs text-muted-foreground">· {s.currentStageNumber}</span>}
                    {(s.hasBlockedStages || s.hasOverdueStages) && (
                      <div className="text-[11px] uppercase text-ember">
                        {s.hasBlockedStages ? t.flagBlocked : ""}
                        {s.hasBlockedStages && s.hasOverdueStages ? " · " : ""}
                        {s.hasOverdueStages ? t.flagOverdue : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell data-label={t.col.progress} className="text-right tabular">{s.progressPct === null ? "—" : pct(s.progressPct, 0)}</TableCell>
                  <TableCell data-label={t.col.estClosing} className="whitespace-nowrap tabular text-muted-foreground">{s.estimatedClosingDate ? date(s.estimatedClosingDate) : "—"}</TableCell>
                  <TableCell data-label={t.col.lastUpdate} className="text-right tabular text-muted-foreground">{s.daysSinceUpdate === null ? "—" : `${s.daysSinceUpdate}d`}</TableCell>
                  <TableCell data-label={t.col.salePrice} className="text-right tabular">{moneyExact(s.salePrice)}</TableCell>
                  <TableCell data-label={t.col.netAtStake} className="text-right tabular font-medium text-siege">{moneyExact(s.netProfitAtStake)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow data-testid="stuck-totals">
                <TableCell className="font-heading" colSpan={6}>
                  {t.totals(stuck.length)}
                </TableCell>
                <TableCell className="text-right tabular">{moneyExact(salesShown)}</TableCell>
                <TableCell className="text-right tabular font-semibold text-siege" data-testid="stuck-total-trapped">
                  {moneyExact(trappedShown)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
