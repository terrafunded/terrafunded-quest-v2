import { useQueries } from "@tanstack/react-query";
import { geometrySlug, parseFarmGeometry, type FarmGeometry } from "@/domain";

/**
 * Where the Availability map's static files come from. The geometry JSON is fetched same-origin
 * (`/lots/<slug>.json`) and rewritten to Payments by vercel.json in production and by the Vite
 * dev/preview proxy locally, because Payments sends no CORS header. The aerial tiles are plain
 * images and load cross-origin directly from Payments without CORS, so they keep the absolute
 * host and never travel through Quest's edge.
 */
export const PAYMENTS_STATIC_ORIGIN = "https://payments.terrafunded.com";
export const GEOMETRY_PATH = "/lots";

export function tileUrl(src: string): string {
  return src.startsWith("http") ? src : `${PAYMENTS_STATIC_ORIGIN}${src}`;
}

export type GeometryResult = { status: "loading" } | { status: "missing" } | { status: "error"; error: Error } | { status: "ready"; geometry: FarmGeometry };

/** 404 → null (no map for this farm). Malformed → throws. Never caches a body it cannot parse. */
export async function fetchFarmGeometry(slug: string, fetchImpl: typeof fetch = fetch): Promise<FarmGeometry | null> {
  const r = await fetchImpl(`${GEOMETRY_PATH}/${slug}.json`, { headers: { Accept: "application/json" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${GEOMETRY_PATH}/${slug}.json`);
  const text = await r.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // The SPA rewrite answers unknown paths with index.html; treat that as "no geometry", not an error.
    if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) return null;
    throw new Error(`Invalid JSON for ${GEOMETRY_PATH}/${slug}.json`);
  }
  const geometry = parseFarmGeometry(raw);
  if (!geometry) throw new Error(`Malformed geometry for ${GEOMETRY_PATH}/${slug}.json`);
  return geometry;
}

export const GEOMETRY_QUERY_KEY = ["payments", "geometry"] as const;

/** One cached query per farm name; results in the same order as `farmNames`. */
export function useFarmGeometries(farmNames: readonly string[]): GeometryResult[] {
  return useQueries({
    queries: farmNames.map((name) => {
      const slug = geometrySlug(name);
      return {
        queryKey: [...GEOMETRY_QUERY_KEY, slug ?? "none"],
        enabled: slug !== null,
        staleTime: Infinity,
        gcTime: 60 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
        queryFn: () => fetchFarmGeometry(slug as string),
      };
    }),
    combine: (results) =>
      results.map<GeometryResult>((q, i) => {
        if (geometrySlug(farmNames[i]) === null) return { status: "missing" };
        if (q.isError) return { status: "error", error: q.error as Error };
        if (q.isPending) return { status: "loading" };
        return q.data ? { status: "ready", geometry: q.data } : { status: "missing" };
      }),
  });
}
