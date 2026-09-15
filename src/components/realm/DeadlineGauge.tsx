import { useMemo } from "react";
import { deviationAtDeadline, type GoalStatus } from "@/domain";
import { eraMonthLabel } from "@/domain/era";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { money, moneyCompact, number } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRealmStrings } from "@/i18n/realm";

/**
 * THE GAUGE — one sentence under the Curve: where today's pace lands against the deadline in
 * lots, dollars and days. `deviationAtDeadline` reads `computeGoal` and Oxygen's net profit per
 * day; the days equal the Curve marker's months × 30.44, so the two never disagree.
 */
export function DeadlineGauge({ goal, netProfitPerDayAtPace }: { goal: GoalStatus; netProfitPerDayAtPace: number | null }) {
  const t = useRealmStrings().gauge;
  const [ref, inView] = useInViewOnce<HTMLElement>();
  const dev = useMemo(() => deviationAtDeadline(goal, netProfitPerDayAtPace), [goal, netProfitPerDayAtPace]);
  const year = Number(goal.deadline.slice(0, 4));
  const pace = number(goal.closedLotsPerMonth);

  let sentence: string;
  if (dev.met) sentence = t.met;
  else if (dev.noHistory || dev.lots === null || dev.dollars === null || dev.side === null) sentence = t.noHistory;
  else if (dev.days === null) sentence = t.noPace(pace, year, number(Math.abs(dev.lots)), moneyCompact(Math.abs(dev.dollars)));
  else sentence = t.sentence(pace, year, number(Math.abs(dev.lots)), moneyCompact(Math.abs(dev.dollars)), number(Math.abs(dev.days)), dev.side);

  const tone = dev.met || dev.side === "ahead" ? "text-oxygen" : dev.side === "behind" ? "text-ember" : "text-foreground";

  return (
    <section
      ref={ref}
      className={cn("parchment-card border-l-4 px-4 py-3 sm:px-5", dev.side === "behind" && !dev.met ? "border-l-ember/70" : dev.side === "ahead" || dev.met ? "border-l-oxygen/70" : "border-l-border")}
      aria-label={t.aria}
      data-testid="deadline-gauge"
      data-revealed={inView}
      data-side={dev.met ? "met" : (dev.side ?? "")}
      data-lots={dev.lots ?? ""}
      data-dollars={dev.dollars ?? ""}
      data-days={dev.days ?? ""}
      title={dev.lots === null ? undefined : t.title(number(dev.lots), money(dev.dollars), dev.days === null ? null : number(dev.days))}
    >
      <p
        className={cn("font-heading text-lg leading-snug transition-opacity duration-700 sm:text-2xl", tone, inView ? "opacity-100" : "opacity-0")}
        data-testid="deadline-gauge-sentence"
      >
        {sentence}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{t.hint(goal.recentSince ? eraMonthLabel(goal.recentSince) : null)}</p>
    </section>
  );
}
