import { useCallback, useEffect, useState, type RefCallback } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * True when the environment cannot or should not defer a reveal: no window (SSR), no
 * IntersectionObserver, or the user asked for reduced motion. In every one of those cases the
 * element counts as "already seen" so nothing waits on a scroll that may never be observed.
 */
function revealImmediately(): boolean {
  if (typeof window === "undefined") return true;
  if (typeof IntersectionObserver === "undefined") return true;
  return window.matchMedia?.(REDUCED_MOTION).matches ?? false;
}

/**
 * Tells a component when its element is first on screen, so an entrance animation runs as the
 * user arrives at it rather than on mount while it is still below the fold.
 *
 * Returns a callback ref and a boolean. The boolean flips to true the first time the element is
 * at least `threshold` (25%) visible and never flips back, so re-renders (a horizon or language
 * change) and later scrolling never replay the reveal. Under `prefers-reduced-motion`, without
 * a window (SSR) or without IntersectionObserver it is true from the first render.
 */
export function useInViewOnce<T extends Element = HTMLElement>(threshold = 0.25): [RefCallback<T>, boolean] {
  const [inView, setInView] = useState<boolean>(revealImmediately);
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback<RefCallback<T>>((el) => setNode(el), []);

  useEffect(() => {
    if (inView || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, node, threshold]);

  return [ref, inView];
}
