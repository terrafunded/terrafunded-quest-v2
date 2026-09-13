import { lazy, Suspense } from "react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useRealmStrings } from "@/i18n/realm";
import type { MonthlyPoint } from "@/domain";

const Loaded = lazy(() => import("./PulseChartsLoaded"));

type Props = {
  history: MonthlyPoint[];
  requiredClosings: number | null;
  requiredReservations: number | null;
  requiredProfitPerDay: number | null;
  eraLabel: string | null;
};

/**
 * Shell that keeps the Pulse testids in the document so e2e can scroll here, and only then
 * downloads recharts. The Throne Room's static import of this file must not pull the charts chunk.
 */
export function PulseCharts(props: Props) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.05);
  const t = useRealmStrings().pulseCharts;
  return (
    <div ref={ref}>
      {inView ? (
        <Suspense fallback={<PulseChartsShell aria={t.aria} />}>
          <Loaded {...props} />
        </Suspense>
      ) : (
        <PulseChartsShell aria={t.aria} />
      )}
    </div>
  );
}

function PulseChartsShell({ aria }: { aria: string }) {
  return (
    <section className="space-y-3" aria-label={aria} data-testid="pulse-charts">
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="parchment-card min-h-[16rem] sm:min-h-[20rem]" data-testid="pulse-chart-pace" />
        <div className="parchment-card min-h-[16rem] sm:min-h-[20rem]" data-testid="pulse-chart-profit" />
      </div>
    </section>
  );
}
