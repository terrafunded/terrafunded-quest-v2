import { Flame, Handshake } from "lucide-react";
import type { Streaks } from "@/domain";
import { Stat } from "./Stat";
import { date, money, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealmStrings } from "@/i18n/realm";

export type StreakKind = "closing" | "reservation";

const STYLE: Record<StreakKind, { testId: string; flame: string }> = {
  closing: { testId: "streaks", flame: "text-siege" },
  reservation: { testId: "reservation-streaks", flame: "text-stage-reserved" },
};

/**
 * STREAKS — consecutive weeks with a closing (or a reservation), best week and best month, from real
 * dates. Reservation streaks count every pledge made, whatever became of it; only closings book profit.
 */
export function StreaksPanel({ streaks, kind = "closing" }: { streaks: Streaks; kind?: StreakKind }) {
  const t = useRealmStrings().streaks;
  const w = t[kind];
  const style = STYLE[kind];
  const alive = streaks.currentWeeks > 0;
  const recent = streaks.weeks.slice(-12);
  const Icon = kind === "closing" ? Flame : Handshake;
  const sinceSuffix = streaks.bestSinceLabel ? t.since(streaks.bestSinceLabel) : "";
  return (
    <section className="space-y-3" aria-label={w.title} data-testid={style.testId} data-kind={kind}>
      <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-muted-foreground">{w.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t.current}
          value={
            <span className="inline-flex items-center gap-2">
              <Icon className={cn("h-5 w-5", alive ? style.flame : "text-muted-foreground")} />
              {t.weeks(streaks.currentWeeks)}
            </span>
          }
          hint={streaks.closedThisWeek ? w.lit : alive ? t.daysLeftToKeep(streaks.daysToKeepStreak) : w.none}
          valueClassName={alive ? style.flame : undefined}
          data-testid={kind === "closing" ? "streak-current" : "reservation-streak-current"}
        />
        <Stat label={t.best} value={t.weeks(streaks.bestWeeks)} hint={streaks.bestWeeksEndedOn ? t.endedOn(date(streaks.bestWeeksEndedOn)) : "—"} />
        <Stat
          label={`${t.bestWeek}${sinceSuffix}`}
          value={streaks.bestWeek ? `${streaks.bestWeek.count} ${w.noun(streaks.bestWeek.count)}` : "—"}
          hint={
            streaks.bestWeek
              ? t.weekOf(date(streaks.bestWeek.weekStart), money(streaks.bestWeek.netProfit), w.moneyLabel)
              : streaks.bestSinceLabel
                ? t.noneSince(streaks.bestSinceLabel)
                : w.noneYet
          }
          valueClassName="text-gold"
          data-testid={kind === "closing" ? "streak-best-week" : "reservation-streak-best-week"}
        />
        <Stat
          label={`${t.bestMonth}${sinceSuffix}`}
          value={streaks.bestMonth ? `${streaks.bestMonth.count} ${w.noun(streaks.bestMonth.count)}` : "—"}
          hint={
            streaks.bestMonth
              ? t.bestMonthHint(monthLabel(streaks.bestMonth.month), money(streaks.bestMonth.netProfit), w.moneyLabel, streaks.bestMonths) +
                (streaks.bestExcluded > 0 ? w.leftOut(streaks.bestExcluded) : "")
              : streaks.bestSinceLabel
                ? t.noneSince(streaks.bestSinceLabel)
                : w.noneYet
          }
          valueClassName="text-gold"
          data-testid={kind === "closing" ? "streak-best-month" : "reservation-streak-best-month"}
        />
      </div>
      {recent.length > 0 && (
        <div className="parchment-card p-4">
          <div className="stat-label mb-2">{w.lastWeeks(recent.length)}</div>
          <ol className="flex flex-wrap gap-1.5">
            {recent.map((wk) => (
              <li key={wk.week} className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs" title={`${wk.week} · ${money(wk.netProfit)} ${w.moneyLabel}`}>
                <span className="text-muted-foreground">{date(wk.weekStart).replace(/, \d{4}$/, "")}</span> <span className={cn("font-heading", kind === "closing" ? "text-gold" : "text-stage-reserved")}>{wk.count}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
