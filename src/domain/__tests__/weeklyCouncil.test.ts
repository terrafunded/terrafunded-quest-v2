import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { computeCouncil } from "../council";
import { computeStageBottleneck } from "../pipeline";
import { buildWeeklyFacts, collectAllowedNumbers, validateWeeklyRead } from "../weeklyCouncil";
import { money } from "../../lib/format";

const fixture = raw as unknown as PaymentsSnapshot;
const realm = buildRealm(fixture, new Date("2026-09-11T00:00:00Z"));
const insights = computeCouncil(realm, "en");
const facts = buildWeeklyFacts(realm, insights, { horizon: 2027, lang: "en", now: new Date("2026-09-13T00:00:00Z") });

function validRead(over: Partial<{ headline: string; why: string; worth: string; extra: string }> = {}) {
  const remaining = facts.summary.remaining;
  const stuck = facts.summary.stuckCount;
  return JSON.stringify({
    week_of: facts.week_of,
    headline: over.headline ?? `Close the stuck reservations; ${remaining} remains.`,
    actions: [
      { action: "Call every stuck buyer.", why: over.why ?? `${stuck} reservations are stuck.`, worth: over.worth ?? facts.summary.trappedProfit },
      { action: "Keep the closings moving.", why: `Producing ${facts.summary.producingPerDay} a day.`, worth: facts.summary.daysLeft },
      { action: "Do not raise a farm this week.", why: `${facts.summary.lotsAvailable} lots are available.`, worth: facts.summary.lotsStillNeeded },
    ],
    watch_out: over.extra ?? `The ${facts.horizon} horizon is ${facts.summary.deadline}.`,
  });
}

describe("computeCouncil", () => {
  it("emits every rule, each figure a formatted string, never NaN", () => {
    expect(insights.map((i) => i.rule)).toEqual(["pace", "stuck", "stage_bottleneck", "inventory", "concentration", "losing_ground", "conversion", "recycle", "quality"]);
    for (const i of insights) {
      expect(i.title.length).toBeGreaterThan(4);
      expect(i.body.length).toBeGreaterThan(8);
      expect(JSON.stringify(i)).not.toMatch(/NaN/);
    }
  });

  it("the concentration figure is the largest outside sponsor over total deployed, recomputed from the investor rows", () => {
    const conc = insights.find((i) => i.rule === "concentration");
    expect(conc).toBeDefined();
    const outside = realm.investors.filter((i) => i.dealType !== "own_capital" && i.capitalDeployed > 0);
    const total = realm.investors.reduce((a, i) => a + i.capitalDeployed, 0);
    const largest = [...outside].sort((a, b) => b.capitalDeployed - a.capitalDeployed)[0];
    expect(largest).toBeDefined();
    const share = ((largest!.capitalDeployed / total) * 100).toFixed(1) + "%";
    expect(conc!.figures.largestShare).toBe(share);
    expect(conc!.figures.largestName).toBe(largest!.name);
  });

  it("stage bottleneck insight quotes the same trapped sale value as computeStageBottleneck", () => {
    const stages = computeStageBottleneck(realm.lots, new Date("2026-09-11T00:00:00Z"));
    const insight = insights.find((i) => i.rule === "stage_bottleneck");
    expect(stages[0]).toBeDefined();
    expect(insight).toBeDefined();
    expect(insight!.figures.salePrice).toBe(money(stages[0]!.salePrice));
    expect(insight!.impact.dollars).toBe(money(stages[0]!.salePrice));
    expect(insight!.figures.count).toBe(String(stages[0]!.count));
  });

  it("Spanish insights contain no English marker strings", () => {
    const es = computeCouncil(realm, "es");
    const blob = es.map((i) => `${i.title} ${i.body}`).join("\n");
    expect(blob).not.toMatch(/\b(the pace|stuck reservations|no recent closings|Data Quality|horizon asks)\b/i);
  });
});

describe("buildWeeklyFacts", () => {
  it("every summary field is pre-formatted and the last 6 months are the last 6 of history", () => {
    expect(facts.week).toMatch(/^\d{4}-W\d{2}$/);
    expect(facts.summary.netProfitToDate).toMatch(/^\$/);
    expect(facts.summary.thisWeekDays).toBe("7");
    expect(facts.historyLast6).toHaveLength(Math.min(6, realm.history.length));
    expect(facts.historyLast6.map((h) => h.month)).toEqual(realm.history.slice(-6).map((h) => h.month));
    expect(facts.insights).toHaveLength(9);
    expect(JSON.stringify(facts)).not.toMatch(/NaN/);
  });
});

describe("validateWeeklyRead", () => {
  it("accepts a well-shaped reply that only cites numbers from the facts", () => {
    const v = validateWeeklyRead(validRead(), facts);
    expect(v.ok).toBe(true);
    expect(v.read?.actions).toHaveLength(3);
  });

  it("rejects a number that is not in the payload", () => {
    const v = validateWeeklyRead(validRead({ why: "This is worth $99,999,999." }), facts);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("untraceable_number");
    expect(v.untraceable?.some((t) => t.includes("99,999,999") || t.includes("99999999"))).toBe(true);
  });

  it("rejects malformed JSON and a reply that is not the required shape", () => {
    expect(validateWeeklyRead("not json", facts).reason).toBe("malformed_json");
    expect(validateWeeklyRead('{"headline":"x"}', facts).reason).toBe("bad_shape");
    expect(validateWeeklyRead(JSON.stringify({ week_of: "x", headline: "h", actions: [{ action: "a", why: "w", worth: "1" }], watch_out: "w" }), facts).reason).toBe("bad_shape");
  });

  it("accepts formatting variants of a payload number ($1,234 vs 1234)", () => {
    const allowed = collectAllowedNumbers(facts);
    const remainingRaw = realm.goal.remaining;
    expect(allowed.values.some((n) => Math.abs(n - remainingRaw) < 1)).toBe(true);
    const v = validateWeeklyRead(validRead({ worth: String(Math.round(remainingRaw)) }), facts);
    expect(v.ok).toBe(true);
  });
});
