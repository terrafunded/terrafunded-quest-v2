import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { buildReverseFunnel, type Conversion, type Expected, type FunnelStep, type GoalStatus, type ReverseFunnel as ReverseFunnelShape } from "@/domain";
import { eraMonthLabel } from "@/domain/era";
import { Input } from "@/components/ui/input";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useWideViewport } from "@/hooks/useWideViewport";
import { usePipelineStrings, type PipelineUiStrings } from "@/i18n/pipeline";
import { useTheme } from "@/theme/ThemeProvider";
import { money, moneyCompact, number, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CURSOR, FOREGROUND, GOLD, MUTED, OXYGEN, TOOLTIP_CLASS, TOOLTIP_STYLE, useChartReveal } from "./chartTokens";

/** Persisted like the War Plan scenarios (`quest.warplan.scenarios`): on this device only. */
const COST_PER_CONVERSATION_KEY = "quest.funnel.costPerConversation";
const MAX_BAR_DURATION_MS = 600;
/** Bar lengths of the funnel, top to bottom — a visual funnel only; the units differ step by step, so the lengths carry no ratio. */
const STEP_WIDTHS: Record<FunnelStep["id"] | "adSpend", number> = { remaining: 100, lots: 88, reservations: 76, perMonth: 64, perWeek: 52, adSpend: 40 };
/** Axis span past the longest bar, where the value labels sit. */
const AXIS_MAX = 168;

type Series = "single" | "lifetime" | "recent";
type FunnelStrings = PipelineUiStrings["funnel"];

interface FunnelRow {
  key: string;
  step: FunnelStep["id"] | "adSpend";
  series: Series;
  /** Y-axis label (wide) / label over the bar (narrow). */
  name: string;
  width: number;
  /** The demand in the step's unit. */
  value: string;
  /** What it demands per month. */
  perMonth: string;
  explain: string;
  raw: number | null;
}

function readCostPerConversation(): number | null {
  try {
    const raw = localStorage.getItem(COST_PER_CONVERSATION_KEY);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function persistCostPerConversation(value: number | null) {
  try {
    if (value === null) localStorage.removeItem(COST_PER_CONVERSATION_KEY);
    else localStorage.setItem(COST_PER_CONVERSATION_KEY, String(value));
  } catch {
    // Storage disabled or full: the figure still lives in memory for this visit.
  }
}

function buildRows(f: ReverseFunnelShape, eraMonth: string | null, cost: number | null, t: FunnelStrings): FunnelRow[] {
  const rows: FunnelRow[] = [];
  const months = number(f.monthsToDeadline);
  const conv = pct(f.conversionPct, 1);
  const tag = (s: Series) =>
    s === "recent" ? t.tagRecent(eraMonth ?? "era", money(f.recentAvgNetProfitPerClosedLot)) : t.tagLedger(money(f.avgNetProfitPerClosedLot));
  const both: Series[] = f.recentAvgNetProfitPerClosedLot !== null ? ["lifetime", "recent"] : ["lifetime"];
  const pick = (p: { lifetime: number | null; recent: number | null }, s: Series) => (s === "recent" ? p.recent : p.lifetime);
  const suffix = (s: Series) => (s === "recent" ? t.sinceEraSuffix(eraMonth ?? "era") : t.ledgerAvgSuffix);
  const sourceNote =
    f.conversionSource === "resolved"
      ? t.resSourceResolved
      : f.conversionSource === "with_cancellations"
        ? t.resSourceWithCanc
        : f.conversionSource === "assumed"
          ? t.resSourceAssumed
          : "";

  const remaining = f.steps.find((s) => s.id === "remaining");
  if (remaining) {
    const perMonth = remaining.perMonth.lifetime;
    rows.push({
      key: "remaining",
      step: "remaining",
      series: "single",
      name: t.remaining,
      width: STEP_WIDTHS.remaining,
      value: money(f.remaining),
      perMonth: perMonth === null ? t.deadlinePassed : t.remainingPerMonth(moneyCompact(perMonth)),
      explain:
        perMonth === null
          ? t.remainingExplainNoMonths(money(f.remaining))
          : t.remainingExplain(money(f.remaining), moneyCompact(perMonth), months),
      raw: f.remaining,
    });
  }
  for (const step of f.steps) {
    if (step.id === "remaining") continue;
    for (const s of both) {
      const total = pick(step.total, s);
      const perMonth = pick(step.perMonth, s);
      if (total === null) continue;
      let name = "";
      let value = "";
      let explain = "";
      switch (step.id) {
        case "lots":
          name = t.lotsToClose(suffix(s));
          value = t.lots(number(total), total === 1);
          explain = t.lotsExplain(value, tag(s), number(perMonth), months);
          break;
        case "reservations":
          name = t.reservationsNeeded(suffix(s));
          value = t.reservations(number(total), total === 1);
          explain = t.resExplain(value, conv, sourceNote);
          break;
        case "perMonth":
          name = t.perMonthLabel(suffix(s));
          value = t.perMonthValue(number(total));
          explain = t.perMonthExplain(number(total), months, tag(s));
          break;
        case "perWeek":
          name = t.perWeekLabel(suffix(s));
          value = t.perWeekValue(number(total));
          explain = t.perWeekExplain(number(total), number(perMonth), tag(s));
          break;
        default:
          break;
      }
      rows.push({
        key: `${step.id}-${s}`,
        step: step.id,
        series: s,
        name,
        width: STEP_WIDTHS[step.id],
        value,
        perMonth: step.id === "perMonth" ? "" : perMonth === null ? "—" : step.id === "lots" ? t.lotsPerMonth(number(perMonth)) : t.perMonthShort(number(perMonth)),
        explain,
        raw: total,
      });
    }
  }
  if (cost !== null && cost > 0) {
    const perMonthStep = f.steps.find((s) => s.id === "perMonth");
    for (const s of both) {
      const perMonth = perMonthStep ? pick(perMonthStep.perMonth, s) : null;
      if (perMonth === null) continue;
      const spend = perMonth * cost;
      rows.push({
        key: `adSpend-${s}`,
        step: "adSpend",
        series: s,
        name: t.adSpendLabel(suffix(s)),
        width: STEP_WIDTHS.adSpend,
        value: t.adSpendValue(money(spend)),
        perMonth: t.adSpendDetail(number(perMonth), money(cost)),
        explain: t.adExplain(money(spend), money(cost)),
        raw: spend,
      });
    }
  }
  return rows;
}

interface LabelProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  rows: FunnelRow[];
  wide: boolean;
}

/** Value and per-month demand to the right of the bar; on narrow screens the step name rides above it. */
function RowLabel({ x = 0, y = 0, width = 0, height = 0, index = 0, rows, wide }: LabelProps) {
  const row = rows[index];
  if (!row) return null;
  const cx = x + width + 8;
  const cy = y + height / 2;
  return (
    <g style={{ textTransform: "none" }}>
      {!wide && (
        <text x={x} y={cy - 10} fill={MUTED} fontSize={10}>
          {row.name}
        </text>
      )}
      <text x={cx} y={cy} dominantBaseline="middle" fill={FOREGROUND} fontSize={wide ? 13 : 12} fontWeight={600}>
        {row.value}
        {wide && row.perMonth && (
          <tspan fill={MUTED} fontWeight={400} fontSize={11}>
            {" "}
            · {row.perMonth}
          </tspan>
        )}
      </text>
      {!wide && row.perMonth && (
        <text x={cx} y={cy + 13} dominantBaseline="middle" fill={MUTED} fontSize={10}>
          {row.perMonth}
        </text>
      )}
    </g>
  );
}

type TooltipProps = { active?: boolean; payload?: { payload: FunnelRow }[] };

function FunnelTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <div className={cn(TOOLTIP_CLASS, "max-w-[300px]")} style={TOOLTIP_STYLE} data-testid="reverse-funnel-tooltip">
      <div className="font-heading text-gold" style={{ textTransform: "none" }}>
        {row.name}
      </div>
      <p className="mt-1 leading-snug">{row.explain}</p>
    </div>
  );
}

/**
 * THE REVERSE FUNNEL — from the remaining dollars backwards to reservations per week, at the
 * ledger average and the since-era average side by side (never one blended figure), through the
 * measured conversion. Payments holds no lead or inquiry volume, so the last step is the user's
 * own cost per conversation (kept in localStorage) and the ad spend it implies, labelled as such.
 */
export function ReverseFunnel({
  goal,
  expected,
  conversion,
}: {
  goal: GoalStatus;
  expected: Expected;
  conversion?: Conversion;
}) {
  const { d, reducedMotion } = useTheme();
  const wide = useWideViewport();
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const reveal = useChartReveal(reducedMotion);
  const t = usePipelineStrings().funnel;
  const [cost, setCost] = useState<number | null>(() => readCostPerConversation());
  const [costText, setCostText] = useState(() => (cost === null ? "" : String(cost)));
  useEffect(() => persistCostPerConversation(cost), [cost]);

  const funnel = useMemo(() => buildReverseFunnel(goal, expected), [goal, expected]);
  const eraMonth = goal.recentSince ? eraMonthLabel(goal.recentSince) : null;
  const rows = useMemo(() => buildRows(funnel, eraMonth, cost, t), [funnel, eraMonth, cost, t]);
  const duration = Math.min(Math.round(d(0.5) * 1000), MAX_BAR_DURATION_MS);
  const rowHeight = wide ? 40 : 60;
  const at = (step: FunnelRow["step"], series: Series) => rows.find((r) => r.step === step && r.series === series)?.raw ?? "";

  const onCost = (text: string) => {
    setCostText(text);
    const n = Number(text);
    setCost(text.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n);
  };

  const conversionSource =
    funnel.conversionSource === "resolved"
      ? conversion
        ? t.conversionResolvedOpen(conversion.closed, conversion.resolvedDenominator, conversion.stillReserved)
        : t.conversionResolved
      : funnel.conversionSource === "with_cancellations"
        ? t.conversionWithCanc
        : funnel.conversionSource === "assumed"
          ? t.conversionAssumed
          : "";

  return (
    <section
      aria-label={t.aria}
      className="parchment-card mb-6 overflow-hidden p-4 sm:p-5"
      data-testid="reverse-funnel"
      data-revealed={inView}
      data-animating={reveal.animate}
      data-remaining={funnel.remaining}
      data-months={funnel.monthsToDeadline}
      data-conversion={funnel.conversionPct}
      data-lots-lifetime={at("lots", "lifetime")}
      data-lots-recent={at("lots", "recent")}
      data-reservations-lifetime={at("reservations", "lifetime")}
      data-reservations-recent={at("reservations", "recent")}
      data-per-month-lifetime={at("perMonth", "lifetime")}
      data-per-month-recent={at("perMonth", "recent")}
      data-per-week-lifetime={at("perWeek", "lifetime")}
      data-per-week-recent={at("perWeek", "recent")}
      data-cost-per-conversation={cost ?? ""}
      data-ad-spend-lifetime={at("adSpend", "lifetime")}
      data-ad-spend-recent={at("adSpend", "recent")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.title(money(funnel.remaining))}</h2>
        <span className="text-xs text-muted-foreground">
          {t.monthsConversion(number(funnel.monthsToDeadline), goal.deadline, pct(funnel.conversionPct, 1), conversionSource)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t.twoFigures(money(funnel.avgNetProfitPerClosedLot))}
        {funnel.recentAvgNetProfitPerClosedLot !== null && eraMonth ? t.andEraAvg(eraMonth, money(funnel.recentAvgNetProfitPerClosedLot), goal.recentClosedLots) : t.noEraAvg}
      </p>

      {funnel.met ? (
        <p className="mt-4 font-heading text-lg text-oxygen" data-testid="reverse-funnel-status">
          {t.goalMet}
        </p>
      ) : funnel.noHistory ? (
        <p className="mt-4 font-heading text-lg text-muted-foreground" data-testid="reverse-funnel-status">
          {t.noHistory(money(funnel.remaining))}
        </p>
      ) : (
        <div ref={ref} className="mt-3 w-full" style={{ height: rows.length * rowHeight + 8 }}>
          {inView && (
            <ResponsiveContainer>
              <BarChart data={rows} layout="vertical" margin={{ top: wide ? 4 : 14, right: 8, left: 0, bottom: 0 }} barCategoryGap={wide ? "30%" : "58%"}>
                <XAxis type="number" domain={[0, AXIS_MAX]} hide />
                <YAxis type="category" dataKey="name" width={wide ? 272 : 0} hide={!wide} interval={0} tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
                <ChartTooltip content={<FunnelTooltip />} cursor={CURSOR} />
                <Bar dataKey="width" radius={[0, 3, 3, 0]} isAnimationActive={reveal.animate} animationDuration={duration} onAnimationEnd={reveal.settle}>
                  {rows.map((r) => (
                    <Cell key={r.key} fill={r.series === "recent" ? OXYGEN : GOLD} fillOpacity={r.series === "recent" ? 0.8 : r.step === "adSpend" ? 0.7 : 1} />
                  ))}
                  <LabelList dataKey="value" content={(props) => <RowLabel {...(props as LabelProps)} rows={rows} wide={wide} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">{t.paymentsHint}</div>
        <label className="flex items-center gap-2 text-xs">
          <span className="whitespace-nowrap text-muted-foreground">{t.costLabel}</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            placeholder={t.costPlaceholder}
            value={costText}
            onChange={(e) => onCost(e.target.value)}
            className="w-28"
            aria-label={t.costAria}
            data-testid="funnel-cost-input"
          />
        </label>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground" aria-label={t.legendAria}>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} /> {t.legendLedger}
        </li>
        {funnel.recentAvgNetProfitPerClosedLot !== null && (
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: OXYGEN, opacity: 0.8 }} /> {t.legendRecent(eraMonth ?? "")}
          </li>
        )}
      </ul>
    </section>
  );
}
