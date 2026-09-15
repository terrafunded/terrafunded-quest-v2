import { useMemo } from "react";
import { useRealm } from "@/data/useRealm";
import { useThisWeek } from "@/data/useThisWeek";
import { useWeeklyCouncil } from "@/data/useWeeklyCouncil";
import { useHorizon } from "@/horizon/HorizonProvider";
import { useLang } from "@/i18n/lang";
import { COUNCIL_UI } from "@/i18n/council";
import { useWeeklyActionsStrings } from "@/i18n/weeklyActions";
import { computeCouncil } from "@/domain/council";
import { buildWeeklyFacts } from "@/domain/weeklyCouncil";
import { WeeklyActionCards } from "@/components/realm/WeeklyActionCards";
import { WeeklyRead } from "@/components/realm/WeeklyRead";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { date, number } from "@/lib/format";

export default function Council() {
  const { data, isLoading, error, refetch } = useRealm();
  const [lang] = useLang();
  const { horizon } = useHorizon();
  const t = COUNCIL_UI[lang];
  const w = useWeeklyActionsStrings();
  const week = useThisWeek();

  const insights = useMemo(() => (data ? computeCouncil(data.realm, lang) : []), [data, lang]);
  const facts = useMemo(
    () => (data ? buildWeeklyFacts(data.realm, insights, { horizon, lang }) : null),
    [data, insights, horizon, lang],
  );
  const weekly = useWeeklyCouncil(facts);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const active = week.week?.actions.filter((a) => a.status !== "dismissed") ?? [];
  const dismissed = week.week?.actions.filter((a) => a.status === "dismissed") ?? [];

  return (
    <div lang={lang} data-testid="council-page" data-lang={lang} data-horizon={horizon}>
      <PageHeader title={t.title} subtitle={w.subtitle} />
      <TableErrorsBanner errors={data.tableErrors} />
      <p data-testid="projected-exit-at-current-pace" className="mb-6 text-sm">
        <span className="stat-label">{t.projectedExitAtCurrentPace}</span>{" "}
        <span className="font-heading tabular text-foreground">
          {data.realm.pathToGoal.projectedExitAtCurrentPace ? date(data.realm.pathToGoal.projectedExitAtCurrentPace) : "—"}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{t.projectedExitFormula}</span>
      </p>
      <p className="mb-4 text-sm text-muted-foreground" data-testid="this-week-last">
        {week.lastWeek ? w.lastWeek(week.lastWeek.doneCount, number(week.lastWeek.daysGained)) : w.lastWeekNone}
      </p>
      {week.week?.belowMinimum && (
        <p className="mb-4 text-sm text-muted-foreground" data-testid="this-week-below-min">
          {w.belowMinimum} {week.week.lever ? w.lever[week.week.lever.kind] : ""}
        </p>
      )}
      <WeeklyRead
        lang={lang}
        response={weekly.response}
        limit={weekly.limit}
        loading={weekly.isLoading}
        regenerating={weekly.regenerating}
        onRegenerate={weekly.regenerate}
      />
      <section className="mt-8" data-testid="weekly-actions-detail" data-source="ledger">
        <p className="stat-label">{w.thisWeek}</p>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">{w.subtitle}</p>
        <WeeklyActionCards
          actions={active}
          onStatus={(id, status, reason) => week.setStatus({ actionId: id, status, reason })}
        />
      </section>
      {dismissed.length > 0 && (
        <section className="mt-8" data-testid="weekly-actions-dismissed">
          <p className="stat-label">{w.dismissed}</p>
          <div className="mt-3">
            <WeeklyActionCards
              actions={dismissed}
              showDismissed
              onStatus={(id, status, reason) => week.setStatus({ actionId: id, status, reason })}
            />
          </div>
        </section>
      )}
      {week.history.length > 0 && (
        <section className="mt-8" data-testid="weekly-actions-history">
          <p className="stat-label">{w.history}</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {week.history.map((row) => (
              <li key={row.week} data-testid="weekly-history-row">
                {w.historyRow(row.week, row.doneCount, number(row.daysGained))}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
