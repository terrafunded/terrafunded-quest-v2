import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { oxygenPace, type Oxygen } from "@/domain";
import { REALM_UI } from "@/i18n/realm";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { OxygenScore } from "./OxygenScore";

function makeOxygen(over: Partial<Oxygen>): Oxygen {
  const lot = {
    propertyId: "p1",
    lotName: "Lamar Lot 6",
    farmName: "Lamar",
    closeDate: "2025-10-10",
    measuredOn: "2025-10-10",
    netProfit: 120_000,
    daysGained: 91,
    paceThatDay: 1318.68,
    projectedBefore: "2028-01-01",
    projectedAfter: "2027-10-02",
  };
  return {
    totalDaysGained: 533,
    perLot: new Map([[lot.propertyId, lot]]),
    ranked: [lot],
    netProfitPerDayAtPace: 9145.63,
    best: lot,
    latest: lot,
    trailingDaysGained: 53,
    trailingWindowDays: 90,
    provisionalDaysGained: 340,
    provisional: new Map(),
    provisionalRanked: [],
    conversionPct: 75,
    ...over,
  };
}

// Server render: no window, so useLang falls back to the default language (Spanish) and the
// counters print their first frame. The verdict copy is derived from props, so it is complete.
function render(oxygen: Oxygen): string {
  return renderToString(createElement(ThemeProvider, null, createElement(MemoryRouter, null, createElement(OxygenScore, { oxygen }))));
}

const textOf = (html: string, testId: string): string => {
  const m = new RegExp(`data-testid="${testId}"[^>]*>([\\s\\S]*?)</`).exec(html);
  return (m?.[1] ?? "").replace(/<!--.*?-->/g, "").replace(/&#x27;/g, "'");
};

describe("OxygenScore scoreboard", () => {
  it("losing ground: 53 gained in the last 90 reads as the exit date moving away by 37 every 90", () => {
    const html = render(makeOxygen({ trailingDaysGained: 53, trailingWindowDays: 90 }));
    expect(html).toContain('data-testid="oxygen" data-band="behind"');
    expect(html).toContain("días ganados en los últimos 90");
    expect(textOf(html, "oxygen-verdict")).toBe("90 días transcurridos − 53 ganados: a este ritmo la fecha de salida se aleja 37 días cada 90");
    expect(html).toMatch(/data-testid="oxygen-verdict" data-diff="37"/);
    expect(html).toMatch(/class="[^"]*text-ember" data-testid="oxygen-trailing"/);
    expect(html).toMatch(/class="[^"]*text-ember" data-testid="oxygen-verdict"/);
    // The cumulative total is demoted to a labelled line and keeps its test hook and value.
    expect(html).toMatch(/data-testid="oxygen-score" data-value="533" data-target="533">533</);
    expect(textOf(html, "oxygen-cumulative")).toContain("Días ganados acumulados");
    // Provisional days stay beside the headline and are not summed into either figure.
    expect(html).toMatch(/data-testid="oxygen-provisional" data-value="340"/);
  });

  it("gaining ground: 104 gained in the last 90 reads as the exit date coming 14 days closer", () => {
    const html = render(makeOxygen({ trailingDaysGained: 104, trailingWindowDays: 90 }));
    expect(html).toContain('data-testid="oxygen" data-band="ahead"');
    expect(textOf(html, "oxygen-verdict")).toBe("104 ganados − 90 días transcurridos: a este ritmo la fecha de salida se acerca 14 días cada 90");
    expect(html).toMatch(/class="[^"]*text-oxygen" data-testid="oxygen-trailing"/);
    expect(html).not.toContain("text-ember");
  });

  it("holding: exactly the window gained reads as the exit date standing still", () => {
    const html = render(makeOxygen({ trailingDaysGained: 90, trailingWindowDays: 90 }));
    expect(html).toContain('data-testid="oxygen" data-band="even"');
    expect(textOf(html, "oxygen-verdict")).toBe("90 ganados en 90 días transcurridos: a este ritmo la fecha de salida no se mueve");
  });

  it("the deepest-breath tooltip explains that a slower realm paid more days per dollar", () => {
    const html = render(makeOxygen({}));
    expect(html).toContain("el mismo dólar compraba más días cuando la utilidad neta diaria era más baja");
  });
});

describe("oxygen verdict copy in English", () => {
  const t = REALM_UI.en.oxygen;
  const say = (gained: number, windowDays: number) => {
    const p = oxygenPace({ trailingDaysGained: gained, trailingWindowDays: windowDays });
    return t.verdict[p.band](gained, windowDays, p.diff);
  };

  it("states the arithmetic and the direction", () => {
    expect(say(53, 90)).toBe("90 days passed − 53 gained: at this pace the exit date moves away by 37 days every 90");
    expect(say(104, 90)).toBe("104 gained − 90 days passed: at this pace the exit date comes 14 days closer every 90");
    expect(say(90, 90)).toBe("90 gained in 90 days passed: at this pace the exit date holds still");
  });

  it("singular day when the difference is one", () => {
    expect(say(89, 90)).toContain("moves away by 1 day every 90");
    expect(say(91, 90)).toContain("comes 1 day closer every 90");
    expect(REALM_UI.es.oxygen.verdict.behind(89, 90, 1)).toContain("se aleja 1 día cada 90");
  });

  it("the topbar pill reads gained/window and carries the verdict", () => {
    expect(t.pill(53, 90)).toBe("53/90d");
    expect(t.pillTitle(53, 90, say(53, 90))).toBe("Pace — 53 days gained in the last 90. 90 days passed − 53 gained: at this pace the exit date moves away by 37 days every 90");
  });
});
