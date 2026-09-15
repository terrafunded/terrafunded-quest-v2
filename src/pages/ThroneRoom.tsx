import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, Coins, Landmark, RefreshCw, Scroll } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import {
  engineDefaultsFromRealm,
  latestEvents,
  reconcileThroneAndEngine,
  runEngine,
  type RealmEvent,
} from "@/domain";
import { MILESTONE_STEP } from "@/config/goal";
import { FitMoney } from "@/components/realm/FitMoney";
import { ProgressRing } from "@/components/realm/ProgressRing";
import { GrowthBurst } from "@/components/realm/GrowthBurst";
import { QuestTree, type QuestNode } from "@/components/realm/QuestTree";
import { CinematicIntro } from "@/components/realm/CinematicIntro";
import { DebtCountdown } from "@/components/realm/DebtCountdown";
import { DeadlineGauge } from "@/components/realm/DeadlineGauge";
import { GoalCurve } from "@/components/realm/GoalCurve";
import { OxygenScore } from "@/components/realm/OxygenScore";
import { Pulse } from "@/components/realm/Pulse";
import { PulseCharts } from "@/components/realm/PulseCharts";
import { AmbientParticles } from "@/components/realm/AmbientParticles";
import { PipelinePanel } from "@/components/realm/PipelinePanel";
import { Reveal } from "@/components/realm/Reveal";
import { Stat } from "@/components/realm/Stat";
import { EmptyState, ErrorState, LoadingState, TableErrorsBanner } from "@/components/realm/PageStates";
import { useCommonStrings } from "@/i18n/common";
import { useLang } from "@/i18n/lang";
import { useThroneRoomStrings } from "@/i18n/throneRoom";
import { date, money, moneyCompact, monthLabel, number, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const EVENT_CLASS: Record<RealmEvent["kind"], string> = {
  reservation: "text-stage-reserved",
  cancellation: "text-ember",
  closing: "text-stage-closed",
  note_sale: "text-stage-note_sold",
  distribution: "text-sponsor",
  farm_acquired: "text-oxygen",
  milestone: "text-gold",
  liberation: "text-liberty",
};

export function ThroneRoom() {
  const { data, isLoading, error, refetch } = useRealm();
  const [lang] = useLang();
  const t = useThroneRoomStrings();
  const common = useCommonStrings();

  const questNodes = useMemo<QuestNode[]>(() => {
    if (!data) return [];
    const milestones = data.realm.events.filter((e) => e.kind === "milestone");
    return Array.from({ length: 10 }, (_, i) => {
      const target = (i + 1) * MILESTONE_STEP;
      const hit = milestones.find((m) => m.milestone === target);
      return { id: `m${i + 1}`, label: `${i + 1}M`, target, reached: !!hit, reachedAt: hit?.date ?? null };
    });
  }, [data]);

  const throneEngineReconcile = useMemo(() => {
    if (!data) return null;
    const farm = data.realm.rotation.benchmark?.farmName ?? null;
    const defaults = engineDefaultsFromRealm(data.realm, farm);
    const engine = runEngine(defaults.inputs, { ...data.realm, referencePace: defaults.referencePace });
    const basis = defaults.inputs.profitBasis === "era" ? "era" : "lifetime";
    return reconcileThroneAndEngine(data.realm.goal, engine, basis, lang);
  }, [data, lang]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const { realm, tableErrors } = data;
  const g = realm.goal;
  const x = realm.expected;
  const tsy = realm.treasury;
  const recent = latestEvents(realm.events, 5, ["reservation", "cancellation", "closing", "note_sale", "distribution", "liberation"]);
  const rot = realm.rotation;
  const plan = realm.warPlan.rotation;
  const turnsNeeded = plan.turnsNeeded === null ? "—" : Number.isInteger(plan.turnsNeeded) ? String(plan.turnsNeeded) : plan.turnsNeeded.toFixed(1);
  const conversionForecastLabel =
    x.conversionSource === "resolved"
      ? t.conversion.resolved
      : x.conversionSource === "with_cancellations"
        ? t.conversion.blendedIncl
        : x.conversionSource === "without_cancellations"
          ? t.conversion.blended
          : t.conversion.assumed;

  if (realm.lots.length === 0) {
    return (
      <>
        <TableErrorsBanner errors={tableErrors} />
        <EmptyState title={t.emptyTitle} body={t.emptyBody} />
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
        <h1 className="stat-label">{t.asOf(date(g.asOf))}</h1>
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
              {(() => {
                const goal = money(g.goal);
                const rem = money(g.remaining);
                const full = t.ofGoal(goal, rem);
                const i = full.indexOf(goal);
                const j = full.indexOf(rem, i + goal.length);
                if (i < 0 || j < 0) return full;
                return <>{full.slice(0, i)}<span className="text-foreground">{goal}</span>{full.slice(i + goal.length, j)}<span className="text-foreground tabular">{rem}</span>{full.slice(j + rem.length)}</>;
              })()}
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0 rounded-xl border border-stage-reserved/30 bg-background/40 px-4 py-3 text-left"
            data-testid="committed"
            aria-label={t.committedAria}
          >
            <div className="stat-label text-stage-reserved">{t.committed(x.liveReservations, common.reservations(x.liveReservations).replace(/^\d+\s+/, ""))}</div>
            <div className="mt-1 font-display text-[clamp(1.5rem,6vw,2.5rem)] leading-none text-stage-reserved">
              <FitMoney value={x.committedNetProfit} data-testid="committed-counter" />
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground" data-testid="committed-when">
              {x.liveReservations === 0 ? (
                t.noReservationWaiting
              ) : (
                <>
                  {money(x.netProfitAtStake)} at stake × {pct(x.conversionPct, 0)} {conversionForecastLabel} = this figure
                  <span className="text-muted-foreground/80"> (forecasts use {conversionForecastLabel})</span>
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

        <Pulse
          producing={realm.oxygen.netProfitPerDayAtPace}
          needed={realm.debt.requiredNetProfitPerDay}
          horizonYear={Number(g.deadline.slice(0, 4))}
        />

        <div className="mt-8 grid items-center gap-6 sm:grid-cols-[auto_1fr] sm:text-left">
          <ProgressRing value={g.pctComplete} size={150} className="mx-auto">
            <div className="font-heading text-3xl text-gold tabular">{g.pctComplete.toFixed(1)}%</div>
            <div className="stat-label">{t.complete}</div>
          </ProgressRing>
          <div className="space-y-3">
            <p className="font-heading text-lg leading-snug text-foreground sm:text-xl" data-testid="verdict">
              {g.verdict.includes(t.verdictLotsMonth)
                ? g.verdict.replace(t.verdictLotsMonth, t.verdictLotsMonthAnnotated)
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
                  · {x.requiredClosingsPerMonth === null ? "—" : number(x.requiredClosingsPerMonth)} closings/month at {pct(x.conversionPct, 0)}{" "}
                  {conversionForecastLabel}
                </span>
              </p>
              <p className="text-xs">
                Era average is the better estimator of today&apos;s business (excludes pre-operation closings). Lifetime keeps every closed lot.
              </p>
              <p data-testid="pace-era-avg" className="text-xs sm:text-sm">
                <span className="text-oxygen">Era</span>
                {g.recentSinceLabel ? ` ${g.recentSinceLabel}` : ""}:{" "}
                <strong className="text-foreground tabular">{g.recentAvgNetProfitPerClosedLot === null ? "—" : money(g.recentAvgNetProfitPerClosedLot)}</strong>
                /lot · <strong className="text-foreground tabular">{g.lotsStillNeededRecent ?? "—"}</strong> lots ·{" "}
                <strong className="text-foreground tabular">{g.farmsStillNeededRecent ?? "—"}</strong> farms · need{" "}
                <strong className="text-foreground tabular">{g.requiredLotsPerMonthToHitDeadlineRecent ?? "—"}</strong>/mo · lands{" "}
                <strong className="text-foreground tabular">{g.projectedDateRecent ? date(g.projectedDateRecent) : "—"}</strong>
                {g.recentClosedLots > 0 ? ` · ${g.recentClosedLots} closings` : ""}
              </p>
              <p data-testid="pace-lifetime-avg" className="text-xs sm:text-sm">
                <span className="text-muted-foreground">Lifetime</span>:{" "}
                <strong className="text-foreground tabular">{g.avgNetProfitPerClosedLot === null ? "—" : money(g.avgNetProfitPerClosedLot)}</strong>
                /lot · <strong className="text-foreground tabular">{g.lotsStillNeeded ?? "—"}</strong> lots ·{" "}
                <strong className="text-foreground tabular">{g.farmsStillNeeded ?? "—"}</strong> farms · need{" "}
                <strong className="text-foreground tabular">{g.requiredLotsPerMonthToHitDeadline ?? "—"}</strong>/mo · lands{" "}
                <strong className="text-foreground tabular">{g.projectedDate ? date(g.projectedDate) : "—"}</strong>
                {g.closedLots > 0 ? ` · ${g.closedLots} closings` : ""}
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
                {g.lotsStillNeededRecent !== null && (
                  <span className="text-xs">
                    {" "}
                    (era: {g.lotsStillNeededRecent} lots · {g.farmsStillNeededRecent ?? "—"} farms)
                  </span>
                )}
              </span>
            </div>
            {throneEngineReconcile && (!throneEngineReconcile.dollarsAgree || !throneEngineReconcile.farmsAgree) && (
              <p className="text-xs text-muted-foreground" data-testid="engine-throne-reconcile">
                Throne pace is unconstrained; the Engine caps inventory and capital turns
                {throneEngineReconcile.dollarReason ? ` — ${throneEngineReconcile.dollarReason}` : ""}
                {throneEngineReconcile.farmReason ? ` ${throneEngineReconcile.farmReason}` : ""}{" "}
                <Link to="/engine" className="touch-link text-gold hover:text-foreground">
                  see The Engine →
                </Link>
              </p>
            )}
          </div>
        </div>

        <dl className="mt-8 grid gap-3 text-left sm:grid-cols-3" aria-label={t.thisMonthAria} data-testid="this-month">
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">{t.reservationsThisMonth}</dt>
            <dd className="mt-1 font-heading text-2xl tabular text-stage-reserved" data-testid="this-month-reservations" data-value={x.thisMonth.reservations}>
              {x.thisMonth.reservations}
            </dd>
            <dd className="text-[11px] text-muted-foreground">{t.pledgedIn(monthLabel(x.thisMonth.month))}</dd>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">{t.closingsThisMonth}</dt>
            <dd className="mt-1 font-heading text-2xl tabular text-stage-closed" data-testid="this-month-closings" data-value={x.thisMonth.closings}>
              {x.thisMonth.closings}
            </dd>
            <dd className="text-[11px] text-muted-foreground">
              {x.thisMonth.expectedReservations > 0
                ? t.moreExpected(x.thisMonth.expectedReservations)
                : t.closedIn(monthLabel(x.thisMonth.month))}
            </dd>
          </div>
          <div className="rounded-md bg-background/40 p-3">
            <dt className="stat-label">{t.expectedNextMonth}</dt>
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

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]" aria-label={t.debtOxygenAria}>
        <DebtCountdown debt={realm.debt} />
        <OxygenScore oxygen={realm.oxygen} />
      </section>

      <GoalCurve goal={g} history={realm.history} />
      <DeadlineGauge goal={g} netProfitPerDayAtPace={realm.oxygen.netProfitPerDayAtPace} />

      <PulseCharts
        history={realm.history}
        requiredClosings={g.requiredLotsPerMonthToHitDeadline}
        requiredReservations={x.requiredReservationsPerMonth}
        requiredProfitPerDay={realm.debt.requiredNetProfitPerDay}
        eraLabel={realm.era?.label ?? null}
      />

      <Reveal>
        <PipelinePanel pipeline={realm.pipeline} />
      </Reveal>

      <Reveal>
        <section className="parchment-card p-4 sm:p-5" aria-label="Rotation" data-testid="rotation-strip">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">
              <RefreshCw className="mr-2 inline h-4 w-4" />
              {t.rotation}
            </h2>
            <Link to="/warplan" className="touch-link text-xs text-muted-foreground hover:text-foreground">
              {t.warPlanLink}
            </Link>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-md bg-background/40 p-3">
              <dt className="stat-label">{t.capitalOutstanding}</dt>
              <dd className="mt-1 font-heading text-xl tabular text-sponsor" data-testid="rotation-outstanding">
                {money(rot.capitalOutstanding)}
              </dd>
              <dd className="text-[11px] text-muted-foreground">today&apos;s captive sponsor capital (excludes own-capital farms)</dd>
            </div>
            <div className="rounded-md bg-background/40 p-3">
              <dt className="stat-label">{t.benchmarkTurn}</dt>
              <dd className="mt-1 font-heading text-xl tabular" data-testid="rotation-benchmark">
                {rot.cycleDays === null ? "—" : `${number(rot.cycleDays)} days`}
              </dd>
              <dd className="text-[11px] text-muted-foreground" data-testid="rotation-benchmark-hint">
                {rot.benchmark ? (
                  <>
                    {rot.benchmark.farmName} ·{" "}
                    <span data-testid="rotation-benchmark-months">
                      {rot.cycleMonths !== null ? rot.cycleMonths.toFixed(1) : "—"} months
                    </span>
                    {rot.benchmark.projected ? ", projected" : ""}
                  </>
                ) : (
                  "no farm freed, none projectable"
                )}
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
              <dt className="stat-label">{t.turnsCompleted}</dt>
              <dd className="mt-1 font-heading text-xl tabular text-liberty" data-testid="rotation-turns-completed">
                {rot.turnsCompleted}
              </dd>
              <dd className="text-[11px] text-muted-foreground">{rot.turnsCompleted === 1 ? "farm freed" : "farms freed"} — capital fully back</dd>
            </div>
            <div className="rounded-md bg-background/40 p-3">
              <dt className="stat-label">{t.turnsStillNeeded}</dt>
              <dd className="mt-1 font-heading text-xl tabular text-gold" data-testid="rotation-turns-needed">
                {turnsNeeded}
              </dd>
              <dd className="text-[11px] text-muted-foreground">
                {plan.turnsNeeded === null
                  ? "no capital has to turn"
                  : `${money(plan.peakOutstanding)} peak in the war-plan buy schedule across ${plan.farms} ${plan.farms === 1 ? "farm" : "farms"} (not today's ${money(rot.capitalOutstanding)} already outstanding with sponsors)`}
                {plan.turnsIncomplete > 0 && <span className="text-ember"> · {plan.turnsIncomplete} not back by the deadline</span>}
              </dd>
            </div>
            <div className="rounded-md bg-background/40 p-3">
              <dt className="stat-label">{t.nextLiberation}</dt>
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
      </Reveal>

      <Reveal>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t.keyFiguresAria}>
          <Stat
            label={t.cashRealized}
            value={money(g.cashRealized)}
            hint={
              tsy.totalOtherNoteSales > 0 ? (
                <span data-testid="treasury-cash-reconcile">
                  Farm-lot cash only. Cash realized {money(g.cashRealized)} + other note sales {money(tsy.totalOtherNoteSales)} = Treasury cash in{" "}
                  {money(tsy.totalCashIn)}
                </span>
              ) : (
                "Farm-lot cash only — down payments + note sales on farm lots"
              )
            }
            valueClassName="text-stage-closed"
          />
          <Stat label={t.profitOnPaper} value={money(g.profitOnPaper)} hint={t.profitOnPaperHint} />
          <Stat
            label={t.pipelineProfit}
            value={money(g.netProfitInPipeline)}
            hint={`${g.reservedLots} reserved lots, if every one closes as priced · ${money(x.committedNetProfit)} committed at ${pct(x.conversionPct, 0)} ${conversionForecastLabel} · ${money(realm.pipeline.netProfitTrapped)} stuck`}
            valueClassName="text-stage-reserved"
          />
          <Stat
            label={t.capitalOutstandingKey}
            value={
              <span data-testid="key-capital-outstanding" data-value={realm.debt.capitalOwed}>
                {money(realm.debt.capitalOwed)}
              </span>
            }
            hint={
              <span data-testid="key-capital-outstanding-hint">
                Today&apos;s captive sponsor capital
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
      </Reveal>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="parchment-card min-w-0 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.liveChronicle}</h2>
            <Link to="/chronicle" className="touch-link inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {t.fullChronicle} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noEvents}</p>
          ) : (
            <ol className="divide-y divide-border/60">
              {recent.map((e, i) => {
                const styleClass = EVENT_CLASS[e.kind];
                return (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="flex items-start gap-3 py-2.5 text-sm"
                  >
                    <span className={cn("w-20 shrink-0 text-[10px] uppercase tracking-wider", styleClass)}>{t.eventLabel[e.kind]}</span>
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
              <div className="font-heading">{t.quests}</div>
              <div className="truncate text-xs text-muted-foreground">
                {g.closedLots} closed · {g.reservedLots} reserved · {g.availableLots} available
              </div>
            </div>
          </Link>
          <Link to="/sponsors" className="parchment-card group flex items-center gap-4 p-4 transition-colors hover:border-gold/40">
            <Landmark className="h-6 w-6 text-gold" />
            <div className="min-w-0">
              <div className="font-heading">{t.sponsors}</div>
              <div className="truncate text-xs text-muted-foreground">{realm.investors.filter((i) => i.capitalDeployed > 0).length} sponsors funding {realm.farms.length} farms</div>
            </div>
          </Link>
          <Link to="/treasury" className="parchment-card group flex items-center gap-4 p-4 transition-colors hover:border-gold/40">
            <Coins className="h-6 w-6 text-gold" />
            <div className="min-w-0">
              <div className="font-heading">{t.treasury}</div>
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
