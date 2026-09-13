export interface PlacementInput {
  /** Pointer position in viewport pixels. */
  x: number;
  y: number;
  /** Measured tooltip box. */
  width: number;
  height: number;
  /** Viewport box (document.documentElement.clientWidth/Height), never window.* read in render. */
  viewportWidth: number;
  viewportHeight: number;
  /** Gap between the pointer and the tooltip's nearest edge. */
  offset?: number;
  /** Minimum distance kept from the viewport edges. */
  margin?: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Which side of the pointer the box landed on, for tests and for an arrow if one is ever wanted. */
  side: { horizontal: "right" | "left"; vertical: "below" | "above" };
}

/**
 * Anchors a tooltip to the pointer: below-right by default, flipped to the other side of the
 * pointer when that would overflow, then clamped inside the viewport as a last resort. Pure so it
 * can be unit-tested; the component reads the viewport in a layout effect and passes it in.
 */
export function placeTooltip({ x, y, width, height, viewportWidth, viewportHeight, offset = 14, margin = 8 }: PlacementInput): Placement {
  const fitsRight = x + offset + width + margin <= viewportWidth;
  const fitsLeft = x - offset - width >= margin;
  const horizontal: Placement["side"]["horizontal"] = fitsRight || !fitsLeft ? "right" : "left";
  let left = horizontal === "right" ? x + offset : x - offset - width;

  const fitsBelow = y + offset + height + margin <= viewportHeight;
  const fitsAbove = y - offset - height >= margin;
  const vertical: Placement["side"]["vertical"] = fitsBelow || !fitsAbove ? "below" : "above";
  let top = vertical === "below" ? y + offset : y - offset - height;

  left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
  top = Math.max(margin, Math.min(top, viewportHeight - height - margin));
  return { left, top, side: { horizontal, vertical } };
}
