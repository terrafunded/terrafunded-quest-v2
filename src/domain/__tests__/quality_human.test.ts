import { describe, expect, it } from "vitest";
import { computeQualityIssues, type QualityIssue, type QualityKind } from "../quality";
import {
  groupIssuesByLot,
  humanDate,
  humanMoney,
  humanizeIssue,
  paymentsLotName,
  QUALITY_LANGS,
  reviewKeyOf,
  summarizeQuality,
  valuesLine,
  whatsappForAll,
  whatsappForCard,
} from "../quality_human";
import { client, farm, fileCase, note, noteSale, property } from "./builders";

const ALL_KINDS: QualityKind[] = [
  "price_mismatch",
  "down_payment_mismatch",
  "reservation_after_note_start",
  "farm_capital_null",
  "sold_note_without_sale",
  "sale_without_sold_flag",
  "note_without_file_case",
  "multiple_notes_on_lot",
  "completed_without_closing_date",
  "active_file_case_with_note",
  "test_client_on_real_case",
  "legacy_farm_with_lots",
  "lot_count_mismatch",
  "note_before_farm_purchase",
  "cash_deal_missing_down_payment",
];

/** One synthetic realm that trips every issue kind at least once. */
function everyKind(): QualityIssue[] {
  // Lamar: subdivided, says 3 lots but has 2 rows; bought 2026-01-10.
  const lamar = farm({ farm_name: "Lamar", total_lots: 3, closing_date: "2026-01-10", funding_date: "2026-01-10", investor_capital: 475_000 });
  const l5 = property(lamar.id, 5, { name: "Lamar — Lot 5" });
  const l6 = property(lamar.id, 6, { name: "Lamar — Lot 6" });
  // Lot 5: active file case disagreeing with a sold note that has no sale and started before the farm was bought.
  const fc5 = fileCase(l5.id, { status: "active", sale_price: 118_506.75, down_payment: 5_000, reservation_date: "2026-09-07", project_name: "Lamar" });
  const n5 = note(l5.id, { note_code: "LAM-L05", original_amount: 113_507, down_payment: 4_000, start_date: "2025-11-05", is_sold: true });
  // Lot 6: no file case, two notes, one with a sale but not flagged sold.
  const n6a = note(l6.id, { note_code: "LAM-L06", start_date: "2026-03-01", is_sold: false });
  const n6b = note(l6.id, { note_code: "LAM-L06-B", start_date: "2026-04-01", is_sold: false });
  const s6 = noteSale(n6a.id, { sale_date: "2026-05-20" });
  // Ben White: no investor capital on file.
  const ben = farm({ farm_name: "Ben White", total_lots: 1, investor_capital: null, closing_date: "2024-07-30", funding_date: "2024-07-30" });
  // Red River 1: legacy one-off with two lots.
  const red = farm({ farm_name: "Red River 1", total_lots: 2, closing_date: "2026-09-02", funding_date: "2026-09-02" });
  const r1 = property(red.id, 1, { name: "Red River 1" });
  // Eastland: completed cash deal without closing date or down payment; a real case with a ghost buyer.
  const east = farm({ farm_name: "Eastland", total_lots: 2, closing_date: "2025-08-01", funding_date: "2025-08-01" });
  const e2 = property(east.id, 2, { name: "Eastland — Lot 2" });
  const e3 = property(east.id, 3, { name: "Eastland — Lot 3" });
  const fc2 = fileCase(e2.id, { status: "completed", closing_date: null, deal_type: "cash", down_payment: null, sale_price: 100_000, reservation_date: "2026-05-15", project_name: "Eastland" });
  const fc3 = fileCase(e3.id, { status: "completed", closing_date: "2026-01-11", client_id: "ghost-client", sale_price: 125_515, reservation_date: "2025-12-01", project_name: "Eastland" });
  return computeQualityIssues({
    farms: [lamar, ben, red, east],
    properties: [l5, l6, r1, e2, e3],
    fileCases: [fc5, fc2, fc3],
    notes: [n5, n6a, n6b],
    noteSales: [s6],
    clients: [client()],
  });
}

const SNAKE = /\b[a-z]+_[a-z_]+\b/;
const COLUMN_WORDS = /file_cases|\bnotes\.\w|note_sales|investor_capital|total_lots|is_sold|closing_date|reservation_date|original_amount|sale_price|property_costs|\bNULL\b/;

describe("quality_human: every issue kind reads in plain language, in Spanish and English", () => {
  const issues = everyKind();

  it("the synthetic realm trips every kind", () => {
    const kinds = new Set(issues.map((i) => i.kind));
    for (const k of ALL_KINDS) expect(kinds.has(k), k).toBe(true);
    expect(kinds.size).toBe(ALL_KINDS.length);
  });

  for (const lang of QUALITY_LANGS) {
    for (const kind of ALL_KINDS) {
      it(`${kind} (${lang}) has a title, one-sentence explanation, what to check, a Payments fix and what Quest uses`, () => {
        const issue = issues.find((i) => i.kind === kind);
        expect(issue).toBeDefined();
        const h = humanizeIssue(issue as QualityIssue, lang);
        expect(h.title.length).toBeGreaterThan(8);
        expect(h.explanation).toMatch(/[.!]$/);
        expect(h.explanation.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¿¡])/).length).toBe(1);
        expect(h.check.length).toBeGreaterThan(8);
        expect(h.fix).toMatch(/^(File Cases|Notes|Note Sales|Farm Acquisitions|Properties|Clients) → /);
        expect(h.fix).toContain("→");
        expect(h.using).toMatch(/^Quest /);
        for (const text of [h.title, h.explanation, h.check, h.using, h.fix]) {
          expect(text, `no column names in "${text}"`).not.toMatch(COLUMN_WORDS);
          expect(text, `no snake_case in "${text}"`).not.toMatch(SNAKE);
        }
        expect(h.technical.message).toBe((issue as QualityIssue).message);
        expect(h.reviewKey).toContain(kind);
      });
    }
  }

  it("Spanish and English differ for every kind", () => {
    for (const issue of issues) {
      const es = humanizeIssue(issue, "es");
      const en = humanizeIssue(issue, "en");
      expect(es.title).not.toBe(en.title);
      expect(es.explanation).not.toBe(en.explanation);
    }
  });

  it("price mismatch: the two values side by side, the Payments screens and fields, and which one Quest uses", () => {
    const issue = issues.find((i) => i.kind === "price_mismatch") as QualityIssue;
    const es = humanizeIssue(issue, "es");
    expect(es.title).toBe("Precio distinto entre expediente y nota");
    expect(valuesLine(es.values)).toBe("Expediente: $118,506.75 / Nota: $113,507.00");
    expect(es.fix).toBe("File Cases → Lamar Lot 5 → Sale price, o Notes → LAM-L05 → Original amount (deja el mismo valor en ambos)");
    expect(es.using).toBe("Quest usa la nota ($113,507.00) para la ganancia de este lote.");
    expect(es.since).toBe("2026-09-07");
    const en = humanizeIssue(issue, "en");
    expect(valuesLine(en.values)).toBe("File case: $118,506.75 / Note: $113,507.00");
    expect(en.fix).toContain("Notes → LAM-L05 → Original amount");
    expect(en.using).toContain("uses the note");
  });

  it("down payment, dates and farm-level kinds carry their own pairs of values", () => {
    const by = (k: QualityKind) => humanizeIssue(issues.find((i) => i.kind === k) as QualityIssue, "es");
    expect(valuesLine(by("down_payment_mismatch").values)).toBe("Expediente: $5,000.00 / Nota: $4,000.00");
    expect(valuesLine(by("reservation_after_note_start").values)).toBe("Reserva: 7 sep 2026 / Inicio de la nota: 5 nov 2025");
    expect(valuesLine(by("note_before_farm_purchase").values)).toBe("Inicio de la nota: 5 nov 2025 / Compra de la finca: 10 ene 2026");
    expect(valuesLine(by("lot_count_mismatch").values)).toBe("Finca: 3 lotes / Propiedades: 2 registradas");
    expect(valuesLine(by("cash_deal_missing_down_payment").values)).toBe("Precio: $100,000.00 / Enganche: sin dato");
    expect(by("farm_capital_null").values).toBeNull();
    expect(by("farm_capital_null").fix).toBe("Farm Acquisitions → Ben White → Investor capital");
    expect(by("legacy_farm_with_lots").fix).toContain("Farm Acquisitions → Red River 1 → Total lots");
    expect(by("test_client_on_real_case").fix).toBe("File Cases → Eastland Lot 3 → Client: elegir al comprador real (o Clients → crear al comprador)");
    expect(by("multiple_notes_on_lot").explanation).toContain("LAM-L06, LAM-L06-B");
    expect(by("sale_without_sold_flag").fix).toBe("Notes → LAM-L06 → Sold: marcar");
  });

  it("review keys are lot + kind, plus the note code only for kinds that repeat per note", () => {
    const price = issues.find((i) => i.kind === "price_mismatch") as QualityIssue;
    expect(reviewKeyOf(price)).toBe("Lamar — Lot 5::price_mismatch");
    const before = issues.find((i) => i.kind === "note_before_farm_purchase") as QualityIssue;
    expect(reviewKeyOf(before)).toBe("Lamar — Lot 5::note_before_farm_purchase::LAM-L05");
    const capital = issues.find((i) => i.kind === "farm_capital_null") as QualityIssue;
    expect(reviewKeyOf(capital)).toBe("farm:Ben White::farm_capital_null");
  });

  it("formats lot names the way Payments lists them, money to the cent and dates per language", () => {
    expect(paymentsLotName("Lamar — Lot 5", "Lamar")).toBe("Lamar Lot 5");
    expect(paymentsLotName("  0000 Hwy 79 S, Olney, TX 76374 - Young County,", "Olney")).toBe("0000 Hwy 79 S, Olney, TX 76374 - Young County,");
    expect(paymentsLotName(null, "Ben White")).toBe("Ben White");
    expect(humanMoney(118_506.75)).toBe("$118,506.75");
    expect(humanMoney(null, "es")).toBe("sin dato");
    expect(humanMoney(null, "en")).toBe("no value");
    expect(humanDate("2026-09-07", "es")).toBe("7 sep 2026");
    expect(humanDate("2026-09-07", "en")).toBe("Sep 7, 2026");
    expect(humanDate(null, "es")).toBe("sin fecha");
  });
});

describe("quality_human: cards, summary and the WhatsApp message", () => {
  const issues = everyKind();
  const cards = groupIssuesByLot(issues, "es");

  it("groups one card per lot (and per farm), sorted by severity then farm, with every issue inside", () => {
    const titles = cards.map((c) => `${c.severity}:${c.isFarm ? "farm" : "lot"}:${c.title}`);
    expect(titles[0]).toBe("error:farm:Lamar"); // lot_count_mismatch is an error on the farm
    expect(titles[1]).toBe("error:lot:Lamar — Lot 5");
    const lot5 = cards.find((c) => c.title === "Lamar — Lot 5") as (typeof cards)[number];
    expect(lot5.issues.map((i) => i.kind)).toEqual(["price_mismatch", "down_payment_mismatch", "sold_note_without_sale", "reservation_after_note_start", "note_before_farm_purchase", "active_file_case_with_note"]);
    expect(lot5.issues.map((i) => i.severity)).toEqual(["error", "error", "error", "error", "warning", "warning"]);
    const lot6 = cards.find((c) => c.title === "Lamar — Lot 6") as (typeof cards)[number];
    expect(lot6.severity).toBe("warning");
    // Lot 6's notes start after the farm purchase, so no note_before_farm_purchase here.
    expect(lot6.issues.map((i) => i.kind).sort()).toEqual(["multiple_notes_on_lot", "note_without_file_case", "note_without_file_case", "sale_without_sold_flag"].sort());
    // Every issue lands in exactly one card.
    expect(cards.reduce((a, c) => a + c.issues.length, 0)).toBe(issues.length);
    // Cards of the same severity are ordered by farm, then lot.
    const warnings = cards.filter((c) => c.severity === "warning").map((c) => c.farmName ?? c.title);
    expect(warnings).toEqual([...warnings].sort((a, b) => a.localeCompare(b)));
  });

  it("summary: lots with issues, dollars of profit moved by price mismatches, and the oldest unreviewed issue", () => {
    const s = summarizeQuality(cards, "2026-09-11");
    // Lamar 5, Lamar 6, Eastland 2, Eastland 3 — the Red River 1 property has no lot-level issue.
    expect(s.lotsWithIssues).toBe(4);
    expect(s.farmsWithIssues).toBe(3);
    expect(s.issues).toBe(issues.length);
    expect(s.priceMismatchDollars).toBe(4_999.75);
    expect(s.priceMismatches).toBe(1);
    expect(s.oldest?.card.title).toBe("Ben White");
    expect(s.oldest?.since).toBe("2024-07-30");
    expect(s.oldest?.days).toBe(773);
    expect(s.unresolved).toBe(issues.length);
  });

  it("summary skips reviewed issues when looking for the oldest one", () => {
    const ben = cards.find((c) => c.title === "Ben White") as (typeof cards)[number];
    const reviewed = new Set(ben.issues.map((i) => i.reviewKey));
    const s = summarizeQuality(cards, "2026-09-11", reviewed);
    expect(s.oldest?.card.title).not.toBe("Ben White");
    // Earliest remaining `since`: Lamar Lot 5's sold note (LAM-L05 started 2025-11-05).
    expect(s.oldest?.since).toBe("2025-11-05");
    expect(s.oldest?.card.title).toBe("Lamar — Lot 5");
    expect(s.unresolved).toBe(issues.length - 1);
  });

  it("WhatsApp text for a card is Spanish plain text: lot, each problem, the two values and the fix", () => {
    const lot5 = cards.find((c) => c.title === "Lamar — Lot 5") as (typeof cards)[number];
    const text = whatsappForCard(lot5);
    const lines = text.split("\n");
    expect(lines[0]).toBe("*Lamar — Lot 5* (finca Lamar) — 6 problemas");
    expect(lines[1]).toBe("1) Precio distinto entre expediente y nota");
    expect(lines[2]).toBe("   Expediente: $118,506.75 / Nota: $113,507.00 — Quest usa la nota ($113,507.00) para la ganancia de este lote.");
    expect(lines[3]).toBe("   Corregir en Payments: File Cases → Lamar Lot 5 → Sale price, o Notes → LAM-L05 → Original amount (deja el mismo valor en ambos)");
    expect(text).toContain("2) Enganche distinto entre expediente y nota");
    expect(text).toContain("Expediente: $5,000.00 / Nota: $4,000.00");
    expect(text).toContain("Reserva: 7 sep 2026 / Inicio de la nota: 5 nov 2025");
    expect(text).not.toMatch(COLUMN_WORDS);
    expect(text).not.toMatch(/<[a-z]+>/); // no markup
  });

  it("WhatsApp text for a card stays Spanish even when the page is in English, and can leave reviewed issues out", () => {
    const enCards = groupIssuesByLot(issues, "en");
    const lot5 = enCards.find((c) => c.title === "Lamar — Lot 5") as (typeof enCards)[number];
    expect(lot5.issues[0]?.title).toBe("Sale price differs between file case and note");
    const text = whatsappForCard(lot5);
    expect(text).toContain("Precio distinto entre expediente y nota");
    expect(text).not.toContain("Sale price differs");
    const reviewed = new Set([lot5.issues[0]?.reviewKey ?? ""]);
    const trimmed = whatsappForCard(lot5, { reviewed, includeReviewed: false });
    expect(trimmed).toContain("— 5 problemas");
    expect(trimmed).not.toContain("Precio distinto");
  });

  it("WhatsApp text for the whole list opens with the date and the summary, then every card", () => {
    const s = summarizeQuality(cards, "2026-09-11");
    const text = whatsappForAll(cards, s, "2026-09-11");
    const lines = text.split("\n");
    expect(lines[0]).toBe("*Calidad de datos — 11 sep 2026*");
    expect(lines[1]).toBe("4 lotes con problemas y 3 fincas · $4,999.75 de ganancia afectada por diferencias de precio");
    expect(lines[2]).toBe("");
    for (const c of cards) expect(text).toContain(`*${c.title}*`);
    expect(text.split("Corregir en Payments:").length - 1).toBe(issues.length);
  });

  it("farm cards say 'finca' without repeating the farm name", () => {
    const ben = cards.find((c) => c.title === "Ben White") as (typeof cards)[number];
    expect(whatsappForCard(ben).split("\n")[0]).toBe("*Ben White* (finca) — 1 problema");
  });
});
