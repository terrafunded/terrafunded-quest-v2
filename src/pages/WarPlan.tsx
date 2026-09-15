import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { useHorizon } from "@/horizon/HorizonProvider";
import {
  extraInterestVersus2027,
  solveWarPlan,
  warPlanMonthLabel,
  type FarmGrade,
  type FarmGradeVerdict,
  type InvestorMixEntry,
  type MixDealType,
  type RotationBenchmark,
  type RotationPlan,
  type TargetMode,
  type WarPlan,
  type WarPlanColumn,
  type WarPlanColumnId,
  type WarPlanInputs,
} from "@/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FarmCalendar } from "@/components/realm/FarmCalendar";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { useCommonStrings } from "@/i18n/common";
import { useLang } from "@/i18n/lang";
import { useWarPlanStrings, type WarPlanUiStrings } from "@/i18n/warPlan";
import { type ExitHorizon } from "@/config/goal";
import { date, money, moneyCompact, monthLabel, number, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const SCENARIOS_KEY = "quest.warplan.scenarios";

interface SavedScenario {
  name: string;
  savedAt: string;
  inputs: WarPlanInputs;
}

function isScenario(value: unknown): value is SavedScenario {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<SavedScenario>;
  return typeof s.name === "string" && !!s.inputs && typeof s.inputs === "object" && typeof s.inputs.target === "number" && Array.isArray(s.inputs.investorMix);
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
    // Storage disabled or full: the scenario still lives in memory for this visit.
  }
}

const GRADE_CLASS: Record<FarmGradeVerdict, string> = { benchmark: "text-gold", ahead: "text-stage-closed", on_pace: "text-foreground", behind: "text-ember", unrated: "text-muted-foreground" };
const signed = (n: number, digits = 1) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
const daysLabel = (n: number, t: WarPlanUiStrings) => t.days(n);
const turnsLabel = (n: number | null, t: WarPlanUiStrings) => (n === null ? "—" : t.turns(Number.isInteger(n) ? String(n) : n.toFixed(1)));

export default function WarPlanPage() {
  const { data, isLoading, error, refetch } = useRealm();
  const { deadline: horizonDeadline } = useHorizon();
  const [lang] = useLang();
  const t = useWarPlanStrings();
  const defaults = data?.realm.warPlanDefaults;
  const [inputs, setInputs] = useState<WarPlanInputs | null>(null);
  const [farmCostTouched, setFarmCostTouched] = useState(false);
  const [column, setColumn] = useState<WarPlanColumnId>("required_plan");
  const [scenarios, setScenarios] = useState<SavedScenario[]>(() => loadScenarios());
  const [scenarioName, setScenarioName] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const seededFor = useRef<string | null>(null);

  // First visit seeds from the real defaults. A global horizon change re-seeds (stale inputs
  // from the old year are a bug). Loading a saved scenario does not write the global horizon.
  useEffect(() => {
    if (!defaults) return;
    if (seededFor.current !== horizonDeadline) {
      seededFor.current = horizonDeadline;
      setInputs(defaults.inputs);
      setFarmCostTouched(false);
      setSelectedScenario("");
    }
  }, [defaults, horizonDeadline]);

  const plan = useMemo(() => (data && inputs ? solveWarPlan(inputs, data.realm, lang) : null), [data, inputs, lang]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || !inputs || !plan || !defaults) return null;

  const real = defaults.real;
  const seasonality = data.realm.seasonality;
  const update = (patch: Partial<WarPlanInputs>) => setInputs((prev) => (prev ? { ...prev, ...patch } : prev));
  const setMix = (investorMix: InvestorMixEntry[]) => update({ investorMix });
  const reset = () => {
    setInputs(defaults.inputs);
    setFarmCostTouched(false);
    setSelectedScenario("");
  };
  const saveScenario = () => {
    const name = scenarioName.trim();
    if (!name) return;
    const next = [...scenarios.filter((s) => s.name !== name), { name, savedAt: new Date().toISOString(), inputs }].sort((a, b) => a.name.localeCompare(b.name));
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

  const selected = plan.all.find((c) => c.id === column) ?? plan.required;
  const cashMode = inputs.targetMode === "cash_in_bank";
  const modeShort = t.modeShort[inputs.targetMode];
  const lastUsefulPurchase = plan.required.rows.find((r) => r.monthIndex === plan.maxPurchaseMonth)?.date ?? null;
  const interestPerDay = data.realm.debt.interestPerDay ?? 0;
  const exitHorizon = Number(data.realm.goal.deadline.slice(0, 4)) as ExitHorizon;
  const extraInterest = extraInterestVersus2027(interestPerDay, data.realm.asOf, exitHorizon);
  const extra2028 = extraInterestVersus2027(interestPerDay, data.realm.asOf, 2028);
  const extra2029 = extraInterestVersus2027(interestPerDay, data.realm.asOf, 2029);

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle(real.eraSince)}>
        <Button variant="outline" size="sm" onClick={reset} data-testid="warplan-reset">
          <RotateCcw /> {t.reset}
        </Button>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      <section aria-label={t.inputsAria} className="parchment-card mb-6 p-4 sm:p-5" data-testid="warplan-inputs">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField id="wp-target" label={t.target} value={inputs.target} onChange={(v) => update({ target: v })} step={100_000} prefix="$" real={money(real.target)} hint={`${t.modeLabel[inputs.targetMode]}`} />
          <div className="min-w-0">
            <label htmlFor="wp-deadline" className="mb-1 block text-sm">
              {t.deadline}
            </label>
            <Input id="wp-deadline" type="date" className="tabular" value={inputs.deadline} min={plan.asOf} onChange={(e) => e.target.value && update({ deadline: e.target.value })} data-testid="warplan-deadline" />
            <FieldFooter hint={t.monthsFromToday(number(plan.monthsToDeadline))} real={date(real.deadline)} />
          </div>
          <div className="min-w-0">
            <label htmlFor="wp-mode" className="mb-1 block text-sm">
              {t.targetMode}
            </label>
            <Select id="wp-mode" value={inputs.targetMode} onChange={(e) => update({ targetMode: e.target.value as TargetMode })}>
              <option value="profit_at_closing">{t.modeOption.profit_at_closing}</option>
              <option value="cash_in_bank">{t.modeOption.cash_in_bank}</option>
            </Select>
            <FieldFooter hint={cashMode ? t.modeHintCash : t.modeHintProfit} real={cashMode ? t.keptOwed(money(plan.ledger.cashKept), money(plan.ledger.owedToday)) : money(data.realm.goal.netProfitToDate)} />
          </div>
          <NumberField
            id="wp-lots-per-farm"
            label={t.lotsPerFarm}
            value={inputs.lotsPerFarm}
            onChange={(v) =>
              setInputs((prev) => (prev ? { ...prev, lotsPerFarm: v, farmCost: farmCostTouched ? prev.farmCost : Math.round(v * real.defaultLandCostPerLot) } : prev))
            }
            step={1}
            min={1}
            real={real.lotsPerFarm === null ? "—" : t.lotsPerFarmReal(number(real.lotsPerFarm))}
            hint={t.lotsPerFarmHint}
          />
          <NumberField
            id="wp-farm-cost"
            label={t.farmCost}
            value={inputs.farmCost}
            onChange={(v) => {
              setFarmCostTouched(true);
              update({ farmCost: v });
            }}
            step={10_000}
            prefix="$"
            real={
              <span data-testid="warplan-farm-cost-real">
                {real.recentLandCostPerLot === null
                  ? t.noPurchase(real.eraSince ?? "on record")
                  : `${t.recentCost(money(real.recentLandCostPerLot * inputs.lotsPerFarm), real.eraSince ? `, ${real.eraSince}` : "", real.recentFarms.join(", "), money(real.recentLandCostPerLot))} · ${t.allTimeCost(money(real.landCostPerLot * inputs.lotsPerFarm), money(real.landCostPerLot))}`}
              </span>
            }
            hint={t.farmCostHint(
              number(inputs.lotsPerFarm),
              real.recentFarms.length > 0
                ? `${real.recentFarms.length} most recent farms${real.eraSince ? ` bought ${real.eraSince}` : ""}`
                : "all-time average",
            )}
          />
          <NumberField id="wp-ad-spend" label={t.adSpend} value={inputs.adSpendPerClosing} onChange={(v) => update({ adSpendPerClosing: v })} step={100} prefix="$" real={t.adSpendReal} hint={t.adSpendHint} />
          <NumberField
            id="wp-conversion"
            label={t.conversion}
            value={inputs.conversionPct}
            onChange={(v) => update({ conversionPct: v })}
            step={1}
            min={1}
            max={100}
            suffix="%"
            real={
              <span data-testid="warplan-conversion-real">
                {real.conversionWithCancellationsPct === null
                  ? "—"
                  : t.conversionIncl(
                      pct(real.conversionWithCancellationsPct, 2),
                      number(data.realm.pipeline.conversion.closed),
                      number(data.realm.pipeline.conversion.cohortWithCancellations),
                      pct(real.conversionPct, 2),
                    )}
              </span>
            }
            hint={t.conversionHint(
              real.cancellationRatePct === null ? null : pct(real.cancellationRatePct, 1),
              number(data.realm.pipeline.conversion.cancelled),
              number(real.cancelledReservations),
              data.realm.pipeline.conversion.closed,
              data.realm.pipeline.conversion.resolvedDenominator,
              data.realm.pipeline.conversion.stillReserved,
            )}
          />
          <NumberField
            id="wp-farm-lag"
            label={t.farmLag}
            value={inputs.farmToFirstCloseMonths}
            onChange={(v) => update({ farmToFirstCloseMonths: v })}
            step={0.5}
            suffix={t.mo}
            real={real.farmToFirstCloseMonths === null ? t.farmLagNone : t.farmLagReal(number(real.farmToFirstCloseMonths), real.farmToFirstCloseFarms)}
            hint={t.farmLagHint(real.medianDaysToClose === null ? "—" : number(real.medianDaysToClose))}
          />
          <NumberField id="wp-note-lag" label={t.noteLag} value={inputs.noteSaleLagMonths} onChange={(v) => update({ noteSaleLagMonths: v })} step={0.5} suffix={t.mo} real={t.noteLagReal(number(real.noteSaleLagMonths))} hint={t.noteLagHint} />
          <div className="min-w-0">
            <label htmlFor="wp-cycle" className="mb-1 block text-sm">
              {t.capitalTurn}
            </label>
            <div className="relative">
              <Input
                id="wp-cycle"
                type="number"
                inputMode="decimal"
                step={0.5}
                min={0}
                className="tabular pr-12"
                value={inputs.cycleMonths ?? ""}
                placeholder={t.neverReturns}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const n = Number(raw);
                  if (raw === "" || n <= 0) update({ cycleMonths: null });
                  else if (Number.isFinite(n)) update({ cycleMonths: n });
                }}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{t.mo}</span>
            </div>
            <FieldFooter
              hint={t.capitalTurnHint}
              real={
                <span data-testid="warplan-cycle-real">
                  {real.cycleDays === null || real.cycleMonths === null
                    ? t.cycleNone(real.eraSince)
                    : t.cycleReal(
                        number(real.cycleDays),
                        real.cycleMonths.toFixed(1),
                        `${real.cycleSource === "freed_farms" ? t.cycleFreed(real.cycleFarms) : t.cycleProjected(real.cycleFarms)}${real.eraSince ? ` funded ${real.eraSince}` : ""}`,
                      )}
                  {real.cycleExcludedFarms.length > 0 && t.cycleExcluded(real.cycleExcludedFarms.join(", "))}
                </span>
              }
            />
          </div>
          <div className="min-w-0">
            <span className="mb-1 block text-sm">{t.requiredPace}</span>
            <div role="group" aria-label={t.paceShapeAria} className="flex gap-2" data-seasonality-applied={seasonality.applied}>
              <Button
                type="button"
                size="sm"
                variant={inputs.seasonal && seasonality.applied ? "default" : "outline"}
                aria-pressed={inputs.seasonal && seasonality.applied}
                disabled={!seasonality.applied}
                title={seasonality.applied ? undefined : seasonality.reason ?? undefined}
                onClick={() => update({ seasonal: true })}
                data-testid="warplan-seasonal-on"
              >
                {t.seasonal}
              </Button>
              <Button type="button" size="sm" variant={inputs.seasonal && seasonality.applied ? "outline" : "default"} aria-pressed={!inputs.seasonal || !seasonality.applied} onClick={() => update({ seasonal: false })} data-testid="warplan-seasonal-off">
                {t.flat}
              </Button>
            </div>
            <FieldFooter
              hint={
                !seasonality.applied
                  ? t.paceHintNone(t.seasonalityReason(seasonality.reason))
                  : inputs.seasonal
                    ? t.paceHintSeasonal
                    : t.paceHintFlat
              }
              real={
                <span data-testid="warplan-seasonality-real">
                  {!seasonality.applied
                    ? t.seasonalityNone(
                        t.seasonalityReason(seasonality.reason),
                        seasonality.monthsOfHistory ?? 0,
                        seasonality.monthsRequired,
                        seasonality.sinceLabel ?? "",
                        number(seasonality.closings),
                        seasonality.excluded,
                      )
                    : seasonality.peakMonth === null || seasonality.troughMonth === null
                      ? t.noDatedClosings
                      : t.seasonalityPeak(
                          number(seasonality.closings),
                          seasonality.sinceLabel ? ` ${seasonality.sinceLabel}` : "",
                          monthLabel(`2020-${String(seasonality.peakMonth + 1).padStart(2, "0")}`, lang),
                          (seasonality.factors[seasonality.peakMonth] ?? 1).toFixed(2),
                          monthLabel(`2020-${String(seasonality.troughMonth + 1).padStart(2, "0")}`, lang),
                          (seasonality.factors[seasonality.troughMonth] ?? 1).toFixed(2),
                          pct(seasonality.floor * 100, 0),
                        )}
                </span>
              }
            />
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.investorMix}</h2>
            <span className="text-xs text-muted-foreground">{t.investorMixHint}</span>
          </div>
          <InvestorMixTable mix={inputs.investorMix} onChange={setMix} t={t} />
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end" data-testid="warplan-scenarios">
          <div className="min-w-0 flex-1">
            <label htmlFor="wp-scenario-name" className="mb-1 block text-sm">
              {t.scenarioName}
            </label>
            <Input id="wp-scenario-name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder={t.scenarioPlaceholder} maxLength={60} />
          </div>
          <Button variant="outline" size="sm" onClick={saveScenario} disabled={!scenarioName.trim()} data-testid="warplan-save">
            <Save /> {t.save}
          </Button>
          <div className="min-w-0 flex-1">
            <label htmlFor="wp-scenario-load" className="mb-1 block text-sm">
              {t.savedScenarios}
            </label>
            <Select id="wp-scenario-load" value={selectedScenario} onChange={(e) => loadScenario(e.target.value)}>
              <option value="">{scenarios.length > 0 ? t.loadScenario : t.noneSaved}</option>
              {scenarios.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} · {date(s.savedAt)}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={deleteScenario} disabled={!selectedScenario} data-testid="warplan-delete">
            <Trash2 /> {t.delete}
          </Button>
        </div>
      </section>

      <section aria-label={t.verdict} className={cn("parchment-card mb-6 p-5", plan.feasible ? "border-gold/40" : "border-destructive/50")}>
        <div className="stat-label">{t.verdict}</div>
        <p className="mt-2 font-heading text-lg leading-snug sm:text-xl" data-testid="warplan-verdict" data-feasible={plan.feasible}>
          {plan.verdict.includes("lots/month")
            ? plan.verdict.replace("lots/month", `lots/month ${t.realDealTerms}`)
            : plan.verdict.includes("lotes/mes")
              ? plan.verdict.replace("lotes/mes", `lotes/mes ${t.realDealTerms}`)
              : plan.verdict}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t.measuredOn(t.modeLabel[inputs.targetMode])}
          {t.verdictFoot(
            number(plan.monthsToDeadline),
            date(plan.goal.deadline),
            number(plan.startInventory),
            String(plan.landLag),
            t.monthWord(plan.landLag),
            String(plan.closeLag),
            cashMode ? t.noteLagPart(plan.noteLag) : "",
            plan.deadlineMonthIndex > 0
              ? lastUsefulPurchase
                ? t.lastPurchase(warPlanMonthLabel(lastUsefulPurchase, lang))
                : t.noPurchaseConverts
              : ".",
          )}
          {cashMode && t.cashStart(money(plan.ledger.cashKept), money(plan.ledger.owedToday), money(plan.ledger.capitalOwed), money(plan.ledger.unpaidTake), money(plan.ledger.cashKept - plan.ledger.owedToday))}
        </p>
        <p className="mt-3 text-xs text-muted-foreground" data-testid="interest-carry-note">
          {t.interestCarryNote(String(exitHorizon), money(extraInterest), money(extra2028), money(extra2029))}
        </p>
      </section>

      <RotationSection plan={plan} t={t} lang={lang} />

      <section aria-label={t.threePlansAria} className="mb-6 grid gap-3 lg:grid-cols-3" data-testid="warplan-columns">
        {plan.all.map((c) => (
          <ColumnCard key={c.id} c={c} plan={plan} modeShort={modeShort} selected={c.id === column} onSelect={() => setColumn(c.id)} t={t} lang={lang} />
        ))}
      </section>

      <MonthTable plan={plan} column={selected} modeShort={modeShort} onColumn={setColumn} t={t} lang={lang} />

      <FarmCalendar plan={plan} real={real} />
    </div>
  );
}

function RotationSection({ plan, t, lang }: { plan: WarPlan; t: WarPlanUiStrings; lang: import("@/domain/quality_human").QualityLang }) {
  const r: RotationPlan = plan.rotation;
  const b: RotationBenchmark = plan.benchmark;
  const flagged = r.turnsIncomplete > 0;
  return (
    <section aria-label={t.rotationAria} className={cn("parchment-card mb-6 overflow-hidden", plan.feasible && !flagged ? "border-gold/40" : "border-ember/40")} data-testid="warplan-rotation">
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="stat-label">{t.rotationTitle}</div>
          <span className="text-xs text-muted-foreground">{t.rotationScope}</span>
        </div>
        <p className="mt-2 font-heading text-lg leading-snug sm:text-xl" data-testid="warplan-rotation-headline" data-turns={r.turnsNeeded ?? ""} data-incomplete={r.turnsIncomplete}>
          {r.headline}
        </p>
        {flagged && (
          <div className="mt-3">
            <Badge variant="error" data-testid="warplan-rotation-flag">
              {t.turnsIncomplete(r.turnsIncomplete, r.farms, r.farms === 1 ? t.turns("1").replace(/^1\s+/, "") : t.turns("2").replace(/^2\s+/, ""))}
            </Badge>
          </div>
        )}

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="warplan-rotation-stats">
          <RotationStat label={t.peakOutstanding} value={money(r.peakOutstanding)} hint={t.peakHint} tone="text-gold" testId="warplan-rotation-peak" />
          <RotationStat label={t.totalDeployed} value={money(r.totalDeployed)} hint={t.totalDeployedHint(r.farms, r.farms === 1 ? "farm" : "farms", money(r.recycled))} testId="warplan-rotation-deployed" />
          <RotationStat label={t.turnsNeeded} value={turnsLabel(r.turnsNeeded, t)} hint={t.turnsNeededHint(r.turnsCompleted, r.cycleMonths === null ? "" : ` · ${r.cycleMonths.toFixed(1)} months each`)} testId="warplan-rotation-turns" />
          <RotationStat
            label={t.firstTurnBy}
            value={r.firstTurnStartBy ? warPlanMonthLabel(r.firstTurnStartBy, lang) : "—"}
            hint={r.lastTurnCompletes ? t.lastTurnCompletes(warPlanMonthLabel(r.lastTurnCompletes, lang)) : r.farms > 0 && r.cycleMonths !== null ? t.noTurnCompletes : t.noFarmToBuy}
            tone={flagged ? "text-ember" : undefined}
          />
        </dl>

        {r.perInvestor.length > 0 && (
          <div className="mt-4">
            <div className="stat-label mb-2">{t.turnsPerInvestor}</div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="warplan-rotation-investors">
              {r.perInvestor.map((inv) => (
                <li key={inv.mixIndex} className="rounded-md border border-border/60 bg-background/40 p-3 text-sm" data-testid="warplan-rotation-investor" data-name={inv.name}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-heading">{inv.name}</span>
                    <span className="tabular text-gold">{turnsLabel(inv.turns, t)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground tabular">
                    {t.investorLine(money(inv.peakOutstanding), money(inv.deployed), money(inv.fresh))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <BenchmarkPanel b={b} t={t} lang={lang} />
    </section>
  );
}

function RotationStat({ label, value, hint, tone, testId }: { label: string; value: ReactNode; hint: ReactNode; tone?: string; testId?: string }) {
  return (
    <div className="rounded-md bg-background/40 p-3">
      <dt className="stat-label">{label}</dt>
      <dd className={cn("mt-1 font-heading text-xl tabular", tone)} data-testid={testId}>
        {value}
      </dd>
      <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

function BenchmarkPanel({ b, t, lang: _lang }: { b: RotationBenchmark; t: WarPlanUiStrings; lang: import("@/domain/quality_human").QualityLang }) {
  const bench = b.benchmark;
  const graded = b.grades.filter((g) => g.verdict !== "benchmark");
  return (
    <div className="border-t border-border/60" data-testid="warplan-benchmark">
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <div className="stat-label">{t.benchmarkCycle}</div>
          {bench ? (
            <>
              <div className="mt-1 font-display text-2xl leading-none text-gold sm:text-3xl" data-testid="warplan-benchmark-farm">
                {bench.farmName}
              </div>
              <div className="mt-2 text-sm tabular" data-testid="warplan-benchmark-cycle">
                {t.daysMonths(number(bench.days), bench.months.toFixed(1), bench.projected)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground" data-testid="warplan-benchmark-scope">
                {t.fundedToFree(bench.investorName, date(bench.fundingDate), bench.projected ? t.projectedFree : t.capitalBack, date(bench.liberationDate), b.cycles.length > 1 ? t.medianCycles(b.cycles.length, b.source === "freed_farms" ? t.freed : t.projected) : "", b.sinceLabel ? t.farmsFunded(b.sinceLabel) : "")}
              </div>
              {b.curve.length > 0 && (
                <ol className="mt-3 flex flex-wrap gap-1 text-[11px] tabular text-muted-foreground" aria-label={t.curveAria}>
                  {b.curve.map((p) => (
                    <li key={p.day} className="rounded bg-background/50 px-1.5 py-0.5">
                      d{p.day} · {p.pct.toFixed(0)}%
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t.noBenchmark(b.sinceLabel)}</p>
          )}
          {b.excludedCycles.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="warplan-benchmark-excluded">
              {t.excludedRecord(b.excludedCycles.map((c) => `${c.farmName} (funded ${date(c.fundingDate)}, freed ${date(c.liberationDate)} in ${number(c.days)} days)`).join("; "), b.sinceLabel?.replace(/^since /, "") ?? "the era")}
            </p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">{t.turnsCompleted}</dt>
            <dd className="text-right tabular" data-testid="warplan-turns-completed">
              {b.turnsCompleted}
            </dd>
            <dt className="text-muted-foreground">{t.capitalOutstanding}</dt>
            <dd className="text-right tabular">{money(b.capitalOutstanding)}</dd>
            <dt className="text-muted-foreground">{t.nextLiberation}</dt>
            <dd className="text-right tabular">{b.nextLiberation ? `${b.nextLiberation.farmName}${b.nextLiberation.daysToGo === null ? "" : ` · ${daysLabel(b.nextLiberation.daysToGo, t)}`}` : "—"}</dd>
          </dl>
        </div>

        <div className="min-w-0">
          <div className="stat-label mb-2">{t.everyFarmVs}</div>
          {bench?.projected && (
            <p className="mb-2 text-xs text-muted-foreground" data-testid="warplan-benchmark-projected">
              {t.projectedBenchmarkNote(b.sinceLabel)}
            </p>
          )}
          {graded.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noOtherFarm}</p>
          ) : (
            <div className="rounded-lg border border-border/60">
              <Table className="min-w-[720px] max-sm:min-w-0" data-mobile="cards" data-testid="warplan-grades">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t.gradeCol.farm}</TableHead>
                    <TableHead className="text-right">{t.gradeCol.daysIn}</TableHead>
                    <TableHead className="text-right">{t.gradeCol.returned}</TableHead>
                    <TableHead className="text-right">{t.gradeCol.benchmarkSameDay(bench?.farmName ?? t.grade.benchmark)}</TableHead>
                    <TableHead className="text-right">{t.gradeCol.vsBenchmark}</TableHead>
                    <TableHead className="text-right">{t.gradeCol.liberation}</TableHead>
                    <TableHead className="text-right">{t.gradeCol.grade}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {graded.map((g) => (
                    <GradeRow key={g.farmId} g={g} t={t} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GradeRow({ g, t }: { g: FarmGrade; t: WarPlanUiStrings }) {
  const cls = GRADE_CLASS[g.verdict];
  return (
    <TableRow data-testid="warplan-grade" data-farm={g.farmName} data-verdict={g.verdict}>
      <TableCell data-label={t.gradeCol.farm} className="font-medium">
        {g.farmName}
        <span className="block text-xs font-normal text-muted-foreground">
          {g.investorName} · {money(g.capital)}
          {g.fundingDate ? ` · ${date(g.fundingDate)}` : ""}
        </span>
      </TableCell>
      <TableCell data-label={t.gradeCol.daysIn} className="text-right tabular">
        {g.daysElapsed === null ? "—" : number(g.daysElapsed)}
      </TableCell>
      <TableCell data-label={t.gradeCol.returned} className="text-right tabular">
        {pct(g.pctReturned, 1)}
        <span className="block text-xs text-muted-foreground">{money(g.capitalReturned)}</span>
      </TableCell>
      <TableCell data-label={t.gradeCol.benchmarkSameDay("")} className="text-right tabular text-muted-foreground">
        {g.benchmarkPctAtSameDay === null ? "—" : pct(g.benchmarkPctAtSameDay, 1)}
      </TableCell>
      <TableCell data-label={t.gradeCol.vsBenchmark} className={cn("text-right tabular", cls)}>
        {g.pctVsBenchmark === null ? "—" : t.pts(signed(g.pctVsBenchmark))}
        {g.daysVsBenchmark !== null && <span className="block text-xs">{g.daysVsBenchmark >= 0 ? t.ahead(daysLabel(g.daysVsBenchmark, t)) : t.behind(daysLabel(-g.daysVsBenchmark, t))}</span>}
      </TableCell>
      <TableCell data-label={t.gradeCol.liberation} className="text-right tabular">
        {g.freed ? t.freedOn(date(g.projectedLiberationDate)) : g.projectedLiberationDate ? `${date(g.projectedLiberationDate)}${g.daysToGo === null ? "" : ` · ${daysLabel(g.daysToGo, t)}`}` : "—"}
        {!g.freed && g.lotsLeftToCover !== null && <span className="block text-xs text-muted-foreground">{g.lotsLeftToCover === 0 ? t.coveredAwaiting : t.lotsToCover(number(g.lotsLeftToCover))}</span>}
      </TableCell>
      <TableCell data-label={t.gradeCol.grade} className={cn("text-right font-heading", cls)}>
        {t.grade[g.verdict]}
      </TableCell>
    </TableRow>
  );
}

function FieldFooter({ hint, real }: { hint: ReactNode; real: ReactNode }) {
  const { realPrefix } = useCommonStrings();
  return (
    <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
      <span>{hint}</span>
      <span className="tabular">
        {realPrefix} {real}
      </span>
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  real: ReactNode;
  hint?: ReactNode;
  step?: number;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
}

/** A numeric input that keeps what you type while you type it and commits every valid number live. */
function NumberField({ id, label, value, onChange, real, hint, step = 1, min = 0, max, prefix, suffix }: NumberFieldProps) {
  const [text, setText] = useState(() => String(value));
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(String(value));
    }
  }, [value]);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
      </label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{prefix}</span>}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={text}
          className={cn("tabular", prefix && "pl-7", suffix && "pr-12")}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const n = Number(raw);
            if (raw.trim() !== "" && Number.isFinite(n) && n >= min && (max === undefined || n <= max)) {
              committed.current = n;
              onChange(n);
            }
          }}
          onBlur={() => setText(String(committed.current))}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{suffix}</span>}
      </div>
      <FieldFooter hint={hint} real={real} />
    </div>
  );
}

function InvestorMixTable({ mix, onChange, t }: { mix: InvestorMixEntry[]; onChange: (mix: InvestorMixEntry[]) => void; t: WarPlanUiStrings }) {
  const updateEntry = (i: number, patch: Partial<InvestorMixEntry>) => onChange(mix.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    const a = mix[i];
    const b = mix[j];
    if (!a || !b) return;
    const next = [...mix];
    next[i] = b;
    next[j] = a;
    onChange(next);
  };
  const remove = (i: number) => onChange(mix.filter((_, j) => j !== i));
  const add = () => onChange([...mix, { investorId: null, name: t.newSponsor(mix.length + 1), dealType: "fixed_interest", ratePct: 20, capital: 500_000 }]);
  const total = mix.reduce((a, e) => a + Math.max(0, e.capital), 0);
  const cell = "max-sm:!items-center";

  return (
    <div className="rounded-lg border border-border/60">
      <Table className="min-w-[760px] max-sm:min-w-0" data-mobile="cards" data-testid="warplan-mix">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8">{t.mixCol.order}</TableHead>
            <TableHead>{t.mixCol.sponsor}</TableHead>
            <TableHead>{t.mixCol.deal}</TableHead>
            <TableHead className="text-right">{t.mixCol.rate}</TableHead>
            <TableHead className="text-right">{t.mixCol.capital}</TableHead>
            <TableHead className="text-right">{t.mixCol.orderCol}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mix.map((e, i) => (
            <TableRow key={`${e.investorId ?? "new"}-${i}`} data-testid="warplan-mix-row" data-name={e.name}>
              <TableCell data-label={t.fundingOrder} className={cn("font-heading text-gold", cell)}>
                <span className="mr-2 text-xs font-normal uppercase tracking-wider text-muted-foreground sm:hidden">{t.fundingOrder}</span>
                {i + 1}
              </TableCell>
              <TableCell data-label={t.mixCol.sponsor} className={cell}>
                <Input aria-label={`${t.mixCol.sponsor} ${i + 1}`} value={e.name} onChange={(ev) => updateEntry(i, { name: ev.target.value })} className="min-w-[10rem] sm:w-full" maxLength={60} />
              </TableCell>
              <TableCell data-label={t.mixCol.deal} className={cell}>
                <Select aria-label={`${t.mixCol.deal} ${i + 1}`} value={e.dealType} onChange={(ev) => updateEntry(i, { dealType: ev.target.value as MixDealType })}>
                  {(Object.keys(t.deal) as MixDealType[]).map((value) => (
                    <option key={value} value={value}>
                      {t.deal[value]}
                    </option>
                  ))}
                </Select>
              </TableCell>
              <TableCell data-label={e.dealType === "profit_share" ? t.shareOfGross : t.annualRate} className={cn("text-right", cell)}>
                <div className="relative ml-auto w-28">
                  <Input
                    aria-label={`${t.mixCol.rate} ${i + 1}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={1}
                    value={e.ratePct}
                    disabled={e.dealType === "own_capital"}
                    onChange={(ev) => updateEntry(i, { ratePct: Math.max(0, Number(ev.target.value) || 0) })}
                    className="pr-8 text-right tabular"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
              </TableCell>
              <TableCell data-label={t.mixCol.capital} className={cn("text-right", cell)}>
                <div className="relative ml-auto w-40">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    aria-label={`${t.mixCol.capital} ${i + 1}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={10_000}
                    value={e.capital}
                    onChange={(ev) => updateEntry(i, { capital: Math.max(0, Number(ev.target.value) || 0) })}
                    className="pl-7 text-right tabular"
                  />
                </div>
              </TableCell>
              <TableCell data-label={t.mixCol.orderCol} className={cn("text-right", cell)}>
                <div className="flex justify-end gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={t.moveUp(e.name)} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={t.moveDown(e.name)} disabled={i === mix.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={t.remove(e.name)} onClick={() => remove(i)}>
                    <X />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell data-label={t.mixCol.sponsor} className={cn("font-heading", cell)} colSpan={4}>
              {t.sponsorsInMix(mix.length)}
            </TableCell>
            <TableCell data-label={t.mixCol.capital} className={cn("text-right tabular font-heading text-gold", cell)} data-testid="warplan-mix-total">
              {money(total)}
            </TableCell>
            <TableCell data-label="" className={cn("text-right", cell)}>
              <Button type="button" variant="outline" size="sm" onClick={add} data-testid="warplan-mix-add">
                <Plus /> {t.addSponsor}
              </Button>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function ColumnCard({ c, plan, modeShort, selected, onSelect, t, lang }: { c: WarPlanColumn; plan: WarPlan; modeShort: string; selected: boolean; onSelect: () => void; t: WarPlanUiStrings; lang: import("@/domain/quality_human").QualityLang }) {
  const tone = c.hitsDeadline ? "text-stage-closed" : c.exitDate ? "text-ember" : "text-muted-foreground";
  const deadline = date(plan.goal.deadline);
  return (
    <article
      className={cn("parchment-card flex flex-col p-5", c.hitsDeadline && "border-stage-closed/40", c.id === "required_plan" && "border-gold/40", selected && "ring-1 ring-gold/50")}
      data-testid="warplan-column"
      data-column={c.id}
      data-hits={c.hitsDeadline}
    >
      <div className="stat-label">{c.title}</div>
      <div className={cn("mt-2 font-display text-2xl leading-none sm:text-3xl", tone)} data-testid="warplan-column-exit">
        {c.exitDate ? date(c.exitDate) : t.beyond10}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {c.exitDate ? (c.hitsDeadline ? t.onOrBefore(deadline) : t.afterDeadline(deadline)) : t.notReached}
        {c.daysEarlierThanCurrent !== null && c.id !== "current_pace" && c.daysEarlierThanCurrent !== 0 && (
          <>
            {" · "}
            <span className={c.daysEarlierThanCurrent > 0 ? "text-stage-closed" : "text-ember"}>
              {c.daysEarlierThanCurrent > 0 ? t.daysEarlierPace(number(c.daysEarlierThanCurrent)) : t.daysLaterPace(number(-c.daysEarlierThanCurrent))}
            </span>
          </>
        )}
      </div>
      <p className="mt-3 text-sm text-foreground/85">{c.premise}</p>
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t.lotsMonth}</dt>
        <dd className="text-right tabular" data-testid="warplan-column-pace">
          {number(c.closingsPerMonth)}
          {(c.id === "required_plan" || c.id === "required_plus_buffer") && (
            <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{t.realDealTerms}</span>
          )}
        </dd>
        <dt className="text-muted-foreground">{t.farmsToBuy}</dt>
        <dd className="text-right tabular" data-testid="warplan-column-farms">
          {c.farmsToBuy}
          {c.lastPurchaseDate && c.farmsToBuy > 0 ? t.lastBy(warPlanMonthLabel(c.lastPurchaseDate, lang)) : ""}
        </dd>
        <dt className="text-muted-foreground">{t.capitalToRaise}</dt>
        <dd className="text-right tabular font-medium" data-testid="warplan-column-capital">
          {money(c.capitalToRaise)}
        </dd>
        {c.funding.map((f) => (
          <Fragment key={f.mixIndex}>
            <dt className="truncate pl-3 text-muted-foreground">{f.name}</dt>
            <dd className="text-right tabular">{money(f.amount)}</dd>
          </Fragment>
        ))}
        {c.unfunded > 0 && (
          <>
            <dt className="pl-3 text-ember">{t.unfunded}</dt>
            <dd className="text-right">
              <Badge variant="error" data-testid="warplan-unfunded">
                {money(c.unfunded)}
              </Badge>
            </dd>
          </>
        )}
        {c.farmsToBuy > 0 && (
          <>
            <dt className="text-muted-foreground">{t.peakOutstandingShort}</dt>
            <dd className="text-right tabular" data-testid="warplan-column-peak">
              {money(c.peakOutstanding)}
            </dd>
            <dt className="text-muted-foreground">{t.totalDeployedShort}</dt>
            <dd className="text-right tabular">{money(c.totalDeployed)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t.reservationsMonth}</dt>
        <dd className="text-right tabular" data-testid="warplan-column-reservations">
          {number(c.reservationsPerMonth)}
        </dd>
        <dt className="text-muted-foreground">{t.adSpendMonth}</dt>
        <dd className="text-right tabular">{money(c.adSpendPerMonth)}</dd>
        <dt className="text-muted-foreground">{t.noteSalesMonth}</dt>
        <dd className="text-right tabular">{number(c.noteSalesPerMonth)}</dd>
        <dt className="text-muted-foreground">{t.lotsClosedByDeadline}</dt>
        <dd className="text-right tabular">
          {number(c.lotsNeeded)}
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{t.lotsClosedByDeadlineHint}</span>
        </dd>
        <dt className="text-muted-foreground">{t.inventoryAtDeadline}</dt>
        <dd className="text-right tabular">{number(c.inventoryAtDeadline)}</dd>
        <dt className="text-muted-foreground">{t.cumulativeAtDeadline(modeShort)}</dt>
        <dd className={cn("text-right tabular font-medium", c.targetAtDeadline >= plan.goal.goal ? "text-stage-closed" : "text-ember")}>{moneyCompact(c.targetAtDeadline)}</dd>
        {c.turnsIncomplete > 0 && (
          <>
            <dt className="text-ember">{t.turnsNotBack}</dt>
            <dd className="text-right tabular text-ember" data-testid="warplan-column-incomplete">
              {t.ofFarms(c.turnsIncomplete, c.farmsToBuy)}
            </dd>
          </>
        )}
        {c.flaggedMonths > 0 && (
          <>
            <dt className="text-ember">{t.redFlags}</dt>
            <dd className="text-right tabular text-ember">
              {t.months(c.flaggedMonths)}
            </dd>
          </>
        )}
      </dl>
      <Button variant={selected ? "default" : "outline"} size="sm" className="mt-4 self-start" onClick={onSelect} aria-pressed={selected}>
        {selected ? t.shownMonthByMonth : t.showMonthByMonth}
      </Button>
    </article>
  );
}

function MonthTable({ plan, column, modeShort, onColumn, t, lang }: { plan: WarPlan; column: WarPlanColumn; modeShort: string; onColumn: (id: WarPlanColumnId) => void; t: WarPlanUiStrings; lang: import("@/domain/quality_human").QualityLang }) {
  const funded = plan.inputs.investorMix
    .map((e, mixIndex) => ({ mixIndex, name: e.name }))
    .filter((e) => column.rows.some((r) => (r.capitalReturned[e.mixIndex] ?? 0) > 0) || column.funding.some((f) => f.mixIndex === e.mixIndex));
  const rows = column.rows;
  const last = rows.at(-1);
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const seasonal = plan.inputs.seasonal && column.id !== "current_pace" && rows.some((r) => r.seasonalFactor !== 1);

  return (
    <section aria-label={t.monthByMonth(column.title)} className="parchment-card overflow-hidden" data-testid="warplan-months" data-column={column.id}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.monthByMonth(column.title)}</h2>
        <div role="group" aria-label={t.planShownAria} className="flex flex-wrap gap-2">
          {plan.all.map((c) => (
            <Button key={c.id} type="button" size="sm" variant={c.id === column.id ? "default" : "outline"} aria-pressed={c.id === column.id} onClick={() => onColumn(c.id)}>
              {t.columnShort[c.id]}
            </Button>
          ))}
        </div>
      </div>
      <Table className="min-w-[1100px] max-sm:min-w-0" data-mobile="cards">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t.monthCol.month}</TableHead>
            <TableHead className="text-right">{t.monthCol.farmsBought}</TableHead>
            <TableHead className="text-right">{t.monthCol.capitalDeployed}</TableHead>
            <TableHead className="text-right">{seasonal ? t.monthCol.lotsClosedSeasonal : t.monthCol.lotsClosed}</TableHead>
            {seasonal && <TableHead className="text-right">{t.monthCol.flatAverage}</TableHead>}
            <TableHead className="text-right">{t.monthCol.notesSold}</TableHead>
            <TableHead className="text-right">{t.monthCol.adSpend}</TableHead>
            <TableHead className="text-right">{t.monthCol.cumulative(modeShort)}</TableHead>
            <TableHead className="text-right">{t.monthCol.capitalOwed}</TableHead>
            {funded.map((f) => (
              <TableHead key={f.mixIndex} className="text-right">
                {t.monthCol.returned(f.name)}
              </TableHead>
            ))}
            <TableHead className="text-right">{t.monthCol.inventory}</TableHead>
            <TableHead>{t.monthCol.flags}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.monthIndex} data-testid="warplan-month" data-flags={r.flags.join(" ")} className={cn(r.flags.length > 0 && "bg-destructive/10 hover:bg-destructive/15")}>
              <TableCell data-label={t.monthCol.month} className="whitespace-nowrap font-medium">
                {warPlanMonthLabel(r.date, lang)}
                {r.monthIndex === 1 && <span className="block text-xs font-normal text-muted-foreground">{t.fromDate(date(plan.asOf))}</span>}
              </TableCell>
              <TableCell data-label={t.monthCol.farmsBought} className={cn("text-right tabular", r.farmsBought === 0 && "max-sm:!hidden")}>
                {r.farmsBought > 0 ? r.farmsBought : "—"}
              </TableCell>
              <TableCell data-label={t.monthCol.capitalDeployed} className={cn("text-right tabular", r.capitalDeployed === 0 && "max-sm:!hidden")}>
                {r.capitalDeployed > 0 ? money(r.capitalDeployed) : "—"}
              </TableCell>
              <TableCell data-label={seasonal ? t.monthCol.lotsClosedSeasonal : t.monthCol.lotsClosed} className="text-right tabular" data-testid="warplan-month-lots">
                {number(r.lotsClosed)}
                {seasonal && r.lotsClosed > 0 && <span className={cn("block text-xs", r.seasonalFactor > 1 ? "text-stage-closed" : r.seasonalFactor < 1 ? "text-ember" : "text-muted-foreground")}>×{r.seasonalFactor.toFixed(2)}</span>}
              </TableCell>
              {seasonal && (
                <TableCell data-label={t.monthCol.flatAverage} className="text-right tabular text-muted-foreground">
                  {number(r.flatLotsClosed)}
                </TableCell>
              )}
              <TableCell data-label={t.monthCol.notesSold} className="text-right tabular">
                {number(r.notesSold)}
              </TableCell>
              <TableCell data-label={t.monthCol.adSpend} className="text-right tabular">
                {money(r.adSpend)}
              </TableCell>
              <TableCell data-label={t.monthCol.cumulative(modeShort)} className={cn("text-right tabular font-medium", r.cumulativeNet >= plan.goal.goal ? "text-stage-closed" : r.cumulativeNet < 0 ? "text-ember" : "")}>
                {money(r.cumulativeNet)}
              </TableCell>
              <TableCell data-label={t.monthCol.capitalOwed} className="text-right tabular text-muted-foreground">
                {money(r.capitalOwed)}
              </TableCell>
              {funded.map((f) => (
                <TableCell key={f.mixIndex} data-label={t.monthCol.returned(f.name)} className="text-right tabular">
                  {money(r.capitalReturned[f.mixIndex] ?? 0)}
                </TableCell>
              ))}
              <TableCell data-label={t.monthCol.inventory} className="text-right tabular">
                {number(r.inventory)}
              </TableCell>
              <TableCell data-label={t.monthCol.flags} className={cn(r.flags.length === 0 && "max-sm:!hidden")}>
                {r.flags.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                    {r.flags.map((f) => (
                      <Badge key={f} variant="error" data-testid="warplan-flag" data-flag={f}>
                        {t.flag[f]}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell data-label={t.byDeadline(date(plan.goal.deadline))} className="font-heading">
              {t.byDeadline(date(plan.goal.deadline))}
            </TableCell>
            <TableCell data-label={t.monthCol.farmsBought} className="text-right tabular">
              {sum((r) => r.farmsBought)}
            </TableCell>
            <TableCell data-label={t.monthCol.capitalDeployed} className="text-right tabular">
              {money(sum((r) => r.capitalDeployed))}
            </TableCell>
            <TableCell data-label={seasonal ? t.monthCol.lotsClosedSeasonal : t.monthCol.lotsClosed} className="text-right tabular">
              {number(Math.round(sum((r) => r.lotsClosed) * 100) / 100)}
            </TableCell>
            {seasonal && (
              <TableCell data-label={t.monthCol.flatAverage} className="text-right tabular text-muted-foreground">
                {number(Math.round(sum((r) => r.flatLotsClosed) * 100) / 100)}
              </TableCell>
            )}
            <TableCell data-label={t.monthCol.notesSold} className="text-right tabular">
              {number(Math.round(sum((r) => r.notesSold) * 100) / 100)}
            </TableCell>
            <TableCell data-label={t.monthCol.adSpend} className="text-right tabular">
              {money(sum((r) => r.adSpend))}
            </TableCell>
            <TableCell data-label={t.monthCol.cumulative(modeShort)} className={cn("text-right tabular font-heading", (last?.cumulativeNet ?? 0) >= plan.goal.goal ? "text-stage-closed" : "text-ember")}>
              {money(last?.cumulativeNet)}
            </TableCell>
            <TableCell data-label={t.monthCol.capitalOwed} className="text-right tabular text-muted-foreground">
              {money(last?.capitalOwed)}
            </TableCell>
            {funded.map((f) => (
              <TableCell key={f.mixIndex} data-label={t.monthCol.returned(f.name)} className="text-right tabular">
                {money(last?.capitalReturned[f.mixIndex] ?? 0)}
              </TableCell>
            ))}
            <TableCell data-label={t.monthCol.inventory} className="text-right tabular">
              {number(last?.inventory)}
            </TableCell>
            <TableCell data-label={t.monthCol.flags} className="tabular">
              {column.flaggedMonths > 0 ? <span className="text-ember">{t.flagged(column.flaggedMonths)}</span> : <span className="text-muted-foreground">{t.none}</span>}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <p className="border-t border-border/60 p-4 text-sm text-muted-foreground">
        {t.monthFoot}{seasonal ? t.monthFootSeasonal : ""}
      </p>
    </section>
  );
}
