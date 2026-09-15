import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { buildFarmCalendar, warPlanMonthLabel, type FarmCalendar as FarmCalendarShape, type PlannedCapitalReturn, type PlannedFarm, type WarPlan, type WarPlanRealValues } from "@/domain";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useWideViewport } from "@/hooks/useWideViewport";
import { useLang } from "@/i18n/lang";
import { useWarPlanStrings, type WarPlanUiStrings } from "@/i18n/warPlan";
import { useTheme } from "@/theme/ThemeProvider";
import { date, moneyCompact, number } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CURSOR,
  DATA_AXIS,
  DATA_GOAL,
  DATA_INVENTORY,
  DATA_PROFIT_RECYCLED,
  DATA_RAISE,
  DATA_STATUS_FAR,
  GRID_STROKE_OPACITY,
  SERIES_STROKE_WIDTH,
  TOOLTIP_CLASS,
  TOOLTIP_STYLE,
  useChartReveal,
} from "./chartTokens";

const MAX_BAR_DURATION_MS = 600;
const ROW_HEIGHT_PX = 30;

type CalCopy = WarPlanUiStrings["calendar"];

interface MonthRow {
  index: number;
  label: string;
  iso: string;
  recycled: number;
  fresh: number;
  unfunded: number;
  returned: number;
  farms: PlannedFarm[];
  returns: PlannedCapitalReturn[];
  inventoryOut: boolean;
  isToday: boolean;
  isDeadline: boolean;
}

function monthRows(cal: FarmCalendarShape): MonthRow[] {
  return cal.months.map((m) => {
    const farms = cal.farms.filter((f) => f.purchaseMonth === m.index);
    const returns = cal.returns.filter((r) => r.monthIndex === m.index);
    return {
      index: m.index,
      label: m.label,
      iso: m.iso,
      recycled: farms.reduce((s, f) => s + f.recycled, 0),
      fresh: farms.reduce((s, f) => s + f.fresh, 0),
      unfunded: farms.reduce((s, f) => s + f.unfunded, 0),
      returned: returns.reduce((s, r) => s + r.amount, 0),
      farms,
      returns,
      inventoryOut: cal.inventoryOut.monthIndex === m.index,
      isToday: m.index === 1,
      isDeadline: m.isDeadline,
    };
  });
}

function lagClause(cal: FarmCalendarShape, c: CalCopy): string {
  const lag = cal.lag;
  const months = c.month(lag.months);
  if (lag.source === "observed") {
    return c.lagObserved(months, c.farm(lag.observedFarms), number(lag.observedMonths));
  }
  const sparse =
    lag.observedFarms < 2
      ? c.lagSparse(lag.observedFarms, lag.observedFarms === 1 ? c.farmHas : c.farmsHave)
      : null;
  return c.lagAssumption(months, sparse);
}

function farmSentence(f: PlannedFarm, cal: FarmCalendarShape, c: CalCopy, lang: "en" | "es"): string {
  const parts: string[] = [];
  if (f.recycled > 0) parts.push(c.recycledFrom(moneyCompact(f.recycled)));
  if (f.fresh > 0) {
    const who =
      f.sponsors
        .filter((s) => s.amount > 0)
        .map((s) => s.name)
        .join(c.andJoin) || c.theMix;
    parts.push(c.freshFrom(moneyCompact(f.fresh), who));
  }
  if (f.unfunded > 0) parts.push(c.nobodyCovers(moneyCompact(f.unfunded)));
  const land = f.landIso ? warPlanMonthLabel(f.landIso, lang) : c.afterDeadline;
  return c.farmSentence(
    f.number,
    c.lot(f.lots),
    moneyCompact(f.cost),
    warPlanMonthLabel(f.purchaseIso, lang),
    land,
    c.month(cal.lag.months),
    cal.lag.source,
    parts.join(", "),
    f.tooLate,
  );
}

function returnSentence(r: PlannedCapitalReturn, cal: FarmCalendarShape, c: CalCopy, lang: "en" | "es"): string {
  const when = r.iso ? warPlanMonthLabel(r.iso, lang) : `month ${r.monthIndex}`;
  const cycle = cal.cycleMonths === null ? "" : c.afterCycle(number(cal.cycleMonths));
  const use =
    r.fundsFarmNumber !== null
      ? c.canFundFarm(r.fundsFarmNumber)
      : r.afterDeadline
        ? c.afterDeadlineNoUse
        : c.noLaterFarm;
  return c.returnSentence(when, r.sponsor, moneyCompact(r.amount), r.farmNumber, cycle, use);
}

function inventorySentence(cal: FarmCalendarShape, c: CalCopy): string {
  const inv = cal.inventoryOut;
  const stock = c.inventoryStock(c.lot(inv.lots), inv.availableLots, inv.reservedLots);
  if (inv.months === null) return c.inventoryNever(stock);
  const when = inv.iso ? date(inv.iso) : "—";
  return inv.afterDeadline
    ? c.inventoryPast(stock, number(inv.months), number(inv.requiredPerMonth), when)
    : c.inventoryRunsOut(stock, number(inv.months), number(inv.requiredPerMonth), when);
}

type TooltipProps = { active?: boolean; payload?: { payload: MonthRow }[]; cal: FarmCalendarShape; c: CalCopy; lang: "en" | "es" };

function CalendarTooltip({ active, payload, cal, c, lang }: TooltipProps) {
  if (!active || !payload?.[0]) return null;
  const m = payload[0].payload;
  const lines: { key: string; text: string; tone?: string }[] = [];
  if (m.isToday) lines.push({ key: "today", text: c.todayMonth(m.label) });
  if (m.inventoryOut) lines.push({ key: "inv", text: inventorySentence(cal, c), tone: "text-ember" });
  m.farms.forEach((f) => lines.push({ key: `f${f.number}`, text: farmSentence(f, cal, c, lang), tone: "text-gold" }));
  m.returns.forEach((r, i) => lines.push({ key: `r${i}`, text: returnSentence(r, cal, c, lang), tone: "text-liberty" }));
  if (m.isDeadline) lines.push({ key: "deadline", text: c.deadlineMonth(m.label, date(cal.deadline)) });
  if (lines.length === 0) lines.push({ key: "none", text: c.emptyMonth(m.label) });
  return (
    <div className={cn(TOOLTIP_CLASS, "max-w-[280px] sm:max-w-[360px]")} style={TOOLTIP_STYLE} data-testid="farm-calendar-tooltip">
      <div className="font-heading text-gold" style={{ textTransform: "none" }}>
        {m.label}
      </div>
      {lines.map((l) => (
        <p key={l.key} className={cn("mt-1 leading-snug", l.tone)}>
          {l.text}
        </p>
      ))}
    </div>
  );
}

/**
 * THE FARM CALENDAR — when to reinvest. The months from today to the deadline with the month
 * today's inventory runs out at the required pace, the funding deadline of every farm the
 * required plan buys (worked back from that month by the funding → first-closing lag), each
 * purchase split into recycled, fresh and unfunded capital, and every sponsor capital return the
 * Oracle's recycling simulation produces. All of it is `solveWarPlan`'s required column, laid on
 * a calendar by `buildFarmCalendar`; nothing is re-planned here.
 */
export function FarmCalendar({ plan, real }: { plan: WarPlan; real: Pick<WarPlanRealValues, "farmToFirstCloseMonths" | "farmToFirstCloseFarms"> }) {
  const { d, reducedMotion } = useTheme();
  const [lang] = useLang();
  const c = useWarPlanStrings().calendar;
  const wide = useWideViewport();
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const reveal = useChartReveal(reducedMotion);
  const cal = useMemo(() => buildFarmCalendar(plan, real), [plan, real]);
  const rows = useMemo(() => monthRows(cal), [cal]);
  const duration = Math.min(Math.round(d(0.5) * 1000), MAX_BAR_DURATION_MS);
  const afterDeadline = cal.returns.filter((r) => r.afterDeadline);
  const inventoryLabel = cal.inventoryOut.monthIndex !== null ? rows.find((r) => r.index === cal.inventoryOut.monthIndex)?.label : undefined;
  const deadlineLabel = rows.find((r) => r.isDeadline)?.label;
  const tick = { fill: DATA_AXIS, fontSize: 10 };
  const dollars = (v: number) => moneyCompact(v);

  return (
    <section
      aria-label={c.aria}
      className="parchment-card mb-6 overflow-hidden p-4 sm:p-5"
      data-testid="farm-calendar"
      data-revealed={inView}
      data-animating={reveal.animate}
      data-inventory-out={cal.inventoryOut.iso ?? ""}
      data-inventory-out-month={cal.inventoryOut.monthIndex ?? ""}
      data-inventory-out-months={cal.inventoryOut.months ?? ""}
      data-inventory-lots={cal.inventoryOut.lots}
      data-required-per-month={cal.inventoryOut.requiredPerMonth}
      data-farms={cal.farms.length}
      data-funding-deadlines={cal.farms.map((f) => f.purchaseIso).join(",")}
      data-returns={cal.returns.length}
      data-lag={cal.lag.months}
      data-lag-source={cal.lag.source}
      data-deadline={cal.deadline}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="stat-label">{c.title}</div>
        <span className="text-xs text-muted-foreground">{c.subtitle}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="farm-calendar-summary">
        {inventorySentence(cal, c)}{" "}
        {cal.farms.length > 0
          ? c.summaryFunds(
              lagClause(cal, c),
              c.farm(cal.farms.length),
              warPlanMonthLabel(cal.farms[0]?.purchaseIso ?? cal.deadline, lang),
              warPlanMonthLabel(cal.farms[cal.farms.length - 1]?.purchaseIso ?? cal.deadline, lang),
              moneyCompact(cal.capitalToRaise),
              cal.recycledTotal > 0 ? c.andRecycled(moneyCompact(cal.recycledTotal)) : null,
            )
          : c.summaryNone(lagClause(cal, c))}
      </p>

      <div ref={ref} className="mt-3 w-full" style={{ height: wide ? 272 : Math.max(200, rows.length * ROW_HEIGHT_PX + 40) }}>
        {inView && rows.length > 0 && (
          <ResponsiveContainer>
            <ComposedChart data={rows} layout={wide ? "horizontal" : "vertical"} margin={{ top: 16, right: wide ? 12 : 16, left: 0, bottom: 0 }} barCategoryGap="20%">
              {wide && <CartesianGrid stroke={DATA_AXIS} strokeOpacity={GRID_STROKE_OPACITY} vertical={false} />}
              {wide ? (
                <>
                  <XAxis dataKey="label" interval={0} angle={-45} textAnchor="end" height={40} tick={tick} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={dollars} tick={tick} tickLine={false} axisLine={false} width={44} />
                </>
              ) : (
                <>
                  <XAxis type="number" tickFormatter={dollars} tick={tick} tickLine={false} axisLine={false} height={20} />
                  <YAxis type="category" dataKey="label" interval={0} tick={tick} tickLine={false} axisLine={false} width={64} />
                </>
              )}
              <ChartTooltip content={<CalendarTooltip cal={cal} c={c} lang={lang} />} cursor={CURSOR} />
              {inventoryLabel && (
                <ReferenceLine
                  {...(wide ? { x: inventoryLabel } : { y: inventoryLabel })}
                  stroke={DATA_INVENTORY}
                  strokeWidth={SERIES_STROKE_WIDTH}
                  label={{ value: c.inventoryOut, fill: DATA_INVENTORY, fontSize: 10, position: wide ? "insideTopRight" : "insideRight" }}
                />
              )}
              {deadlineLabel && (
                <ReferenceLine
                  {...(wide ? { x: deadlineLabel } : { y: deadlineLabel })}
                  stroke={DATA_GOAL}
                  strokeWidth={SERIES_STROKE_WIDTH}
                  strokeDasharray="4 4"
                  label={{ value: c.deadline, fill: DATA_GOAL, fontSize: 10, position: wide ? "insideTopLeft" : "insideLeft" }}
                />
              )}
              <Bar dataKey="recycled" name={c.barRecycled} stackId="farm" fill={DATA_PROFIT_RECYCLED} isAnimationActive={reveal.animate} animationDuration={duration} />
              <Bar dataKey="fresh" name={c.barFresh} stackId="farm" fill={DATA_RAISE} isAnimationActive={reveal.animate} animationDuration={duration} />
              <Bar dataKey="unfunded" name={c.barUnfunded} stackId="farm" fill={DATA_STATUS_FAR} isAnimationActive={reveal.animate} animationDuration={duration} onAnimationEnd={reveal.settle} />
              <Bar dataKey="returned" name={c.barReturned} stackId="return" fill={DATA_PROFIT_RECYCLED} fillOpacity={0.45} isAnimationActive={reveal.animate} animationDuration={duration} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground" aria-label={c.legendAria}>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DATA_RAISE }} /> {c.legendFresh}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DATA_PROFIT_RECYCLED }} /> {c.legendRecycled}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DATA_STATUS_FAR }} /> {c.legendUnfunded}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: DATA_PROFIT_RECYCLED, opacity: 0.45 }} /> {c.legendReturned}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t" style={{ borderColor: DATA_INVENTORY }} /> {c.legendInventoryOut}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed" style={{ borderColor: DATA_GOAL }} /> {c.deadline}
        </li>
      </ul>

      <ol className="mt-3 grid gap-2 text-xs sm:grid-cols-2" aria-label={c.fundingDeadlinesAria} data-testid="farm-calendar-farms">
        {cal.farms.map((f) => (
          <li
            key={f.number}
            className="rounded-md border border-border/60 bg-background/40 p-2.5"
            data-testid="farm-calendar-farm"
            data-purchase={f.purchaseIso}
            data-recycled={f.recycled}
            data-fresh={f.fresh}
            data-unfunded={f.unfunded}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-heading">{c.farmFundBy(f.number, warPlanMonthLabel(f.purchaseIso, lang))}</span>
              <span className="tabular text-muted-foreground">{moneyCompact(f.cost)}</span>
            </div>
            <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-border/40" aria-hidden>
              {f.recycled > 0 && <span style={{ width: `${(f.recycled / f.cost) * 100}%`, background: DATA_PROFIT_RECYCLED }} />}
              {f.fresh > 0 && <span style={{ width: `${(f.fresh / f.cost) * 100}%`, background: DATA_RAISE }} />}
              {f.unfunded > 0 && <span style={{ width: `${(f.unfunded / f.cost) * 100}%`, background: DATA_STATUS_FAR }} />}
            </div>
            <div className="mt-1 text-muted-foreground tabular">
              {f.recycled > 0 && <span className="text-liberty">{c.recycledAmount(moneyCompact(f.recycled))}</span>}
              <span className="text-gold">{c.freshAmount(moneyCompact(f.fresh))}</span>
              {f.unfunded > 0 && <span className="text-ember">{c.unfundedAmount(moneyCompact(f.unfunded))}</span>}
              {c.lotsCloseFrom(f.landIso ? warPlanMonthLabel(f.landIso, lang) : c.afterDeadline)}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[11px] text-muted-foreground" data-testid="farm-calendar-lag">
        {c.lagPrefix}
        {lagClause(cal, c)}.{" "}
        {cal.returns.length > 0
          ? c.returnsInPlan(
              c.capitalReturn(cal.returns.length),
              cal.cycleMonths !== null ? c.onCycle(number(cal.cycleMonths)) : "",
              afterDeadline.length > 0
                ? c.afterDeadlineList(
                    afterDeadline.length,
                    afterDeadline
                      .map((r) =>
                        c.returnAfterItem(r.sponsor, moneyCompact(r.amount), r.farmNumber, r.iso ? warPlanMonthLabel(r.iso, lang) : null),
                      )
                      .join(", "),
                  )
                : "",
            )
          : cal.cycleMonths === null
            ? c.noCycleMeasured
            : c.noReturnsInPlan}
      </p>
    </section>
  );
}
