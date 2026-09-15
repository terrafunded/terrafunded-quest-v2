import { lazy, Suspense } from "react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import type { EngineResult, EngineSensitivityCell } from "@/domain/engine";
import type { EngineUiStrings } from "@/i18n/engine";

const Loaded = lazy(() => import("./EngineChartsLoaded"));

type Props = {
  result: EngineResult;
  t: EngineUiStrings;
  nextFarmFundByDate: string | null;
  onLoadSensitivity: (cell: EngineSensitivityCell) => void;
};

/**
 * Keeps Engine chart testids in the document and loads recharts only when in view —
 * same pattern as GoalCurve / PulseCharts so the initial bundle stays untouched.
 */
export function EngineCharts(props: Props) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.05);
  return (
    <div ref={ref}>
      {inView ? (
        <Suspense fallback={<EngineChartsShell aria={props.t.chartAria} />}>
          <Loaded {...props} />
        </Suspense>
      ) : (
        <EngineChartsShell aria={props.t.chartAria} />
      )}
    </div>
  );
}

function EngineChartsShell({ aria }: { aria: string }) {
  return (
    <section className="space-y-4" aria-label={aria} data-testid="engine-charts">
      <div className="parchment-card min-h-[20rem]" data-testid="engine-chart-turns" />
      <div className="parchment-card min-h-[20rem]" data-testid="engine-chart-profit" />
      <div className="parchment-card min-h-[16rem]" data-testid="engine-chart-inventory" />
      <div className="parchment-card min-h-[16rem]" data-testid="engine-chart-capital" />
      <div className="parchment-card min-h-[16rem]" data-testid="engine-chart-sensitivity" />
    </section>
  );
}
