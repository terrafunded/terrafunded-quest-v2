import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import type { EngineResult, EngineSensitivityCell } from "@/domain/engine";
import type { EngineUiStrings } from "@/i18n/engine";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useWideViewport } from "@/hooks/useWideViewport";
import { useTheme } from "@/theme/ThemeProvider";
import { money, moneyCompact, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BORDER,
  EMBER,
  GOLD,
  LIBERTY,
  MUTED,
  OXYGEN,
  SPONSOR,
  STEEL,
  TOOLTIP_CLASS,
  TOOLTIP_STYLE,
  useChartReveal,
  CURSOR,
} from "./chartTokens";

type Props = {
  result: EngineResult;
  t: EngineUiStrings;
  onLoadSensitivity: (cell: EngineSensitivityCell) => void;
};

function ChartCard({
  testId,
  title,
  hint,
  children,
  className,
}: {
  testId: string;
  title: string;
  hint: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.05);
  return (
    <div ref={ref} className={cn("parchment-card p-3 sm:p-4", className)} data-testid={testId}>
      <h3 className="font-heading text-lg text-foreground">{title}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{hint}</p>
      {inView ? children : <div className="min-h-[14rem]" />}
    </div>
  );
}

export default function EngineChartsLoaded({ result, t, onLoadSensitivity }: Props) {
  const reduceMotion = useReducedMotion() ?? false;
  const { d } = useTheme();
  const wide = useWideViewport();
  const reveal = useChartReveal(reduceMotion);
  const duration = Math.min(900, d(700));

  return (
    <section className="space-y-4" aria-label={t.chartAria} data-testid="engine-charts">
      <TurnsTimeline result={result} t={t} reveal={reveal} duration={duration} wide={wide} />
      <ProfitStack result={result} t={t} reveal={reveal} duration={duration} />
      <InventoryChart result={result} t={t} reveal={reveal} duration={duration} />
      <CapitalChart result={result} t={t} reveal={reveal} duration={duration} />
      <SensitivityGrid result={result} t={t} onLoad={onLoadSensitivity} />
    </section>
  );
}

function TurnsTimeline({
  result,
  t,
  reveal,
  duration,
  wide,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  reveal: ReturnType<typeof useChartReveal>;
  duration: number;
  wide: boolean;
}) {
  const k = result.figures.capitalDeadlineMonthIndex;
  const maxMonth = Math.max(1, ...result.series.map((s) => s.monthIndex));
  const lanes = result.turns.filter((lane) => lane.kind !== "inventory" || lane.lots > 0);

  // Mobile: vertical stack of lanes; desktop: horizontal timeline.
  return (
    <ChartCard testId="engine-chart-turns" title={t.turnsChart} hint={t.turnsChartHint}>
      <div className={cn("min-w-0", !wide && "flex flex-col gap-3")}>
        {wide ? (
          <div className="relative overflow-x-auto">
            <div className="relative min-w-[36rem]" style={{ height: Math.max(180, lanes.length * 44 + 40) }}>
              {/* Month axis */}
              <div className="absolute inset-x-0 top-0 flex justify-between text-xs text-muted-foreground">
                <span>{monthLabel(result.asOf)}</span>
                <span>{monthLabel(result.deadline)}</span>
              </div>
              {lanes.map((lane, i) => {
                const top = 28 + i * 44;
                const blocks =
                  lane.blocks.length > 0
                    ? lane.blocks
                    : lane.purchaseMonth !== null
                      ? [
                          {
                            farmName: lane.label,
                            isExisting: false,
                            purchaseMonth: lane.purchaseMonth,
                            purchaseIso: lane.purchaseIso,
                            returnMonth: lane.returnMonth,
                            returnIso: lane.returnIso,
                            cost: lane.cost,
                            recycled: lane.recycled,
                            fresh: lane.fresh,
                            lots: lane.lots,
                            kind: (lane.kind === "fresh" ? "fresh" : "recycled") as "fresh" | "recycled",
                          },
                        ]
                      : [];
                return (
                  <div key={lane.id} className="absolute left-0 right-0" style={{ top, height: 36 }}>
                    <div className="mb-0.5 truncate text-xs text-muted-foreground">{lane.label}</div>
                    <div className="relative h-4 rounded-sm bg-muted/40">
                      {blocks.map((block, bi) => {
                        const start = Math.max(0, block.purchaseMonth);
                        const end =
                          block.returnMonth ??
                          Math.min(maxMonth, start + Math.round(result.effectiveCycleMonths));
                        const left = (start / maxMonth) * 100;
                        const width = Math.max(2, ((end - start) / maxMonth) * 100);
                        const color = block.kind === "fresh" ? SPONSOR : LIBERTY;
                        return (
                          <div
                            key={`${lane.id}-${bi}-${block.farmName}`}
                            className="absolute top-0 h-full rounded-sm"
                            style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: 0.85 }}
                            title={`${block.farmName}: ${moneyCompact(block.cost)} · recycled ${moneyCompact(block.recycled)} · fresh ${moneyCompact(block.fresh)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Reference lines */}
              {result.inventoryDryMonths.slice(0, 3).map((m) => (
                <div
                  key={`dry-${m}`}
                  className="absolute bottom-0 top-6 w-px bg-ember/60"
                  style={{ left: `${((m - 1) / maxMonth) * 100}%` }}
                  title="Inventory dry"
                />
              ))}
              {k > 0 && (
                <div
                  className="absolute bottom-0 top-6 w-0.5 bg-gold"
                  style={{ left: `${((k - 1) / maxMonth) * 100}%` }}
                  title={t.capitalDeadline}
                />
              )}
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {lanes.map((lane) => {
              const blocks =
                lane.blocks.length > 0
                  ? lane.blocks
                  : [
                      {
                        farmName: lane.label,
                        purchaseIso: lane.purchaseIso,
                        returnIso: lane.returnIso,
                        cost: lane.cost,
                        recycled: lane.recycled,
                        fresh: lane.fresh,
                        kind: (lane.kind === "fresh" ? "fresh" : "recycled") as "fresh" | "recycled",
                      },
                    ];
              return (
                <li key={lane.id} className="rounded-md border border-border/60 p-2">
                  <div className="font-heading text-sm">{lane.label}</div>
                  <ul className="mt-1 space-y-1">
                    {blocks.map((block, bi) => (
                      <li key={`${lane.id}-m-${bi}`} className="text-xs text-muted-foreground">
                        <span className="text-foreground">{block.farmName}</span>
                        {" · "}
                        {block.purchaseIso ? monthLabel(block.purchaseIso) : "—"} →{" "}
                        {block.returnIso ? monthLabel(block.returnIso) : "—"}
                        {" · "}
                        {moneyCompact(block.cost)}
                        {block.recycled > 0 ? ` · recycled ${moneyCompact(block.recycled)}` : ""}
                        {block.fresh > 0 ? ` · fresh ${moneyCompact(block.fresh)}` : ""}
                        <div className="mt-1 h-2 overflow-hidden rounded-sm bg-muted/40">
                          <div
                            className="h-full"
                            style={{
                              width: "100%",
                              background: block.kind === "fresh" ? SPONSOR : LIBERTY,
                              opacity: 0.85,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {/* Keep recharts out of the hero timeline; settle reveal for siblings */}
      <span className="sr-only" onAnimationEnd={reveal.settle} />
      {reveal.animate && <span className="hidden" style={{ animationDuration: `${duration}ms` }} />}
    </ChartCard>
  );
}

function ProfitStack({
  result,
  t,
  reveal,
  duration,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  reveal: ReturnType<typeof useChartReveal>;
  duration: number;
}) {
  const data = useMemo(
    () =>
      result.series.map((s) => ({
        t: s.monthIndex,
        label: monthLabel(s.date),
        inventory: s.profitFromInventory,
        recycled: s.profitFromInventory + s.profitFromRecycled,
        fresh: s.cumulativeProfit,
        goal: result.goalLine.start + ((result.goalLine.goal - result.goalLine.start) * (s.monthIndex - 1)) / Math.max(1, result.series.length - 1),
      })),
    [result],
  );

  return (
    <ChartCard testId="engine-chart-profit" title={t.profitChart} hint={t.profitChartHint}>
      <div className="h-64 min-w-0 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={BORDER} strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tickFormatter={(v) => moneyCompact(Number(v))} tick={{ fill: MUTED, fontSize: 11 }} width={56} />
            <ChartTooltip
              cursor={CURSOR}
              contentStyle={TOOLTIP_STYLE}
              wrapperClassName={TOOLTIP_CLASS}
              formatter={(value: number, name: string) => [money(value), name]}
            />
            <Area
              type="monotone"
              dataKey="inventory"
              name="Inventory"
              stackId="1"
              stroke={STEEL}
              fill={STEEL}
              fillOpacity={0.35}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
            />
            <Area
              type="monotone"
              dataKey="recycled"
              name="Turns"
              stroke={LIBERTY}
              fill={LIBERTY}
              fillOpacity={0.25}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
            />
            <Area
              type="monotone"
              dataKey="fresh"
              name="Fresh"
              stroke={SPONSOR}
              fill={SPONSOR}
              fillOpacity={0.2}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
              onAnimationEnd={reveal.settle}
            />
            <Line type="monotone" dataKey="goal" name="Goal" stroke={GOLD} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <ReferenceLine y={result.goal} stroke={GOLD} strokeOpacity={0.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function InventoryChart({
  result,
  t,
  reveal,
  duration,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  reveal: ReturnType<typeof useChartReveal>;
  duration: number;
}) {
  const data = result.series.map((s) => ({
    label: monthLabel(s.date),
    inventory: s.inventory,
    dry: s.inventoryDry ? s.inventory : null,
  }));

  return (
    <ChartCard testId="engine-chart-inventory" title={t.inventoryChart} hint={t.inventoryChartHint}>
      <div className="h-56 min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={BORDER} strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} width={40} />
            <ChartTooltip cursor={CURSOR} contentStyle={TOOLTIP_STYLE} wrapperClassName={TOOLTIP_CLASS} />
            <Area
              type="stepAfter"
              dataKey="inventory"
              name="Lots"
              stroke={OXYGEN}
              fill={OXYGEN}
              fillOpacity={0.25}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
            />
            <Area type="stepAfter" dataKey="dry" name="Dry" stroke={EMBER} fill={EMBER} fillOpacity={0.45} isAnimationActive={false} />
            {result.inventoryDryMonths[0] !== undefined && (
              <ReferenceLine
                x={monthLabel(result.series.find((s) => s.monthIndex === result.inventoryDryMonths[0])?.date ?? "")}
                stroke={EMBER}
                strokeDasharray="3 3"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function CapitalChart({
  result,
  t,
  reveal,
  duration,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  reveal: ReturnType<typeof useChartReveal>;
  duration: number;
}) {
  const peak = result.figures.peakOutstanding;
  const data = result.series.map((s) => ({
    label: monthLabel(s.date),
    owed: s.capitalOwed,
    interest: s.cumulativeInterest,
    peak: s.capitalOwed >= peak - 0.5 && peak > 0 ? s.capitalOwed : null,
  }));

  return (
    <ChartCard testId="engine-chart-capital" title={t.capitalChart} hint={t.capitalChartHint}>
      <div className="h-56 min-w-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={BORDER} strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis yAxisId="l" tickFormatter={(v) => moneyCompact(Number(v))} tick={{ fill: MUTED, fontSize: 11 }} width={56} />
            <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => moneyCompact(Number(v))} tick={{ fill: MUTED, fontSize: 11 }} width={48} />
            <ChartTooltip cursor={CURSOR} contentStyle={TOOLTIP_STYLE} wrapperClassName={TOOLTIP_CLASS} formatter={(v: number) => money(v)} />
            <Area
              yAxisId="l"
              type="monotone"
              dataKey="owed"
              name="Outstanding"
              stroke={SPONSOR}
              fill={SPONSOR}
              fillOpacity={0.3}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
            />
            <Line
              yAxisId="r"
              type="monotone"
              dataKey="interest"
              name="Interest"
              stroke={EMBER}
              dot={false}
              isAnimationActive={reveal.animate}
              animationDuration={duration}
              onAnimationEnd={reveal.settle}
            />
            {peak > 0 && <ReferenceLine yAxisId="l" y={peak} stroke={GOLD} strokeDasharray="4 4" label={{ value: `peak ${moneyCompact(peak)}`, fill: GOLD, fontSize: 11 }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function SensitivityGrid({
  result,
  t,
  onLoad,
}: {
  result: EngineResult;
  t: EngineUiStrings;
  onLoad: (cell: EngineSensitivityCell) => void;
}) {
  const [hover, setHover] = useState<EngineSensitivityCell | null>(null);
  const cells = result.sensitivity;
  const paces = [1, 1.5, 2];
  const cycles = [-60, 0, 60];
  const bandClass: Record<string, string> = {
    met: "bg-stage-closed/40 text-foreground",
    close: "bg-oxygen/30 text-foreground",
    short: "bg-ember/25 text-foreground",
    far: "bg-ember/50 text-foreground",
  };

  const cellAt = (mult: number, offset: number) => cells.find((c) => c.paceMultiplier === mult && c.cycleOffsetDays === offset);

  return (
    <ChartCard testId="engine-chart-sensitivity" title={t.sensitivity} hint={t.sensitivityHint}>
      <div className="overflow-x-auto">
        <div className="min-w-[22rem]">
          <div className="mb-1 grid grid-cols-[5rem_1fr_1fr_1fr] gap-1 text-center text-xs text-muted-foreground">
            <span />
            {paces.map((p) => (
              <span key={p}>
                {t.sensitivityPace} ×{p}
              </span>
            ))}
          </div>
          {cycles.map((offset) => (
            <div key={offset} className="mb-1 grid grid-cols-[5rem_1fr_1fr_1fr] gap-1">
              <div className="flex items-center text-xs text-muted-foreground">
                {t.sensitivityCycle} {offset > 0 ? `+${offset}d` : offset === 0 ? "base" : `${offset}d`}
              </div>
              {paces.map((mult) => {
                const cell = cellAt(mult, offset);
                if (!cell) return <div key={mult} className="min-h-11 rounded-md bg-muted/30" />;
                return (
                  <button
                    key={mult}
                    type="button"
                    className={cn(
                      "min-h-11 rounded-md border border-border/50 px-1 py-2 text-center text-xs font-numeric transition-colors hover:ring-2 hover:ring-gold/50",
                      bandClass[cell.band],
                    )}
                    onMouseEnter={() => setHover(cell)}
                    onFocus={() => setHover(cell)}
                    onClick={() => onLoad(cell)}
                    data-testid={`engine-sensitivity-${mult}-${offset}`}
                    aria-label={cell.verdict}
                  >
                    {moneyCompact(cell.netProfitAtDeadline)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {hover && (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="engine-sensitivity-preview">
          {hover.verdict}
        </p>
      )}
    </ChartCard>
  );
}
