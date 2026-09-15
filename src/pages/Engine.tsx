import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { useHorizon } from "@/horizon/HorizonProvider";
import { useLang } from "@/i18n/lang";
import { ENGINE_UI } from "@/i18n/engine";
import {
  costPerClosing,
  engineDefaultsFromRealm,
  engineVerdict,
  reconcileThroneAndEngine,
  resolveFarmCost,
  runEngine,
  type EngineInputs,
  type EngineSensitivityCell,
} from "@/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { EngineCharts } from "@/components/realm/EngineCharts";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { date, money, moneyCompact, number, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const SCENARIOS_KEY = "quest.engine.scenarios";

interface SavedScenario {
  name: string;
  savedAt: string;
  inputs: EngineInputs;
}

function isScenario(value: unknown): value is SavedScenario {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<SavedScenario>;
  return typeof s.name === "string" && !!s.inputs && typeof s.inputs === "object" && typeof s.inputs.salesPace === "number";
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
    /* storage full / disabled — keep in memory for this visit */
  }
}

const BAND_CLASS = {
  met: "border-stage-closed/50 bg-stage-closed/15 text-foreground",
  close: "border-oxygen/50 bg-oxygen/15 text-foreground",
  short: "border-ember/40 bg-ember/10 text-foreground",
  far: "border-ember/60 bg-ember/20 text-foreground",
} as const;

export default function EnginePage() {
  const { data, isLoading, error, refetch } = useRealm();
  const { deadline: horizonDeadline } = useHorizon();
  const [lang] = useLang();
  const t = ENGINE_UI[lang];
  const [inputs, setInputs] = useState<EngineInputs | null>(null);
  const [farmCostTouched, setFarmCostTouched] = useState(false);
  const [scenarios, setScenarios] = useState<SavedScenario[]>(() => loadScenarios());
  const [scenarioName, setScenarioName] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const seededFor = useRef<string | null>(null);

  const defaults = useMemo(() => {
    if (!data) return null;
    const farm = data.realm.rotation.benchmark?.farmName ?? null;
    return engineDefaultsFromRealm(data.realm, farm);
  }, [data]);

  useEffect(() => {
    if (!defaults) return;
    if (seededFor.current !== horizonDeadline) {
      seededFor.current = horizonDeadline;
      setInputs(defaults.inputs);
      setFarmCostTouched(false);
      setSelectedScenario("");
    }
  }, [defaults, horizonDeadline]);

  const result = useMemo(
    () => (data && inputs && defaults ? runEngine(inputs, { ...data.realm, referencePace: defaults.referencePace }) : null),
    [data, inputs, defaults],
  );

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || !inputs || !result || !defaults) return null;

  const real = defaults.real;
  const update = (patch: Partial<EngineInputs>) => setInputs((prev) => (prev ? { ...prev, ...patch } : prev));
  const reset = () => {
    setInputs(defaults.inputs);
    setFarmCostTouched(false);
    setSelectedScenario("");
  };
  const saveScenario = () => {
    const name = scenarioName.trim();
    if (!name) return;
    const next = [...scenarios.filter((s) => s.name !== name), { name, savedAt: new Date().toISOString(), inputs }].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    persistScenarios(next);
    setScenarios(next);
    setSelectedScenario(name);
  };
  const loadScenario = (name: string) => {
    setSelectedScenario(name);
    const s = scenarios.find((x) => x.name === name);
    if (!s) return;
    setInputs({ ...defaults.inputs, ...s.inputs });
    setFarmCostTouched(true);
    setScenarioName(s.name);
  };
  const deleteScenario = () => {
    const next = scenarios.filter((s) => s.name !== selectedScenario);
    persistScenarios(next);
    setScenarios(next);
    setSelectedScenario("");
  };
  const loadSensitivity = (cell: EngineSensitivityCell) => {
    update({ salesPace: cell.salesPace, cycleMonths: cell.cycleMonths });
  };

  const closingCost = costPerClosing(inputs.costPerReservation, inputs.conversionPct);
  const farmCost = resolveFarmCost(inputs);
  const cycleMin = Math.max(1, (real.cycleMonths ?? 6) - 4);
  const cycleMax = (real.cycleMonths ?? 6) + 6;
  const g = data.realm.goal;
  const reconcile = reconcileThroneAndEngine(g, result, inputs.profitBasis === "era" ? "era" : "lifetime", lang);
  const eraAvg = g.recentAvgNetProfitPerClosedLot;
  const lifetimeAvg = g.avgNetProfitPerClosedLot;

  return (
    <div lang={lang} data-testid="engine-page" data-lang={lang} data-horizon={horizonDeadline.slice(0, 4)}>
      <PageHeader title={t.title} subtitle={t.subtitle}>
        <Button variant="outline" size="sm" onClick={reset} data-testid="engine-reset" className="min-h-11">
          <RotateCcw /> {t.reset}
        </Button>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      {/* THE VERDICT — largest type, plain-language paragraph */}
      <section
        aria-label={t.verdictLabel}
        className={cn("parchment-card mb-6 border-2 p-4 sm:p-6", BAND_CLASS[result.band])}
        data-testid="engine-verdict"
        data-band={result.band}
      >
        <p className="mb-2 text-sm font-heading uppercase tracking-wide text-muted-foreground">{t.verdictLabel}</p>
        <p className="font-display text-2xl leading-snug text-foreground sm:text-3xl md:text-4xl" data-testid="engine-verdict-text">
          {engineVerdict(result, lang)}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{t.band[result.band]}</p>
        {result.figures.interestShareOfProfit !== null && result.figures.totalInterest > 0 && (
          <p
            className="mt-4 border-t border-border/40 pt-4 text-base leading-snug text-foreground sm:text-lg"
            data-testid="engine-interest-verdict"
          >
            {t.interestBesideVerdict(
              moneyCompact(result.figures.totalInterest),
              `${result.figures.interestShareOfProfit.toFixed(0)}%`,
            )}
          </p>
        )}
        {(!reconcile.dollarsAgree || !reconcile.farmsAgree) && (
          <div className="mt-4 space-y-1 border-t border-border/40 pt-4 text-sm text-muted-foreground" data-testid="engine-throne-reconcile">
            {reconcile.dollarReason && <p>{reconcile.dollarReason}</p>}
            {reconcile.farmReason && <p>{reconcile.farmReason}</p>}
          </div>
        )}
      </section>

      {/* Bottleneck call */}
      <section className="parchment-card mb-6 p-4" data-testid="engine-bottleneck">
        <h2 className="font-heading text-lg">{t.bottleneck}</h2>
        <p className="mt-1 text-xl font-heading text-gold" data-testid="engine-bottleneck-label">
          {t.bottleneckLabel[result.bottleneck]}
        </p>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="engine-bottleneck-detail">
          {t.bottleneckDetail(result.bottleneckCode)}
        </p>
      </section>

      {/* Inputs */}
      <section aria-label={t.inputs} className="parchment-card mb-6 p-4 sm:p-5" data-testid="engine-inputs">
        <h2 className="mb-4 font-heading text-lg">{t.inputs}</h2>

        <div className="mb-5" data-testid="engine-profit-basis">
          <p className="mb-2 text-sm">{t.profitBasis}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={inputs.profitBasis === "era" ? "default" : "outline"}
              className="min-h-11"
              onClick={() => update({ profitBasis: "era" })}
              data-testid="engine-profit-basis-era"
            >
              {t.profitBasisEra}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={inputs.profitBasis === "lifetime" ? "default" : "outline"}
              className="min-h-11"
              onClick={() => update({ profitBasis: "lifetime" })}
              data-testid="engine-profit-basis-lifetime"
            >
              {t.profitBasisLifetime}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t.profitBasisWhy}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.profitBasisFigures(
              eraAvg === null ? "—" : money(eraAvg),
              lifetimeAvg === null ? "—" : money(lifetimeAvg),
              g.recentClosedLots,
              g.closedLots,
            )}
          </p>
        </div>

        <div className="mb-5">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="engine-cycle" className="text-sm">
              {t.cycleMonths}
              <AssumptionBadge label={real.cycleMonths !== null ? t.measured : t.assumption} />
            </label>
            <span className="font-numeric text-sm" data-testid="engine-cycle-value">
              {inputs.cycleMonths.toFixed(1)} mo → {t.effectiveCycle(result.effectiveCycleMonths.toFixed(1))}
            </span>
          </div>
          <Slider
            id="engine-cycle"
            min={cycleMin}
            max={cycleMax}
            step={0.1}
            value={[inputs.cycleMonths]}
            onValueChange={(v) => update({ cycleMonths: v[0] ?? inputs.cycleMonths })}
            data-testid="engine-cycle-slider"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t.cycleHint(real.cycleBenchmarkFarm, real.cycleExcludedFarms.join(", "), real.cycleSource)}
          </p>
          <p className="mt-1 text-xs text-ember/90">{t.couplingNote}</p>
        </div>

        {/* Sales pace — visually unmistakable assumption */}
        <div
          className="mb-5 rounded-md border-2 border-dashed border-ember/50 bg-ember/10 p-3"
          data-testid="engine-pace-assumption"
        >
          <p className="mb-2 text-sm font-heading text-ember">{t.assumption}</p>
          <p className="mb-3 text-sm leading-snug text-foreground">{t.salesPaceAssumption}</p>
          <NumberField
            id="engine-pace"
            label={t.salesPace}
            value={inputs.salesPace}
            onChange={(v) => update({ salesPace: v })}
            step={0.1}
            min={0.1}
            real={t.salesPaceHint(number(real.salesPace))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            id="engine-cpr"
            label={t.costPerReservation}
            value={inputs.costPerReservation}
            onChange={(v) => update({ costPerReservation: v })}
            step={100}
            min={0}
            prefix="$"
            hint={t.costPerReservationHint}
            real={t.costPerClosing(money(closingCost))}
            assumption
            assumptionLabel={t.assumption}
          />
          <NumberField
            id="engine-conversion"
            label={t.conversion}
            value={inputs.conversionPct}
            onChange={(v) => update({ conversionPct: v })}
            step={1}
            min={1}
            max={100}
            suffix="%"
            real={t.conversionHint(
              real.conversionResolvedPct !== null
                ? pct(real.conversionResolvedPct)
                : real.conversionWithCancellationsPct !== null
                  ? pct(real.conversionWithCancellationsPct)
                  : "—",
            )}
          />
          <NumberField
            id="engine-lots"
            label={t.lotsPerFarm}
            value={inputs.lotsPerFarm}
            onChange={(v) =>
              setInputs((prev) =>
                prev
                  ? {
                      ...prev,
                      lotsPerFarm: v,
                      farmCost: farmCostTouched ? prev.farmCost : Math.round(v * real.defaultLandCostPerLot),
                    }
                  : prev,
              )
            }
            step={1}
            min={1}
            real={real.lotsPerFarm === null ? "—" : number(real.lotsPerFarm)}
          />
          <NumberField
            id="engine-farm-cost"
            label={t.farmCost}
            value={farmCost}
            onChange={(v) => {
              setFarmCostTouched(true);
              update({ farmCost: v, acresPerFarm: null, costPerAcre: null });
            }}
            step={10_000}
            min={0}
            prefix="$"
            real={money(defaults.inputs.farmCost)}
            hint={
              inputs.acresPerFarm !== null && inputs.costPerAcre !== null
                ? `${number(inputs.acresPerFarm)} ac × ${money(inputs.costPerAcre)}`
                : undefined
            }
          />
          <NumberField
            id="engine-acres"
            label={t.acres}
            value={inputs.acresPerFarm ?? 0}
            onChange={(v) => update({ acresPerFarm: v > 0 ? v : null })}
            step={1}
            min={0}
            hint={t.acresHint}
            real={real.meanAcresPerFarm === null ? "—" : number(real.meanAcresPerFarm)}
            assumption
            assumptionLabel={t.assumption}
          />
          <NumberField
            id="engine-cpa"
            label={t.costPerAcre}
            value={inputs.costPerAcre ?? 0}
            onChange={(v) => update({ costPerAcre: v > 0 ? v : null })}
            step={100}
            min={0}
            prefix="$"
            real={real.meanCostPerAcre === null ? "—" : money(real.meanCostPerAcre)}
            assumption
            assumptionLabel={t.assumption}
          />
        </div>

        {/* Scenarios */}
        <div className="mt-5 flex flex-col gap-2 border-t border-border/50 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="engine-scenario-name" className="mb-1 block text-sm">
              {t.scenarioName}
            </label>
            <Input
              id="engine-scenario-name"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder={t.scenarioPlaceholder}
              className="min-h-11"
            />
          </div>
          <Button type="button" onClick={saveScenario} className="min-h-11" data-testid="engine-save-scenario">
            <Save /> {t.save}
          </Button>
          <div className="min-w-0 sm:w-48">
            <label htmlFor="engine-scenarios" className="mb-1 block text-sm">
              {t.savedScenarios}
            </label>
            <select
              id="engine-scenarios"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              value={selectedScenario}
              onChange={(e) => (e.target.value ? loadScenario(e.target.value) : setSelectedScenario(""))}
            >
              <option value="">{scenarios.length === 0 ? t.noneSaved : t.loadOne}</option>
              {scenarios.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {selectedScenario && (
            <Button type="button" variant="outline" onClick={deleteScenario} className="min-h-11">
              <Trash2 /> {t.remove}
            </Button>
          )}
        </div>
      </section>

      {/* Figures */}
      <section aria-label={t.figures} className="mb-6" data-testid="engine-figures">
        <h2 className="mb-3 font-heading text-lg">{t.figures}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Figure
            label={t.inventoryToday}
            value={number(result.figures.inventoryLots)}
            hint={t.inventoryDetail(result.figures.availableLots, result.figures.reservedLots, number(result.figures.reservedExpected))}
          />
          <Figure label={t.inventoryProfit} value={moneyCompact(result.figures.inventoryNetProfit)} />
          <Figure
            label={t.inventoryMonths}
            value={result.figures.inventoryMonths === null ? t.never : `${result.figures.inventoryMonths.toFixed(1)} ${t.months}`}
          />
          <Figure label={t.lotsProduced} value={number(result.figures.totalLotsProduced)} />
          <Figure label={t.turns} value={result.figures.turns.toFixed(1)} />
          <Figure label={t.netNoFresh} value={moneyCompact(result.figures.netProfitNoFresh)} testId="engine-net-no-fresh" />
          <Figure label={t.shortfall} value={moneyCompact(result.figures.shortfallDollars)} testId="engine-shortfall" />
          <Figure label={t.shortfallLots} value={result.figures.shortfallLots === null ? "—" : number(result.figures.shortfallLots)} />
          <Figure label={t.shortfallFarms} value={number(result.figures.shortfallFarms)} />
          <Figure label={t.freshCapital} value={moneyCompact(result.figures.freshCapital)} testId="engine-fresh-capital" />
          <Figure label={t.peakOutstanding} value={moneyCompact(result.figures.peakOutstanding)} hint={t.peakHint} testId="engine-peak" />
          <Figure
            label={t.capitalDeadline}
            value={result.figures.capitalDeadlineIso ? date(result.figures.capitalDeadlineIso) : t.never}
            hint={t.capitalDeadlineDetail(result.figures.capitalDeadlineCode)}
            testId="engine-capital-deadline"
          />
          <Figure
            label={t.totalAdSpend}
            value={moneyCompact(result.figures.totalAdSpend)}
            hint={result.figures.adSpendShareOfProfit !== null ? t.adShare(pct(result.figures.adSpendShareOfProfit)) : undefined}
          />
          <Figure
            label={t.totalInterest}
            value={moneyCompact(result.figures.totalInterest)}
            hint={
              result.figures.interestShareOfProfit !== null
                ? t.interestShareHint(`${result.figures.interestShareOfProfit.toFixed(0)}%`)
                : undefined
            }
            testId="engine-interest"
          />
        </div>
      </section>

      <EngineCharts result={result} t={t} onLoadSensitivity={loadSensitivity} />
    </div>
  );
}

function AssumptionBadge({ label }: { label: string }) {
  return (
    <span className="ml-2 inline-block rounded border border-ember/40 bg-ember/10 px-1.5 py-0.5 text-[0.65rem] font-heading uppercase tracking-wide text-ember">
      {label}
    </span>
  );
}

function Figure({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="parchment-card p-3" data-testid={testId}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-numeric text-xl text-foreground">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  prefix,
  suffix,
  hint,
  real,
  assumption,
  assumptionLabel,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
  real?: string;
  assumption?: boolean;
  assumptionLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
        {assumption && assumptionLabel && <AssumptionBadge label={assumptionLabel} />}
      </label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{prefix}</span>}
        <Input
          id={id}
          type="number"
          className={cn("min-h-11 tabular", prefix && "pl-7", suffix && "pr-8")}
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{suffix}</span>}
      </div>
      {(hint || real) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {hint}
          {hint && real ? " · " : ""}
          {real}
        </p>
      )}
    </div>
  );
}
