import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, Coins, Landmark, RefreshCw, Scroll } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { latestEvents, type RealmEvent } from "@/domain";
import { MILESTONE_STEP } from "@/config/goal";
import { FitMoney } from "@/components/realm/FitMoney";
import { ProgressRing } from "@/components/realm/ProgressRing";
import { GrowthBurst } from "@/components/realm/GrowthBurst";
import { QuestTree, type QuestNode } from "@/components/realm/QuestTree";
import { CinematicIntro } from "@/components/realm/CinematicIntro";
import { DebtCountdown } from "@/components/realm/DebtCountdown";
import { OxygenScore } from "@/components/realm/OxygenScore";
import { AmbientParticles } from "@/components/realm/AmbientParticles";
import { PipelinePanel } from "@/components/realm/PipelinePanel";
import { Stat } from "@/components/realm/Stat";
import { EmptyState, ErrorState, LoadingState, TableErrorsBanner } from "@/components/realm/PageStates";
import { date, money, moneyCompact, monthLabel, number, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const EVENT_STYLE: Record<RealmEvent["kind"], { label: string; className: string }> = {
  reservation: { label: "Reserved", className: "text-stage-reserved" },
  cancellation: { label: "Cancelled", className: "text-ember" },
  closing: { label: "Closed", className: "text-stage-closed" },
  note_sale: { label: "Note sold", className: "text-stage-note_sold" },
  distribution: { label: "Paid out", className: "text-sponsor" },
  farm_acquired: { label: "Farm", className: "text-oxygen" },
  milestone: { label: "Milestone", className: "text-gold" },
  liberation: { label: "Freed", className: "text-liberty" },
};

export function ThroneRoom() {
  const { data, isLoading, error, refetch } = useRealm();

  const questNodes = useMemo<QuestNode[]>(() => {
    if (!data) return [];
    const milestones = data.realm.events.filter((e) => e.kind === "milestone");
    return Array.from({ length: 10 }, (_, i) => {
      const target = (i + 1) * MILESTONE_STEP;
      const hit = milestones.find((m) => m.milestone === target);
      return { id: `m${i + 1}`, label: `${i + 1}M`, target, reached: !!hit, reachedAt: hit?.date ?? null };
    });
  }, [data]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const { realm, tableErrors } = data;
  const g = realm.goal;
  const x = realm.expected;
  const recent = latestEvents(realm.events, 5, ["reservation", "cancellation", "closing", "note_sale", "distribution", "liberation"]);
  const rot = realm.rotation;
  const plan = realm.warPlan.rotation;
  const turnsNeeded = plan.turnsNeeded === null ? "—" : Number.isInteger(plan.turnsNeeded) ? String(plan.turnsNeeded) : plan.turnsNeeded.toFixed(1);

  if (realm.lots.length === 0) {
    return (
      <>
        <TableErrorsBanner errors={tableErrors} />
        <EmptyState title="The realm is empty" body="No lots were found on subdivided farms. Check the Data Quality panel and table permissions." />
      </>
    );
  }

  return (
    <div className="space-y-8">
      <CinematicIntro story={realm.story} />
      <TableErrorsBanner errors={tableErrors} />

      <section className="relative overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-b from-card/90 to-background/40 px-5 py-10 text-center shadow-[0_0_120px_-40px_hsl(var(--gold)/0.6)] sm:px-10 sm:py-14">
        <AmbientParticles />
        <GrowthBurst trigger={g.netProfitToDate} className="pointer-events-none absolute inset-0 left-1/2 top-1/2" />
        <h1 className="stat-label">Throne Room · Net profit chronicled · as of {date(g.asOf)}</h1>
        <div className="mt-3 grid items-end gap-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto w-full max-w-full font-display text-[clamp(1.75rem,9vw,4.5rem)] leading-none"
            >
              <FitMoney value={g.netProfitToDate} className="gold-shimmer text-center" data-testid="net-profit-counter" />
            </motion.div>
            <div className="mt-2 text-sm text-muted-foreground">
              of <span className="text-foreground">{money(g.goal)}</span> · <span className="text-foreground tabular">{money(g.remaining)}</span> remaining · closings only
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0 rounded-xl border border-stage-reserved/30 bg-background/40 px-4 py-3 text-left"
            data-testid="committed"
            aria-label="Committed net profit from live reservations"
          >
            <div className="stat-label text-stage-reserved">Committed · {x.liveReservations} live {x.liveReservations === 1 ? "reservation" : "reservations"}</div>
            <div className="mt-1 font-display text-[clamp(1.5rem,6vw,2.5rem)] leading-none text-stage-reserved">
              <FitMoney value={x.committedNetProfit} data-testid="committed-counter" />
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground" data-testid="committed-when">
              {x.liveReservations === 0 ? (
                "no reservation is waiting to close"
              ) : (
                <>
                  {money(x.netProfitAtStake)} at stake × {pct(x.conversionPct, 0)} conversion = this figure
                  {x.landsBy && (
                    <>
                      {" "}
                      · expected by <span className="text-foreground" data-testid="committed-lands-by">{monthLabel(x.landsBy)}</span>
                    </>
                  )}
                  {x.overdueCount > 0 && (
                    <span className="text-ember">
                      {" "}
                      · {x.overdueCount} overdue ({moneyCompact(x.overdueNetProfit)})
                    </span>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>

        <div className="mt-8 grid items-center gap-6 sm:grid-cols-[auto_1fr] sm:text-left">
          <ProgressRing value={g.pctComplete} size={150} className="mx-auto">
            <div className="font-heading text-3xl text-gold tabular">{g.pctComplete.toFixed(1)}%</div>
            <div className="stat-label">complete</div>
          </ProgressRing>
          <div className="space-y-3">
            <p className="font-heading text-lg leading-snug text-foreground sm:text-xl" data-testid="verdict">
              {g.verdict.startsWith("You need")
                ? g.verdict.replace("lots/month", "lots/month from the ledger average")
                : g.verdict}
            </p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p data-testid="pace-line-reservations">
                Reserving <strong className="text-stage-reserved tabular">{number(x.reservationsPerMonth)}</strong>/month, closing{" "}
                <strong className="text-stage-closed tabular">{number(x.closingsPerMonth)}</strong>/month
                <span className="text-xs" data-testid="pace-window">
                  {" "}
                  · {x.trailingEraClipped && realm.era ? `${realm.era.since} (${x.trailingDays} days)` : `trailing ${x.trailingWindowDays} days`}
                </span>
              </p>
              <p data-testid="pace-line-required">
                Need <strong className="text-foreground tabular">{x.requiredReservationsPerMonth === null ? "—" : number(x.requiredReservationsPerMonth)}</strong> reservations/month
                <span className="text-xs">
                  {" "}
                  · {x.requiredClosingsPerMonth === null ? "—" : number(x.requiredClosingsPerMonth)} closings/month at {pct(x.conversionPct, 0)} conversion from the ledger average
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground sm:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-gold" />
                <span data-testid="days-to-deadline">
                  <strong className="text-foreground tabular">{number(g.daysToDeadline)}</strong> days to {date(g.deadline)}
                </span>
              </span>
              <span>
                <strong className="text-foreground tabular">{g.lotsStillNeeded ?? "—"}</strong> lots still needed ·{" "}
                <strong className="text-foreground tabular">{g.farmsStillNeeded ?? "—"}</strong> more farms
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-8 grid gap-3 text-left sm:grid-cols-3" aria-label="This month" data-testid="this-month">
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">Reservations this month</dt>
            <dd className="mt-1 font-heading text-2xl tabular text-stage-reserved" data-testid="this-month-reservations" data-value={x.thisMonth.reservations}>
              {x.thisMonth.reservations}
            </dd>
            <dd className="text-[11px] text-muted-foreground">pledged in {monthLabel(x.thisMonth.month)}</dd>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">Closings this month</dt>
            <dd className="mt-1 font-heading text-2xl tabular text-stage-closed" data-testid="this-month-closings" data-value={x.thisMonth.closings}>
              {x.thisMonth.closings}
            </dd>
            <dd className="text-[11px] text-muted-foreground">
              {x.thisMonth.expectedReservations > 0
                ? `${x.thisMonth.expectedReservations} more expected to close by month end`
                : `closed in ${monthLabel(x.thisMonth.month)}`}
            </dd>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">Expected next month</dt>
            <dd className="mt-1 font-heading text-2xl tabular text-foreground" data-testid="next-month-expected" data-value={x.nextMonth.expectedClosings}>
              {number(x.nextMonth.expectedClosings)}
            </dd>
            <dd className="text-[11px] text-muted-foreground">
              closings in {monthLabel(x.nextMonth.month)} from {x.nextMonth.expectedReservations} {x.nextMonth.expectedReservations === 1 ? "reservation" : "reservations"} already made
            </dd>
          </div>
        </dl>

        <QuestTree nodes={questNodes} current={g.netProfitToDate} className="mt-8" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]" aria-label="The Debt and Oxygen">
        <DebtCountdown debt={realm.debt} />
        <OxygenScore oxygen={realm.oxygen} />
      </section>

      <PipelinePanel pipeline={realm.pipeline} />

      <section className="parchment-card p-4 sm:p-5" aria-label="Rotation" data-testid="rotation-strip">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">
            <RefreshCw className="mr-2 inline h-4 w-4" />
            Rotation · land capital turning
          </h2>
          <Link to="/warplan" className="touch-link text-xs text-muted-foreground hover:text-foreground">
            the war plan →
          </Link>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">Capital outstanding</dt>
            <dd className="mt-1 font-heading text-xl tabular text-sponsor" data-testid="rotation-outstanding">
              {money(rot.capitalOutstanding)}
            </dd>
            <dd className="text-[11px] text-muted-foreground">land capital still out with sponsors</dd>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">Benchmark turn</dt>
            <dd className="mt-1 font-heading text-xl tabular" data-testid="rotation-benchmark">
              {rot.cycleDays === null ? "—" : `${number(rot.cycleDays)} days`}
            </dd>
            <dd className="text-[11px] text-muted-foreground" data-testid="rotation-benchmark-hint">
              {rot.benchmark ? `${rot.benchmark.farmName} · ${rot.benchmark.months.toFixed(1)} months${rot.benchmark.projected ? ", projected" : ""}` : "no farm freed, none projectable"}
              {rot.sinceLabel && (
                <>
                  {" "}
                  · farms funded {rot.sinceLabel}
                  {rot.excludedCycles.length > 0 && ` (${rot.excludedCycles.map((c) => c.farmName).join(", ")} freed earlier, on record only)`}
                </>
              )}
            </dd>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">Turns completed</dt>
            <dd className="mt-1 font-heading text-xl tabular text-liberty" data-testid="rotation-turns-completed">
              {rot.turnsCompleted}
            </dd>
            <dd className="text-[11px] text-muted-foreground">{rot.turnsCompleted === 1 ? "farm freed" : "farms freed"} — capital fully back</dd>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">Turns still needed</dt>
            <dd className="mt-1 font-heading text-xl tabular text-gold" data-testid="rotation-turns-needed">
              {turnsNeeded}
            </dd>
            <dd className="text-[11px] text-muted-foreground">
              {plan.turnsNeeded === null ? "no capital has to turn" : `${money(plan.peakOutstanding)} rotating across ${plan.farms} ${plan.farms === 1 ? "farm" : "farms"}`}
              {plan.turnsIncomplete > 0 && <span className="text-ember"> · {plan.turnsIncomplete} not back by the deadline</span>}
            </dd>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">Next liberation</dt>
            <dd className="mt-1 truncate font-heading text-xl" data-testid="rotation-next">
              {rot.nextLiberation?.farmName ?? "—"}
            </dd>
            <dd className="text-[11px] text-muted-foreground tabular">
              {rot.nextLiberation
                ? rot.nextLiberation.daysToGo === null
                  ? `${(100 - rot.nextLiberation.pctReturned).toFixed(0)}% of capital still to return`
                  : rot.nextLiberation.daysToGo === 0
                    ? "lots covered, awaiting payout"
                    : `${number(rot.nextLiberation.daysToGo)} days to go · ${date(rot.nextLiberation.projectedLiberationDate)}`
                : "every sponsor-funded farm is free"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key figures">
        <Stat label="Cash realized" value={money(g.cashRealized)} hint="Down payments + note sales, money in the door" valueClassName="text-stage-closed" />
        <Stat label="Profit on paper" value={money(g.profitOnPaper)} hint="Net profit recognized but not yet cash" />
        <Stat
          label="Pipeline profit"
          value={money(g.netProfitInPipeline)}
          hint={`${g.reservedLots} reserved lots, if every one closes as priced · ${money(x.committedNetProfit)} committed at ${pct(x.conversionPct, 0)} · ${money(realm.pipeline.netProfitTrapped)} stuck`}
          valueClassName="text-stage-reserved"
        />
        <Stat
          label="Capital outstanding"
          value={
            <span data-testid="key-capital-outstanding" data-value={realm.debt.capitalOwed}>
              {money(realm.debt.capitalOwed)}
            </span>
          }
          hint={
            <span data-testid="key-capital-outstanding-hint">
              Still owed to sponsors
              {realm.debt.ownCapitalOutstanding > 0 ? (
                <span data-testid="key-own-capital">
                  {" · + "}
                  {money(realm.debt.ownCapitalOutstanding)} own capital tied up
                </span>
              ) : null}
            </span>
          }
          valueClassName="text-sponsor"
          data-testid="key-capital-outstanding-stat"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="parchment-card min-w-0 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">Live chronicle</h2>
            <Link to="/chronicle" className="touch-link inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Full chronicle <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <ol className="divide-y divide-border/60">
              {recent.map((e, i) => {
                const style = EVENT_STYLE[e.kind];
                return (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="flex items-start gap-3 py-2.5 text-sm"
                  >
                    <span className={cn("w-20 shrink-0 text-[10px] uppercase tracking-wider", style.className)}>{style.label}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{e.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{realm.narrative.get(e.id)}</span>
                    </span>
                    <span className="w-24 shrink-0 text-right tabular text-foreground">{e.amount !== null ? moneyCompact(e.amount) : "—"}</span>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <Link to="/quests" className="parchment-card group flex items-center gap-4 p-4 transition-colors hover:border-gold/40">
            <Scroll className="h-6 w-6 text-gold" />
            <div className="min-w-0">
              <div className="font-heading">Quests</div>
              <div className="truncate text-xs text-muted-foreground">
                {g.closedLots} closed · {g.reservedLots} reserved · {g.availableLots} available
              </div>
            </div>
          </Link>
          <Link to="/sponsors" className="parchment-card group flex items-center gap-4 p-4 transition-colors hover:border-gold/40">
            <Landmark className="h-6 w-6 text-gold" />
            <div className="min-w-0">
              <div className="font-heading">Sponsors</div>
              <div className="truncate text-xs text-muted-foreground">{realm.investors.filter((i) => i.capitalDeployed > 0).length} sponsors funding {realm.farms.length} farms</div>
            </div>
          </Link>
          <Link to="/treasury" className="parchment-card group flex items-center gap-4 p-4 transition-colors hover:border-gold/40">
            <Coins className="h-6 w-6 text-gold" />
            <div className="min-w-0">
              <div className="font-heading">Treasury</div>
              <div className="truncate text-xs text-muted-foreground">
                {money(realm.treasury.totalCashIn)} in · {money(realm.treasury.totalCashOut)} out
              </div>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
