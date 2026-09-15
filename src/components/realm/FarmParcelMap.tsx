import { useEffect, useId, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { motion } from "framer-motion";
import type { FarmEconomics, FarmGeometry, Lot, Pipeline } from "@/domain";
import { tileUrl } from "@/data/useFarmGeometry";
import { useRealmMapStrings } from "@/i18n/realmMap";
import { stageLabel } from "@/lib/format";
import { BACKGROUND, FOREGROUND } from "./chartTokens";
import { HOVER_STROKE, MAP_BOX_ASPECT, MAP_PLATE_STROKE, RING_STROKE, STAGE_FILL, ringFor, territoryFill } from "./realmTokens";

/** Lot-number label target size in CSS pixels; converted to viewBox units per farm. */
const LABEL_PX = 11;
const LABEL_MIN_PX = 7;

/** How much of the tile shows through each Quest state. Available stays mostly aerial: nothing has happened there yet. */
const TINT_OPACITY: Record<Lot["stage"], number> = { available: 0.14, reserved: 0.3, closed: 0.58, note_sold: 0.62 };
/** Without an aerial tile the tint is all there is, so it is stronger. */
const FLAT_OPACITY: Record<Lot["stage"], number> = { available: 0.45, reserved: 0.3, closed: 0.92, note_sold: 0.95 };

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.1 } } };
const parcelReveal = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.45 } } };

function pointsAttr(points: [number, number][]): string {
  return points.map((p) => p.join(",")).join(" ");
}

function bbox(points: [number, number][]): { w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { w: maxX - minX, h: maxY - minY };
}

/** Rendered width of an element, via ResizeObserver; 0 until measured (and always 0 without a DOM). */
function useMeasuredWidth<T extends Element>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * The real parcel map: Payments' surveyed polygons over the USDA aerial tiles it serves, each lot
 * tinted by its Quest state with the theme's stage tokens. Coordinates stay in the geometry file's
 * pixel space (its viewBox); the map is fitted into the shared 4:3 box with `meet`, so a portrait
 * plat sits centred on the farm's ground colour. Strokes are non-scaling so a 32-lot plat and a
 * 6-lot plat get the same 1.5px survey lines. The polygons are the pointer targets and never
 * change geometry on hover — the highlight is a stroke drawn on top — so the tooltip that follows
 * the page-level mousemove cannot flicker.
 */
export function FarmParcelMap({
  farm,
  geometry,
  lotByPolygon,
  pipeline,
  hoveredLotId,
  inView,
  onSelect,
}: {
  farm: FarmEconomics;
  geometry: FarmGeometry;
  lotByPolygon: Map<number, Lot>;
  pipeline: Pipeline | undefined;
  hoveredLotId: string | null;
  /** Imagery only loads once the card has been seen; the polygons animate in from the same signal. */
  inView: boolean;
  onSelect: () => void;
}) {
  const uid = useId().replace(/:/g, "");
  const t = useRealmMapStrings();
  const [svgRef, widthPx] = useMeasuredWidth<SVGSVGElement>();
  const [failedTiles, setFailedTiles] = useState<ReadonlySet<string>>(() => new Set());
  const [loadedTiles, setLoadedTiles] = useState<ReadonlySet<string>>(() => new Set());
  const [vx, vy, vw, vh] = geometry.viewBox;

  // Pixels per viewBox unit after `meet` fitting into the 4:3 box; a sane default before measuring.
  const boxW = widthPx || 420;
  const boxH = boxW / MAP_BOX_ASPECT;
  const pxPerUnit = Math.min(boxW / vw, boxH / vh);

  const parcels = useMemo(
    () =>
      geometry.lots.map((p) => {
        const lot = lotByPolygon.get(p.lot) as Lot;
        const { w, h } = bbox(p.points);
        const fitPx = Math.min(w, h) * pxPerUnit * 0.42;
        const labelPx = Math.max(LABEL_MIN_PX, Math.min(LABEL_PX, fitPx));
        return { p, lot, labelUnits: labelPx / pxPerUnit, showLabel: fitPx >= LABEL_MIN_PX * 0.8 };
      }),
    [geometry, lotByPolygon, pxPerUnit],
  );

  const hovered = hoveredLotId ? parcels.find((x) => x.lot.propertyId === hoveredLotId) : undefined;
  const markTile = (set: Dispatch<SetStateAction<ReadonlySet<string>>>, code: string) =>
    set((prev) => {
      if (prev.has(code)) return prev;
      const next = new Set(prev);
      next.add(code);
      return next;
    });

  return (
    <svg
      ref={svgRef}
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label={`${farm.name}: surveyed parcel map, ${geometry.lots.length} lots`}
      data-testid="farm-parcel-map"
      data-polygons={geometry.lots.length}
    >
      <defs>
        {parcels.map(({ p }) => (
          <clipPath key={p.code} id={`${uid}-clip-${p.code}`}>
            <polygon points={pointsAttr(p.points)} />
          </clipPath>
        ))}
        <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={3 / pxPerUnit} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* The tract — roads and everything between parcels — in the farm's ground colour, gold as it sells out. */}
      {geometry.tract && <polygon points={geometry.tract} fill={territoryFill(farm.pctClosed)} stroke={MAP_PLATE_STROKE} strokeOpacity={0.35} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}

      <motion.g variants={stagger} initial="hidden" animate={inView ? "show" : "hidden"}>
        {parcels.map(({ p, lot, labelUnits, showLabel }) => {
          const ring = ringFor(lot, pipeline);
          const hasTile = inView && p.tile && !failedTiles.has(p.code);
          const opacity = (hasTile ? TINT_OPACITY : FLAT_OPACITY)[lot.stage];
          const points = pointsAttr(p.points);
          return (
            <motion.g key={p.code} variants={parcelReveal}>
              {hasTile && p.tile && (
                <image
                  href={tileUrl(p.tile.src)}
                  x={p.tile.x}
                  y={p.tile.y}
                  width={p.tile.width}
                  height={p.tile.height}
                  preserveAspectRatio="none"
                  clipPath={`url(#${uid}-clip-${p.code})`}
                  className="pointer-events-none transition-opacity duration-500"
                  // Aerial imagery is dimmed and desaturated so the stage tints, not the crops, carry the colour.
                  style={{ filter: "saturate(0.55) brightness(0.72) contrast(1.05)", opacity: loadedTiles.has(p.code) ? 1 : 0 }}
                  onLoad={() => markTile(setLoadedTiles, p.code)}
                  onError={() => markTile(setFailedTiles, p.code)}
                />
              )}
              <polygon
                points={points}
                fill={STAGE_FILL[lot.stage]}
                fillOpacity={opacity}
                stroke={ring ? RING_STROKE[ring] : "hsl(var(--background) / 0.85)"}
                strokeWidth={ring ? 2.5 : 1.2}
                strokeDasharray={ring === "stuck" ? "5 3" : undefined}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                filter={lot.stage === "note_sold" ? `url(#${uid}-glow)` : undefined}
                className="cursor-pointer transition-[fill-opacity] duration-150"
                data-testid="lot-tile"
                data-lot-id={lot.propertyId}
                data-lot-number={p.lot}
                data-stage={lot.stage}
                data-ring={ring ?? undefined}
                data-hovered={hoveredLotId === lot.propertyId || undefined}
                aria-label={t.lotAria(lot.name, stageLabel(lot.stage), ring === "stuck")}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                }}
              />
              {showLabel && (
                <text
                  x={p.label_point[0]}
                  y={p.label_point[1]}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={labelUnits}
                  fontWeight={700}
                  className="pointer-events-none select-none tabular"
                  style={{ fill: FOREGROUND, paintOrder: "stroke", stroke: BACKGROUND, strokeOpacity: 0.9, strokeWidth: labelUnits * 0.28, strokeLinejoin: "round" }}
                  data-testid="lot-number"
                >
                  {p.lot}
                </text>
              )}
            </motion.g>
          );
        })}
      </motion.g>

      {/* Hover: a stroke on top of everything; the hovered polygon itself never moves. */}
      {hovered && <polygon points={pointsAttr(hovered.p.points)} fill={STAGE_FILL[hovered.lot.stage]} fillOpacity={0.18} stroke={HOVER_STROKE} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="pointer-events-none" data-testid="lot-hover-outline" />}
    </svg>
  );
}
