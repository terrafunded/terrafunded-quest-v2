import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildRealm } from "../realm";
import { isSold } from "../lot";
import { computeProfitLayers, lotProfitLayer } from "../profitLayers";
import { ASOF, farm, fileCase, investor, note, noteSale, property, snapshot } from "./builders";
import type { PaymentsSnapshot } from "../types";

const fixture = JSON.parse(
  readFileSync(new URL("../__fixtures__/payments.json", import.meta.url), "utf8"),
) as PaymentsSnapshot;

describe("profit layers", () => {
  it("the three figures sum from the same lots the goal already books", () => {
    const realm = buildRealm(fixture, new Date("2026-09-11T00:00:00Z"), { deadline: "2027-12-31" });
    const layers = realm.profitLayers;
    expect(layers.netProfitAtClosing).toBe(realm.goal.netProfitToDate);
    expect(layers.netCashRealized).toBe(
      computeProfitLayers(realm.lots, realm.oracleDefaults.noteSalePct / 100).netCashRealized,
    );
    const fromLots = realm.lots.map(lotProfitLayer).filter((l) => l !== null);
    expect(fromLots.reduce((s, l) => s + l.netProfitAtClosing, 0)).toBeCloseTo(layers.netProfitAtClosing, 2);
    expect(fromLots.reduce((s, l) => s + l.netCashRealized, 0)).toBeCloseTo(layers.netCashRealized, 2);
    expect(fromLots.reduce((s, l) => s + l.notesHeldFace, 0)).toBeCloseTo(layers.notesHeldFace, 2);
    expect(layers.notesHeldFace).toBeCloseTo(2_367_153.36, 2);
    expect(layers.noteSaleRatio).toBeCloseTo(0.8021, 4);
  });

  it("a lot whose note is sold contributes its sale proceeds to cash and zero to notes held", () => {
    const alpha = farm({ farm_name: "Alpha", total_lots: 2, investor_capital: 200_000 });
    const p1 = property(alpha.id, 1);
    const p2 = property(alpha.id, 2);
    const kevin = investor({ name: "Kevin" });
    const n1 = note(p1.id, {
      original_amount: 120_000,
      down_payment: 20_000,
      financed_amount: 100_000,
      start_date: "2026-03-01",
      is_sold: true,
    });
    const n2 = note(p2.id, {
      original_amount: 120_000,
      down_payment: 20_000,
      financed_amount: 100_000,
      start_date: "2026-03-15",
      is_sold: false,
    });
    const snap = snapshot({
      farmAcquisitions: [alpha],
      properties: [p1, p2],
      fileCases: [
        fileCase(p1.id, { status: "completed", deal_type: "financed", sale_price: 120_000, down_payment: 20_000, closing_date: "2026-03-01" }),
        fileCase(p2.id, { status: "completed", deal_type: "financed", sale_price: 120_000, down_payment: 20_000, closing_date: "2026-03-15" }),
      ],
      notes: [n1, n2],
      noteSales: [noteSale(n1.id, { sale_price: 80_200, sale_date: "2026-06-01" })],
      investors: [kevin],
    });
    const realm = buildRealm(snap, ASOF, { deadline: "2027-12-31" });
    const sold = realm.lots.find((l) => l.propertyId === p1.id);
    const held = realm.lots.find((l) => l.propertyId === p2.id);
    expect(sold?.stage).toBe("note_sold");
    expect(held?.stage).toBe("closed");
    const soldLayer = lotProfitLayer(sold!);
    const heldLayer = lotProfitLayer(held!);
    expect(soldLayer?.noteSaleProceeds).toBe(80_200);
    expect(soldLayer?.notesHeldFace).toBe(0);
    expect(soldLayer?.cashAtClosing).toBe(20_000);
    expect(heldLayer?.noteSaleProceeds).toBe(0);
    expect(heldLayer?.notesHeldFace).toBe(100_000);
    expect(realm.profitLayers.noteSaleProceeds).toBe(80_200);
    expect(realm.profitLayers.notesHeldFace).toBe(100_000);
    expect(realm.profitLayers.notesHeldCount).toBe(1);
  });

  it("sale-price residual equals the per-lot leftover after cash at closing, notes held and notes sold", () => {
    const realm = buildRealm(fixture, new Date("2026-09-11T00:00:00Z"), { deadline: "2027-12-31" });
    const layers = realm.profitLayers;
    const leftover = layers.lots.reduce(
      (s, l) => s + (l.salePrice - l.cashAtClosing - l.notesHeldFace - l.noteSaleProceeds),
      0,
    );
    expect(layers.salePriceResidual).toBeCloseTo(leftover, 2);
    expect(layers.cashAtClosing + layers.notesHeldFace + layers.noteSaleProceeds + layers.salePriceResidual).toBeCloseTo(
      layers.salePriceSoldLots,
      2,
    );
    expect(realm.lots.filter(isSold).every((l) => lotProfitLayer(l) !== null)).toBe(true);
  });
});
