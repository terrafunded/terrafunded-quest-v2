import { Flame, Handshake } from "lucide-react";
import type { Streaks } from "@/domain";
import { Stat } from "./Stat";
import { date, money, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StreakKind = "closing" | "reservation";

const WORDING: Record<
  StreakKind,
  { title: string; noun: string; nouns: string; lit: string; none: string; noneYet: string; moneyLabel: string; testId: string; flame: string }
> = {
  closing: {
    title: "Closing streaks",
    noun: "closing",
    nouns: "closings",
    lit: "a lot closed this week — the flame is lit",
    none: "no closing last week or this week",
    noneYet: "no closings yet",
    moneyLabel: "net",
    testId: "streaks",
    flame: "text-siege",
  },
  reservation: {
    title: "Reservation streaks",
    noun: "reservation",
    nouns: "reservations",
    lit: "a lot was reserved this week — the line is unbroken",
    none: "no reservation last week or this week",
    noneYet: "no reservations yet",
    moneyLabel: "net at stake",
    testId: "reservation-streaks",
    flame: "text-stage-reserved",
  },
};

/**
 * STREAKS — consecutive weeks with a closing (or a reservation), best week and best month, from real
 * dates. Reservation streaks count every pledge made, whatever became of it; only closings book profit.
 */
export function StreaksPanel({ streaks, kind = "closing" }: { streaks: Streaks; kind?: StreakKind }) {
  const w = WORDING[kind];
  const alive = streaks.currentWeeks > 0;
  const recent = streaks.weeks.slice(-12);
  const Icon = kind === "closing" ? Flame : Handshake;
  return (
    <section className="space-y-3" aria-label={w.title} data-testid={w.testId} data-kind={kind}>
      <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-muted-foreground">{w.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Current streak"
          value={
            <span className="inline-flex items-center gap-2">
              <Icon className={cn("h-5 w-5", alive ? w.flame : "text-muted-foreground")} />
              {streaks.currentWeeks} {streaks.currentWeeks === 1 ? "week" : "weeks"}
            </span>
          }
          hint={streaks.closedThisWeek ? w.lit : alive ? `${streaks.daysToKeepStreak} ${streaks.daysToKeepStreak === 1 ? "day" : "days"} left this week to keep it alive` : w.none}
          valueClassName={alive ? w.flame : undefined}
          data-testid={kind === "closing" ? "streak-current" : "reservation-streak-current"}
        />
        <Stat label="Best streak" value={`${streaks.bestWeeks} ${streaks.bestWeeks === 1 ? "week" : "weeks"}`} hint={streaks.bestWeeksEndedOn ? `ended ${date(streaks.bestWeeksEndedOn)}` : "—"} />
        <Stat
          label={streaks.bestSinceLabel ? `Best week · ${streaks.bestSinceLabel}` : "Best week"}
          value={streaks.bestWeek ? `${streaks.bestWeek.count} ${streaks.bestWeek.count === 1 ? w.noun : w.nouns}` : "—"}
          hint={streaks.bestWeek ? `week of ${date(streaks.bestWeek.weekStart)} · ${money(streaks.bestWeek.netProfit)} ${w.moneyLabel}` : streaks.bestSinceLabel ? `none ${streaks.bestSinceLabel}` : w.noneYet}
          valueClassName="text-gold"
          data-testid={kind === "closing" ? "streak-best-week" : "reservation-streak-best-week"}
        />
        <Stat
          label={streaks.bestSinceLabel ? `Best month · ${streaks.bestSinceLabel}` : "Best month"}
          value={streaks.bestMonth ? `${streaks.bestMonth.count} ${streaks.bestMonth.count === 1 ? w.noun : w.nouns}` : "—"}
          hint={
            streaks.bestMonth
              ? `${monthLabel(streaks.bestMonth.month)} · ${money(streaks.bestMonth.netProfit)} ${w.moneyLabel} · best run ${streaks.bestMonths} months${streaks.bestExcluded > 0 ? ` · ${streaks.bestExcluded} earlier ${streaks.bestExcluded === 1 ? w.noun : w.nouns} left out` : ""}`
              : streaks.bestSinceLabel
                ? `none ${streaks.bestSinceLabel}`
                : w.noneYet
          }
          valueClassName="text-gold"
          data-testid={kind === "closing" ? "streak-best-month" : "reservation-streak-best-month"}
        />
      </div>
      {recent.length > 0 && (
        <div className="parchment-card p-4">
          <div className="stat-label mb-2">
            Last {recent.length} weeks with a {w.noun}
          </div>
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
