import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { RotateCcw } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { runOracle, type Future, type OracleParams } from "@/domain";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/realm/Stat";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { useCommonStrings } from "@/i18n/common";
import { useOracleStrings, type OracleUiStrings } from "@/i18n/oracle";
import { date, money, moneyCompact, monthLabel, number } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The nine trailing averages the sliders drive; the War Plan extensions of OracleParams are not sliders. */
type SliderKey =
  | "lotsPerMonth"
  | "avgSalePrice"
  | "avgLandCost"
  | "avgMonthsToSellNote"
  | "newFarmEveryMonths"
  | "avgLotsPerFarm"
  | "investorTakePct"
  | "downPaymentPct"
  | "noteSalePct";

interface SliderDef {
  key: SliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint: string;
}

const SLIDERS: SliderDef[] = [
  { key: "lotsPerMonth", label: "Lots closed per month", min: 0, max: 20, step: 0.5, format: (v) => `${v}`, hint: "Trailing 90-day pace" },
  { key: "avgSalePrice", label: "Average sale price", min: 60_000, max: 250_000, step: 1_000, format: money, hint: "Mean price of closed lots" },
  { key: "avgLandCost", label: "Average land cost per lot", min: 10_000, max: 120_000, step: 500, format: money, hint: "Capital ÷ lots on closed lots" },
  { key: "avgMonthsToSellNote", label: "Months to sell a note", min: 0, max: 12, step: 0.5, format: (v) => `${v} mo`, hint: "Closing → note sale" },
  { key: "newFarmEveryMonths", label: "New farm every N months", min: 0, max: 12, step: 0.25, format: (v) => (v === 0 ? "never" : `${v} mo`), hint: "Mean gap between fundings" },
  { key: "avgLotsPerFarm", label: "Lots per new farm", min: 4, max: 40, step: 1, format: (v) => `${v}`, hint: "Mean total_lots" },
  { key: "investorTakePct", label: "Investor take (% of gross)", min: 0, max: 60, step: 1, format: (v) => `${v}%`, hint: "Blended, from closed lots" },
];

export default function Oracle() {
  const { data, isLoading, error, refetch } = useRealm();
  const t = useOracleStrings();
  const { realPrefix } = useCommonStrings();
  const defaults = data?.realm.oracleDefaults;
  const [params, setParams] = useState<OracleParams | null>(null);
  // Whether the sliders' future starts with the live reservations on their expected dates (the current-pace future does).
  const [withReservations, setWithReservations] = useState(true);

  useEffect(() => {
    if (defaults && !params) setParams(data?.realm.futures.current.params ?? defaults);
  }, [data, defaults, params]);

  const result = useMemo(() => {
    if (!data || !params) return null;
    const g = data.realm.goal;
    const current = data.realm.futures.current;
    const lag = data.realm.expected.medianDaysToClose;
    return runOracle(params, g, g.availableLots + g.reservedLots, data.realm.asOf, withReservations ? { scheduled: current.scheduled, paceLagDays: lag === null ? 0 : Math.round(lag) } : {});
  }, [data, params, withReservations]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || !params || !result || !defaults) return null;

  const g = data.realm.goal;
  const x = data.realm.expected;
  const cadence = data.realm.farmCadence;
  const series = result.series.filter((p) => p.monthIndex <= Math.max(24, (result.monthsToGoal ?? 0) + 3));
  const deadlineLabel = date(g.deadline);
  // THE ERA: the cadence only counts farms funded on or after ERA_START, and says so.
  const sliderHint = (s: SliderDef) => {
    const base = t.slider[s.key as keyof typeof t.slider]?.hint ?? s.hint;
    return s.key === "newFarmEveryMonths" && cadence.sinceLabel
      ? t.fundingHint(base, cadence.sinceLabel, cadence.farms, cadence.excluded)
      : base;
  };
  const adopt = (f: Future) => {
    setParams(f.params);
    setWithReservations(f.scheduled.length > 0);
  };

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setParams(data.realm.futures.current.params);
            setWithReservations(true);
          }}
        >
          <RotateCcw /> {t.reset}
        </Button>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t.futuresAria} data-testid="futures">
        {data.realm.futures.all.map((f, i) => (
          <FutureCard key={f.id} f={f} index={i} onAdopt={() => adopt(f)} cadenceSince={f.params.newFarmEveryMonths === defaults.newFarmEveryMonths ? cadence.sinceLabel : null} t={t} />
        ))}
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.yourFuture}</h2>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={withReservations}
          data-testid="oracle-with-reservations"
          onClick={() => setWithReservations((v) => !v)}
          className={cn(withReservations && "border-stage-reserved/50 text-stage-reserved")}
        >
          {withReservations ? t.withReservations(x.liveReservations) : t.closingsOnly}
        </Button>
      </div>
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-with-reservations={withReservations}>
        <Stat
          label={t.goalReached}
          value={result.goalDate ? date(result.goalDate) : t.notWithin10}
          hint={
            (result.goalDate ? (result.hitsDeadline ? t.beforeDeadline(deadlineLabel) : t.afterDeadline(deadlineLabel)) : t.raisePace) +
            (withReservations ? t.reservationsScheduledFirst(x.liveReservations) : t.closingsOnlyHint)
          }
          valueClassName={result.hitsDeadline ? "text-stage-closed" : "text-ember"}
          data-testid="oracle-goal-date"
        />
        <Stat label={t.monthsToGoal} value={result.monthsToGoal === null ? "—" : `${result.monthsToGoal}`} hint={t.monthsLeft(number(g.monthsToDeadline))} />
        <Stat label={t.netPerLot} value={money(result.netProfitPerLot)} hint={t.lotsStillNeeded(String(result.lotsNeeded ?? "—"))} />
        <Stat label={t.netAtDeadline} value={money(result.netProfitAtDeadline)} hint={t.farmsBought(result.farmsBought)} valueClassName="text-gold" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="parchment-card space-y-5 p-5">
          {SLIDERS.map((s) => (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-sm" htmlFor={`slider-${s.key}`}>
                  {t.slider[s.key as keyof typeof t.slider]?.label ?? s.label}
                </label>
                <span className="font-heading tabular text-gold">{s.format(params[s.key])}</span>
              </div>
              <Slider
                id={`slider-${s.key}`}
                min={s.min}
                max={s.max}
                step={s.step}
                value={[params[s.key]]}
                onValueChange={([v]) => v !== undefined && setParams({ ...params, [s.key]: v })}
                aria-label={t.slider[s.key as keyof typeof t.slider]?.label ?? s.label}
              />
              <div className="flex justify-between gap-3 text-[11px] text-muted-foreground">
                <span data-testid={`slider-hint-${s.key}`}>{sliderHint(s)}</span>
                <span className="shrink-0">{realPrefix} {s.format(defaults[s.key])}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="parchment-card p-4">
          <h2 className="mb-3 font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.projected}</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="oracle-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => monthLabel(String(d).slice(0, 7))} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={(v: number) => moneyCompact(v)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={56} domain={[0, (max: number) => Math.max(max, g.goal * 1.05)]} />
                <ChartTooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [money(v), name]}
                  labelFormatter={(d) => date(String(d))}
                />
                <ReferenceLine y={g.goal} stroke="hsl(var(--gold))" strokeDasharray="4 4" label={{ value: "$10M", fill: "hsl(var(--gold))", fontSize: 11, position: "insideTopRight" }} />
                {series.some((p) => p.date >= g.deadline) && (
                  <ReferenceLine x={series.find((p) => p.date >= g.deadline)?.date} stroke="hsl(var(--sponsor))" strokeDasharray="4 4" label={{ value: t.deadline, fill: "hsl(var(--sponsor))", fontSize: 11, position: "insideTopLeft" }} />
                )}
                <Area type="monotone" dataKey="cumulativeNetProfit" name={t.netProfit} stroke="hsl(var(--gold))" fill="url(#oracle-fill)" strokeWidth={2} />
                <Area type="monotone" dataKey="cumulativeCash" name={t.cashRealized} stroke="hsl(var(--stage-closed))" fill="transparent" strokeWidth={1.5} strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t.chartFootStart(money(g.netProfitToDate), number(g.availableLots + g.reservedLots))}
            {withReservations
              ? t.chartFootWithRes(x.liveReservations, x.conversionPct, x.medianDaysToClose ?? 0)
              : t.chartFootClosingsOnly}
            {t.chartFootCash(defaults.downPaymentPct, defaults.noteSalePct, params.avgMonthsToSellNote)}
          </p>
        </div>
      </div>
    </div>
  );
}

function FutureCard({ f, index, onAdopt, cadenceSince, t }: { f: Future; index: number; onAdopt: () => void; cadenceSince: string | null; t: OracleUiStrings }) {
  const tone = f.hitsDeadline ? "text-stage-closed" : f.exitDate ? "text-ember" : "text-muted-foreground";
  return (
    <article
      className={cn("parchment-card flex flex-col p-5", f.hitsDeadline && "border-stage-closed/40", index === 0 && "border-gold/30", f.id === "closings_only" && "border-dashed opacity-90")}
      data-testid="future"
      data-future={f.id}
      data-scheduled={f.scheduled.length}
    >
      <div className="stat-label">{f.title}</div>
      <div className={cn("mt-2 font-display text-2xl leading-none sm:text-3xl", tone)} data-testid="future-exit">
        {f.exitDate ? date(f.exitDate) : t.beyond10}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {f.exitDate ? (f.hitsDeadline ? t.beforeThe(date(f.result.deadline)) : t.afterThe(date(f.result.deadline))) : t.notReached}
        {f.daysEarlierThanCurrent !== null && f.id !== "current_pace" && (
          <>
            {" · "}
            <span className={f.daysEarlierThanCurrent > 0 ? "text-stage-closed" : f.daysEarlierThanCurrent < 0 ? "text-ember" : ""}>
              {f.daysEarlierThanCurrent > 0 ? t.daysEarlier(number(f.daysEarlierThanCurrent)) : f.daysEarlierThanCurrent < 0 ? t.daysLater(number(-f.daysEarlierThanCurrent)) : t.sameDay}
            </span>
          </>
        )}
      </div>
      <p className="mt-3 flex-1 text-sm text-foreground/85">
        {f.id === "required_pace" && (f.premise.includes("lots/month") || f.premise.includes("lotes/mes"))
          ? f.premise.replace("lots/month", `lots/month ${t.replayingMix}`).replace("lotes/mes", `lotes/mes ${t.replayingMix}`)
          : f.premise}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {f.scheduled.length > 0 && (
          <>
            <dt className="text-muted-foreground">{t.reservationsScheduled}</dt>
            <dd className="text-right tabular text-stage-reserved" data-testid="future-scheduled">
              {f.scheduled.length}{t.closingsArrow(number(Math.round(f.scheduled.reduce((a, s) => a + s.lots, 0) * 10) / 10))}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">{f.scheduled.length > 0 ? t.thenLotsMonth : t.lotsMonth}</dt>
        <dd className="text-right tabular" data-testid="future-pace">
          {f.params.lotsPerMonth}
          {f.id === "required_pace" && <span className="mt-0.5 block text-[11px] text-muted-foreground">{t.replayingMix}</span>}
        </dd>
        <dt className="text-muted-foreground">{t.farmEvery}</dt>
        <dd className="text-right tabular" data-testid="future-cadence">
          {f.params.newFarmEveryMonths} {t.mo}{cadenceSince ? <span className="ml-1 text-[11px] text-muted-foreground">{cadenceSince}</span> : null}
        </dd>
        <dt className="text-muted-foreground">{t.inventoryToday}</dt>
        <dd className="text-right tabular">{t.lots(number(f.startInventory))}</dd>
        <dt className="text-muted-foreground">{t.netAtDeadline}</dt>
        <dd className="text-right tabular">{moneyCompact(f.result.netProfitAtDeadline)}</dd>
      </dl>
      <Button variant="outline" size="sm" className="mt-4 self-start" onClick={onAdopt}>
        {t.loadSliders}
      </Button>
    </article>
  );
}
