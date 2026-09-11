import { Flame } from "lucide-react";
import type { Streaks } from "@/domain";
import { Stat } from "./Stat";
import { date, money, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** STREAKS — consecutive weeks with a closing, best week and best month, from real closing dates. */
export function StreaksPanel({ streaks }: { streaks: Streaks }) {
  const alive = streaks.currentWeeks > 0;
  const recent = streaks.weeks.slice(-12);
  return (
    <section className="space-y-3" aria-label="Streaks" data-testid="streaks">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Current streak"
          value={
            <span className="inline-flex items-center gap-2">
              <Flame className={cn("h-5 w-5", alive ? "text-orange-400" : "text-muted-foreground")} />
              {streaks.currentWeeks} {streaks.currentWeeks === 1 ? "week" : "weeks"}
            </span>
          }
          hint={
            streaks.closedThisWeek
              ? "a lot closed this week — the flame is lit"
              : alive
                ? `${streaks.daysToKeepStreak} ${streaks.daysToKeepStreak === 1 ? "day" : "days"} left this week to keep it alive`
                : "no closing last week or this week"
          }
          valueClassName={alive ? "text-orange-200" : undefined}
          data-testid="streak-current"
        />
        <Stat label="Best streak" value={`${streaks.bestWeeks} ${streaks.bestWeeks === 1 ? "week" : "weeks"}`} hint={streaks.bestWeeksEndedOn ? `ended ${date(streaks.bestWeeksEndedOn)}` : "—"} />
        <Stat
          label="Best week"
          value={streaks.bestWeek ? `${streaks.bestWeek.count} closings` : "—"}
          hint={streaks.bestWeek ? `week of ${date(streaks.bestWeek.weekStart)} · ${money(streaks.bestWeek.netProfit)} net` : "no closings yet"}
          valueClassName="text-gold"
        />
        <Stat
          label="Best month"
          value={streaks.bestMonth ? `${streaks.bestMonth.count} closings` : "—"}
          hint={streaks.bestMonth ? `${monthLabel(streaks.bestMonth.month)} · ${money(streaks.bestMonth.netProfit)} net · best run ${streaks.bestMonths} months` : "no closings yet"}
          valueClassName="text-gold"
        />
      </div>
      {recent.length > 0 && (
        <div className="parchment-card p-4">
          <div className="stat-label mb-2">Last {recent.length} weeks with a closing</div>
          <ol className="flex flex-wrap gap-1.5">
            {recent.map((w) => (
              <li key={w.week} className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs" title={`${w.week} · ${money(w.netProfit)} net`}>
                <span className="text-muted-foreground">{date(w.weekStart).replace(/, \d{4}$/, "")}</span> <span className="font-heading text-gold">{w.count}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
