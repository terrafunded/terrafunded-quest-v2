import { Link } from "react-router-dom";
import { useThisWeek } from "@/data/useThisWeek";
import { WeeklyActionCards } from "@/components/realm/WeeklyActionCards";
import { useWeeklyActionsStrings } from "@/i18n/weeklyActions";
import { number } from "@/lib/format";

export function ThisWeekStrip() {
  const t = useWeeklyActionsStrings();
  const week = useThisWeek();
  if (!week.week) return null;
  const top = week.week.actions.filter((a) => a.status !== "dismissed").slice(0, 3);

  return (
    <section className="space-y-2" data-testid="this-week-strip" aria-label={t.thisWeek}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="stat-label">
          <Link to="/council" className="hover:text-foreground">
            {t.thisWeek}
          </Link>
        </h2>
        <p className="text-xs text-muted-foreground" data-testid="this-week-last">
          {week.lastWeek
            ? t.lastWeek(week.lastWeek.doneCount, number(week.lastWeek.daysGained))
            : t.lastWeekNone}
        </p>
      </div>
      {week.week.belowMinimum && (
        <p className="text-sm text-muted-foreground" data-testid="this-week-below-min">
          {t.belowMinimum} {week.week.lever ? t.lever[week.week.lever.kind] : ""}
        </p>
      )}
      {top.length > 0 && (
        <WeeklyActionCards actions={top} compact onStatus={(id, status, reason) => week.setStatus({ actionId: id, status, reason })} />
      )}
    </section>
  );
}
