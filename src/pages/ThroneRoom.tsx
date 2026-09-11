import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, Coins, Landmark, Scroll } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { latestEvents, type RealmEvent } from "@/domain";
import { GOAL_DEADLINE, MILESTONE_STEP } from "@/config/goal";
import { AnimatedCounter } from "@/components/realm/AnimatedCounter";
import { ProgressRing } from "@/components/realm/ProgressRing";
import { GrowthBurst } from "@/components/realm/GrowthBurst";
import { QuestTree, type QuestNode } from "@/components/realm/QuestTree";
import { CinematicIntro } from "@/components/realm/CinematicIntro";
import { Stat } from "@/components/realm/Stat";
import { EmptyState, ErrorState, LoadingState, TableErrorsBanner } from "@/components/realm/PageStates";
import { date, money, moneyCompact, number } from "@/lib/format";
import { cn } from "@/lib/utils";

const EVENT_STYLE: Record<RealmEvent["kind"], { label: string; className: string }> = {
  reservation: { label: "Reserved", className: "text-stage-reserved" },
  closing: { label: "Closed", className: "text-stage-closed" },
  note_sale: { label: "Note sold", className: "text-stage-note_sold" },
  distribution: { label: "Paid out", className: "text-fuchsia-300" },
  farm_acquired: { label: "Farm", className: "text-sky-300" },
  milestone: { label: "Milestone", className: "text-gold" },
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
  const recent = latestEvents(realm.events, 5, ["reservation", "closing", "note_sale", "distribution"]);

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
      <CinematicIntro />
      <TableErrorsBanner errors={tableErrors} />

      <section className="relative overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-b from-card/90 to-background/40 px-5 py-10 text-center shadow-[0_0_120px_-40px_hsl(var(--gold)/0.6)] sm:px-10 sm:py-14">
        <GrowthBurst trigger={g.netProfitToDate} className="pointer-events-none absolute inset-0 left-1/2 top-1/2" />
        <h1 className="stat-label">Throne Room · Net profit chronicled · as of {date(g.asOf)}</h1>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 font-display text-[11vw] leading-none sm:text-6xl lg:text-7xl"
        >
          <AnimatedCounter value={g.netProfitToDate} className="gold-shimmer" data-testid="net-profit-counter" />
        </motion.div>
        <div className="mt-2 text-sm text-muted-foreground">
          of <span className="text-foreground">{money(g.goal)}</span> · <span className="text-foreground tabular">{money(g.remaining)}</span> remaining
        </div>

        <div className="mt-8 grid items-center gap-6 sm:grid-cols-[auto_1fr] sm:text-left">
          <ProgressRing value={g.pctComplete} size={150} className="mx-auto">
            <div className="font-heading text-3xl text-gold tabular">{g.pctComplete.toFixed(1)}%</div>
            <div className="stat-label">complete</div>
          </ProgressRing>
          <div className="space-y-3">
            <p className="font-heading text-lg leading-snug text-foreground sm:text-xl" data-testid="verdict">
              {g.verdict}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground sm:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-gold" />
                <strong className="text-foreground tabular">{number(g.daysToDeadline)}</strong> days to {date(GOAL_DEADLINE)}
              </span>
              <span>
                Pace <strong className="text-foreground tabular">{g.closedLotsPerMonth}</strong> lots/mo · need{" "}
                <strong className="text-foreground tabular">{g.requiredLotsPerMonthToHitDeadline ?? "—"}</strong>
              </span>
              <span>
                <strong className="text-foreground tabular">{g.lotsStillNeeded ?? "—"}</strong> lots still needed ·{" "}
                <strong className="text-foreground tabular">{g.farmsStillNeeded ?? "—"}</strong> more farms
              </span>
            </div>
          </div>
        </div>

        <QuestTree nodes={questNodes} current={g.netProfitToDate} className="mt-8" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key figures">
        <Stat label="Cash realized" value={money(g.cashRealized)} hint="Down payments + note sales, money in the door" valueClassName="text-stage-closed" />
        <Stat label="Profit on paper" value={money(g.profitOnPaper)} hint="Net profit recognized but not yet cash" />
        <Stat label="Pipeline profit" value={money(g.netProfitInPipeline)} hint={`${g.reservedLots} reserved lots, if they close as priced`} valueClassName="text-stage-reserved" />
        <Stat label="Capital outstanding" value={money(g.capitalOutstanding)} hint="Still owed to sponsors" valueClassName="text-fuchsia-200" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="parchment-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">Live chronicle</h2>
            <Link to="/chronicle" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
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
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    <span className={cn("w-20 shrink-0 text-[10px] uppercase tracking-wider", style.className)}>{style.label}</span>
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{date(e.date)}</span>
                    <span className="w-24 shrink-0 text-right tabular text-foreground">{e.amount !== null ? moneyCompact(e.amount) : "—"}</span>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
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
