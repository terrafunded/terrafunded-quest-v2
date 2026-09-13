import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placeTooltip, type Placement } from "@/lib/tooltipPlacement";
import { cn } from "@/lib/utils";

/**
 * A pointer-anchored tooltip that never owns pointer events and never reads the viewport during
 * render. It is portalled to <body>: the page-transition wrapper animates `filter`/`transform`,
 * which turns any `position: fixed` descendant into one positioned against that wrapper (and so
 * wrong as soon as the page scrolls). It measures itself and the document's client box in a layout
 * effect (SSR renders nothing), re-places itself on resize, and stays hidden until measured so it
 * never flashes at a wrong corner.
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      // --popover is a theme token but not a Tailwind colour, so the background is set from the variable directly (bg-popover would silently do nothing).
      className={cn("pointer-events-none fixed z-50 w-64 rounded-md border border-border bg-[hsl(var(--popover))] p-3 text-xs text-[hsl(var(--popover-foreground))] shadow-2xl", className)}
      style={placement ? { left: placement.left, top: placement.top } : { left: x, top: y, visibility: "hidden" }}
      data-side={placement ? `${placement.side.vertical}-${placement.side.horizontal}` : undefined}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}
