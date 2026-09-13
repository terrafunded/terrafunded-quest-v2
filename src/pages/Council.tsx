import { useMemo } from "react";
import { useRealm } from "@/data/useRealm";
import { useWeeklyCouncil } from "@/data/useWeeklyCouncil";
import { useHorizon } from "@/horizon/HorizonProvider";
import { useLang } from "@/i18n/lang";
import { COUNCIL_UI } from "@/i18n/council";
import { computeCouncil } from "@/domain/council";
import { buildWeeklyFacts } from "@/domain/weeklyCouncil";
import { CouncilInsights } from "@/components/realm/CouncilInsights";
import { WeeklyRead } from "@/components/realm/WeeklyRead";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";

export default function Council() {
  const { data, isLoading, error, refetch } = useRealm();
  const [lang] = useLang();
  const { horizon } = useHorizon();
  const t = COUNCIL_UI[lang];

  const insights = useMemo(() => (data ? computeCouncil(data.realm, lang) : []), [data, lang]);
  const facts = useMemo(
    () => (data ? buildWeeklyFacts(data.realm, insights, { horizon, lang }) : null),
    [data, insights, horizon, lang],
  );
  const weekly = useWeeklyCouncil(facts);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  return (
    <div lang={lang} data-testid="council-page" data-lang={lang} data-horizon={horizon}>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <TableErrorsBanner errors={data.tableErrors} />
      <WeeklyRead
        lang={lang}
        response={weekly.response}
        limit={weekly.limit}
        loading={weekly.isLoading}
        regenerating={weekly.regenerating}
        onRegenerate={weekly.regenerate}
      />
      <CouncilInsights insights={insights} lang={lang} />
    </div>
  );
}
