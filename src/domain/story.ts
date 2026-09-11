import type { Debt } from "./debt";
import type { FarmEconomics } from "./farm";
import type { GoalStatus } from "./goal";
import type { Liberation } from "./liberation";
import type { Oxygen } from "./oxygen";
import { proseMoney } from "./narrative";

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

export function buildStory(goal: GoalStatus, farms: FarmEconomics[], debt: Debt, oxygen: Oxygen, liberation: Liberation): Story {
  const counties = new Set(farms.map((f) => f.county).filter((c): c is string => !!c));
  const totalLots = farms.reduce((s, f) => s + f.totalLots, 0);
  const sponsorCount = liberation.sponsors.length;
  const firstFunding = farms.map((x) => x.fundingDate ?? x.closingDate).filter((d): d is string => !!d).sort()[0];
  const firstYear = firstFunding ? firstFunding.slice(0, 4) : null;

  const cards: StoryCard[] = [];
  if (farms.length === 0) return { cards, hasData: false };

  cards.push({
    id: "lands",
    kicker: firstYear ? `Since ${firstYear}` : "The realm",
    line: `${plural(farms.length, "farm")} across ${plural(counties.size, "county", "counties")}, cut into ${plural(totalLots, "lot")}.`,
  });
  cards.push({
    id: "gold",
    kicker: "Sponsor gold",
    line: `${proseMoney(liberation.totalCapital)} lent by ${plural(sponsorCount, "sponsor")}. ${proseMoney(debt.capitalOwed)} still owed.`,
  });
  cards.push({
    id: "claimed",
    kicker: "Claimed",
    line: `${plural(goal.closedLots, "lot")} closed for ${proseMoney(goal.netProfitToDate)} of net profit — ${goal.pctComplete.toFixed(1)}% of the ten million.`,
  });
  if (oxygen.totalDaysGained !== 0) {
    cards.push({
      id: "oxygen",
      kicker: "Oxygen",
      line: `Every closing bought time. ${plural(Math.abs(oxygen.totalDaysGained), "day")} ${oxygen.totalDaysGained > 0 ? "gained" : "lost"} toward the exit.`,
    });
  }
  if (liberation.freedHostages.length > 0) {
    const h = liberation.freedHostages[0];
    cards.push({
      id: "freed",
      kicker: "Liberated",
      line: `${liberation.freedHostages.length === 1 && h ? `${h.investorName} walked free of ${h.farmName}` : `${plural(liberation.freedHostages.length, "sponsor position")} repaid in full`}. ${plural(liberation.captiveHostages.length, "remains", "remain")} in chains.`,
    });
  }
  cards.push({
    id: "debt",
    kicker: "The Debt",
    line:
      debt.requiredNetProfitPerDay !== null
        ? `${plural(debt.daysLeft, "day")} left. ${proseMoney(debt.requiredNetProfitPerDay)} of net profit needed every single day.`
        : `The deadline has passed. ${proseMoney(debt.remainingNetProfit)} was still missing.`,
  });

  return { cards, hasData: true };
}
