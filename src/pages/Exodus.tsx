import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { useHorizon } from "@/horizon/HorizonProvider";
import {
  deriveExodusDefaults,
  exodusMonthLabel,
  exodusVerdict,
  prepareExodus,
  scanNotesPct,
  solveExodus,
  type ExodusDefaults,
  type ExodusInputs,
  type ExodusPlan,
  type NoteInventoryRow,
  type NoteInventoryStatus,
  type Realm,
} from "@/domain";
import { EXODUS_NOTES_PCT_MAX } from "@/config/exodus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { date, money, moneyCompact, number, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCommonStrings } from "@/i18n/common";
import { useLang } from "@/i18n/lang";
import { EXODUS_UI, type ExodusUiStrings } from "@/i18n/exodus";
import type { PaymentsQueryError } from "@/data/queries";

const SCENARIOS_KEY = "quest.exodus.scenarios";

type StoredInputs = Omit<ExodusInputs, "warPlan">;

interface SavedScenario {
  name: string;
  savedAt: string;
  inputs: StoredInputs;
}

function isScenario(value: unknown): value is SavedScenario {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<SavedScenario>;
  return typeof s.name === "string" && !!s.inputs && typeof s.inputs === "object" && typeof s.inputs.notesPct === "number" && typeof s.inputs.deadline === "string";
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

const STATUS_VARIANT: Record<NoteInventoryStatus, "closed" | "reserved" | "note_sold" | "error" | "info"> = {
  free: "closed",
  needs_release: "reserved",
  profit_share: "note_sold",
  excluded: "error",
  no_farm: "info",
};

const parseCodes = (text: string) => [...new Set(text.split(/[,\s;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];
const ratioLabel = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(2)}%`);

export default function ExodusPage() {
  const { data, isLoading, error, refetch } = useRealm();
  const defaults = useMemo(() => (data ? deriveExodusDefaults(data.realm, data.realm.warPlanDefaults.inputs) : null), [data]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || !defaults) return null;
  return <ExodusBody realm={data.realm} tableErrors={data.tableErrors} defaults={defaults} />;
}

function ExodusBody({ realm, tableErrors, defaults }: { realm: Realm; tableErrors: PaymentsQueryError[]; defaults: ExodusDefaults }) {
  const [lang] = useLang();
  const { deadline: horizonDeadline } = useHorizon();
  const t = EXODUS_UI[lang];
  const [inputs, setInputs] = useState<ExodusInputs>(defaults.inputs);
  const [codesText, setCodesText] = useState(defaults.inputs.excludedNoteCodes.join(", "));
  const [scenarios, setScenarios] = useState<SavedScenario[]>(() => loadScenarios());
  const [scenarioName, setScenarioName] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const seededFor = useRef<string | null>(null);

  // A global horizon change re-seeds every input from the new defaults. A realm refresh at the
  // same horizon only inherits the War Plan live. Loading a saved scenario does not write the
  // global horizon — that scenario keeps the deadline it was saved with.
  useEffect(() => {
    if (seededFor.current !== horizonDeadline) {
      seededFor.current = horizonDeadline;
      setInputs(defaults.inputs);
      setCodesText(defaults.inputs.excludedNoteCodes.join(", "));
      setSelectedScenario("");
      return;
    }
    setInputs((prev) => ({ ...prev, warPlan: defaults.inputs.warPlan }));
  }, [defaults, horizonDeadline]);

  // Expensive (solves the War Plan): only the deadline, the capital, the exclusions and the War Plan move it.
  const base = useMemo(
    () => prepareExodus({ lpCapital: inputs.lpCapital, deadline: inputs.deadline, warPlan: inputs.warPlan, excludedNoteCodes: inputs.excludedNoteCodes }, realm),
    [realm, inputs.lpCapital, inputs.deadline, inputs.warPlan, inputs.excludedNoteCodes],
  );
  // The 61-point scan does not depend on the slider, so dragging it stays cheap.
  const scan = useMemo(
    () => scanNotesPct(base, { lpCapital: inputs.lpCapital, noteSaleRatio: inputs.noteSaleRatio, startingCash: inputs.startingCash }),
    [base, inputs.lpCapital, inputs.noteSaleRatio, inputs.startingCash],
  );
  const plan = useMemo(() => solveExodus(inputs, realm, { base, scan }), [inputs, realm, base, scan]);
  const verdict = useMemo(() => exodusVerdict(plan, lang), [plan, lang]);

  const real = defaults.real;
  const s = plan.scenario;
  const update = (patch: Partial<ExodusInputs>) => setInputs((prev) => ({ ...prev, ...patch }));
  const reset = () => {
    setInputs(defaults.inputs);
    setCodesText(defaults.inputs.excludedNoteCodes.join(", "));
    setSelectedScenario("");
  };
  const stored = (): StoredInputs => ({
    lpCapital: inputs.lpCapital,
    notesPct: inputs.notesPct,
    deadline: inputs.deadline,
    noteSaleRatio: inputs.noteSaleRatio,
    excludedNoteCodes: inputs.excludedNoteCodes,
    startingCash: inputs.startingCash,
  });
  const saveScenario = () => {
    const name = scenarioName.trim();
    if (!name) return;
    const next = [...scenarios.filter((x) => x.name !== name), { name, savedAt: new Date().toISOString(), inputs: stored() }].sort((a, b) => a.name.localeCompare(b.name));
    persistScenarios(next);
    setScenarios(next);
    setSelectedScenario(name);
  };
  const loadScenario = (name: string) => {
    setSelectedScenario(name);
    const sc = scenarios.find((x) => x.name === name);
    if (!sc) return;
    const next: ExodusInputs = { ...defaults.inputs, ...sc.inputs, warPlan: defaults.inputs.warPlan };
    setInputs(next);
    setCodesText(next.excludedNoteCodes.join(", "));
    setScenarioName(sc.name);
  };
  const deleteScenario = () => {
    const next = scenarios.filter((x) => x.name !== selectedScenario);
    persistScenarios(next);
    setScenarios(next);
    setSelectedScenario("");
  };

  const v = plan.versusCash;
  const monthName = (iso: string | null) => (iso ? exodusMonthLabel(iso, lang) : "—");

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle(money(inputs.lpCapital))}>
        <Button variant="outline" size="sm" onClick={reset} data-testid="exodus-reset">
          <RotateCcw /> {t.reset}
        </Button>
      </PageHeader>
      <TableErrorsBanner errors={tableErrors} />

      <section aria-label={t.verdict} className={cn("parchment-card mb-6 p-5", s.feasible ? "border-gold/40" : "border-destructive/50")} data-testid="exodus-verdict-card">
        <div className="stat-label">{t.verdict}</div>
        <p className={cn("mt-2 font-heading text-lg leading-snug sm:text-xl", !s.feasible && "text-ember")} data-testid="exodus-verdict" data-feasible={s.feasible} data-notes-pct={s.notesPct} data-max-notes-pct={plan.maxNotesPct}>
          {verdict}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t.verdictFoot(number(plan.monthsToDeadline), date(plan.deadline), number(plan.warPlan.closingsPerMonth), plan.warPlan.farmsToBuy, money(plan.warPlan.adSpendPerMonth))}{" "}
          {plan.latestViablePurchaseDate ? t.latestViable(monthName(plan.latestViablePurchaseDate)) : t.noViable}
        </p>
      </section>

      <section aria-label={t.versus} className="mb-6 grid gap-3 sm:grid-cols-3" data-testid="exodus-versus">
        <Stat label={t.discountSaved} value={money(v.discountSaved)} hint={t.discountSavedHint(ratioLabel(inputs.noteSaleRatio))} tone={v.discountSaved > 0 ? "text-stage-closed" : undefined} testId="exodus-discount-saved" dataValue={v.discountSaved} />
        <Stat
          label={t.lotsNotNeeded}
          value={v.lotsNotNeeded === null ? t.never : number(v.lotsNotNeeded)}
          hint={t.lotsNotNeededHint(number(plan.baseline.hitMonthIndex === null ? plan.baseline.lotsClosedTotal : plan.baseline.lotsNeeded), s.hitMonthIndex === null ? t.never : number(s.lotsNeeded))}
          tone={v.lotsNotNeeded !== null && v.lotsNotNeeded > 0 ? "text-stage-closed" : undefined}
          testId="exodus-lots-not-needed"
          dataValue={v.lotsNotNeeded ?? -1}
        />
        <Stat
          label={t.monthsEarlier}
          value={v.monthsEarlier === null ? t.never : number(v.monthsEarlier)}
          hint={t.monthsEarlierHint(s.hitDate ? date(s.hitDate) : t.never, plan.baseline.hitDate ? date(plan.baseline.hitDate) : t.never)}
          tone={v.monthsEarlier !== null && v.monthsEarlier > 0 ? "text-stage-closed" : undefined}
          testId="exodus-months-earlier"
          dataValue={v.monthsEarlier ?? -1}
        />
      </section>

      <section aria-label={t.inputs} className="parchment-card mb-6 p-4 sm:p-5" data-testid="exodus-inputs">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor="ex-notes-pct" className="block text-sm">
                {t.notesPct}
              </label>
              <span className="font-heading text-lg tabular" data-testid="exodus-notes-pct-value">
                {Math.round(inputs.notesPct)}%
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 pb-6">
                <input
                  id="ex-notes-pct"
                  type="range"
                  min={0}
                  max={EXODUS_NOTES_PCT_MAX}
                  step={1}
                  value={inputs.notesPct}
                  onChange={(e) => update({ notesPct: Number(e.target.value) })}
                  className="h-11 w-full cursor-pointer accent-[hsl(var(--primary))]"
                  aria-valuetext={`${Math.round(inputs.notesPct)}%`}
                  data-testid="exodus-notes-pct"
                />
                <MaxMark pct={plan.maxNotesPct} label={t.maxMark(plan.maxNotesPct)} />
              </div>
              <div className="w-28 shrink-0">
                <NumberInput id="ex-notes-pct-number" value={inputs.notesPct} onChange={(n) => update({ notesPct: n })} min={0} max={EXODUS_NOTES_PCT_MAX} step={1} suffix="%" testId="exodus-notes-pct-number" />
              </div>
            </div>
            <FieldFooter
              hint={t.notesPctHint(money(s.noteTarget))}
              real={`${t.noteSalesCount(real.noteSaleRatio.sales, realm.lots.filter((l) => l.noteSaleId).length)} · ${t.maxMark(plan.maxNotesPct)}`}
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="ex-lp-capital" className="mb-1 block text-sm">
              {t.lpCapital}
            </label>
            <Input id="ex-lp-capital" className="tabular" value={money(inputs.lpCapital)} readOnly aria-readonly />
            <FieldFooter hint={t.lpCapitalReal} real={money(real.lpCapital)} />
          </div>

          <div className="min-w-0">
            <label htmlFor="ex-deadline" className="mb-1 block text-sm">
              {t.deadline}
            </label>
            <Input id="ex-deadline" type="date" className="tabular" value={inputs.deadline} min={plan.asOf} onChange={(e) => e.target.value && update({ deadline: e.target.value })} data-testid="exodus-deadline" />
            <FieldFooter hint={t.deadlineHint(number(plan.monthsToDeadline))} real={date(real.deadline)} />
          </div>

          <div className="min-w-0">
            <label htmlFor="ex-ratio" className="mb-1 block text-sm">
              {t.noteSaleRatio}
            </label>
            <NumberInput id="ex-ratio" value={Math.round(inputs.noteSaleRatio * 10_000) / 100} onChange={(n) => update({ noteSaleRatio: n / 100 })} min={0} max={100} step={0.01} suffix="%" testId="exodus-note-sale-ratio" />
            <FieldFooter
              hint={t.noteSaleRatioHint}
              real={
                <span data-testid="exodus-ratio-real">
                  {t.noteSaleRatioReal(
                    `${ratioLabel(real.noteSaleRatio.used)} (${t.basis[real.noteSaleRatio.basis]})`,
                    ratioLabel(real.noteSaleRatio.discountBased),
                    real.noteSaleRatio.salesWithDiscount,
                    ratioLabel(real.noteSaleRatio.financedBased),
                    real.noteSaleRatio.salesWithFinanced,
                    ratioLabel(real.noteSaleRatio.literal),
                  )}
                </span>
              }
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="ex-excluded" className="mb-1 block text-sm">
              {t.excluded}
            </label>
            <Input
              id="ex-excluded"
              className="tabular uppercase"
              value={codesText}
              placeholder="EAS-L04"
              onChange={(e) => {
                setCodesText(e.target.value);
                update({ excludedNoteCodes: parseCodes(e.target.value) });
              }}
              data-testid="exodus-excluded"
            />
            <FieldFooter hint={t.excludedHint} real={t.excludedReal(real.excludedNoteCodes.join(", ") || "—")} />
          </div>

          <div className="min-w-0">
            <label htmlFor="ex-starting-cash" className="mb-1 block text-sm">
              {t.startingCash}
            </label>
            <NumberInput id="ex-starting-cash" value={inputs.startingCash} onChange={(n) => update({ startingCash: n })} min={0} step={10_000} prefix="$" testId="exodus-starting-cash" />
            <FieldFooter hint={t.startingCashHint} real={t.startingCashReal(money(real.cashKeptToday), money(real.owedToday))} />
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t.inherited}</p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end" data-testid="exodus-scenarios">
          <div className="min-w-0 flex-1">
            <label htmlFor="ex-scenario-name" className="mb-1 block text-sm">
              {t.scenarioName}
            </label>
            <Input id="ex-scenario-name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder={t.scenarioPlaceholder} maxLength={60} />
          </div>
          <Button variant="outline" size="sm" onClick={saveScenario} disabled={!scenarioName.trim()} data-testid="exodus-save">
            <Save /> {t.save}
          </Button>
          <div className="min-w-0 flex-1">
            <label htmlFor="ex-scenario-load" className="mb-1 block text-sm">
              {t.savedScenarios}
            </label>
            <Select id="ex-scenario-load" value={selectedScenario} onChange={(e) => loadScenario(e.target.value)}>
              <option value="">{scenarios.length > 0 ? t.loadOne : t.noneSaved}</option>
              {scenarios.map((sc) => (
                <option key={sc.name} value={sc.name}>
                  {sc.name} · {date(sc.savedAt)}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={deleteScenario} disabled={!selectedScenario} data-testid="exodus-delete">
            <Trash2 /> {t.remove}
          </Button>
        </div>
      </section>

      <MonthTable plan={plan} t={t} lang={lang} />
      <InventoryTable rows={plan.inventory.rows} plan={plan} t={t} />
      <PackageSection plan={plan} t={t} />
      <SourcesSection plan={plan} t={t} lang={lang} />
    </div>
  );
}

/** The `maxNotesPct` tick under the slider track; the label hugs the track edge when the tick sits near either end. */
function MaxMark({ pct: value, label }: { pct: number; label: string }) {
  const frac = Math.min(1, Math.max(0, value / EXODUS_NOTES_PCT_MAX));
  // A 16px thumb travels 100% − 16px, so the tick follows the thumb centre rather than the raw percentage.
  const left = `calc(${frac * 100}% + ${(0.5 - frac) * 16}px)`;
  const edge = frac > 0.8 ? "right-0" : frac < 0.2 ? "left-0" : "-translate-x-1/2";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6" data-testid="exodus-max-mark" data-max={value}>
      <span className="absolute top-0 h-2 w-0.5 -translate-x-1/2 bg-gold" style={{ left }} aria-hidden />
      <span className={cn("absolute top-2 whitespace-nowrap text-[11px] text-gold", edge)} style={edge === "-translate-x-1/2" ? { left } : undefined}>
        {label}
      </span>
    </div>
  );
}

function Stat({ label, value, hint, tone, testId, dataValue }: { label: string; value: ReactNode; hint: ReactNode; tone?: string; testId: string; dataValue: number }) {
  return (
    <div className="parchment-card p-4">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1 font-heading text-2xl tabular", tone)} data-testid={testId} data-value={dataValue}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
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

interface NumberInputProps {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  testId?: string;
}

/** A numeric input that keeps what you type while you type it and commits every valid number live. */
function NumberInput({ id, value, onChange, min = 0, max, step = 1, prefix, suffix, testId }: NumberInputProps) {
  const [text, setText] = useState(() => String(value));
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(String(value));
    }
  }, [value]);
  return (
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
        className={cn("tabular", prefix && "pl-7", suffix && "pr-9")}
        data-testid={testId}
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
  );
}

function MonthTable({ plan, t, lang }: { plan: ExodusPlan; t: ExodusUiStrings; lang: "en" | "es" }) {
  const rows = plan.scenario.rows;
  const last = rows.at(-1);
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const units = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return (
    <section aria-label={t.months} className="parchment-card mb-6 overflow-hidden" data-testid="exodus-months">
      <div className="border-b border-border/60 p-4">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.months}</h2>
      </div>
      <Table className="min-w-[1180px] max-sm:min-w-0" data-mobile="cards">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t.colMonth}</TableHead>
            <TableHead className="text-right">{t.colLots}</TableHead>
            <TableHead className="text-right">{t.colFreeAvailable}</TableHead>
            <TableHead className="text-right">{t.colDelivered}</TableHead>
            <TableHead className="text-right">{t.colReleases}</TableHead>
            <TableHead className="text-right">{t.colFarms}</TableHead>
            <TableHead className="text-right">{t.colSold}</TableHead>
            <TableHead className="text-right">{t.colCashIn}</TableHead>
            <TableHead className="text-right">{t.colAds}</TableHead>
            <TableHead className="text-right">{t.colCashPaid}</TableHead>
            <TableHead className="text-right">{t.colCumNotes}</TableHead>
            <TableHead className="text-right">{t.colCumCash}</TableHead>
            <TableHead className="text-right">{t.colCumTotal}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.monthIndex} data-testid="exodus-month" className={cn(r.cumulativeReturned >= plan.inputs.lpCapital - 0.005 && "bg-stage-closed/10 hover:bg-stage-closed/15")}>
              <TableCell data-label={t.colMonth} className="whitespace-nowrap font-medium">
                {exodusMonthLabel(r.date, lang)}
                {r.monthIndex === 1 && <span className="block text-xs font-normal text-muted-foreground">{t.from(date(plan.asOf))}</span>}
              </TableCell>
              <TableCell data-label={t.colLots} className={cn("text-right tabular", r.lotsClosed === 0 && "max-sm:!hidden")}>
                {r.lotsClosed > 0 ? number(r.lotsClosed) : "—"}
              </TableCell>
              <TableCell data-label={t.colFreeAvailable} className={cn("text-right tabular", r.freeNotesAvailable === 0 && "max-sm:!hidden")}>
                {r.freeNotesAvailable > 0 ? units(r.freeNotesAvailable) : "—"}
              </TableCell>
              <TableCell data-label={t.colDelivered} className={cn("text-right tabular", r.notesDelivered === 0 && "max-sm:!hidden")}>
                {r.notesDelivered > 0 ? (
                  <>
                    {units(r.notesDelivered)}
                    <span className="block text-xs text-muted-foreground">{money(r.notesDeliveredValue)}</span>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell data-label={t.colReleases} className={cn("text-right tabular", r.partialReleases === 0 && "max-sm:!hidden")}>
                {r.partialReleases > 0 ? (
                  <>
                    {units(r.partialReleases)}
                    <span className="block text-xs text-muted-foreground">{money(r.partialReleaseCost)}</span>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell data-label={t.colFarms} className={cn("text-right tabular", r.cashFarmsBought === 0 && "max-sm:!hidden")}>
                {r.cashFarmsBought > 0 ? (
                  <>
                    {r.cashFarmsBought}
                    <span className="block text-xs text-muted-foreground">{money(r.cashFarmCost)}</span>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell data-label={t.colSold} className={cn("text-right tabular", r.notesSold === 0 && "max-sm:!hidden")}>
                {r.notesSold > 0 ? (
                  <>
                    {units(r.notesSold)}
                    <span className="block text-xs text-muted-foreground">{money(r.noteSaleProceeds)}</span>
                  </>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell data-label={t.colCashIn} className="text-right tabular">
                {money(r.portafolioCashIn)}
              </TableCell>
              <TableCell data-label={t.colAds} className={cn("text-right tabular", r.adSpend === 0 && "max-sm:!hidden")}>
                {r.adSpend > 0 ? money(r.adSpend) : "—"}
              </TableCell>
              <TableCell data-label={t.colCashPaid} className={cn("text-right tabular font-medium", r.cashCarried < 0 && "text-ember")}>
                {money(r.cashPaidToLPs)}
                {r.cashCarried < 0 && <span className="block text-xs font-normal">{money(r.cashCarried)}</span>}
              </TableCell>
              <TableCell data-label={t.colCumNotes} className="text-right tabular">
                {money(r.cumulativeNotes)}
              </TableCell>
              <TableCell data-label={t.colCumCash} className="text-right tabular">
                {money(r.cumulativeCash)}
              </TableCell>
              <TableCell data-label={t.colCumTotal} className={cn("text-right tabular font-medium", r.cumulativeReturned >= plan.inputs.lpCapital - 0.005 && "text-stage-closed")}>
                {money(r.cumulativeReturned)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell data-label={t.colMonth} className="font-heading">
              {t.by(date(plan.deadline))}
            </TableCell>
            <TableCell data-label={t.colLots} className="text-right tabular">
              {number(Math.round(sum((r) => r.lotsClosed) * 100) / 100)}
            </TableCell>
            <TableCell data-label={t.colFreeAvailable} className="text-right tabular text-muted-foreground">
              —
            </TableCell>
            <TableCell data-label={t.colDelivered} className="text-right tabular">
              {units(Math.round(sum((r) => r.notesDelivered) * 100) / 100)}
              <span className="block text-xs text-muted-foreground">{money(plan.scenario.notesDelivered)}</span>
            </TableCell>
            <TableCell data-label={t.colReleases} className="text-right tabular">
              {units(plan.scenario.partialReleases.count)}
              <span className="block text-xs text-muted-foreground">{money(plan.scenario.partialReleases.cost)}</span>
            </TableCell>
            <TableCell data-label={t.colFarms} className="text-right tabular">
              {plan.scenario.cashFarms.count}
              <span className="block text-xs text-muted-foreground">{money(plan.scenario.cashFarms.cost)}</span>
            </TableCell>
            <TableCell data-label={t.colSold} className="text-right tabular">
              {units(plan.scenario.notesSold.count)}
              <span className="block text-xs text-muted-foreground">{money(plan.scenario.notesSold.proceeds)}</span>
            </TableCell>
            <TableCell data-label={t.colCashIn} className="text-right tabular">
              {money(sum((r) => r.portafolioCashIn))}
            </TableCell>
            <TableCell data-label={t.colAds} className="text-right tabular">
              {money(plan.scenario.adSpend)}
            </TableCell>
            <TableCell data-label={t.colCashPaid} className="text-right tabular font-heading">
              {money(plan.scenario.cashPaidToLPs)}
            </TableCell>
            <TableCell data-label={t.colCumNotes} className="text-right tabular">
              {money(last?.cumulativeNotes)}
            </TableCell>
            <TableCell data-label={t.colCumCash} className="text-right tabular">
              {money(last?.cumulativeCash)}
            </TableCell>
            <TableCell data-label={t.colCumTotal} className={cn("text-right tabular font-heading", plan.scenario.feasible ? "text-stage-closed" : "text-ember")}>
              {money(last?.cumulativeReturned)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <p className="border-t border-border/60 p-4 text-sm text-muted-foreground">{t.monthsFoot}</p>
    </section>
  );
}

function InventoryTable({ rows, plan, t }: { rows: NoteInventoryRow[]; plan: ExodusPlan; t: ExodusUiStrings }) {
  const inv = plan.inventory;
  const chips: { status: NoteInventoryStatus; notes: number; upb: number; extra?: string }[] = [
    { status: "free", notes: inv.free.notes, upb: inv.free.upb, extra: inv.free.farms.join(", ") },
    { status: "needs_release", notes: inv.needsRelease.notes, upb: inv.needsRelease.upb, extra: money(inv.needsRelease.costToday) },
    { status: "profit_share", notes: inv.profitShare.notes, upb: inv.profitShare.upb },
    { status: "excluded", notes: inv.excluded.notes, upb: inv.excluded.upb },
    { status: "no_farm", notes: inv.noFarm.notes, upb: inv.noFarm.upb },
  ];
  return (
    <section aria-label={t.inventory} className="parchment-card mb-6 overflow-hidden" data-testid="exodus-inventory">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.inventory}</h2>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <Badge key={c.status} variant={STATUS_VARIANT[c.status]} data-testid="exodus-inventory-chip" data-status={c.status} data-notes={c.notes} data-upb={c.upb}>
              {t.statusShort[c.status]} · {c.notes} · {moneyCompact(c.upb)}
              {c.extra ? ` · ${c.extra}` : ""}
            </Badge>
          ))}
        </div>
      </div>
      <Table className="min-w-[900px] max-sm:min-w-0" data-mobile="cards">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t.colNote}</TableHead>
            <TableHead>{t.colFarm}</TableHead>
            <TableHead className="text-right">{t.colUpb}</TableHead>
            <TableHead className="text-right">{t.colRate}</TableHead>
            <TableHead className="text-right">{t.colTerm}</TableHead>
            <TableHead>{t.colStatus}</TableHead>
            <TableHead className="text-right">{t.colReleaseCost}</TableHead>
            <TableHead className="text-right">{t.colSettlement}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.noteId} data-testid="exodus-note" data-status={r.status} data-code={r.code}>
              <TableCell data-label={t.colNote} className="whitespace-nowrap font-medium tabular">
                {r.code}
              </TableCell>
              <TableCell data-label={t.colFarm}>{r.farmName ?? "—"}</TableCell>
              <TableCell data-label={t.colUpb} className="text-right tabular">
                {money(r.upb)}
              </TableCell>
              <TableCell data-label={t.colRate} className="text-right tabular">
                {pct(r.ratePct, 2)}
              </TableCell>
              <TableCell data-label={t.colTerm} className="text-right tabular">
                {r.termMonths}
                {r.remainingMonths !== null && <span className="block text-xs text-muted-foreground">{t.remaining(r.remainingMonths)}</span>}
              </TableCell>
              <TableCell data-label={t.colStatus}>
                <Badge variant={STATUS_VARIANT[r.status]}>{t.status[r.status]}</Badge>
              </TableCell>
              <TableCell data-label={t.colReleaseCost} className={cn("text-right tabular", r.releaseCostToday === null && "max-sm:!hidden")}>
                {r.releaseCostToday === null ? "—" : r.releaseCostToday === 0 ? money(0) : money(r.releaseCostToday)}
              </TableCell>
              <TableCell data-label={t.colSettlement} className={cn("text-right tabular", r.settlementPerDollar === null && "max-sm:!hidden")}>
                {r.settlementPerDollar === null ? "—" : `${r.settlementPerDollar.toFixed(2)}×`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t border-border/60 p-4 text-sm text-muted-foreground">
        {t.inventoryFoot} {t.inventorySummary(inv.sold, inv.inactive)}
      </p>
    </section>
  );
}

function PackageSection({ plan, t }: { plan: ExodusPlan; t: ExodusUiStrings }) {
  const p = plan.scenario.package;
  const parts: { label: string; notes: number; upb: number; key: string }[] = [
    { key: "existingFree", label: t.fromExistingFree, ...p.existingFree },
    { key: "existingReleased", label: t.fromExistingReleased, ...p.existingReleased },
    { key: "projectedFree", label: t.fromProjectedFree, ...p.projectedFree },
    { key: "projectedReleased", label: t.fromProjectedReleased, ...p.projectedReleased },
    { key: "cashFarm", label: t.fromCashFarm, ...p.cashFarm },
  ].filter((x) => x.upb > 0);
  const units = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return (
    <section aria-label={t.packageTitle} className="parchment-card mb-6 p-4 sm:p-5" data-testid="exodus-package">
      <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.packageTitle}</h2>
      {p.totalUpb <= 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t.packageEmpty}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label={t.totalUpb} value={money(p.totalUpb)} hint={t.ofLpCapital(pct((p.totalUpb / plan.inputs.lpCapital) * 100, 1))} testId="exodus-package-upb" dataValue={p.totalUpb} />
            <Stat label={t.notesCount} value={units(p.notes)} hint={t.notesCountHint} testId="exodus-package-notes" dataValue={p.notes} />
            <Stat label={t.avgRate} value={pct(p.avgRatePct ?? 0, 2)} hint={t.upbWeighted} testId="exodus-package-rate" dataValue={p.avgRatePct ?? 0} />
            <Stat label={t.avgTerm} value={number(p.avgTermMonths ?? 0)} hint={t.upbWeighted} testId="exodus-package-term" dataValue={p.avgTermMonths ?? 0} />
            <Stat label={t.avgRemaining} value={number(p.avgRemainingMonths ?? 0)} hint={t.upbWeighted} testId="exodus-package-remaining" dataValue={p.avgRemainingMonths ?? 0} />
          </div>
          <ul className="mt-4 grid gap-y-1 gap-x-8 text-sm sm:grid-cols-2">
            {parts.map((x) => (
              <li key={x.key} className="flex justify-between gap-3 border-b border-border/40 py-1" data-testid="exodus-package-part" data-part={x.key}>
                <span className="text-muted-foreground">{x.label}</span>
                <span className="tabular">
                  {t.notes(Math.round(x.notes * 100) / 100)} · {money(x.upb)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function SourcesSection({ plan, t, lang }: { plan: ExodusPlan; t: ExodusUiStrings; lang: "en" | "es" }) {
  const r = plan.reconciliation;
  const b = r.bridge;
  const lines: { label: string; value: number }[] = [
    { label: t.bridgeStart, value: b.startingPosition },
    { label: t.bridgeReceipts, value: b.receipts },
    { label: t.bridgeExisting, value: b.existingNotes },
    { label: t.bridgePartners, value: b.partnerPayments },
    { label: t.bridgeSettlement, value: b.settlementSpend },
    { label: t.bridgeAds, value: b.adSpend },
    { label: t.bridgeCarry, value: b.unpaidCarry },
    { label: t.bridgeDrift, value: b.replayDrift },
    { label: t.bridgeResidual, value: b.residual },
  ].filter((l) => Math.abs(l.value) >= 0.5 || l.label === t.bridgeResidual);
  const signedMoney = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;
  const s = plan.scenario;
  return (
    <details className="parchment-card mb-6 p-4 sm:p-5" data-testid="exodus-sources">
      <summary className="cursor-pointer font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.sources}</summary>
      <h3 className="mt-3 text-sm font-medium">{t.sourcesTitle}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t.productionLine(number(r.production.lotsClosed), r.production.farmsBought, money(r.production.adSpend), r.production.closingsMatch)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t.cashLine(money(r.warPlanCash.warPlanTargetAtDeadline), money(r.baselineCashPaid))}</p>
      <ul className="mt-2 grid gap-1 text-sm">
        {lines.map((l) => (
          <li key={l.label} className="flex justify-between gap-3 border-b border-border/40 py-1">
            <span className="text-muted-foreground">{l.label}</span>
            <span className="tabular">{signedMoney(l.value)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">{t.futureNoteLine(money(plan.futureNote.faceValue), pct(plan.futureNote.annualRate * 100, 2), plan.futureNote.termMonths, plan.futureNote.notes)}</p>
      {plan.unsoldLotsAtDeadline.lots > 0 && <p className="mt-1 text-sm text-muted-foreground">{t.unsoldLine(number(plan.unsoldLotsAtDeadline.lots), money(plan.unsoldLotsAtDeadline.partnerBalance))}</p>}
      <p className="mt-1 text-sm text-muted-foreground">{t.partnerBalanceLine(money(s.partnerBalanceAtDeadline))}</p>
      {s.partialReleases.list.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-medium">{t.releasesTitle}</h3>
          <ul className="mt-1 grid gap-y-1 gap-x-8 text-sm sm:grid-cols-2">
            {s.partialReleases.list.map((x, i) => (
              <li key={`${x.label}-${i}`} className="flex justify-between gap-3 border-b border-border/40 py-1" data-testid="exodus-release">
                <span className="min-w-0 truncate">
                  {x.closingDate === null ? `${x.label} · ${x.farmName}` : `${x.farmName} · ${t.closingsOf(exodusMonthLabel(x.closingDate, lang))}`}
                  <span className="text-muted-foreground"> · {t.releasedIn(exodusMonthLabel(x.date, lang))}</span>
                </span>
                <span className="shrink-0 tabular">
                  {Number.isInteger(x.units) ? x.units : x.units.toFixed(2)} · {money(x.cost)} → {money(x.upbDelivered)} · {x.ratio.toFixed(2)}×
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {s.cashFarms.purchases.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-medium">{t.farmsTitle}</h3>
          <ul className="mt-1 grid gap-y-1 gap-x-8 text-sm sm:grid-cols-2">
            {s.cashFarms.purchases.map((x) => (
              <li key={x.wpFarmIndex} className="flex justify-between gap-3 border-b border-border/40 py-1" data-testid="exodus-cash-farm">
                <span className="min-w-0 truncate">
                  {x.label} <span className="text-muted-foreground">· {exodusMonthLabel(x.date, lang)}</span>
                </span>
                <span className="shrink-0 tabular">
                  {money(x.cost)} → {money(x.freeNoteValue)} · {t.farmViable(`${x.ratio.toFixed(2)}×`)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
