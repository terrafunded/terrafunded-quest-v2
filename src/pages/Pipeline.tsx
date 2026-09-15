import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Hourglass } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import type { StuckLot } from "@/domain";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Stat } from "@/components/realm/Stat";
import { Ellipsize } from "@/components/realm/FitMoney";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { ReverseFunnel } from "@/components/realm/ReverseFunnel";
import { usePipelineStrings } from "@/i18n/pipeline";
import { date, money, moneyExact, monthLabel, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Pipeline() {
  const { data, isLoading, error, refetch } = useRealm();
  const t = usePipelineStrings();
  const [farm, setFarm] = useState("all");

  const pipeline = data?.realm.pipeline;
  const farms = useMemo(() => (pipeline?.farms ?? []).filter((f) => f.stuck > 0).map((f) => f.farmName).sort(), [pipeline]);
  const stuck = useMemo<StuckLot[]>(() => (pipeline?.stuck ?? []).filter((s) => farm === "all" || s.farmName === farm), [pipeline, farm]);

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

      <ReverseFunnel goal={data.realm.goal} expected={data.realm.expected} />

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
          value={p.conversion.resolvedPct === null ? "—" : pct(p.conversion.resolvedPct)}
          hint={t.resolvedHint(p.conversion.closed, String(p.conversion.resolvedDenominator || "—"), data.realm.expected.conversionSource === "resolved")}
          valueClassName="text-stage-closed"
          data-testid="pipeline-page-conversion-resolved"
        />
        <Stat
          label={t.stillOpen}
          value={p.conversion.stillReserved}
          hint={t.stillOpenHint(date(p.conversion.cutoff))}
          valueClassName="text-stage-reserved"
          data-testid="pipeline-page-conversion-open"
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
          hint={t.blendedHint(p.conversion.closed, p.conversion.cohort, p.conversion.stillReserved, p.conversion.cancelled)}
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

      {stuck.length === 0 ? (
        <EmptyState title={t.emptyTitle} body={t.emptyBody(p.stuckAfterDays, farm !== "all" ? farm : "")} />
      ) : (
        <div className="parchment-card overflow-hidden">
          <Table className="min-w-[900px] max-sm:min-w-0" data-mobile="cards" data-testid="stuck-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-right">{t.col.daysWaiting}</TableHead>
                <TableHead>{t.col.lot}</TableHead>
                <TableHead>{t.col.buyer}</TableHead>
                <TableHead>{t.col.reserved}</TableHead>
                <TableHead>{t.col.estClosing}</TableHead>
                <TableHead className="text-right">{t.col.salePrice}</TableHead>
                <TableHead className="text-right">{t.col.netAtStake}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stuck.map((s) => (
                <TableRow key={s.propertyId} data-testid="stuck-row" data-days={s.daysWaiting}>
                  <TableCell data-label={t.col.daysWaiting} className="text-right">
                    <span className="inline-flex items-center gap-1 font-heading text-lg tabular text-siege">
                      <Hourglass className="h-3.5 w-3.5" />
                      {s.daysWaiting}
                    </span>
                  </TableCell>
                  <TableCell data-label={t.col.lot} className="whitespace-nowrap font-medium">
                    <Ellipsize>{s.lotName}</Ellipsize>
                  </TableCell>
                  <TableCell data-label={t.col.buyer} className="max-w-[260px]">
                    {s.buyerName ? (
                      <Ellipsize>{s.buyerName}</Ellipsize>
                    ) : s.buyerIsTestClient ? (
                      <span className="italic text-muted-foreground">{t.testClient}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell data-label={t.col.reserved} className="whitespace-nowrap tabular">{date(s.reservationDate)}</TableCell>
                  <TableCell data-label={t.col.estClosing} className="whitespace-nowrap tabular text-muted-foreground">{s.estimatedClosingDate ? date(s.estimatedClosingDate) : "—"}</TableCell>
                  <TableCell data-label={t.col.salePrice} className="text-right tabular">{moneyExact(s.salePrice)}</TableCell>
                  <TableCell data-label={t.col.netAtStake} className="text-right tabular font-medium text-siege">{moneyExact(s.netProfitAtStake)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow data-testid="stuck-totals">
                <TableCell className="font-heading" colSpan={5}>
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
