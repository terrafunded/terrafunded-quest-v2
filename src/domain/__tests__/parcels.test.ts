import { describe, expect, it } from "vitest";
import type { FarmEconomics } from "../farm";
import type { Lot } from "../lot";
import { geometrySlug, parcelGeometryIssues, parseFarmGeometry, reconcileParcels, type FarmGeometry } from "../parcels";
import { humanizeIssue, QUALITY_LANGS } from "../quality_human";

const lot = (n: number | null, farmName = "Lamar"): Lot => ({ propertyId: `p${n ?? "x"}`, lotNumber: n === null ? null : String(n), name: `${farmName} — Lot ${n ?? "?"}`, stage: "available" }) as unknown as Lot;
const farmOf = (lots: Lot[], name = "Lamar"): FarmEconomics => ({ farmId: "f1", name, lots, totalLots: lots.length, lotRows: lots.length }) as unknown as FarmEconomics;

const square = (i: number): [number, number][] => [
  [i * 10, 0],
  [i * 10 + 10, 0],
  [i * 10 + 10, 10],
  [i * 10, 10],
];
const geometryOf = (numbers: number[]): FarmGeometry => ({
  farm: "Lamar",
  source: "test plat",
  viewBox: [0, 0, 100, 10],
  tract: "0,0 100,0 100,10 0,10",
  lots: numbers.map((n, i) => ({ lot: n, code: `LAM-L0${n}`, acres: null, points: square(i), label_point: [i * 10 + 5, 5], tile: { x: i * 10, y: 0, width: 10, height: 10, src: `/lots/Lamar/LAM-L0${n}.jpg` } })),
});

describe("geometrySlug mirrors Payments' loader", () => {
  it("lower-cases, strips accents and non-alphanumerics", () => {
    expect(geometrySlug("Promised Valley")).toBe("promisedvalley");
    expect(geometrySlug("Red River 1")).toBe("redriver1");
    expect(geometrySlug("Fincá Ñu")).toBe("fincanu");
    expect(geometrySlug("")).toBeNull();
    expect(geometrySlug(null)).toBeNull();
  });
});

describe("parseFarmGeometry", () => {
  it("accepts the Payments shape and keeps lot numbers, polygons, label points and tiles", () => {
    const g = parseFarmGeometry(JSON.parse(JSON.stringify(geometryOf([1, 2]))));
    expect(g?.lots.map((l) => l.lot)).toEqual([1, 2]);
    expect(g?.lots[0]?.tile?.src).toBe("/lots/Lamar/LAM-L01.jpg");
    expect(g?.viewBox).toEqual([0, 0, 100, 10]);
  });

  it("rejects bodies without a 4-number viewBox or without lots", () => {
    expect(parseFarmGeometry({ viewBox: [0, 0, 10], lots: [] })).toBeNull();
    expect(parseFarmGeometry({ viewBox: [0, 0, 10, 10], lots: [] })).toBeNull();
    expect(parseFarmGeometry({ viewBox: [0, 0, 10, 10], lots: [{ lot: 1, points: [[0, 0]], label_point: [0, 0] }] })).toBeNull();
    expect(parseFarmGeometry("<!doctype html>")).toBeNull();
  });
});

describe("reconcileParcels: the polygon count must equal Quest's lot count and every lot must have its parcel", () => {
  it("ok when one polygon per lot and the numbers agree, in any order", () => {
    const r = reconcileParcels(farmOf([lot(3), lot(1), lot(2)]), geometryOf([1, 2, 3]));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.lotByPolygon.get(2)?.name).toBe("Lamar — Lot 2");
    expect([...r.lotByPolygon.keys()]).toEqual([1, 2, 3]);
  });

  it("no_geometry when Payments has no file (grid fallback, no finding)", () => {
    expect(reconcileParcels(farmOf([lot(1)]), null)).toEqual({ status: "no_geometry" });
    expect(parcelGeometryIssues([reconcileParcels(farmOf([lot(1)]), null)])).toEqual([]);
  });

  it("mismatch when the map draws more parcels than the ledger has lots (Olney: 13 parcels, 1 lot)", () => {
    const r = reconcileParcels(farmOf([lot(1)], "Olney"), { ...geometryOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), farm: "Olney" });
    expect(r.status).toBe("mismatch");
    if (r.status !== "mismatch") return;
    expect(r.polygons).toBe(13);
    expect(r.lotRows).toBe(1);
    expect(r.lotsWithoutPolygon).toEqual([]);
    expect(r.polygonsWithoutLot).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(r.issue.kind).toBe("parcel_geometry_mismatch");
    expect(r.issue.severity).toBe("warning");
    expect(r.issue.farmName).toBe("Olney");
    expect(r.issue.lotName).toBeNull();
    expect(r.issue.details).toMatchObject({ polygons: 13, lotRows: 1, polygonsWithoutLot: "2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13", lotsWithoutPolygon: null });
  });

  it("mismatch when the ledger has a lot the map does not draw (Eastland: 11 lots, 10 parcels)", () => {
    const lots = Array.from({ length: 11 }, (_, i) => lot(i + 1, "Eastland"));
    const r = reconcileParcels(farmOf(lots, "Eastland"), geometryOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(r.status).toBe("mismatch");
    if (r.status !== "mismatch") return;
    expect(r.lotsWithoutPolygon).toEqual(["Eastland — Lot 11"]);
    expect(r.polygonsWithoutLot).toEqual([]);
  });

  it("mismatch when counts agree but the numbers do not — a count match alone never tints the wrong lot", () => {
    const r = reconcileParcels(farmOf([lot(1), lot(2), lot(4)]), geometryOf([1, 2, 3]));
    expect(r.status).toBe("mismatch");
    if (r.status !== "mismatch") return;
    expect(r.lotsWithoutPolygon).toEqual(["Lamar — Lot 4"]);
    expect(r.polygonsWithoutLot).toEqual([3]);
  });

  it("a lot without a number can never match a parcel", () => {
    const r = reconcileParcels(farmOf([lot(1), lot(null)]), geometryOf([1, 2]));
    expect(r.status).toBe("mismatch");
  });

  it("the finding reads in plain language in both languages, with the two counts side by side", () => {
    const r = reconcileParcels(farmOf([lot(1)], "Olney"), geometryOf([1, 2]));
    if (r.status !== "mismatch") throw new Error("expected mismatch");
    for (const lang of QUALITY_LANGS) {
      const h = humanizeIssue(r.issue, lang);
      expect(h.title.length).toBeGreaterThan(8);
      expect(h.explanation).toMatch(/[.!]$/);
      expect(h.explanation).toContain("Olney");
      expect(h.fix).toMatch(/^Properties → Olney → /);
      expect(h.using).toMatch(/^Quest /);
      expect(h.values).toEqual({ left: { label: lang === "es" ? "Mapa" : "Map", value: lang === "es" ? "2 parcelas" : "2 parcels" }, right: { label: lang === "es" ? "Libro" : "Ledger", value: lang === "es" ? "1 lotes" : "1 lots" } });
      for (const text of [h.title, h.explanation, h.check, h.using, h.fix]) expect(text).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
    }
  });
});
