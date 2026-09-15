/**
 * /sponsors in Spanish must not leak an English word or an English date. The page's strings live
 * in `src/i18n/sponsors.ts`; the hostages strip reads `src/i18n/realm.ts`. Both tables are
 * exercised here with real fixture data through a server render (no window → the drawer language
 * falls back to the default, Spanish), and the tables themselves are swept for English markers.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import raw from "@/domain/__fixtures__/payments.json";
import type { PaymentsSnapshot } from "@/domain";
import { buildRealm } from "@/domain";
import { ASOF } from "@/domain/__tests__/builders";
import { DEFAULT_QUALITY_LANG } from "@/domain/quality_human";
import { SPONSORS_UI } from "@/i18n/sponsors";
import { REALM_UI } from "@/i18n/realm";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { CapitalDonut } from "./CapitalDonut";
import { LiberationBoard } from "./Liberation";
import { SponsorCard } from "./SponsorCard";

const fixture = raw as unknown as PaymentsSnapshot;
const realm = buildRealm(fixture, ASOF, { deadline: "2027-12-31" });

/** English UI words the old page printed, plus the English date shape ("May 19, 2026"). */
const ENGLISH_MARKERS =
  /\b(Capital deployed|Capital returned|Capital outstanding|Profit share|Fixed interest|Own capital|Interest accrued|Interest paid|Unpaid|Distributions|Nothing paid|Terms|Lots|Farm|Share earned|Accrued|Outstanding|returned|freed|after \d+ days|to go|paid on top|holds|deployed capital|recovered|Returned|Deployed|Click to open)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/;

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

function render(node: Parameters<typeof renderToString>[0]): string {
  return renderToString(createElement(ThemeProvider, null, createElement(MemoryRouter, null, node)));
}

/** Calls every string and string-function in a table with plausible arguments. */
function sweep(table: unknown, out: string[] = []): string[] {
  if (typeof table === "string") out.push(table);
  else if (typeof table === "function") {
    const args = ["$1,000", "$2,000", "50%", "Townson Family", 3, 2, 1] as unknown[];
    out.push(String((table as (...a: unknown[]) => unknown)(...args)));
    out.push(String((table as (...a: unknown[]) => unknown)(1, "$1", "$2", "$3")));
  } else if (table && typeof table === "object") for (const v of Object.values(table as Record<string, unknown>)) sweep(v, out);
  return out;
}

describe("Sponsors page in Spanish", () => {
  it("renders with Spanish as the default language", () => {
    expect(DEFAULT_QUALITY_LANG).toBe("es");
  });

  it("every sponsor card prints Spanish labels, terms and dates", () => {
    const t = SPONSORS_UI.es;
    for (const [i, inv] of realm.investors.filter((x) => x.farms.length > 0).entries()) {
      const html = render(createElement(SponsorCard, { inv, index: i, t }));
      const text = textOf(html);
      expect(text, inv.name).not.toMatch(ENGLISH_MARKERS);
      expect(text).toContain("Capital desplegado");
      expect(text).toContain("Términos");
      // Funding dates go through the Spanish formatter: "21 ago 2025", never "Aug 21, 2025".
      const funded = inv.farms.find((f) => f.fundingDate);
      if (funded) expect(text).toMatch(/\b\d{1,2} [a-z]{3}\.? \d{4}\b/);
    }
  });

  it("the deal badge is translated for every deal type the domain produces", () => {
    for (const inv of realm.investors) expect(SPONSORS_UI.es.deal[inv.dealType], inv.dealType).toBeDefined();
    for (const inv of realm.investors) expect(SPONSORS_UI.en.deal[inv.dealType], inv.dealType).toBeDefined();
  });

  it("the hostages strip and the liberated gallery print Spanish, including the freed date", () => {
    const text = textOf(render(createElement(LiberationBoard, { liberation: realm.liberation })));
    expect(text).not.toMatch(ENGLISH_MARKERS);
    expect(text).toContain("Capital aún afuera");
    expect(text).toContain("devueltos");
    const freed = realm.liberation.freedHostages[0];
    if (freed?.freedAt) {
      expect(text).toContain(`devuelto el ${REALM_UI.es.date(freed.freedAt)}`);
      expect(REALM_UI.es.date(freed.freedAt)).not.toMatch(/^[A-Z][a-z]{2} \d/);
      expect(REALM_UI.en.date(freed.freedAt)).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    }
  });

  it("the donut's legend, kind ring and concentration line print Spanish and the domain's figures", () => {
    const html = render(createElement(CapitalDonut, { composition: realm.capitalComposition, liberation: realm.liberation, onSelect: () => undefined }));
    const text = textOf(html);
    expect(text).not.toMatch(ENGLISH_MARKERS);
    expect(text).toContain("Capital desplegado por sponsor");
    expect(html).toContain(`data-total="${realm.capitalComposition.totalDeployed}"`);
    expect(html).toContain(`data-arc-sum="${realm.capitalComposition.totalDeployed}"`);
    const c = realm.capitalComposition.concentration;
    expect(html).toContain(`data-largest-share="${c.largest?.share}"`);
    expect(html).toContain(`data-top-two-share="${c.topTwo?.share}"`);
    expect(html).toContain(`data-flagged="${c.flagged}"`);
    expect(text).toContain(`${c.largest?.name} tiene el ${c.largest?.share.toFixed(1)}% del capital desplegado`);
  });

  it("the Spanish tables hold no English marker and the English tables no Spanish one", () => {
    const withoutDate = (table: object) => Object.fromEntries(Object.entries(table).filter(([k]) => k !== "date"));
    const esTable = withoutDate(SPONSORS_UI.es);
    const enTable = withoutDate(SPONSORS_UI.en);
    const es = sweep(esTable).join(" | ");
    expect(es).not.toMatch(ENGLISH_MARKERS);
    expect(es).not.toMatch(/\b(the|and|of|with)\b/);
    const en = sweep(enTable).join(" | ");
    // The marker list bites: the English table trips it.
    expect(en).toMatch(ENGLISH_MARKERS);
    expect(en).not.toMatch(/\b(del|de la|los|las|devuelto|pendiente|desplegado)\b/);
  });
});
