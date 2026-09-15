import type { FarmEconomics } from "./farm";
import type { Lot } from "./lot";
import type { QualityIssue } from "./quality";

/**
 * Surveyed parcel geometry as Payments' "Availability map" draws it. It is NOT a Payments table:
 * Payments serves one static file per farm at `/lots/<slug>.json` (slug = farm name lower-cased,
 * accents and non-alphanumerics stripped), traced from the plat or satellite image, with
 * coordinates in that source image's pixel space. Each lot carries the polygon, a label point and
 * an aerial tile (USDA NAIP crop) whose box is in the same coordinate space. Quest reads these
 * files read-only, through a same-origin `/lots/*` rewrite (Payments sends no CORS header).
 */
export interface ParcelTile {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Path on the Payments host, e.g. "/lots/Lamar/LAM-L01.jpg". */
  src: string;
}

export interface ParcelPolygon {
  /** Lot number exactly as Payments prints it on the map (matches properties.lot_number). */
  lot: number;
  code: string;
  acres: number | null;
  points: [number, number][];
  label_point: [number, number];
  tile: ParcelTile | null;
}

export interface FarmGeometry {
  farm: string;
  source: string;
  /** [minX, minY, width, height] in source-image pixels. */
  viewBox: [number, number, number, number];
  /** Outer tract outline as an SVG points string. */
  tract: string;
  lots: ParcelPolygon[];
}

/** Same slug Payments' lotGeometry loader derives from farm_acquisitions.farm_name. */
export function geometrySlug(farmName: string | null | undefined): string | null {
  if (!farmName) return null;
  const s = farmName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return s || null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPoint = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

/** Structural check of a `/lots/<slug>.json` body; null when it is not a usable geometry file. */
export function parseFarmGeometry(raw: unknown): FarmGeometry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const vb = r["viewBox"];
  if (!Array.isArray(vb) || vb.length !== 4 || !vb.every(isNum) || (vb[2] as number) <= 0 || (vb[3] as number) <= 0) return null;
  if (!Array.isArray(r["lots"]) || r["lots"].length === 0) return null;
  const lots: ParcelPolygon[] = [];
  for (const l of r["lots"] as unknown[]) {
    if (!l || typeof l !== "object") return null;
    const o = l as Record<string, unknown>;
    if (!isNum(o["lot"]) || !Array.isArray(o["points"]) || o["points"].length < 3 || !o["points"].every(isPoint) || !isPoint(o["label_point"])) return null;
    const t = o["tile"];
    let tile: ParcelTile | null = null;
    if (t && typeof t === "object") {
      const tt = t as Record<string, unknown>;
      if (isNum(tt["x"]) && isNum(tt["y"]) && isNum(tt["width"]) && isNum(tt["height"]) && typeof tt["src"] === "string" && tt["src"]) {
        tile = { x: tt["x"], y: tt["y"], width: tt["width"], height: tt["height"], src: tt["src"] };
      }
    }
    lots.push({ lot: o["lot"], code: typeof o["code"] === "string" ? o["code"] : `L${o["lot"]}`, acres: isNum(o["acres"]) ? o["acres"] : null, points: o["points"] as [number, number][], label_point: o["label_point"], tile });
  }
  return {
    farm: typeof r["farm"] === "string" ? r["farm"] : "",
    source: typeof r["source"] === "string" ? r["source"] : "",
    viewBox: vb as [number, number, number, number],
    tract: typeof r["tract"] === "string" ? r["tract"] : "",
    lots,
  };
}

export type ParcelReconciliation =
  /** Payments has no geometry file for this farm (HTTP 404): the grid fallback, no finding. */
  | { status: "no_geometry" }
  /** The drawing and the ledger disagree: fallback plus a Data Quality finding. */
  | { status: "mismatch"; polygons: number; lotRows: number; lotsWithoutPolygon: string[]; polygonsWithoutLot: number[]; issue: QualityIssue }
  /** One polygon per Quest lot and vice versa: the real map can be drawn. */
  | { status: "ok"; geometry: FarmGeometry; lotByPolygon: Map<number, Lot> };

/**
 * The assertion the spec demands before any polygon is tinted: the polygon count must equal the
 * lot count Quest computes for the farm, and every Quest lot number must have its polygon (a count
 * match with the wrong numbers would still contradict the ledger). Anything else falls back.
 */
export function reconcileParcels(farm: FarmEconomics, geometry: FarmGeometry | null): ParcelReconciliation {
  if (!geometry) return { status: "no_geometry" };
  const byNumber = new Map<number, Lot>();
  for (const lot of farm.lots) {
    const n = Number(lot.lotNumber);
    if (Number.isFinite(n) && lot.lotNumber !== null && !byNumber.has(n)) byNumber.set(n, lot);
  }
  const polygonNumbers = new Set(geometry.lots.map((l) => l.lot));
  const lotsWithoutPolygon = farm.lots.filter((l) => !polygonNumbers.has(Number(l.lotNumber))).map((l) => l.name);
  const polygonsWithoutLot = geometry.lots.filter((p) => !byNumber.has(p.lot)).map((p) => p.lot);
  const countMatches = geometry.lots.length === farm.lots.length;
  if (countMatches && lotsWithoutPolygon.length === 0 && polygonsWithoutLot.length === 0 && polygonNumbers.size === geometry.lots.length) {
    const lotByPolygon = new Map<number, Lot>();
    for (const p of geometry.lots) lotByPolygon.set(p.lot, byNumber.get(p.lot) as Lot);
    return { status: "ok", geometry, lotByPolygon };
  }
  const issue: QualityIssue = {
    id: `parcel_geometry_mismatch:${farm.farmId}`,
    kind: "parcel_geometry_mismatch",
    severity: "warning",
    farmName: farm.name,
    lotName: null,
    propertyId: null,
    message: `${farm.name}: the Availability map draws ${geometry.lots.length} parcels but Quest has ${farm.lots.length} lots in Payments` + (lotsWithoutPolygon.length ? `; no parcel for ${lotsWithoutPolygon.join(", ")}` : "") + (polygonsWithoutLot.length ? `; parcels ${polygonsWithoutLot.join(", ")} have no lot` : "") + ". Quest shows the grid instead of the map.",
    details: {
      farmId: farm.farmId,
      polygons: geometry.lots.length,
      lotRows: farm.lots.length,
      lotsWithoutPolygon: lotsWithoutPolygon.join(", ") || null,
      polygonsWithoutLot: polygonsWithoutLot.join(", ") || null,
      geometrySource: geometry.source || null,
    },
    since: null,
  };
  return { status: "mismatch", polygons: geometry.lots.length, lotRows: farm.lots.length, lotsWithoutPolygon, polygonsWithoutLot, issue };
}

/** The Data Quality findings from a set of reconciliations, in farm order. */
export function parcelGeometryIssues(reconciliations: Iterable<ParcelReconciliation>): QualityIssue[] {
  const out: QualityIssue[] = [];
  for (const r of reconciliations) if (r.status === "mismatch") out.push(r.issue);
  return out;
}
