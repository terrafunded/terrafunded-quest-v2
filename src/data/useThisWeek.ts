import { useMemo } from "react";
import { useRealm } from "@/data/useRealm";
import { useWeeklyActions } from "@/data/useWeeklyActions";
import { useHorizon } from "@/horizon/HorizonProvider";
import { useLang } from "@/i18n/lang";
import {
  computeWeeklyActions,
  evaluateWeekResult,
  freezeWeeklyActions,
  pendingTopCount,
  type FrozenWeeklyWeek,
  type WeeklyWeekResult,
} from "@/domain/weeklyActions";

export function useThisWeek() {
  const { data } = useRealm();
  const [lang] = useLang();
  const { horizon } = useHorizon();

  const generated = useMemo(() => {
    if (!data) return null;
    const computed = computeWeeklyActions(data.realm, data.realm.asOf, lang);
    return freezeWeeklyActions(computed, data.realm.goal.asOf, horizon);
  }, [data, lang, horizon]);

  const weekly = useWeeklyActions(generated);
  const week: FrozenWeeklyWeek | null = weekly.week ?? generated;

  const lastWeek: WeeklyWeekResult | null = useMemo(() => {
    if (!data || !weekly.previous) return null;
    return evaluateWeekResult(weekly.previous, data.realm);
  }, [data, weekly.previous]);

  const history = useMemo(() => {
    if (!data) return [];
    return (weekly.history ?? []).map((w) => evaluateWeekResult(w, data.realm));
  }, [data, weekly.history]);

  const pill = pendingTopCount(week, 3);

  return {
    generated,
    week,
    lastWeek,
    history,
    dismissed: week?.actions.filter((a) => a.status === "dismissed") ?? [],
    ranked: (week?.actions.filter((a) => a.status !== "dismissed") ?? []).slice(),
    pill,
    setStatus: weekly.setStatus,
    isLoading: weekly.isLoading,
    unavailable: weekly.unavailable,
  };
}
