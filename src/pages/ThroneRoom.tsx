import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, Coins, Landmark, RefreshCw, Scroll } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import {
  engineDefaultsFromRealm,
  extraInterestVersus2027,
  latestEvents,
  reconcileThroneAndEngine,
  runEngine,
  type RealmEvent,
} from "@/domain";
import { MILESTONE_STEP, type ExitHorizon } from "@/config/goal";
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
import { FarmScorecardSummary } from "@/components/realm/FarmScorecardSection";
import { ThisWeekStrip } from "@/components/realm/ThisWeekStrip";
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
  const layers = realm.profitLayers;
  const noteSalePctLabel = `${(layers.noteSaleRatio * 100).toFixed(1)}%`;
  const exitHorizon = Number(g.deadline.slice(0, 4)) as ExitHorizon;
  const interestPerDay = realm.debt.interestPerDay ?? 0;
  const extraInterest = extraInterestVersus2027(interestPerDay, realm.asOf, exitHorizon);
  const extra2028 = extraInterestVersus2027(interestPerDay, realm.asOf, 2028);
  const extra2029 = extraInterestVersus2027(interestPerDay, realm.asOf, 2029);
  const projectedExitLabel = realm.pathToGoal.projectedExitAtCurrentPace
    ? date(realm.pathToGoal.projectedExitAtCurrentPace)
    : "—";
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
      <ThisWeekStrip />

      <section className="relative overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-b from-card/90 to-background/40 px-5 py-6 text-center shadow-[0_0_120px_-40px_hsl(var(--gold)/0.6)] sm:px-10 sm:py-8" data-testid="throne-headline">
        <AmbientParticles />
        <GrowthBurst trigger={g.netProfitToDate} className="pointer-events-none absolute inset-0 left-1/2 top-1/2" />
        <h1 className="stat-label">{t.asOf(date(g.asOf))}</h1>
        <div className="mt-3 grid items-stretch gap-5 md:grid-cols-3" data-testid="profit-layers">
          <div className="flex min-h-full min-w-0 flex-col items-center justify-center rounded-xl border border-gold/20 bg-background/40 px-4 py-3">
            <div className="stat-label">{t.profitAtClosing}</div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-1 w-full max-w-full font-display text-[clamp(1.5rem,6vw,3.25rem)] leading-none"
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
          <div className="flex min-h-full min-w-0 flex-col items-center justify-center rounded-xl border border-gold/20 bg-background/40 px-4 py-3">
            <div className="stat-label">{t.noteLiquidityCost}</div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-1 w-full max-w-full font-display text-[clamp(1.5rem,6vw,3.25rem)] leading-none"
            >
              <FitMoney value={layers.liquidityCostTotal} className="text-center" data-testid="note-liquidity-cost-counter" />
            </motion.div>
            <div className="mt-2 text-xs text-muted-foreground" data-testid="note-liquidity-cost-breakdown">
              {t.noteLiquidityBreakdown(
                money(layers.liquidityCostRealized),
                layers.notesSoldCount,
                money(layers.liquidityCostUnrealized),
                layers.notesHeldCount,
                pct(layers.liquidityCostSharePct, 0),
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground" data-testid="note-liquidity-cost-subtitle">
              {t.noteLiquiditySubtitle}
            </div>
          </div>
          <div className="flex min-h-full min-w-0 flex-col items-center justify-center rounded-xl border border-gold/20 bg-background/40 px-4 py-3">
            <div className="stat-label">{t.notesHeldFace}</div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-1 w-full max-w-full font-display text-[clamp(1.5rem,6vw,3.25rem)] leading-none"
            >
              <FitMoney value={layers.notesHeldFace} className="text-center" data-testid="notes-held-counter" />
            </motion.div>
            <div className="mt-2 text-xs text-muted-foreground" data-testid="notes-held-hint">
              {t.notesHeldHint(layers.notesHeldCount, money(layers.notesHeldAtRatio), noteSalePctLabel)}
            </div>
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-3xl text-sm text-muted-foreground" data-testid="profit-layers-context">
          {t.profitLayersContext(noteSalePctLabel)}{" "}
          <Link to="/exodus" className="text-foreground underline underline-offset-4 hover:text-gold">
            {t.seeExodus}
          </Link>
        </p>
        <div className="mt-5">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="flex h-full min-w-0 flex-col justify-center rounded-xl border border-stage-reserved/30 bg-background/40 px-4 py-3 text-left"
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
                  {t.atStake(money(x.netProfitAtStake), pct(x.conversionPct, 0), conversionForecastLabel)}
                  <span className="text-muted-foreground/80">{t.forecastsUse(conversionForecastLabel)}</span>
                  {x.landsBy && (
                    <>
                      {t.expectedBy}
                      <span className="text-foreground" data-testid="committed-lands-by">{monthLabel(x.landsBy)}</span>
                    </>
                  )}
                  {x.overdueCount > 0 && (
                    <span className="text-ember">{t.overdue(x.overdueCount, moneyCompact(x.overdueNetProfit))}</span>
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

        <div className="mt-8 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:text-left">
          <ProgressRing value={g.pctComplete} size={150} className="mx-auto shrink-0">
            <div className="font-heading text-3xl text-gold tabular">{g.pctComplete.toFixed(1)}%</div>
            <div className="stat-label">{t.complete}</div>
          </ProgressRing>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="font-heading text-lg leading-snug text-foreground sm:text-xl" data-testid="verdict">
              {g.verdict.includes(t.verdictLotsMonth)
                ? g.verdict.replace(t.verdictLotsMonth, t.verdictLotsMonthAnnotated)
                : g.verdict}
            </p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p data-testid="pace-line-reservations">
                {(() => {
                  const res = number(x.reservationsPerMonth);
                  const closings = number(x.closingsPerMonth);
                  const full = t.paceReservations(res, closings);
                  const i = full.indexOf(res);
                  const j = full.indexOf(closings, i + res.length);
                  if (i < 0 || j < 0) return full;
                  return (
                    <>
                      {full.slice(0, i)}
                      <strong className="text-stage-reserved tabular">{res}</strong>
                      {full.slice(i + res.length, j)}
                      <strong className="text-stage-closed tabular">{closings}</strong>
                      {full.slice(j + closings.length)}
                    </>
                  );
                })()}
                <span className="text-xs" data-testid="pace-window">
                  {" "}
                  ·{" "}
                  {x.trailingEraClipped && realm.era
                    ? t.paceWindowSince(realm.era.since, x.trailingDays)
                    : t.paceWindowTrailing(x.trailingWindowDays)}
                </span>
              </p>
              <p data-testid="pace-line-required">
                {(() => {
                  const res = x.requiredReservationsPerMonth === null ? "—" : number(x.requiredReservationsPerMonth);
                  const full = t.paceRequired(res);
                  const i = full.indexOf(res);
                  if (i < 0) return full;
                  return (
                    <>
                      {full.slice(0, i)}
                      <strong className="text-foreground tabular">{res}</strong>
                      {full.slice(i + res.length)}
                    </>
                  );
                })()}
                <span className="text-xs">
                  {t.paceRequiredClosings(
                    x.requiredClosingsPerMonth === null ? "—" : number(x.requiredClosingsPerMonth),
                    pct(x.conversionPct, 0),
                    conversionForecastLabel,
                  )}
                </span>
              </p>
              <p className="text-xs">{t.eraNote}</p>
              <p data-testid="projected-exit-at-current-pace" className="text-sm">
                <span className="stat-label">{t.projectedExitAtCurrentPace}</span>{" "}
                <span className="font-heading tabular text-foreground">{projectedExitLabel}</span>
                <span className="mt-0.5 block text-xs">{t.projectedExitFormula}</span>
              </p>
              <p data-testid="pace-era-avg" className="text-xs sm:text-sm">
                <span className="text-oxygen">{t.era}</span>
                {g.recentSinceLabel ? ` ${g.recentSinceLabel}` : ""}
                {t.perLotLotsFarms(
                  g.recentAvgNetProfitPerClosedLot === null ? "—" : money(g.recentAvgNetProfitPerClosedLot),
                  String(g.lotsStillNeededRecent ?? "—"),
                  String(g.requiredLotsPerMonthToHitDeadlineRecent ?? "—"),
                  g.projectedDateRecent ? date(g.projectedDateRecent) : "—",
                  t.closingsCount(g.recentClosedLots),
                )}
              </p>
              <p data-testid="pace-lifetime-avg" className="text-xs sm:text-sm">
                <span className="text-muted-foreground">{t.lifetime}</span>
                {t.perLotLotsFarms(
                  g.avgNetProfitPerClosedLot === null ? "—" : money(g.avgNetProfitPerClosedLot),
                  String(g.lotsStillNeeded ?? "—"),
                  String(g.requiredLotsPerMonthToHitDeadline ?? "—"),
                  g.projectedDate ? date(g.projectedDate) : "—",
                  t.closingsCount(g.closedLots),
                )}
                <span className="mt-0.5 block text-[11px]">{t.lifetimeDateAssumption}</span>
              </p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground sm:text-left">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-gold" />
                <span data-testid="days-to-deadline">{t.daysToDeadline(number(g.daysToDeadline), date(g.deadline))}</span>
              </span>
              <div data-testid="lots-still-needed">
                {t.lotsStillNeeded(String(g.lotsStillNeeded ?? "—"))}
                <span className="mt-0.5 block text-[11px]">{t.lotsStillNeededHint}</span>
              </div>
              {g.lotsStillNeededRecent !== null && (
                <div data-testid="lots-still-needed-era">
                  {t.lotsStillNeededEra(String(g.lotsStillNeededRecent))}
                  <span className="mt-0.5 block text-[11px]">{t.lotsStillNeededEraHint}</span>
                </div>
              )}
              <div data-testid="warplan-lots-needed">
                {t.warPlanLotsNeeded}: {number(realm.warPlan.required.lotsNeeded)}
                <span className="mt-0.5 block text-[11px]">{t.warPlanLotsNeededHint}</span>
              </div>
              <div data-testid="rotation-farms">
                {t.rotationFarms(String(g.farmsStillNeeded ?? "—"))}
                <span className="mt-0.5 block text-[11px]">{t.rotationFarmsHint}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="interest-carry-note">
              {t.interestCarryNote(
                String(exitHorizon),
                money(extraInterest),
                money(extra2028),
                money(extra2029),
              )}
            </p>
            {throneEngineReconcile && (!throneEngineReconcile.dollarsAgree || !throneEngineReconcile.farmsAgree) && (
              <p className="text-xs text-muted-foreground" data-testid="engine-throne-reconcile">
                {t.engineReconcile}
                {throneEngineReconcile.dollarReason ? ` — ${throneEngineReconcile.dollarReason}` : ""}
                {throneEngineReconcile.farmReason ? ` ${throneEngineReconcile.farmReason}` : ""}{" "}
                <Link to="/engine" className="touch-link text-gold hover:text-foreground">
                  {t.seeEngine}
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
              {t.closingsFromReservations(
                monthLabel(x.nextMonth.month),
                x.nextMonth.expectedReservations,
                common.reservations(x.nextMonth.expectedReservations).replace(/^\d+\s+/, ""),
              )}
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

      <section className="grid gap-3 sm:grid-cols-2" data-testid="decision-summaries">
        <Link to="/realm" className="parchment-card block p-4 transition-colors hover:border-gold/40" data-testid="farm-scorecard-summary">
          <div className="stat-label">{t.scorecardTitle}</div>
          <div className="mt-1 font-heading text-xl tabular">{t.scorecardHint(realm.farmScorecard.gradeACount, realm.farmScorecard.staleCount)}</div>
          <div className="mt-2">
            <FarmScorecardSummary scorecard={realm.farmScorecard} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">{t.scorecardLink}</div>
        </Link>
        <Link to="/pipeline" className="parchment-card block p-4 transition-colors hover:border-gold/40" data-testid="parked-money-summary">
          <div className="stat-label">{t.parkedTitle}</div>
          <div className="mt-1 font-heading text-xl tabular">
            {realm.reservationAging.stuckCount === 0
              ? t.parkedClear
              : t.parkedHint(realm.reservationAging.stuckCount, money(realm.reservationAging.stuckExpectedNet))}
          </div>
          {realm.reservationAging.fullyReservedUnsold.length > 0 && (
            <div className="mt-2 text-xs text-[hsl(var(--data-status-far))]">
              {realm.reservationAging.fullyReservedUnsold.map((f) => f.farmName).join(" · ")}
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground">{t.parkedLink}</div>
        </Link>
      </section>

      <Reveal>
        <section className="parchment-card p-4 sm:p-5" aria-label={t.rotation} data-testid="rotation-strip">
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
              <dd className="text-[11px] text-muted-foreground">{t.capitalOutstandingHint}</dd>
              {realm.debt.capitalCommittedUnfunded > 0 && (
                <dd className="text-[11px] text-muted-foreground" data-testid="rotation-committed-unfunded">
                  {t.capitalCommittedUnfunded(money(realm.debt.capitalCommittedUnfunded))}
                </dd>
              )}
            </div>
            <div className="rounded-md bg-background/40 p-3">
              <dt className="stat-label">{t.benchmarkTurn}</dt>
              <dd className="mt-1 font-heading text-xl tabular" data-testid="rotation-benchmark">
                {rot.cycleDays === null ? "—" : t.days(number(rot.cycleDays))}
              </dd>
              <dd className="text-[11px] text-muted-foreground" data-testid="rotation-benchmark-hint">
                {rot.benchmark ? (
                  <>
                    {rot.benchmark.farmName} ·{" "}
                    <span data-testid="rotation-benchmark-months">
                      {rot.cycleMonths !== null ? t.months(rot.cycleMonths.toFixed(1)) : "—"}
                    </span>
                    {rot.benchmark.projected ? t.projected : ""}
                  </>
                ) : (
                  t.noFarmFreed
                )}
                {rot.sinceLabel && (
                  <>
                    {t.farmsFunded(rot.sinceLabel)}
                    {rot.excludedCycles.length > 0 && t.freedEarlier(rot.excludedCycles.map((c) => c.farmName).join(", "))}
                  </>
                )}
              </dd>
            </div>
            <div className="rounded-md bg-background/40 p-3">
              <dt className="stat-label">{t.turnsCompleted}</dt>
              <dd className="mt-1 font-heading text-xl tabular text-liberty" data-testid="rotation-turns-completed">
                {rot.turnsCompleted}
              </dd>
              <dd className="text-[11px] text-muted-foreground">
                {rot.turnsCompleted === 1 ? t.farmFreed : t.farmsFreed}
                {t.capitalFullyBack}
              </dd>
            </div>
            <div className="rounded-md bg-background/40 p-3">
              <dt className="stat-label">{t.turnsStillNeeded}</dt>
              <dd className="mt-1 font-heading text-xl tabular text-gold" data-testid="rotation-turns-needed">
                {turnsNeeded}
              </dd>
              <dd className="text-[11px] text-muted-foreground">
                {plan.turnsNeeded === null
                  ? t.noCapitalToTurn
                  : t.peakInWarPlan(money(plan.peakOutstanding), plan.farms, t.farmWord(plan.farms), money(rot.capitalOutstanding))}
                {plan.turnsIncomplete > 0 && <span className="text-ember">{t.notBackByDeadline(plan.turnsIncomplete)}</span>}
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
                    ? t.pctStillToReturn((100 - rot.nextLiberation.pctReturned).toFixed(0))
                    : rot.nextLiberation.daysToGo === 0
                      ? t.lotsCoveredAwaiting
                      : t.daysToGo(number(rot.nextLiberation.daysToGo), date(rot.nextLiberation.projectedLiberationDate))
                  : t.everyFarmFree}
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
                  {t.cashReconcile(money(g.cashRealized), money(tsy.totalOtherNoteSales), money(tsy.totalCashIn))}
                </span>
              ) : (
                t.cashRealizedHint
              )
            }
            valueClassName="text-stage-closed"
          />
          <Stat label={t.profitOnPaper} value={money(g.profitOnPaper)} hint={t.profitOnPaperHint} />
          <Stat
            label={t.pipelineProfit}
            value={money(g.netProfitInPipeline)}
            hint={t.pipelineHint(
              g.reservedLots,
              money(x.committedNetProfit),
              pct(x.conversionPct, 0),
              conversionForecastLabel,
              money(realm.pipeline.netProfitTrapped),
            )}
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
                {t.captiveSponsor}
                {realm.debt.ownCapitalOutstanding > 0 ? (
                  <span data-testid="key-own-capital">{t.ownCapitalTied(money(realm.debt.ownCapitalOutstanding))}</span>
                ) : null}
                {realm.debt.capitalCommittedUnfunded > 0 ? (
                  <span data-testid="key-committed-unfunded">
                    {t.capitalCommittedUnfunded(money(realm.debt.capitalCommittedUnfunded))}
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
              <div className="truncate text-xs text-muted-foreground">{t.questsHint(g.closedLots, g.reservedLots, g.availableLots)}</div>
            </div>
          </Link>
          <Link to="/sponsors" className="parchment-card group flex items-center gap-4 p-4 transition-colors hover:border-gold/40">
            <Landmark className="h-6 w-6 text-gold" />
            <div className="min-w-0">
              <div className="font-heading">{t.sponsors}</div>
              <div className="truncate text-xs text-muted-foreground">
                {t.sponsorsHint(realm.investors.filter((i) => i.capitalDeployed > 0).length, realm.farms.length)}
              </div>
            </div>
          </Link>
          <Link to="/treasury" className="parchment-card group flex items-center gap-4 p-4 transition-colors hover:border-gold/40">
            <Coins className="h-6 w-6 text-gold" />
            <div className="min-w-0">
              <div className="font-heading">{t.treasury}</div>
              <div className="truncate text-xs text-muted-foreground">
                {t.treasuryHint(money(realm.treasury.totalCashIn), money(realm.treasury.totalCashOut))}
              </div>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
