import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import type { FarmEconomics, Pipeline } from "@/domain";
import { STAGE_LABEL } from "@/lib/format";
import { HOVER_STROKE, RING_STROKE, STAGE_FILL, ringFor, territoryFill } from "./realmTokens";

const TILE = 26;
const GAP = 6;
const PAD = 18;
const RADIUS = 14;
const MIN_PLATE_COLS = 4;
const MIN_PLATE_ROWS = 3;

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0.1 } } };
const tileReveal = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } };

/** Rows × columns for a lot count, roughly landscape so the plate sits well in the 4:3 box. */
function gridShape(n: number): { cols: number; rows: number } {
  const count = Math.max(n, 1);
  const cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.4)));
  return { cols, rows: Math.ceil(count / cols) };
}

/**
 * The schematic for farms without a usable survey drawing: a numbered plat on survey paper rather
 * than loose tiles, so it reads as a deliberate drawing next to the real maps. Same tokens, same
 * rings, same lot numbers, same hit-area rule as the parcel map (stable invisible rects that also
 * cover the gutters, so the tooltip never drops between two lots). Fitted with `meet` into the
 * shared 4:3 box on the farm's ground colour.
 */
export function FarmGridMap({ farm, pipeline, hoveredLotId, inView, onSelect }: { farm: FarmEconomics; pipeline: Pipeline | undefined; hoveredLotId: string | null; inView: boolean; onSelect: () => void }) {
  const uid = useId().replace(/:/g, "");
  const layout = useMemo(() => {
    const lots = [...farm.lots].sort((a, b) => Number(a.lotNumber ?? 0) - Number(b.lotNumber ?? 0));
    const { cols, rows } = gridShape(lots.length);
    // The plate never shrinks below 4 × 3 tiles, so a five-lot farm is not drawn with tiles three times the size of a twelve-lot one.
    const plateCols = Math.max(cols, MIN_PLATE_COLS);
    const plateRows = Math.max(rows, MIN_PLATE_ROWS);
    const w = plateCols * (TILE + GAP) - GAP + PAD * 2;
    const h = plateRows * (TILE + GAP) - GAP + PAD * 2;
    const offsetX = ((plateCols - cols) * (TILE + GAP)) / 2;
    const offsetY = ((plateRows - rows) * (TILE + GAP)) / 2;
    const tiles = lots.map((lot, i) => ({ lot, x: PAD + offsetX + (i % cols) * (TILE + GAP), y: PAD + offsetY + Math.floor(i / cols) * (TILE + GAP) }));
    return { w, h, tiles, originX: PAD + offsetX - GAP / 2, originY: PAD + offsetY - GAP / 2 };
  }, [farm.lots]);

  const hovered = hoveredLotId ? layout.tiles.find((t) => t.lot.propertyId === hoveredLotId) : undefined;

  return (
    <svg viewBox={`0 0 ${layout.w} ${layout.h}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full" role="img" aria-label={`${farm.name}: schematic lot grid, ${farm.lots.length} lots`} data-testid="farm-grid-map">
      <defs>
        <pattern id={`${uid}-paper`} width={TILE + GAP} height={TILE + GAP} patternUnits="userSpaceOnUse" x={layout.originX} y={layout.originY}>
          <path d={`M ${TILE + GAP} 0 L 0 0 0 ${TILE + GAP}`} fill="none" stroke="hsl(var(--gold) / 0.14)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
        <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={0} y={0} width={layout.w} height={layout.h} rx={RADIUS} fill={territoryFill(farm.pctClosed)} stroke="hsl(var(--gold) / 0.35)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <rect x={0} y={0} width={layout.w} height={layout.h} rx={RADIUS} fill={`url(#${uid}-paper)`} className="pointer-events-none" />

      <motion.g variants={stagger} initial="hidden" animate={inView ? "show" : "hidden"}>
        {layout.tiles.map(({ lot, x, y }) => {
          const ring = ringFor(lot, pipeline);
          return (
            <motion.g key={lot.propertyId} variants={tileReveal}>
              <rect
                x={x}
                y={y}
                width={TILE}
                height={TILE}
                rx={4}
                fill={STAGE_FILL[lot.stage]}
                fillOpacity={lot.stage === "available" ? 0.45 : ring ? 0.2 : 0.95}
                stroke={ring ? RING_STROKE[ring] : undefined}
                strokeWidth={ring ? 2.5 : undefined}
                strokeDasharray={ring === "stuck" ? "4 3" : undefined}
                vectorEffect="non-scaling-stroke"
                filter={lot.stage === "note_sold" ? `url(#${uid}-glow)` : undefined}
                className="pointer-events-none transition-[fill-opacity] duration-150"
                data-testid="lot-tile"
                data-lot-number={lot.lotNumber ?? undefined}
                data-stage={lot.stage}
                data-ring={ring ?? undefined}
                data-hovered={hoveredLotId === lot.propertyId || undefined}
                aria-label={`${lot.name}: ${STAGE_LABEL[lot.stage]}${ring === "stuck" ? ", stuck reservation" : ""}`}
              />
              {lot.lotNumber !== null && (
                <text x={x + TILE / 2} y={y + TILE / 2 + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} className="pointer-events-none select-none tabular" style={{ fill: "hsl(var(--foreground))", paintOrder: "stroke", stroke: "hsl(var(--background) / 0.75)", strokeWidth: 2.4, strokeLinejoin: "round" }} data-testid="lot-number">
                  {lot.lotNumber}
                </text>
              )}
            </motion.g>
          );
        })}
      </motion.g>

      {hovered && <rect x={hovered.x} y={hovered.y} width={TILE} height={TILE} rx={4} fill="none" stroke={HOVER_STROKE} strokeWidth={2.5} vectorEffect="non-scaling-stroke" className="pointer-events-none" data-testid="lot-hover-outline" />}

      {/* Hit areas last, covering half the gutter on every side, so the pointer is always on a lot inside the plate. */}
      {layout.tiles.map(({ lot, x, y }) => (
        <rect
          key={`hit-${lot.propertyId}`}
          x={x - GAP / 2}
          y={y - GAP / 2}
          width={TILE + GAP}
          height={TILE + GAP}
          fill="transparent"
          className="cursor-pointer"
          data-lot-id={lot.propertyId}
          data-lot-hit
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        />
      ))}
    </svg>
  );
}
