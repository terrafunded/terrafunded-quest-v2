import type { Debt } from "./debt";
import type { FarmEconomics } from "./farm";
import type { GoalStatus } from "./goal";
import type { Liberation } from "./liberation";
import type { Oxygen } from "./oxygen";
import { proseMoney } from "./narrative";
import type { QualityLang } from "./quality_human";

/**
 * CINEMATIC INTRO (Phase 2 §8) — the real story in a handful of title cards, every number from
 * the realm. Pure so the same lines can be tested and reused.
 */
export interface StoryCard {
  id: string;
  kicker: string;
  line: string;
}

export interface Story {
  cards: StoryCard[];
  /** Data needed to say something at all. */
  hasData: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function buildStory(
  goal: GoalStatus,
  farms: FarmEconomics[],
  debt: Debt,
  oxygen: Oxygen,
  liberation: Liberation,
  lang: QualityLang = "en",
): Story {
  const counties = new Set(farms.map((f) => f.county).filter((c): c is string => !!c));
  const totalLots = farms.reduce((s, f) => s + f.totalLots, 0);
  const sponsorCount = liberation.sponsors.length;
  const firstFunding = farms.map((x) => x.fundingDate ?? x.closingDate).filter((d): d is string => !!d).sort()[0];
  const firstYear = firstFunding ? firstFunding.slice(0, 4) : null;
  const es = lang === "es";

  const cards: StoryCard[] = [];
  if (farms.length === 0) return { cards, hasData: false };

  cards.push({
    id: "lands",
    kicker: firstYear ? (es ? `Desde ${firstYear}` : `Since ${firstYear}`) : es ? "Fincas" : "Farms",
    line: es
      ? `${plural(farms.length, "finca")} en ${plural(counties.size, "condado")}, cortadas en ${plural(totalLots, "lote")}.`
      : `${plural(farms.length, "farm")} across ${plural(counties.size, "county", "counties")}, cut into ${plural(totalLots, "lot")}.`,
  });
  cards.push({
    id: "gold",
    kicker: es ? "Capital de sponsors" : "Sponsor capital",
    line: es
      ? `${proseMoney(liberation.totalCapital, lang)} prestados por ${plural(sponsorCount, "sponsor")}. ${proseMoney(debt.capitalOwed, lang)} aún adeudados.`
      : `${proseMoney(liberation.totalCapital)} lent by ${plural(sponsorCount, "sponsor")}. ${proseMoney(debt.capitalOwed)} still owed.`,
  });
  cards.push({
    id: "claimed",
    kicker: es ? "Cerrado" : "Closed",
    line: es
      ? `${plural(goal.closedLots, "lote")} cerrados por ${proseMoney(goal.netProfitToDate, lang)} de utilidad neta — ${goal.pctComplete.toFixed(1)}% de los diez millones.`
      : `${plural(goal.closedLots, "lot")} closed for ${proseMoney(goal.netProfitToDate)} of net profit — ${goal.pctComplete.toFixed(1)}% of the ten million.`,
  });
  if (oxygen.totalDaysGained !== 0) {
    cards.push({
      id: "oxygen",
      kicker: es ? "Ritmo" : "Pace",
      line: es
        ? `Cada cierre compró tiempo. ${plural(Math.abs(oxygen.totalDaysGained), "día")} ${oxygen.totalDaysGained > 0 ? "ganados" : "perdidos"} hacia la salida.`
        : `Every closing bought time. ${plural(Math.abs(oxygen.totalDaysGained), "day")} ${oxygen.totalDaysGained > 0 ? "gained" : "lost"} toward the exit.`,
    });
  }
  if (liberation.freedHostages.length > 0) {
    const h = liberation.freedHostages[0];
    cards.push({
      id: "freed",
      kicker: es ? "Capital devuelto" : "Capital returned",
      line: es
        ? `${liberation.freedHostages.length === 1 && h ? `${h.investorName} recibió el capital de vuelta de ${h.farmName}` : `${plural(liberation.freedHostages.length, "posición de sponsor")} reembolsada${liberation.freedHostages.length === 1 ? "" : "s"} por completo`}. ${plural(liberation.captiveHostages.length, "queda", "quedan")} con capital aún afuera.`
        : `${liberation.freedHostages.length === 1 && h ? `${h.investorName} received their capital back for ${h.farmName}` : `${plural(liberation.freedHostages.length, "sponsor position")} repaid in full`}. ${plural(liberation.captiveHostages.length, "remains", "remain")} with capital still out.`,
    });
  }
  cards.push({
    id: "debt",
    kicker: es ? "Capital adeudado" : "Capital owed",
    line:
      debt.requiredNetProfitPerDay !== null
        ? es
          ? `${plural(debt.daysLeft, "día")} restantes. ${proseMoney(debt.requiredNetProfitPerDay, lang)} de utilidad neta necesarios cada día.`
          : `${plural(debt.daysLeft, "day")} left. ${proseMoney(debt.requiredNetProfitPerDay)} of net profit needed every single day.`
        : es
          ? `La fecha límite ya pasó. Aún faltaban ${proseMoney(debt.remainingNetProfit, lang)}.`
          : `The deadline has passed. ${proseMoney(debt.remainingNetProfit)} was still missing.`,
  });

  return { cards, hasData: true };
}
