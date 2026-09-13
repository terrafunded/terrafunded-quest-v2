import type { ParcelReconciliation } from "@/domain";
import type { GeometryResult } from "@/data/useFarmGeometry";

export type MapMode = "parcels" | "grid" | "loading";

/** Which drawing a farm gets, from the geometry fetch and the ledger reconciliation. */
export function mapModeOf(geometry: GeometryResult, reconciliation: ParcelReconciliation): MapMode {
  if (geometry.status === "loading") return "loading";
  return reconciliation.status === "ok" ? "parcels" : "grid";
}
