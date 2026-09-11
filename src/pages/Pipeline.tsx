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
import { date, money, moneyExact, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The reservations layer in full: what is waiting, what is stuck, how long closings take.
 * None of this feeds net profit, pace, oxygen or the goal date — closings alone do that.
 */
export default function Pipeline() {
  const { data, isLoading, error, refetch } = useRealm();
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

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={`Reservations lead, closings pay. Every reserved lot with no closing after ${p.stuckAfterDays} days, sorted by days waiting. Nothing on this page counts toward net profit or the goal date until it closes.`}
      >
        <Select value={farm} onChange={(e) => setFarm(e.target.value)} aria-label="Filter stuck lots by farm" className="w-44">
          <option value="all">All farms</option>
          {farms.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Link to="/quests?filter=stuck" className="touch-link inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          in the ledger <ArrowRight className="h-3 w-3" />
        </Link>
      </PageHeader>

      <TableErrorsBanner errors={data.tableErrors} />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Pipeline figures">
        <Stat
          label="Profit trapped in reservations"
          value={money(p.netProfitTrapped)}
          hint={`${p.stuckCount} of ${p.reserved} reservations waiting ${p.stuckAfterDays}+ days · ${money(p.salePriceTrapped)} of sales`}
          valueClassName="text-siege"
          data-testid="pipeline-page-trapped"
        />
        <Stat
          label="Reservations vs closings / mo"
          value={
            <>
              <span className="text-siege">{p.reservationsPerMonth}</span> <span className="text-muted-foreground">vs</span>{" "}
              <span className="text-stage-closed">{p.closedLotsPerMonth}</span>
            </>
          }
          hint={`trailing ${p.trailingWindowDays} days · ${p.newReservationsTrailing} new reservations still waiting, ${p.reservationsMadeTrailing} made in total`}
        />
        <Stat
          label="Reservation → closing conversion"
          value={
            <>
              {p.conversion.pct === null ? "—" : pct(p.conversion.pct)}
              {p.conversion.pctWithCancellations !== null && p.conversion.pctWithCancellations !== p.conversion.pct && <span className="text-muted-foreground"> · {pct(p.conversion.pctWithCancellations)} incl. cancellations</span>}
            </>
          }
          hint={`${p.conversion.closed} of ${p.conversion.cohort} reservations made on or before ${date(p.conversion.cutoff)} have closed; ${p.conversion.stillReserved} still waiting; ${p.conversion.cancelled} cancelled`}
          data-testid="pipeline-page-conversion"
        />
        <Stat
          label="Cancellation rate"
          value={p.conversion.cancellationRatePct === null ? "—" : pct(p.conversion.cancellationRatePct)}
          hint={`${p.conversion.cancelled} matured reservations whose only file case was cancelled, out of ${p.conversion.cohortWithCancellations} · ${p.cancelledReservations} cancelled in all, counted as conversion failures in the War Plan`}
          valueClassName={p.conversion.cancellationRatePct ? "text-ember" : undefined}
          data-testid="pipeline-page-cancellation-rate"
        />
        <Stat
          label="Median days to close"
          value={p.medianDaysToClose === null ? "—" : `${p.medianDaysToClose}d`}
          hint={`over ${p.closedWithBothDates} closed lots with both dates · per farm below`}
        />
      </section>

      <section className="mb-6 parchment-card p-4" aria-label="Per farm">
        <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">Per farm</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {p.farms.map((f) => (
            <div key={f.farmId} className={cn("rounded-md border border-border/60 bg-background/40 p-3 text-sm", f.stuck > 0 && "border-siege/36")} data-testid="pipeline-farm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-heading">{f.farmName}</span>
                <span className="tabular text-xs text-muted-foreground">median {f.medianDaysToClose === null ? "—" : `${f.medianDaysToClose}d`}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {f.reserved} reserved · <span className={cn(f.stuck > 0 && "text-siege")}>{f.stuck} stuck</span>
                {f.stuck > 0 && <> · {money(f.netProfitTrapped)} trapped</>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {stuck.length === 0 ? (
        <EmptyState title="Nothing stuck" body={`No reservation has waited ${p.stuckAfterDays} days without closing${farm !== "all" ? ` on ${farm}` : ""}.`} />
      ) : (
        <div className="parchment-card overflow-hidden">
          <Table className="min-w-[900px] max-sm:min-w-0" data-mobile="cards" data-testid="stuck-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-right">Days waiting</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Reserved</TableHead>
                <TableHead>Est. closing</TableHead>
                <TableHead className="text-right">Sale price</TableHead>
                <TableHead className="text-right">Net profit at stake</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stuck.map((s) => (
                <TableRow key={s.propertyId} data-testid="stuck-row" data-days={s.daysWaiting}>
                  <TableCell data-label="Days waiting" className="text-right">
                    <span className="inline-flex items-center gap-1 font-heading text-lg tabular text-siege">
                      <Hourglass className="h-3.5 w-3.5" />
                      {s.daysWaiting}
                    </span>
                  </TableCell>
                  <TableCell data-label="Lot" className="whitespace-nowrap font-medium">
                    <Ellipsize>{s.lotName}</Ellipsize>
                  </TableCell>
                  <TableCell data-label="Buyer" className="max-w-[260px]">
                    {s.buyerName ? (
                      <Ellipsize>{s.buyerName}</Ellipsize>
                    ) : s.buyerIsTestClient ? (
                      <span className="italic text-muted-foreground">test client</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell data-label="Reserved" className="whitespace-nowrap tabular">{date(s.reservationDate)}</TableCell>
                  <TableCell data-label="Est. closing" className="whitespace-nowrap tabular text-muted-foreground">{s.estimatedClosingDate ? date(s.estimatedClosingDate) : "—"}</TableCell>
                  <TableCell data-label="Sale price" className="text-right tabular">{moneyExact(s.salePrice)}</TableCell>
                  <TableCell data-label="Net at stake" className="text-right tabular font-medium text-siege">{moneyExact(s.netProfitAtStake)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow data-testid="stuck-totals">
                <TableCell className="font-heading" colSpan={5}>
                  Totals · {stuck.length} stuck reservations
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
