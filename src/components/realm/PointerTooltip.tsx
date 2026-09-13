import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { placeTooltip, type Placement } from "@/lib/tooltipPlacement";
import { cn } from "@/lib/utils";

/**
 * A pointer-anchored tooltip that never owns pointer events and never reads the viewport during
 * render. It measures itself and the document's client box in a layout effect (so SSR renders
 * nothing position-dependent), re-places itself on resize, and stays hidden until it has been
 * measured so it never flashes at a wrong corner.
 */
export function PointerTooltip({ x, y, children, className, ...rest }: { x: number; y: number; children: ReactNode; className?: string; "data-testid"?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const read = () => setViewport({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !viewport) return;
    const { width, height } = el.getBoundingClientRect();
    setPlacement(placeTooltip({ x, y, width, height, viewportWidth: viewport.w, viewportHeight: viewport.h }));
  }, [x, y, viewport, children]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className={cn("pointer-events-none fixed z-50 w-64 rounded-md border border-border bg-popover p-3 text-xs shadow-2xl", className)}
      style={placement ? { left: placement.left, top: placement.top } : { left: x, top: y, visibility: "hidden" }}
      data-side={placement ? `${placement.side.vertical}-${placement.side.horizontal}` : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
