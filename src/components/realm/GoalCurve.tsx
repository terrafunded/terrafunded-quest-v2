import { lazy, Suspense } from "react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useRealmStrings } from "@/i18n/realm";
import type { GoalStatus, MonthlyPoint } from "@/domain";

const Loaded = lazy(() => import("./GoalCurveLoaded"));

/**
 * Keeps the Goal Curve testid in the document (e2e scrolls it into view) and loads recharts
 * only then. The Throne Room must not statically import the charts chunk.
 */
export function GoalCurve({ goal, history }: { goal: GoalStatus; history: MonthlyPoint[] }) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.05);
  const t = useRealmStrings().goalCurve;
  return (
    <div ref={ref}>
      {inView ? (
        <Suspense fallback={<div className="parchment-card min-h-[24rem]" data-testid="goal-curve" aria-label={t.aria} />}>
          <Loaded goal={goal} history={history} />
        </Suspense>
      ) : (
        <div className="parchment-card min-h-[24rem]" data-testid="goal-curve" aria-label={t.aria} />
      )}
    </div>
  );
}
