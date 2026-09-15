import { useCallback, useState } from "react";

/** The skin's tokens as recharts wants them (plain CSS strings). */
export const EMBER = "hsl(var(--ember))";
export const GREEN = "hsl(var(--stage-closed))";
export const GOLD = "hsl(var(--gold))";
export const OXYGEN = "hsl(var(--oxygen))";
export const LIBERTY = "hsl(var(--liberty))";
export const SPONSOR = "hsl(var(--sponsor))";
export const STEEL = "hsl(var(--steel))";
export const CARD = "hsl(var(--card))";
export const BACKGROUND = "hsl(var(--background))";
export const FOREGROUND = "hsl(var(--foreground))";
export const MUTED = "hsl(var(--muted-foreground))";
export const BORDER = "hsl(var(--border))";
export const POPOVER = "hsl(var(--popover))";

/** Semantic data series — the only colors a chart series may use. */
export const DATA_PROFIT_INVENTORY = "hsl(var(--data-profit-inventory))";
export const DATA_PROFIT_RECYCLED = "hsl(var(--data-profit-recycled))";
export const DATA_PROFIT_FRESH = "hsl(var(--data-profit-fresh))";
export const DATA_OWED = "hsl(var(--data-owed))";
export const DATA_INTEREST = "hsl(var(--data-interest))";
export const DATA_RAISE = "hsl(var(--data-raise))";
export const DATA_INVENTORY = "hsl(var(--data-inventory))";
export const DATA_GOAL = "hsl(var(--data-goal))";
export const DATA_AXIS = "hsl(var(--data-axis))";
export const DATA_STATUS_FAR = "hsl(var(--data-status-far))";
export const DATA_STATUS_NEAR = "hsl(var(--data-status-near))";
export const DATA_STATUS_HIT = "hsl(var(--data-status-hit))";
export const DATA_CAT = [
  "hsl(var(--data-cat-1))",
  "hsl(var(--data-cat-2))",
  "hsl(var(--data-cat-3))",
  "hsl(var(--data-cat-4))",
  "hsl(var(--data-cat-5))",
  "hsl(var(--data-cat-6))",
] as const;

export const AREA_FILL_OPACITY = 0.28;
export const GRID_STROKE_OPACITY = 0.35;
export const SERIES_STROKE_WIDTH = 2;

/**
 * Hover cursor: recharts' default is an opaque #ccc rectangle over the hovered band, which reads
 * as a white slab on the dark skins. A 6% wash of the skin's own foreground marks the band on
 * all three (light on Iron Crown / Neon Kingdom, dark on Gilded Realm's parchment).
 */
export const CURSOR = { fill: FOREGROUND, opacity: 0.06 };

/** Tooltip container classes and inline colours shared by every realm chart. */
export const TOOLTIP_CLASS = "rounded-md border px-3 py-2 text-xs shadow-md";
export const TOOLTIP_STYLE = { background: POPOVER, borderColor: BORDER } as const;

/** Handed to a chart so its series grow on first reveal and then stay put. */
export interface ChartReveal {
  /** `isAnimationActive` for every series: true only during the first reveal. */
  animate: boolean;
  /** Wire to `onAnimationEnd` of the last-starting series to end the reveal. */
  settle: () => void;
}

/**
 * Once the reveal ends, series animation is switched off so a new exit horizon or language
 * re-renders the chart in place; without this, recharts replays the grow on every `data`
 * identity change.
 */
export function useChartReveal(reducedMotion: boolean): ChartReveal {
  const [settled, setSettled] = useState(false);
  const settle = useCallback(() => setSettled(true), []);
  return { animate: !reducedMotion && !settled, settle };
}
