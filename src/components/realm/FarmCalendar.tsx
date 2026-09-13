import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { buildFarmCalendar, warPlanMonthLabel, type FarmCalendar as FarmCalendarShape, type PlannedCapitalReturn, type PlannedFarm, type WarPlan, type WarPlanRealValues } from "@/domain";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useWideViewport } from "@/hooks/useWideViewport";
import { useTheme } from "@/theme/ThemeProvider";
import { date, moneyCompact, number } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BORDER, CURSOR, EMBER, GOLD, LIBERTY, MUTED, TOOLTIP_CLASS, TOOLTIP_STYLE, useChartReveal } from "./chartTokens";

const MAX_BAR_DURATION_MS = 600;
const ROW_HEIGHT_PX = 30;

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

const plural = (n: number, one: string, many: string) => `${number(n)} ${n === 1 ? one : many}`;

function lagClause(cal: FarmCalendarShape): string {
  const lag = cal.lag;
  return lag.source === "observed"
    ? `${plural(lag.months, "month", "months")} from funding to first closing, observed on ${plural(lag.observedFarms, "farm", "farms")} (median ${number(lag.observedMonths)})`
    : `${plural(lag.months, "month", "months")} from funding to first closing — an assumption${lag.observedFarms < 2 ? ` (only ${lag.observedFarms} funded ${lag.observedFarms === 1 ? "farm has" : "farms have"} a first closing)` : ", not the observed median"}`;
}

function farmSentence(f: PlannedFarm, cal: FarmCalendarShape): string {
  const parts: string[] = [];
  if (f.recycled > 0) parts.push(`${moneyCompact(f.recycled)} recycled from an earlier farm's capital return`);
  if (f.fresh > 0) parts.push(`${moneyCompact(f.fresh)} fresh from ${f.sponsors.filter((s) => s.amount > 0).map((s) => s.name).join(" and ") || "the mix"}`);
  if (f.unfunded > 0) parts.push(`${moneyCompact(f.unfunded)} nobody in the mix covers`);
  const land = f.landIso ? warPlanMonthLabel(f.landIso) : "after the deadline";
  const late = f.tooLate ? " — bought too late to convert before the deadline." : ".";
  return `Farm ${f.number} (${plural(f.lots, "lot", "lots")}, ${moneyCompact(f.cost)}): fund by ${warPlanMonthLabel(f.purchaseIso)} so its lots can close from ${land} (${plural(cal.lag.months, "month", "months")} lag, ${cal.lag.source}) — ${parts.join(", ")}${late}`;
}

function returnSentence(r: PlannedCapitalReturn, cal: FarmCalendarShape): string {
  const when = r.iso ? warPlanMonthLabel(r.iso) : `month ${r.monthIndex}`;
  const cycle = cal.cycleMonths === null ? "" : ` after a ${number(cal.cycleMonths)}-month cycle`;
  const use = r.fundsFarmNumber !== null ? `it can fund farm ${r.fundsFarmNumber}` : r.afterDeadline ? "after the deadline, so no planned farm can use it" : "no later farm in the plan needs it";
  return `${when}: ${r.sponsor}'s ${moneyCompact(r.amount)} from farm ${r.farmNumber} comes back${cycle} — ${use}.`;
}

function inventorySentence(cal: FarmCalendarShape): string {
  const inv = cal.inventoryOut;
  const stock = `${plural(inv.lots, "lot", "lots")} in inventory today (${inv.availableLots} available + ${inv.reservedLots} reserved)`;
  if (inv.months === null) return `${stock}; the required pace is zero, so they never run out.`;
  const when = inv.iso ? date(inv.iso) : "—";
  return inv.afterDeadline
    ? `${stock} last ${number(inv.months)} months at ${number(inv.requiredPerMonth)} lots/month — past the deadline (${when}), so no farm is needed for inventory.`
    : `${stock} last ${number(inv.months)} months at the required ${number(inv.requiredPerMonth)} lots/month: they run out around ${when}.`;
}

type TooltipProps = { active?: boolean; payload?: { payload: MonthRow }[]; cal: FarmCalendarShape };

function CalendarTooltip({ active, payload, cal }: TooltipProps) {
  if (!active || !payload?.[0]) return null;
  const m = payload[0].payload;
  const lines: { key: string; text: string; tone?: string }[] = [];
  if (m.isToday) lines.push({ key: "today", text: `${m.label}: today's month — the plan starts here.` });
  if (m.inventoryOut) lines.push({ key: "inv", text: inventorySentence(cal), tone: "text-ember" });
  m.farms.forEach((f) => lines.push({ key: `f${f.number}`, text: farmSentence(f, cal), tone: "text-gold" }));
  m.returns.forEach((r, i) => lines.push({ key: `r${i}`, text: returnSentence(r, cal), tone: "text-liberty" }));
  if (m.isDeadline) lines.push({ key: "deadline", text: `${m.label}: the deadline, ${date(cal.deadline)}.` });
  if (lines.length === 0) lines.push({ key: "none", text: `${m.label}: nothing to fund, nothing comes back.` });
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
  const wide = useWideViewport();
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const reveal = useChartReveal(reducedMotion);
  const cal = useMemo(() => buildFarmCalendar(plan, real), [plan, real]);
  const rows = useMemo(() => monthRows(cal), [cal]);
  const duration = Math.min(Math.round(d(0.5) * 1000), MAX_BAR_DURATION_MS);
  const afterDeadline = cal.returns.filter((r) => r.afterDeadline);
  const inventoryLabel = cal.inventoryOut.monthIndex !== null ? rows.find((r) => r.index === cal.inventoryOut.monthIndex)?.label : undefined;
  const deadlineLabel = rows.find((r) => r.isDeadline)?.label;
  const tick = { fill: MUTED, fontSize: 10 };
  const dollars = (v: number) => moneyCompact(v);

  return (
    <section
      aria-label="Farm calendar"
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
        <div className="stat-label">The farm calendar — when to reinvest</div>
        <span className="text-xs text-muted-foreground">The required plan, month by month. Hover any month.</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="farm-calendar-summary">
        {inventorySentence(cal)}{" "}
        {cal.farms.length > 0
          ? `Working back ${lagClause(cal)}, the plan funds ${plural(cal.farms.length, "farm", "farms")} — the first by ${warPlanMonthLabel(cal.farms[0]?.purchaseIso ?? cal.deadline)}, the last by ${warPlanMonthLabel(cal.farms[cal.farms.length - 1]?.purchaseIso ?? cal.deadline)} — ${moneyCompact(cal.capitalToRaise)} fresh${cal.recycledTotal > 0 ? ` and ${moneyCompact(cal.recycledTotal)} recycled` : ""}.`
          : `No farm to fund before the deadline (lag: ${lagClause(cal)}).`}
      </p>

      <div ref={ref} className="mt-3 w-full" style={{ height: wide ? 272 : Math.max(200, rows.length * ROW_HEIGHT_PX + 40) }}>
        {inView && rows.length > 0 && (
          <ResponsiveContainer>
            <ComposedChart data={rows} layout={wide ? "horizontal" : "vertical"} margin={{ top: 16, right: wide ? 12 : 16, left: 0, bottom: 0 }} barCategoryGap="20%">
              {wide && <CartesianGrid stroke={BORDER} vertical={false} />}
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
              <ChartTooltip content={<CalendarTooltip cal={cal} />} cursor={CURSOR} />
              {inventoryLabel && (
                <ReferenceLine
                  {...(wide ? { x: inventoryLabel } : { y: inventoryLabel })}
                  stroke={EMBER}
                  strokeDasharray="4 4"
                  label={{ value: "inventory out", fill: EMBER, fontSize: 10, position: wide ? "insideTopRight" : "insideRight" }}
                />
              )}
              {deadlineLabel && <ReferenceLine {...(wide ? { x: deadlineLabel } : { y: deadlineLabel })} stroke={GOLD} strokeOpacity={0.7} label={{ value: "deadline", fill: GOLD, fontSize: 10, position: wide ? "insideTopLeft" : "insideLeft" }} />}
              <Bar dataKey="recycled" name="Recycled capital" stackId="farm" fill={LIBERTY} isAnimationActive={reveal.animate} animationDuration={duration} />
              <Bar dataKey="fresh" name="Fresh capital to raise" stackId="farm" fill={GOLD} isAnimationActive={reveal.animate} animationDuration={duration} />
              <Bar dataKey="unfunded" name="Unfunded" stackId="farm" fill={EMBER} fillOpacity={0.7} isAnimationActive={reveal.animate} animationDuration={duration} onAnimationEnd={reveal.settle} />
              <Bar dataKey="returned" name="Capital returned" stackId="return" fill={LIBERTY} fillOpacity={0.45} isAnimationActive={reveal.animate} animationDuration={duration} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground" aria-label="legend">
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} /> fresh capital to raise
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LIBERTY }} /> recycled capital
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: EMBER, opacity: 0.7 }} /> unfunded
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LIBERTY, opacity: 0.45 }} /> sponsor capital returned
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t border-dashed" style={{ borderColor: EMBER }} /> inventory out
        </li>
      </ul>

      <ol className="mt-3 grid gap-2 text-xs sm:grid-cols-2" aria-label="Funding deadlines" data-testid="farm-calendar-farms">
        {cal.farms.map((f) => (
          <li key={f.number} className="rounded-md border border-border/60 bg-background/40 p-2.5" data-testid="farm-calendar-farm" data-purchase={f.purchaseIso} data-recycled={f.recycled} data-fresh={f.fresh} data-unfunded={f.unfunded}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-heading">
                Farm {f.number} · fund by <span className="text-gold">{warPlanMonthLabel(f.purchaseIso)}</span>
              </span>
              <span className="tabular text-muted-foreground">{moneyCompact(f.cost)}</span>
            </div>
            <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-border/40" aria-hidden>
              {f.recycled > 0 && <span style={{ width: `${(f.recycled / f.cost) * 100}%`, background: LIBERTY }} />}
              {f.fresh > 0 && <span style={{ width: `${(f.fresh / f.cost) * 100}%`, background: GOLD }} />}
              {f.unfunded > 0 && <span style={{ width: `${(f.unfunded / f.cost) * 100}%`, background: EMBER, opacity: 0.7 }} />}
            </div>
            <div className="mt-1 text-muted-foreground tabular">
              {f.recycled > 0 && <span className="text-liberty">{moneyCompact(f.recycled)} recycled · </span>}
              <span className="text-gold">{moneyCompact(f.fresh)} fresh</span>
              {f.unfunded > 0 && <span className="text-ember"> · {moneyCompact(f.unfunded)} unfunded</span>}
              {" · "}lots close from {f.landIso ? warPlanMonthLabel(f.landIso) : "after the deadline"}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[11px] text-muted-foreground" data-testid="farm-calendar-lag">
        Lag: {lagClause(cal)}.{" "}
        {cal.returns.length > 0
          ? `${plural(cal.returns.length, "capital return", "capital returns")} in the plan${cal.cycleMonths !== null ? ` on a ${number(cal.cycleMonths)}-month cycle` : ""}${afterDeadline.length > 0 ? `; ${afterDeadline.length} of them land after the deadline (${afterDeadline.map((r) => `${r.sponsor} ${moneyCompact(r.amount)} from farm ${r.farmNumber}${r.iso ? ` in ${warPlanMonthLabel(r.iso)}` : ""}`).join(", ")})` : ""}.`
          : cal.cycleMonths === null
            ? "No capital cycle is measured, so no sponsor capital returns inside the plan."
            : "No sponsor capital returns inside the plan."}
      </p>
    </section>
  );
}
