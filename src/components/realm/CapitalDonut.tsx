import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";
import type { CapitalComposition, CapitalKind, CapitalKindSlice, InvestorFarmPosition, Liberation, SponsorCapitalArc } from "@/domain";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useWideViewport } from "@/hooks/useWideViewport";
import { useTheme } from "@/theme/ThemeProvider";
import { useSponsorsStrings, type SponsorsUiStrings } from "@/i18n/sponsors";
import { money, moneyCompact, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CARD, FOREGROUND, GOLD, LIBERTY, MUTED, SPONSOR, STEEL, TOOLTIP_CLASS, TOOLTIP_STYLE, useChartReveal } from "./chartTokens";

/**
 * CAPITAL COMPOSITION — one donut, two rings, plus a small recovery donut.
 *
 * Why one donut with an inner ring rather than a flat pie or two separate charts: the page has
 * six sources of capital in three kinds, and the reader needs both facts at once — who put the
 * money in (outer ring, one arc per sponsor, descending) and on what kind of deal (inner ring:
 * own capital / profit share / fixed interest). A flat pie of sponsors would blend the kinds a
 * profit-share arc and a fixed-interest arc sit on; two side-by-side charts would make the
 * reader match arcs across them. Nesting keeps the kinds legible as bands directly under the
 * sponsors they are made of, and the outer arcs borrow their kind's hue so the two rings read as
 * one figure. Hue carries the meaning the page already assigns: gold is profit share (the
 * Townson card, badge and crown), the sponsor token is fixed interest (the hostage bars and the
 * capital-outstanding tile), steel is own capital (neutral: nobody is owed it). Sponsors of the
 * same kind step down in opacity by rank and are separated by a card-coloured seam.
 *
 * The recovery donut (returned vs outstanding) is a second, deliberately tiny chart because it
 * answers a different question — how much of the outside capital is home — over the Liberation
 * totals the hostages strip already prints, so the 13 % reads at a glance without a third ring.
 *
 * Every figure comes from `Realm.capitalComposition` (`computeCapitalComposition`) and
 * `Realm.liberation`; nothing is summed here. The concentration line under the donut is the
 * same `concentration` object the Council's rule reads.
 */

const KIND_FILL: Record<CapitalKind, string> = {
  own_capital: STEEL,
  profit_share: GOLD,
  fixed_interest: SPONSOR,
  other: MUTED,
};

/** Clockwise from 12 o'clock, so "descending" reads like a clock face. */
const START_ANGLE = 90;
const END_ANGLE = -270;
const RADIAN = Math.PI / 180;
/** Vertical room one two-line arc label needs. */
const LABEL_GAP = 32;

interface ArcLabelPlacement {
  x: number;
  y: number;
  anchor: "start" | "end";
  /** Where the leader line leaves the ring. */
  edge: { x: number; y: number };
  elbow: { x: number; y: number };
}

/**
 * Lays every outer-ring label out at once so adjacent thin arcs never overlap: anchors sit on
 * the arc's bisector just outside the ring, then each side is swept top to bottom and pushed
 * down to keep `LABEL_GAP` between neighbours. Deterministic in the arcs, so each recharts
 * label callback just reads its own slot.
 */
function layoutArcLabels(arcs: SponsorCapitalArc[], cx: number, cy: number, outerRadius: number): ArcLabelPlacement[] {
  const total = arcs.reduce((s, a) => s + a.capitalDeployed, 0);
  let cum = 0;
  const placements = arcs.map((a) => {
    const sweep = total > 0 ? (a.capitalDeployed / total) * 360 : 0;
    const mid = START_ANGLE - (cum + sweep / 2);
    cum += sweep;
    const cos = Math.cos(-mid * RADIAN);
    const sin = Math.sin(-mid * RADIAN);
    const edge = { x: cx + outerRadius * cos, y: cy + outerRadius * sin };
    const elbow = { x: cx + (outerRadius + 14) * cos, y: cy + (outerRadius + 14) * sin };
    const right = cos >= 0;
    return { x: cx + (right ? 1 : -1) * (outerRadius + 24), y: elbow.y, anchor: right ? ("start" as const) : ("end" as const), edge, elbow };
  });
  for (const side of ["start", "end"] as const) {
    const idx = placements.map((p, i) => (p.anchor === side ? i : -1)).filter((i) => i >= 0).sort((a, b) => placements[a]!.y - placements[b]!.y);
    for (let k = 1; k < idx.length; k++) {
      const prev = placements[idx[k - 1]!]!;
      const cur = placements[idx[k]!]!;
      if (cur.y < prev.y + LABEL_GAP) cur.y = prev.y + LABEL_GAP;
    }
  }
  return placements;
}

const asNumber = (v: number | string | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

function termsOf(farms: InvestorFarmPosition[], t: SponsorsUiStrings): string {
  const set = new Set(
    farms.map((f) =>
      f.dealType === "profit_share" ? t.card.termsShare(pct(f.profitSharePct, 0)) : f.dealType === "fixed_interest" ? t.card.termsPerYear(pct(f.annualRatePct, 0)) : t.card.termsOwn,
    ),
  );
  return [...set].join(" · ");
}

interface TooltipRow {
  payload?: SponsorCapitalArc | CapitalKindSlice;
}

function DonutTooltip({ active, payload, t }: { active?: boolean; payload?: TooltipRow[]; t: SponsorsUiStrings }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  if ("investorId" in row) {
    return (
      <div className={cn(TOOLTIP_CLASS, "max-w-[18rem] space-y-1")} style={TOOLTIP_STYLE} data-testid="capital-donut-tooltip">
        <div className="font-heading text-sm text-foreground">{row.name}</div>
        <div className="text-muted-foreground">
          {t.kind[row.kind]} · {t.donut.shareOfTotal(pct(row.share, 1))}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pt-1">
          <dt className="text-muted-foreground">{t.donut.deployed}</dt>
          <dd className="text-right tabular text-foreground">{money(row.capitalDeployed)}</dd>
          <dt className="text-muted-foreground">{t.donut.returned}</dt>
          <dd className="text-right tabular text-stage-closed">{money(row.capitalReturned)}</dd>
          <dt className="text-muted-foreground">{t.donut.outstanding}</dt>
          <dd className="text-right tabular text-sponsor">{money(row.capitalOutstanding)}</dd>
          <dt className="text-muted-foreground">{t.donut.terms}</dt>
          <dd className="text-right text-foreground">{termsOf(row.farms, t)}</dd>
          <dt className="text-muted-foreground">{t.donut.farms}</dt>
          <dd className="text-right text-foreground">{row.farms.map((f) => f.farmName).join(", ")}</dd>
        </dl>
        <div className="pt-1 text-[11px] text-muted-foreground">{t.donut.openCard}</div>
      </div>
    );
  }
  return (
    <div className={cn(TOOLTIP_CLASS, "space-y-0.5")} style={TOOLTIP_STYLE} data-testid="capital-donut-tooltip">
      <div className="font-heading text-sm text-foreground">{t.kind[row.kind]}</div>
      <div className="tabular text-foreground">{money(row.capitalDeployed)}</div>
      <div className="text-muted-foreground">{t.donut.shareOfTotal(pct(row.share, 1))}</div>
    </div>
  );
}

function RecoveredTooltip({ active, payload }: { active?: boolean; payload?: { name?: string; value?: number }[] }) {
  const row = payload?.[0];
  if (!active || !row) return null;
  return (
    <div className={TOOLTIP_CLASS} style={TOOLTIP_STYLE}>
      <span className="text-muted-foreground">{row.name}</span> <span className="tabular text-foreground">{money(row.value)}</span>
    </div>
  );
}

export function CapitalDonut({ composition, liberation, onSelect }: { composition: CapitalComposition; liberation: Liberation; onSelect: (investorId: string) => void }) {
  const { d, reducedMotion } = useTheme();
  const t = useSponsorsStrings();
  const wide = useWideViewport();
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const reveal = useChartReveal(reducedMotion);
  const { arcs, byKind, concentration } = composition;
  const duration = Math.round(d(0.9) * 1000);

  /** Opacity steps down by rank within a kind so same-hue neighbours stay apart. */
  const arcOpacity = useMemo(() => {
    const seen = new Map<CapitalKind, number>();
    return arcs.map((a) => {
      const rank = seen.get(a.kind) ?? 0;
      seen.set(a.kind, rank + 1);
      return Math.max(0.45, 1 - rank * 0.16);
    });
  }, [arcs]);

  const farmCount = new Set(arcs.flatMap((a) => a.farms.map((f) => f.farmId))).size;
  const sourceCount = new Set(arcs.map((a) => a.investorId)).size;
  const arcSum = arcs.reduce((s, a) => s + a.capitalDeployed, 0);

  const outer = wide ? { inner: 76, outer: 104 } : { inner: 60, outer: 88 };
  const inner = wide ? { inner: 58, outer: 70 } : { inner: 44, outer: 54 };

  const largest = concentration.largest;
  const topTwo = concentration.topTwo;
  const concentrationText =
    largest === null
      ? t.donut.concentrationNone
      : topTwo && topTwo.names.length > 1
        ? t.donut.concentration(largest.name, pct(largest.share, 1), pct(topTwo.share, 1))
        : t.donut.concentrationOne(largest.name, pct(largest.share, 1));
  const thresholdText = pct(concentration.thresholdPct, 0);

  const recovered = [
    { key: "returned", name: t.donut.returned, value: liberation.totalReturned, fill: LIBERTY, opacity: 1 },
    { key: "outstanding", name: t.donut.outstanding, value: Math.max(0, liberation.totalCapital - liberation.totalReturned), fill: SPONSOR, opacity: 0.45 },
  ];

  const renderLabel = (props: { cx?: number | string; cy?: number | string; outerRadius?: number | string; index?: number }) => {
    if (!wide || props.index === undefined) return null;
    const cx = asNumber(props.cx, 0);
    const cy = asNumber(props.cy, 0);
    const r = asNumber(props.outerRadius, outer.outer);
    const slot = layoutArcLabels(arcs, cx, cy, r)[props.index];
    const arc = arcs[props.index];
    if (!slot || !arc) return null;
    const lineEnd = { x: slot.x + (slot.anchor === "start" ? -6 : 6), y: slot.y };
    return (
      <g data-testid="capital-donut-label" data-arc={arc.id}>
        <polyline points={`${slot.edge.x},${slot.edge.y} ${slot.elbow.x},${slot.elbow.y} ${lineEnd.x},${lineEnd.y}`} fill="none" stroke={MUTED} strokeOpacity={0.6} strokeWidth={1} />
        <text x={slot.x} y={slot.y - 3} textAnchor={slot.anchor} fill={FOREGROUND} fontSize={12}>
          {arc.name}
        </text>
        <text x={slot.x} y={slot.y + 11} textAnchor={slot.anchor} fill={MUTED} fontSize={11} className="tabular">
          {t.donut.arcLabel(moneyCompact(arc.capitalDeployed), pct(arc.share, 1))}
        </text>
      </g>
    );
  };

  return (
    <section
      className="parchment-card min-w-0 overflow-hidden p-4 sm:p-5"
      aria-label={t.donut.aria}
      data-testid="capital-donut"
      data-revealed={inView}
      data-animating={reveal.animate}
      data-total={composition.totalDeployed}
      data-arc-sum={Math.round(arcSum * 100) / 100}
      data-arcs={arcs.length}
      data-kinds={byKind.map((k) => k.kind).join(",")}
      data-largest={largest?.name ?? ""}
      data-largest-share={largest?.share ?? ""}
      data-top-two-share={topTwo?.share ?? ""}
      data-threshold={concentration.thresholdPct}
      data-flagged={concentration.flagged}
      data-returned={liberation.totalReturned}
      data-outside-capital={liberation.totalCapital}
      data-pct-returned={liberation.pctReturned}
    >
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0">
          <h2 className="font-heading text-sm uppercase tracking-[0.2em] text-gold">{t.donut.title}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">{t.donut.subtitle(money(composition.totalDeployed), sourceCount, farmCount)}</p>

          <div ref={ref} className={cn("relative mt-3 w-full [&_.recharts-pie-sector]:cursor-pointer", wide ? "h-[340px]" : "h-[220px]")}>
            {inView && (
              <ResponsiveContainer>
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <ChartTooltip content={<DonutTooltip t={t} />} isAnimationActive={false} wrapperStyle={{ outline: "none", zIndex: 10 }} />
                  <Pie
                    data={byKind}
                    dataKey="capitalDeployed"
                    nameKey="kind"
                    cx="50%"
                    cy="50%"
                    innerRadius={inner.inner}
                    outerRadius={inner.outer}
                    startAngle={START_ANGLE}
                    endAngle={END_ANGLE}
                    stroke={CARD}
                    strokeWidth={2}
                    isAnimationActive={reveal.animate}
                    animationDuration={duration}
                    animationEasing="ease-out"
                  >
                    {byKind.map((k) => (
                      <Cell key={k.kind} fill={KIND_FILL[k.kind]} fillOpacity={0.55} />
                    ))}
                  </Pie>
                  <Pie
                    data={arcs}
                    dataKey="capitalDeployed"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={outer.inner}
                    outerRadius={outer.outer}
                    startAngle={START_ANGLE}
                    endAngle={END_ANGLE}
                    stroke={CARD}
                    strokeWidth={2}
                    label={renderLabel}
                    labelLine={false}
                    isAnimationActive={reveal.animate}
                    animationDuration={duration}
                    animationEasing="ease-out"
                    onAnimationEnd={reveal.settle}
                    onClick={(_, index) => {
                      const arc = arcs[index];
                      if (arc) onSelect(arc.investorId);
                    }}
                  >
                    {arcs.map((a, i) => (
                      <Cell key={a.id} fill={KIND_FILL[a.kind]} fillOpacity={arcOpacity[i]} data-arc={a.id} data-kind={a.kind} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            {inView && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className={cn("font-heading tabular text-foreground", wide ? "text-lg" : "text-sm")}>{moneyCompact(composition.totalDeployed)}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.donut.deployed}</span>
              </div>
            )}
          </div>

          {/* Phones drop the arc labels; this legend carries them instead. */}
          {!wide && (
            <ul className="mt-2 space-y-1 text-xs" data-testid="capital-donut-legend">
              {arcs.map((a, i) => (
                <li key={a.id} className="flex items-center gap-2">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(a.investorId)}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_FILL[a.kind], opacity: arcOpacity[i] }} aria-hidden />
                    <span className="truncate text-foreground">{a.name}</span>
                  </button>
                  <span className="shrink-0 tabular text-muted-foreground">{t.donut.arcLabel(moneyCompact(a.capitalDeployed), pct(a.share, 1))}</span>
                </li>
              ))}
            </ul>
          )}

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-label={t.donut.ringLegend}>
            {byKind.map((k) => (
              <li key={k.kind} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: KIND_FILL[k.kind] }} aria-hidden />
                {t.kind[k.kind]} <span className="tabular">{pct(k.share, 1)}</span>
              </li>
            ))}
          </ul>

          <p
            className={cn("mt-3 flex items-start gap-2 text-sm", concentration.flagged ? "text-stage-reserved" : "text-muted-foreground")}
            data-testid="capital-concentration"
            data-largest-share={largest?.share ?? ""}
            data-top-two-share={topTwo?.share ?? ""}
            data-threshold={concentration.thresholdPct}
            data-flagged={concentration.flagged}
          >
            {concentration.flagged && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            <span>
              <span className={cn(concentration.flagged && "font-medium")}>{concentrationText}</span>
              {largest && <span className="block text-[11px] opacity-80">{concentration.flagged ? t.donut.flagged(thresholdText) : t.donut.underThreshold(thresholdText)}</span>}
            </span>
          </p>
        </div>

        <div className="min-w-0 border-t border-border/50 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" data-testid="capital-recovered">
          <h3 className="font-heading text-sm uppercase tracking-[0.2em] text-liberty">{t.donut.recoveredTitle}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{t.donut.recoveredSubtitle(money(liberation.totalReturned), money(liberation.totalCapital))}</p>
          <div className="relative mx-auto mt-3 h-40 w-40">
            {inView && (
              <ResponsiveContainer>
                <PieChart>
                  <ChartTooltip content={<RecoveredTooltip />} isAnimationActive={false} wrapperStyle={{ outline: "none", zIndex: 10 }} />
                  <Pie
                    data={recovered}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={72}
                    startAngle={START_ANGLE}
                    endAngle={END_ANGLE}
                    stroke={CARD}
                    strokeWidth={2}
                    isAnimationActive={reveal.animate}
                    animationDuration={duration}
                    animationEasing="ease-out"
                  >
                    {recovered.map((r) => (
                      <Cell key={r.key} fill={r.fill} fillOpacity={r.opacity} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            {inView && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-heading text-xl tabular text-liberty" data-testid="capital-recovered-pct">
                  {pct(liberation.pctReturned, 1)}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.donut.recoveredCentre}</span>
              </div>
            )}
          </div>
          <ul className="mt-3 space-y-1 text-xs">
            {recovered.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: r.fill, opacity: r.opacity }} aria-hidden />
                  {r.name}
                </span>
                <span className="tabular text-foreground">{money(r.value)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">{t.donut.outsideOnly}</p>
        </div>
      </div>
    </section>
  );
}
