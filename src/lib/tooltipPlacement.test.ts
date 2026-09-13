import { describe, expect, it } from "vitest";
import { placeTooltip } from "./tooltipPlacement";

const box = { width: 256, height: 220, viewportWidth: 1280, viewportHeight: 800 };

describe("placeTooltip", () => {
  it("sits below-right of the pointer when there is room", () => {
    const p = placeTooltip({ x: 100, y: 100, ...box });
    expect(p).toEqual({ left: 114, top: 114, side: { horizontal: "right", vertical: "below" } });
  });

  it("flips to the left of the pointer near the right edge instead of clamping over it", () => {
    const p = placeTooltip({ x: 1200, y: 100, ...box });
    expect(p.side.horizontal).toBe("left");
    expect(p.left).toBe(1200 - 14 - 256);
    expect(p.left + 256).toBeLessThanOrEqual(1280 - 8);
  });

  it("flips above the pointer near the bottom edge", () => {
    const p = placeTooltip({ x: 100, y: 760, ...box });
    expect(p.side.vertical).toBe("above");
    expect(p.top).toBe(760 - 14 - 220);
  });

  it("clamps inside the viewport when the box fits on neither side (small screens)", () => {
    const p = placeTooltip({ x: 200, y: 400, width: 256, height: 220, viewportWidth: 380, viewportHeight: 500 });
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + 256).toBeLessThanOrEqual(380 - 8);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + 220).toBeLessThanOrEqual(500 - 8);
  });

  it("re-places for a new viewport: the same pointer lands differently after a resize", () => {
    const wide = placeTooltip({ x: 900, y: 100, ...box });
    const narrow = placeTooltip({ x: 900, y: 100, ...box, viewportWidth: 1000 });
    expect(wide.side.horizontal).toBe("right");
    expect(narrow.side.horizontal).toBe("left");
  });
});
