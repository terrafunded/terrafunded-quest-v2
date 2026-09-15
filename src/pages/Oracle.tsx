import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, RotateCcw, Save, Trash2 } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import {
  compareResults,
  leversForPreset,
  runPreset,
  runSimulator,
  simulatorContextFromRealm,
  todayLevers,
  type BindingConstraint,
  type SimulatorLevers,
  type SimulatorPresetId,
  type SimulatorResult,
} from "@/domain";
import { parseDate } from "@/domain/dates";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingState, TableErrorsBanner } from "@/components/realm/PageStates";
import { ChartLegend } from "@/components/realm/ChartLegend";
import { constraintLabel, useOracleStrings, type OracleUiStrings } from "@/i18n/oracle";
import { date, money, moneyCompact, monthLabel, number } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BACKGROUND,
  BORDER,
  DATA_AXIS,
  DATA_GOAL,
  DATA_INTEREST,
  DATA_INVENTORY,
  DATA_OWED,
  DATA_PROFIT_INVENTORY,
  DATA_RAISE,
  GRID_STROKE_OPACITY,
  POPOVER,
  SERIES_STROKE_WIDTH,
  TOOLTIP_STYLE,
} from "@/components/realm/chartTokens";

const SCENARIOS_KEY = "quest.simulator.scenarios";
const PRESETS: SimulatorPresetId[] = ["today", "required", "plus_one_farm", "aggressive"];

interface SavedScenario {
  id: string;
  name: string;
  savedAt: string;
  levers: SimulatorLevers;
}

function isScenario(value: unknown): value is SavedScenario {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<SavedScenario>;
  return typeof s.id === "string" && typeof s.name === "string" && !!s.levers && typeof s.levers.adSpendPerMonth === "number";
}

function loadScenarios(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isScenario) : [];
  } catch {
    return [];
  }
}

function persistScenarios(list: SavedScenario[]) {
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(list));
  } catch {
    /* storage full / disabled */
  }
}

function presetLabel(t: OracleUiStrings, id: SimulatorPresetId): string {
  if (id === "required") return t.presetRequired;
  if (id === "plus_one_farm") return t.presetPlusOne;
  if (id === "aggressive") return t.presetAggressive;
  return t.presetToday;
}

export default function Oracle() {
  const { data, isLoading, error, refetch } = useRealm();
  const t = useOracleStrings();
  const reduceMotion = useReducedMotion() ?? false;
  const [levers, setLevers] = useState<SimulatorLevers | null>(null);
  const [preset, setPreset] = useState<SimulatorPresetId | null>("today");
  const [advanced, setAdvanced] = useState(false);
  const [scenarios, setScenarios] = useState<SavedScenario[]>(() => loadScenarios());
  const [saveName, setSaveName] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const ctx = useMemo(() => (data ? simulatorContextFromRealm(data.realm) : null), [data]);

  useEffect(() => {
    if (ctx && !levers) setLevers(todayLevers(ctx));
  }, [ctx, levers]);

  const today = useMemo(() => (ctx ? runPreset("today", ctx, true) : null), [ctx]);
  const plan = useMemo(() => {
    if (!ctx || !levers) return null;
    return runSimulator(levers, ctx, {
      presetId: preset,
      pinFreedomDate: preset === "today" ? today?.freedomDate : undefined,
    });
  }, [ctx, levers, preset, today]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || !ctx || !levers || !plan || !today) return null;

  const g = data.realm.goal;
  const adopt = (id: SimulatorPresetId) => {
    setLevers(leversForPreset(id, ctx));
    setPreset(id);
  };
  const setLever = <K extends keyof SimulatorLevers>(key: K, value: SimulatorLevers[K]) => {
    setLevers({ ...levers, [key]: value });
    setPreset(null);
  };
  const onSlider = (key: keyof SimulatorLevers, value: number) => {
    setLevers({ ...levers, [key]: value });
    setPreset(null);
  };

  const save = () => {
    const name = saveName.trim();
    if (!name) return;
    const next: SavedScenario[] = [{ id: `${Date.now()}`, name, savedAt: new Date().toISOString(), levers }, ...scenarios].slice(0, 12);
    setScenarios(next);
    persistScenarios(next);
    setSaveName("");
  };

  const remove = (id: string) => {
    const next = scenarios.filter((s) => s.id !== id);
    setScenarios(next);
    persistScenarios(next);
    setCompareIds((ids) => ids.filter((x) => x !== id));
  };

  const toggleCompare = (id: string) => {
    setCompareIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= 3) return ids;
      return [...ids, id];
    });
  };

  const compareRows = compareResults(
    compareIds
      .map((id) => scenarios.find((s) => s.id === id))
      .filter((s): s is SavedScenario => !!s)
      .map((s) => ({ id: s.id, name: s.name, result: runSimulator(s.levers, ctx, { skipMarginals: true }) })),
  );

  const vsToday = plan.vsTodayPace;
  const vsLine =
    !plan.freedomDate && vsToday?.direction === "behind"
      ? t.notWithinHorizon
      : vsToday?.direction === "ahead"
        ? t.monthsAheadOfToday(number(Math.max(0.1, vsToday.months)))
        : vsToday?.direction === "behind"
          ? t.monthsBehindToday(number(Math.max(0.1, vsToday.months)))
          : t.sameAsTodayPace;

  const deadlineVs =
    plan.vsDeadline?.direction === "ahead"
      ? t.daysAheadOfDeadline(number(plan.vsDeadline.days))
      : plan.vsDeadline?.direction === "behind"
        ? t.daysBehindDeadline(number(plan.vsDeadline.days))
        : plan.vsDeadline
          ? t.sameAsDeadline
          : null;

  const bottleneckText =
    plan.bottleneck.kind === "inventory"
      ? t.bottleneckInventory
      : plan.bottleneck.kind === "demand"
        ? t.bottleneckDemand
        : plan.bottleneck.kind === "capital"
          ? plan.bottleneck.fundByDate
            ? t.bottleneckCapital(money(plan.bottleneck.capitalShort), date(plan.bottleneck.fundByDate))
            : t.bottleneckCapitalNoDate(money(plan.bottleneck.capitalShort))
          : t.bottleneckNone;

  const bottleColor =
    plan.bottleneck.kind === "inventory" ? DATA_INVENTORY : plan.bottleneck.kind === "capital" ? DATA_RAISE : DATA_OWED;

  const chartRows = mergeChart(plan, today, g.deadline);
  const capitalMax = Math.max(ctx.farmCost * 8, levers.capitalAvailable, ctx.mix.reduce((a, e) => a + e.capital, 0) * 2, 500_000);

  return (
    <div className="space-y-3">
      <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title font-display text-2xl text-gold sm:text-3xl">{t.title}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => adopt("today")}>
          <RotateCcw /> {t.reset}
        </Button>
      </header>
      <TableErrorsBanner errors={data.tableErrors} />

      <div className="sticky top-14 z-20 space-y-2 bg-background/95 py-1 backdrop-blur md:static md:bg-transparent md:py-0 md:backdrop-blur-none">
        <section className="parchment-card px-4 py-2.5" data-testid="simulator-hero" aria-label={t.freedomDate}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="stat-label">{t.freedomDate}</p>
              <motion.p
                key={plan.freedomDate ?? "none"}
                data-testid="simulator-freedom-date"
                className={cn("font-display text-4xl leading-none tracking-tight sm:text-5xl", plan.freedomDate ? "text-foreground" : "text-muted-foreground")}
                initial={reduceMotion ? false : { opacity: 0.4, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                {plan.freedomDate ? date(plan.freedomDate) : t.notWithinHorizon}
              </motion.p>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="simulator-vs-today">
                {vsLine}
                {deadlineVs ? <span className="mt-0.5 block text-[11px]">{deadlineVs}</span> : null}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground" data-testid="projected-exit-at-current-pace">
              <span className="stat-label">{t.projectedExitAtCurrentPace}</span>{" "}
              <span className="font-heading tabular text-foreground">{today.freedomDate ? date(today.freedomDate) : "—"}</span>
            </p>
          </div>
          <RaceBar
            asOf={ctx.asOf}
            deadline={g.deadline}
            planDate={plan.freedomDate}
            todayDate={today.freedomDate}
            t={t}
            reduceMotion={reduceMotion}
          />
        </section>

        <section
          className="grid grid-cols-2 gap-2 rounded-lg border px-3 py-2 sm:grid-cols-5"
          aria-label={t.costAria}
          data-testid="simulator-cost-strip"
          style={{ borderColor: BORDER }}
        >
          <CostCell label={t.costAds} value={moneyCompact(plan.totalAdSpend)} color={DATA_OWED} />
          <CostCell label={t.costLand} value={moneyCompact(plan.landCapitalDeployed)} color={DATA_RAISE} />
          <CostCell label={t.costPeak} value={moneyCompact(plan.peakCapitalOwed)} color={DATA_OWED} />
          <CostCell label={t.costInterest} value={moneyCompact(plan.interestPaid)} color={DATA_INTEREST} />
          <CostCell label={t.costNet} value={moneyCompact(plan.netProfitAtDeadline)} color={DATA_PROFIT_INVENTORY} wide />
        </section>
      </div>

      <section
        className="rounded-lg border px-3 py-2 text-sm"
        aria-label={t.bottleneckAria}
        data-testid="simulator-bottleneck"
        data-kind={plan.bottleneck.kind}
        style={{ borderColor: bottleColor, background: `color-mix(in srgb, ${bottleColor} 12%, transparent)` }}
      >
        {bottleneckText}
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <section className="parchment-card space-y-3 p-3" aria-label={t.leversAria} data-testid="simulator-levers">
          <div className="flex flex-wrap gap-1.5" aria-label={t.presetsAria} data-testid="simulator-presets">
            {PRESETS.map((id) => (
              <Button
                key={id}
                variant="outline"
                size="sm"
                aria-pressed={preset === id}
                data-testid={`preset-${id}`}
                data-preset={id}
                className={cn("h-8 px-2.5 text-xs", preset === id && "border-gold/60 bg-gold/10")}
                onClick={() => adopt(id)}
              >
                {presetLabel(t, id)}
              </Button>
            ))}
          </div>
          <Lever
            id="ads"
            label={t.adsLabel}
            value={levers.adSpendPerMonth}
            min={0}
            max={200_000}
            step={1_000}
            format={money}
            hint={t.adsHint}
            onChange={(v) => onSlider("adSpendPerMonth", v)}
            marginal={marginalCopy(t, "ads", plan.marginalAds.binds, plan.marginalAds.binding, plan.marginalAds.daysSooner)}
            binds={plan.marginalAds.binds}
          />
          <Lever
            id="farms"
            label={t.farmsLabel}
            value={levers.farmsPerQuarter}
            min={0}
            max={8}
            step={0.25}
            format={(v) => number(v)}
            hint={t.farmsHint}
            onChange={(v) => onSlider("farmsPerQuarter", v)}
            marginal={marginalCopy(t, "farms", plan.marginalFarm.binds, plan.marginalFarm.binding, plan.marginalFarm.daysSooner)}
            binds={plan.marginalFarm.binds}
          />
          <Lever
            id="capital"
            label={t.capitalLabel}
            value={levers.capitalAvailable}
            min={0}
            max={capitalMax}
            step={50_000}
            format={money}
            hint={t.capitalHint}
            onChange={(v) => onSlider("capitalAvailable", v)}
            marginal={t.closingsOutput(number(plan.demandPerMonth))}
            binds={false}
          />

          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
            data-testid="simulator-advanced"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advanced && "rotate-180")} />
            {advanced ? t.advancedHide : t.advancedToggle}
          </button>
          {advanced && (
            <div className="space-y-3 border-t pt-3">
              <Lever
                id="sale"
                label={t.salePriceLabel}
                value={levers.avgSalePrice}
                min={60_000}
                max={250_000}
                step={1_000}
                format={money}
                hint=""
                onChange={(v) => setLever("avgSalePrice", v)}
                marginal=""
                binds={false}
              />
              <Lever
                id="cpr"
                label={t.cprLabel}
                value={levers.costPerReservation}
                min={200}
                max={8_000}
                step={50}
                format={money}
                hint={t.cprHint}
                onChange={(v) => setLever("costPerReservation", v)}
                marginal={t.cprHint}
                binds={false}
                assumptionLabel={t.assumption}
              />
              <Lever
                id="conversion"
                label={t.conversionLabel}
                value={levers.conversionPct}
                min={10}
                max={100}
                step={1}
                format={(v) => `${number(v)}%`}
                hint=""
                onChange={(v) => setLever("conversionPct", v)}
                marginal=""
                binds={false}
              />
              <Lever
                id="take"
                label={t.takeLabel}
                value={levers.investorTakePct}
                min={0}
                max={60}
                step={1}
                format={(v) => `${number(v)}%`}
                hint=""
                onChange={(v) => setLever("investorTakePct", v)}
                marginal=""
                binds={false}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={t.saveName}
              aria-label={t.saveName}
              className="h-9 text-sm"
            />
            <Button variant="outline" size="sm" onClick={save} disabled={!saveName.trim()}>
              <Save /> {t.save}
            </Button>
          </div>
        </section>

        <section className="parchment-card p-3" data-testid="simulator-chart">
          <h2 className="mb-2 font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.chartTitle}</h2>
          <div className="h-48 w-full sm:h-52">
            <ResponsiveContainer>
              <ComposedChart data={chartRows} margin={{ top: 8, right: 36, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={DATA_AXIS} strokeOpacity={GRID_STROKE_OPACITY} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => monthLabel(String(d).slice(0, 7))} tick={{ fill: DATA_AXIS, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tickFormatter={(v: number) => moneyCompact(v)} tick={{ fill: DATA_AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={52} domain={[0, (max: number) => Math.max(max, g.goal * 1.05)]} />
                <ChartTooltip
                  contentStyle={{ ...TOOLTIP_STYLE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, background: POPOVER }}
                  formatter={(v: number, name: string) => [money(v), name]}
                  labelFormatter={(d) => date(String(d))}
                />
                <ReferenceLine y={g.goal} stroke={DATA_GOAL} strokeWidth={SERIES_STROKE_WIDTH} strokeDasharray="4 4" label={{ value: "$10M", fill: DATA_GOAL, fontSize: 11, position: "insideTopRight" }} />
                {chartRows.some((p) => p.date >= g.deadline) && (
                  <ReferenceLine
                    x={chartRows.find((p) => p.date >= g.deadline)?.date}
                    stroke={DATA_GOAL}
                    strokeWidth={SERIES_STROKE_WIDTH}
                    strokeDasharray="4 4"
                    label={{ value: t.deadline, fill: DATA_GOAL, fontSize: 11, position: "insideBottomLeft" }}
                  />
                )}
                <Area type="monotone" dataKey="savedHigh" name={t.legendSaved} stroke="none" fill={DATA_GOAL} fillOpacity={0.16} isAnimationActive={!reduceMotion} />
                <Area type="monotone" dataKey="savedLow" name={t.legendSaved} stroke="none" fill={BACKGROUND} fillOpacity={1} isAnimationActive={false} />
                <Line type="monotone" dataKey="today" name={t.legendToday} stroke={DATA_INVENTORY} strokeWidth={SERIES_STROKE_WIDTH} strokeDasharray="5 4" dot={false} isAnimationActive={!reduceMotion} />
                <Line type="monotone" dataKey="plan" name={t.legendPlan} stroke={DATA_PROFIT_INVENTORY} strokeWidth={SERIES_STROKE_WIDTH} dot={false} isAnimationActive={!reduceMotion} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            aria={t.chartLegendAria}
            items={[
              { color: DATA_PROFIT_INVENTORY, label: t.legendPlan },
              { color: DATA_INVENTORY, label: t.legendToday, dashed: true },
              { color: DATA_GOAL, label: t.legendGoal, dashed: true },
              { color: DATA_GOAL, label: t.legendSaved },
            ]}
          />
        </section>
      </div>

      <section aria-label={t.savedAria} className="space-y-2" data-testid="simulator-saved">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{t.comparePick}</p>
          {scenarios.length === 0 && <p className="text-xs text-muted-foreground">{t.noSaved}</p>}
          {scenarios.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className={cn("h-8 text-xs", compareIds.includes(s.id) && "border-gold/60")}
                aria-pressed={compareIds.includes(s.id)}
                onClick={() => toggleCompare(s.id)}
              >
                {s.name}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t.remove} onClick={() => remove(s.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </span>
          ))}
        </div>
        {compareRows.length > 0 && (
          <div className="overflow-x-auto" data-testid="simulator-compare" aria-label={t.compareAria}>
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">{t.compare}</th>
                  <th className="py-1 pr-3 font-medium">{t.freedomDate}</th>
                  <th className="py-1 pr-3 font-medium">{t.costNet}</th>
                  <th className="py-1 pr-3 font-medium">{t.costAds}</th>
                  <th className="py-1 pr-3 font-medium">{t.costLand}</th>
                  <th className="py-1 pr-3 font-medium">{t.costPeak}</th>
                  <th className="py-1 font-medium">{t.costInterest}</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-1.5 pr-3 font-heading">{row.name}</td>
                    <td className="py-1.5 pr-3 tabular">{row.freedomDate ? date(row.freedomDate) : t.notWithinHorizon}</td>
                    <td className="py-1.5 pr-3 tabular" style={{ color: DATA_PROFIT_INVENTORY }}>{moneyCompact(row.netProfitAtDeadline)}</td>
                    <td className="py-1.5 pr-3 tabular" style={{ color: DATA_OWED }}>{moneyCompact(row.totalAdSpend)}</td>
                    <td className="py-1.5 pr-3 tabular" style={{ color: DATA_RAISE }}>{moneyCompact(row.landCapitalDeployed)}</td>
                    <td className="py-1.5 pr-3 tabular" style={{ color: DATA_OWED }}>{moneyCompact(row.peakCapitalOwed)}</td>
                    <td className="py-1.5 tabular" style={{ color: DATA_INTEREST }}>{moneyCompact(row.interestPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function marginalCopy(
  t: OracleUiStrings,
  lever: "ads" | "farms",
  binds: boolean,
  binding: BindingConstraint | null,
  daysSooner: number | null,
): string {
  if (binds) return lever === "ads" ? t.leverBindsAds(constraintLabel(t, binding)) : t.leverBindsFarms(constraintLabel(t, binding));
  const days = daysSooner ?? 0;
  if (Math.abs(days) >= 1000) return lever === "ads" ? t.marginalAdsReaches : t.marginalFarmReaches;
  if (days >= 0) return lever === "ads" ? t.marginalAdsSooner(number(days)) : t.marginalFarmSooner(number(days));
  return lever === "ads" ? t.marginalAdsLater(number(-days)) : t.marginalFarmLater(number(-days));
}

function CostCell({ label, value, color, wide }: { label: string; value: string; color: string; wide?: boolean }) {
  return (
    <div className={cn(wide && "col-span-2 sm:col-span-1")}>
      <p className="stat-label">{label}</p>
      <p className="font-heading tabular text-lg leading-tight" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function Lever({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  hint,
  onChange,
  marginal,
  binds,
  assumptionLabel,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint: string;
  onChange: (v: number) => void;
  marginal: string;
  binds: boolean;
  assumptionLabel?: string;
}) {
  return (
    <div data-testid={`lever-${id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm" htmlFor={`slider-${id}`}>
          {label}
          {assumptionLabel ? (
            <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">({assumptionLabel})</span>
          ) : null}
        </label>
        <span className="font-heading tabular text-gold">{format(value)}</span>
      </div>
      <Slider
        id={`slider-${id}`}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        aria-label={label}
      />
      <div className="flex justify-between gap-3 text-[11px] text-muted-foreground">
        <span>{hint}</span>
        {marginal ? (
          <span className={cn("shrink-0 text-right", binds && "text-ember")} data-testid={`lever-marginal-${id}`}>
            {marginal}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RaceBar({
  asOf,
  deadline,
  planDate,
  todayDate,
  t,
  reduceMotion,
}: {
  asOf: Date;
  deadline: string;
  planDate: string | null;
  todayDate: string | null;
  t: OracleUiStrings;
  reduceMotion: boolean;
}) {
  const start = asOf.getTime();
  const points = [deadline, planDate, todayDate].map((iso) => parseDate(iso)?.getTime() ?? start);
  const end = Math.max(start + 1, ...points);
  const pct = (iso: string | null) => {
    const d = parseDate(iso);
    if (!d) return null;
    return Math.min(96, Math.max(2, ((d.getTime() - start) / (end - start)) * 100));
  };
  const planPct = pct(planDate);
  const todayPct = pct(todayDate);
  const deadlinePct = pct(deadline);

  return (
    <div className="mt-3" aria-label={t.raceAria} data-testid="simulator-race">
      <div className="relative h-3 overflow-visible rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: DATA_PROFIT_INVENTORY }}
          animate={{ width: `${planPct ?? 0}%` }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 160, damping: 24 }}
        />
        {todayPct !== null && (
          <span
            className="absolute top-1/2 h-3.5 w-1.5 -translate-y-1/2 rounded-sm"
            style={{ left: `calc(${todayPct}% + 4px)`, background: DATA_INVENTORY }}
            title={t.raceToday}
          />
        )}
        {deadlinePct !== null && (
          <span
            className="absolute -top-1 h-5 w-0.5"
            style={{ left: `${deadlinePct}%`, background: DATA_GOAL }}
            title={t.raceDeadline}
          />
        )}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-muted-foreground">
        {deadlinePct !== null && (
          <span className="absolute -translate-x-1/2" style={{ left: `${deadlinePct}%`, color: DATA_GOAL }}>
            {t.raceDeadline}
          </span>
        )}
        {todayPct !== null && (
          <span
            className="absolute whitespace-nowrap"
            style={{ left: todayPct > 85 ? "auto" : `${todayPct}%`, right: todayPct > 85 ? 0 : "auto", transform: todayPct > 85 ? "none" : "translateX(-50%)" }}
          >
            {t.raceToday}
          </span>
        )}
      </div>
    </div>
  );
}

function mergeChart(plan: SimulatorResult, today: SimulatorResult, deadline: string) {
  const todayBy = new Map(today.series.map((s) => [s.date, s.cumulativeNetProfit]));
  const last = Math.max(plan.series.find((s) => s.date >= deadline)?.monthIndex ?? 16, 16);
  return plan.series
    .filter((s) => s.monthIndex <= last + 4)
    .map((s) => {
      const todayY = todayBy.get(s.date) ?? null;
      const planY = s.cumulativeNetProfit;
      const ahead = todayY !== null && planY > todayY;
      return {
        date: s.date,
        plan: planY,
        today: todayY,
        savedHigh: ahead ? planY : null,
        savedLow: ahead ? todayY : null,
      };
    });
}
