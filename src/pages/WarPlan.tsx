import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import {
  solveWarPlan,
  warPlanMonthLabel,
  type InvestorMixEntry,
  type MixDealType,
  type TargetMode,
  type WarPlan,
  type WarPlanColumn,
  type WarPlanColumnId,
  type WarPlanFlag,
  type WarPlanInputs,
} from "@/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { date, money, moneyCompact, number, pct } from "@/lib/format";
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

const MODE_LABEL: Record<TargetMode, string> = { profit_at_closing: "net profit at closing", cash_in_bank: "cash in the bank" };
const MODE_SHORT: Record<TargetMode, string> = { profit_at_closing: "net profit", cash_in_bank: "cash" };
const DEAL_OPTIONS: { value: MixDealType; label: string }[] = [
  { value: "fixed_interest", label: "Fixed interest" },
  { value: "profit_share", label: "Profit share" },
  { value: "own_capital", label: "Own capital" },
];
const FLAG_LABEL: Record<WarPlanFlag, string> = { shortfall: "Closings exceed inventory", too_late: "Farm bought too late to convert" };
const COLUMN_SHORT: Record<WarPlanColumnId, string> = { current_pace: "Current pace", required_plan: "Required plan", required_plus_buffer: "+1 buffer farm" };

export default function WarPlanPage() {
  const { data, isLoading, error, refetch } = useRealm();
  const defaults = data?.realm.warPlanDefaults;
  const [inputs, setInputs] = useState<WarPlanInputs | null>(null);
  const [farmCostTouched, setFarmCostTouched] = useState(false);
  const [column, setColumn] = useState<WarPlanColumnId>("required_plan");
  const [scenarios, setScenarios] = useState<SavedScenario[]>(() => loadScenarios());
  const [scenarioName, setScenarioName] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");

  useEffect(() => {
    if (defaults && !inputs) setInputs(defaults.inputs);
  }, [defaults, inputs]);

  const plan = useMemo(() => (data && inputs ? solveWarPlan(inputs, data.realm) : null), [data, inputs]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data || !inputs || !plan || !defaults) return null;

  const real = defaults.real;
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
  const modeShort = MODE_SHORT[inputs.targetMode];
  const lastUsefulPurchase = plan.required.rows.find((r) => r.monthIndex === plan.maxPurchaseMonth)?.date ?? null;

  return (
    <div>
      <PageHeader
        title="War Plan"
        subtitle="The Oracle in reverse: the Oracle takes a pace and returns a date; the War Plan takes the deadline and returns what must happen — closings, farms and when to buy them, capital and who funds it, ad spend, note sales, and what comes back to every sponsor. Every input starts at the real figure."
      >
        <Button variant="outline" size="sm" onClick={reset} data-testid="warplan-reset">
          <RotateCcw /> Reset to real data
        </Button>
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />

      <section aria-label="Inputs" className="parchment-card mb-6 p-4 sm:p-5" data-testid="warplan-inputs">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField id="wp-target" label="Target" value={inputs.target} onChange={(v) => update({ target: v })} step={100_000} prefix="$" real={money(real.target)} hint={`Measured on ${MODE_LABEL[inputs.targetMode]}`} />
          <div className="min-w-0">
            <label htmlFor="wp-deadline" className="mb-1 block text-sm">
              Deadline
            </label>
            <Input id="wp-deadline" type="date" className="tabular" value={inputs.deadline} min={plan.asOf} onChange={(e) => e.target.value && update({ deadline: e.target.value })} />
            <FieldFooter hint={`${number(plan.monthsToDeadline)} months from today`} real={date(real.deadline)} />
          </div>
          <div className="min-w-0">
            <label htmlFor="wp-mode" className="mb-1 block text-sm">
              Target mode
            </label>
            <Select id="wp-mode" value={inputs.targetMode} onChange={(e) => update({ targetMode: e.target.value as TargetMode })}>
              <option value="profit_at_closing">Net profit at closing</option>
              <option value="cash_in_bank">Cash in the bank, sponsors paid out</option>
            </Select>
            <FieldFooter hint={cashMode ? "Down payments + note sales − farm outlays − every sponsor's capital and take" : "(price − land) × (1 − take), booked at closing"} real={cashMode ? `${money(plan.ledger.cashKept)} kept, ${money(plan.ledger.owedToday)} owed` : money(data.realm.goal.netProfitToDate)} />
          </div>
          <NumberField
            id="wp-lots-per-farm"
            label="Lots per new farm"
            value={inputs.lotsPerFarm}
            onChange={(v) =>
              setInputs((prev) => (prev ? { ...prev, lotsPerFarm: v, farmCost: farmCostTouched ? prev.farmCost : Math.round(v * real.landCostPerLot) } : prev))
            }
            step={1}
            min={1}
            real={real.lotsPerFarm === null ? "—" : `${number(real.lotsPerFarm)} (mean total_lots)`}
            hint="The brief's 10; the farm cost follows until you edit it"
          />
          <NumberField
            id="wp-farm-cost"
            label="Farm cost"
            value={inputs.farmCost}
            onChange={(v) => {
              setFarmCostTouched(true);
              update({ farmCost: v });
            }}
            step={10_000}
            prefix="$"
            real={`${money(real.landCostPerLot * inputs.lotsPerFarm)} (${number(inputs.lotsPerFarm)} × ${money(real.landCostPerLot)}/lot)`}
            hint="Capital one new farm needs"
          />
          <NumberField id="wp-ad-spend" label="Ad spend per closing" value={inputs.adSpendPerClosing} onChange={(v) => update({ adSpendPerClosing: v })} step={100} prefix="$" real="no source in the data — assumption" hint="Monthly ads = closings ÷ conversion × this" />
          <NumberField
            id="wp-conversion"
            label="Reservation → closing conversion"
            value={inputs.conversionPct}
            onChange={(v) => update({ conversionPct: v })}
            step={1}
            min={1}
            max={100}
            suffix="%"
            real={real.conversionPct === null ? "—" : `${pct(real.conversionPct, 2)} (${number(data.realm.pipeline.conversion.closed)} of ${number(data.realm.pipeline.conversion.cohort)} matured reservations)`}
            hint="Reservations that closed, pipeline.ts"
          />
          <NumberField
            id="wp-farm-lag"
            label="Farm purchase → first closing"
            value={inputs.farmToFirstCloseMonths}
            onChange={(v) => update({ farmToFirstCloseMonths: v })}
            step={0.5}
            suffix="mo"
            real={real.farmToFirstCloseMonths === null ? "no farm has closed a lot yet" : `${number(real.farmToFirstCloseMonths)} mo (median of ${real.farmToFirstCloseFarms} farms)`}
            hint={`Plus ${real.medianDaysToClose === null ? "—" : number(real.medianDaysToClose)} median days to close a reservation`}
          />
          <NumberField id="wp-note-lag" label="Note-sale lag" value={inputs.noteSaleLagMonths} onChange={(v) => update({ noteSaleLagMonths: v })} step={0.5} suffix="mo" real={`${number(real.noteSaleLagMonths)} mo (closing → note sale)`} hint="When the financed balance turns into cash" />
        </div>

        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">Investor mix</h2>
            <span className="text-xs text-muted-foreground">New farms are funded top to bottom; each new lot pays its own farm's deal. Prefilled from the sponsors' real positions.</span>
          </div>
          <InvestorMixTable mix={inputs.investorMix} onChange={setMix} />
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end" data-testid="warplan-scenarios">
          <div className="min-w-0 flex-1">
            <label htmlFor="wp-scenario-name" className="mb-1 block text-sm">
              Scenario name
            </label>
            <Input id="wp-scenario-name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="e.g. Two farms before spring" maxLength={60} />
          </div>
          <Button variant="outline" size="sm" onClick={saveScenario} disabled={!scenarioName.trim()} data-testid="warplan-save">
            <Save /> Save
          </Button>
          <div className="min-w-0 flex-1">
            <label htmlFor="wp-scenario-load" className="mb-1 block text-sm">
              Saved scenarios
            </label>
            <Select id="wp-scenario-load" value={selectedScenario} onChange={(e) => loadScenario(e.target.value)}>
              <option value="">{scenarios.length > 0 ? "Load a scenario…" : "None saved yet"}</option>
              {scenarios.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} · {date(s.savedAt)}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={deleteScenario} disabled={!selectedScenario} data-testid="warplan-delete">
            <Trash2 /> Delete
          </Button>
        </div>
      </section>

      <section aria-label="Verdict" className={cn("parchment-card mb-6 p-5", plan.feasible ? "border-gold/40" : "border-destructive/50")}>
        <div className="stat-label">The verdict</div>
        <p className="mt-2 font-heading text-lg leading-snug sm:text-xl" data-testid="warplan-verdict" data-feasible={plan.feasible}>
          {plan.verdict}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Measured on {MODE_LABEL[inputs.targetMode]}. {number(plan.monthsToDeadline)} months to {date(plan.goal.deadline)}, {number(plan.startInventory)} lots in inventory today (available + reserved). A new farm needs {plan.landLag} {plan.landLag === 1 ? "month" : "months"} to its first closing and {plan.closeLag} more to close a reservation
          {cashMode ? `, then ${plan.noteLag} to sell the note` : ""}
          {plan.deadlineMonthIndex > 0 ? (lastUsefulPurchase ? `, so the last useful purchase is ${warPlanMonthLabel(lastUsefulPurchase)}.` : ", so no farm bought now converts before the deadline.") : "."}
          {cashMode && (
            <>
              {" "}
              The fund has kept {money(plan.ledger.cashKept)} and owes sponsors {money(plan.ledger.owedToday)} ({money(plan.ledger.capitalOwed)} of capital and {money(plan.ledger.unpaidTake)} of accrued take), so the plan starts at {money(plan.ledger.cashKept - plan.ledger.owedToday)}.
            </>
          )}
        </p>
      </section>

      <section aria-label="Three plans" className="mb-6 grid gap-3 lg:grid-cols-3" data-testid="warplan-columns">
        {plan.all.map((c) => (
          <ColumnCard key={c.id} c={c} plan={plan} modeShort={modeShort} selected={c.id === column} onSelect={() => setColumn(c.id)} />
        ))}
      </section>

      <MonthTable plan={plan} column={selected} modeShort={modeShort} onColumn={setColumn} />
    </div>
  );
}

function FieldFooter({ hint, real }: { hint: ReactNode; real: ReactNode }) {
  return (
    <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
      <span>{hint}</span>
      <span className="tabular">real: {real}</span>
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

function InvestorMixTable({ mix, onChange }: { mix: InvestorMixEntry[]; onChange: (mix: InvestorMixEntry[]) => void }) {
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
  const add = () => onChange([...mix, { investorId: null, name: `Sponsor ${mix.length + 1}`, dealType: "fixed_interest", ratePct: 20, capital: 500_000 }]);
  const total = mix.reduce((a, e) => a + Math.max(0, e.capital), 0);
  const cell = "max-sm:!items-center";

  return (
    <div className="rounded-lg border border-border/60">
      <Table className="min-w-[760px] max-sm:min-w-0" data-mobile="cards" data-testid="warplan-mix">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8">#</TableHead>
            <TableHead>Sponsor</TableHead>
            <TableHead>Deal</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Capital for new farms</TableHead>
            <TableHead className="text-right">Order</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mix.map((e, i) => (
            <TableRow key={`${e.investorId ?? "new"}-${i}`} data-testid="warplan-mix-row" data-name={e.name}>
              <TableCell data-label="Funding order" className={cn("font-heading text-gold", cell)}>
                <span className="mr-2 text-xs font-normal uppercase tracking-wider text-muted-foreground sm:hidden">Funding order</span>
                {i + 1}
              </TableCell>
              <TableCell data-label="Sponsor" className={cell}>
                <Input aria-label={`Sponsor ${i + 1} name`} value={e.name} onChange={(ev) => updateEntry(i, { name: ev.target.value })} className="min-w-[10rem] sm:w-full" maxLength={60} />
              </TableCell>
              <TableCell data-label="Deal" className={cell}>
                <Select aria-label={`Sponsor ${i + 1} deal`} value={e.dealType} onChange={(ev) => updateEntry(i, { dealType: ev.target.value as MixDealType })}>
                  {DEAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </TableCell>
              <TableCell data-label={e.dealType === "profit_share" ? "Share of gross" : "Annual rate"} className={cn("text-right", cell)}>
                <div className="relative ml-auto w-28">
                  <Input
                    aria-label={`Sponsor ${i + 1} rate`}
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
              <TableCell data-label="Capital" className={cn("text-right", cell)}>
                <div className="relative ml-auto w-40">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    aria-label={`Sponsor ${i + 1} capital`}
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
              <TableCell data-label="Order" className={cn("text-right", cell)}>
                <div className="flex justify-end gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move ${e.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move ${e.name} down`} disabled={i === mix.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${e.name}`} onClick={() => remove(i)}>
                    <X />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell data-label="Sponsors" className={cn("font-heading", cell)} colSpan={4}>
              {mix.length} {mix.length === 1 ? "sponsor" : "sponsors"} in the mix
            </TableCell>
            <TableCell data-label="Total capital" className={cn("text-right tabular font-heading text-gold", cell)} data-testid="warplan-mix-total">
              {money(total)}
            </TableCell>
            <TableCell data-label="" className={cn("text-right", cell)}>
              <Button type="button" variant="outline" size="sm" onClick={add} data-testid="warplan-mix-add">
                <Plus /> Add sponsor
              </Button>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function ColumnCard({ c, plan, modeShort, selected, onSelect }: { c: WarPlanColumn; plan: WarPlan; modeShort: string; selected: boolean; onSelect: () => void }) {
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
        {c.exitDate ? date(c.exitDate) : "beyond 10 years"}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {c.exitDate ? (c.hitsDeadline ? `on or before the ${deadline} deadline` : `after the ${deadline} deadline`) : "the target is not reached within the horizon"}
        {c.daysEarlierThanCurrent !== null && c.id !== "current_pace" && c.daysEarlierThanCurrent !== 0 && (
          <>
            {" · "}
            <span className={c.daysEarlierThanCurrent > 0 ? "text-stage-closed" : "text-ember"}>
              {c.daysEarlierThanCurrent > 0 ? `${number(c.daysEarlierThanCurrent)} days earlier than the current pace` : `${number(-c.daysEarlierThanCurrent)} days later than the current pace`}
            </span>
          </>
        )}
      </div>
      <p className="mt-3 text-sm text-foreground/85">{c.premise}</p>
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Lots / month</dt>
        <dd className="text-right tabular" data-testid="warplan-column-pace">
          {number(c.closingsPerMonth)}
        </dd>
        <dt className="text-muted-foreground">Farms to buy</dt>
        <dd className="text-right tabular" data-testid="warplan-column-farms">
          {c.farmsToBuy}
          {c.lastPurchaseDate && c.farmsToBuy > 0 ? ` · last by ${warPlanMonthLabel(c.lastPurchaseDate)}` : ""}
        </dd>
        <dt className="text-muted-foreground">Capital to raise</dt>
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
            <dt className="pl-3 text-ember">Unfunded</dt>
            <dd className="text-right">
              <Badge variant="error" data-testid="warplan-unfunded">
                {money(c.unfunded)}
              </Badge>
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Ad spend / month</dt>
        <dd className="text-right tabular">{money(c.adSpendPerMonth)}</dd>
        <dt className="text-muted-foreground">Note sales / month</dt>
        <dd className="text-right tabular">{number(c.noteSalesPerMonth)}</dd>
        <dt className="text-muted-foreground">Lots closed by the deadline</dt>
        <dd className="text-right tabular">{number(c.lotsNeeded)}</dd>
        <dt className="text-muted-foreground">Inventory at the deadline</dt>
        <dd className="text-right tabular">{number(c.inventoryAtDeadline)} lots</dd>
        <dt className="text-muted-foreground">Cumulative {modeShort} at the deadline</dt>
        <dd className={cn("text-right tabular font-medium", c.targetAtDeadline >= plan.goal.goal ? "text-stage-closed" : "text-ember")}>{moneyCompact(c.targetAtDeadline)}</dd>
        {c.flaggedMonths > 0 && (
          <>
            <dt className="text-ember">Red flags</dt>
            <dd className="text-right tabular text-ember">
              {c.flaggedMonths} {c.flaggedMonths === 1 ? "month" : "months"}
            </dd>
          </>
        )}
      </dl>
      <Button variant={selected ? "default" : "outline"} size="sm" className="mt-4 self-start" onClick={onSelect} aria-pressed={selected}>
        {selected ? "Shown month by month" : "Show month by month"}
      </Button>
    </article>
  );
}

function MonthTable({ plan, column, modeShort, onColumn }: { plan: WarPlan; column: WarPlanColumn; modeShort: string; onColumn: (id: WarPlanColumnId) => void }) {
  const funded = plan.inputs.investorMix
    .map((e, mixIndex) => ({ mixIndex, name: e.name }))
    .filter((e) => column.rows.some((r) => (r.capitalReturned[e.mixIndex] ?? 0) > 0) || column.funding.some((f) => f.mixIndex === e.mixIndex));
  const rows = column.rows;
  const last = rows.at(-1);
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + pick(r), 0);

  return (
    <section aria-label="Month by month" className="parchment-card overflow-hidden" data-testid="warplan-months" data-column={column.id}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">Month by month — {column.title}</h2>
        <div role="group" aria-label="Plan shown" className="flex flex-wrap gap-2">
          {plan.all.map((c) => (
            <Button key={c.id} type="button" size="sm" variant={c.id === column.id ? "default" : "outline"} aria-pressed={c.id === column.id} onClick={() => onColumn(c.id)}>
              {COLUMN_SHORT[c.id]}
            </Button>
          ))}
        </div>
      </div>
      <Table className="min-w-[1100px] max-sm:min-w-0" data-mobile="cards">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Month</TableHead>
            <TableHead className="text-right">Farms bought</TableHead>
            <TableHead className="text-right">Capital deployed</TableHead>
            <TableHead className="text-right">Lots closed</TableHead>
            <TableHead className="text-right">Notes sold</TableHead>
            <TableHead className="text-right">Ad spend</TableHead>
            <TableHead className="text-right">Cumulative {modeShort}</TableHead>
            <TableHead className="text-right">Capital owed</TableHead>
            {funded.map((f) => (
              <TableHead key={f.mixIndex} className="text-right">
                Returned · {f.name}
              </TableHead>
            ))}
            <TableHead className="text-right">Inventory</TableHead>
            <TableHead>Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.monthIndex} data-testid="warplan-month" data-flags={r.flags.join(" ")} className={cn(r.flags.length > 0 && "bg-destructive/10 hover:bg-destructive/15")}>
              <TableCell data-label="Month" className="whitespace-nowrap font-medium">
                {warPlanMonthLabel(r.date)}
                {r.monthIndex === 1 && <span className="block text-xs font-normal text-muted-foreground">from {date(plan.asOf)}</span>}
              </TableCell>
              <TableCell data-label="Farms bought" className={cn("text-right tabular", r.farmsBought === 0 && "max-sm:!hidden")}>
                {r.farmsBought > 0 ? r.farmsBought : "—"}
              </TableCell>
              <TableCell data-label="Capital deployed" className={cn("text-right tabular", r.capitalDeployed === 0 && "max-sm:!hidden")}>
                {r.capitalDeployed > 0 ? money(r.capitalDeployed) : "—"}
              </TableCell>
              <TableCell data-label="Lots closed" className="text-right tabular">
                {number(r.lotsClosed)}
              </TableCell>
              <TableCell data-label="Notes sold" className="text-right tabular">
                {number(r.notesSold)}
              </TableCell>
              <TableCell data-label="Ad spend" className="text-right tabular">
                {money(r.adSpend)}
              </TableCell>
              <TableCell data-label={`Cumulative ${modeShort}`} className={cn("text-right tabular font-medium", r.cumulativeNet >= plan.goal.goal ? "text-stage-closed" : r.cumulativeNet < 0 ? "text-ember" : "")}>
                {money(r.cumulativeNet)}
              </TableCell>
              <TableCell data-label="Capital owed" className="text-right tabular text-muted-foreground">
                {money(r.capitalOwed)}
              </TableCell>
              {funded.map((f) => (
                <TableCell key={f.mixIndex} data-label={`Returned · ${f.name}`} className="text-right tabular">
                  {money(r.capitalReturned[f.mixIndex] ?? 0)}
                </TableCell>
              ))}
              <TableCell data-label="Inventory" className="text-right tabular">
                {number(r.inventory)}
              </TableCell>
              <TableCell data-label="Flags" className={cn(r.flags.length === 0 && "max-sm:!hidden")}>
                {r.flags.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                    {r.flags.map((f) => (
                      <Badge key={f} variant="error" data-testid="warplan-flag" data-flag={f}>
                        {FLAG_LABEL[f]}
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
            <TableCell data-label="Total" className="font-heading">
              By {date(plan.goal.deadline)}
            </TableCell>
            <TableCell data-label="Farms bought" className="text-right tabular">
              {sum((r) => r.farmsBought)}
            </TableCell>
            <TableCell data-label="Capital deployed" className="text-right tabular">
              {money(sum((r) => r.capitalDeployed))}
            </TableCell>
            <TableCell data-label="Lots closed" className="text-right tabular">
              {number(Math.round(sum((r) => r.lotsClosed) * 100) / 100)}
            </TableCell>
            <TableCell data-label="Notes sold" className="text-right tabular">
              {number(Math.round(sum((r) => r.notesSold) * 100) / 100)}
            </TableCell>
            <TableCell data-label="Ad spend" className="text-right tabular">
              {money(sum((r) => r.adSpend))}
            </TableCell>
            <TableCell data-label={`Cumulative ${modeShort}`} className={cn("text-right tabular font-heading", (last?.cumulativeNet ?? 0) >= plan.goal.goal ? "text-stage-closed" : "text-ember")}>
              {money(last?.cumulativeNet)}
            </TableCell>
            <TableCell data-label="Capital owed" className="text-right tabular text-muted-foreground">
              {money(last?.capitalOwed)}
            </TableCell>
            {funded.map((f) => (
              <TableCell key={f.mixIndex} data-label={`Returned · ${f.name}`} className="text-right tabular">
                {money(last?.capitalReturned[f.mixIndex] ?? 0)}
              </TableCell>
            ))}
            <TableCell data-label="Inventory" className="text-right tabular">
              {number(last?.inventory)}
            </TableCell>
            <TableCell data-label="Flags" className="tabular">
              {column.flaggedMonths > 0 ? <span className="text-ember">{column.flaggedMonths} flagged</span> : <span className="text-muted-foreground">none</span>}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <p className="border-t border-border/60 p-4 text-sm text-muted-foreground">
        The first row runs from today to the end of the month, so its closings are prorated. Capital owed is what sponsors are still due at month end (today's positions repaid pro rata as the existing lots close, new farms as their lots close). Red rows are months where the required closings exceed the inventory or a farm is bought too late to convert before the deadline.
      </p>
    </section>
  );
}
