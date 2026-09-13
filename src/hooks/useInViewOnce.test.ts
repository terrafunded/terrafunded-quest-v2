import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useInViewOnce } from "./useInViewOnce";

function Probe() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  return createElement("div", { ref, "data-in-view": String(inView) });
}

function firstRenderInView(): string {
  const html = renderToString(createElement(Probe));
  return /data-in-view="(true|false)"/.exec(html)?.[1] ?? "missing";
}

// renderToString runs only the first render (no effects), which is exactly the value a server
// or a browser without the observer would paint with.
const g = globalThis as { window?: unknown; IntersectionObserver?: unknown };

afterEach(() => {
  delete g.window;
  delete g.IntersectionObserver;
});

describe("useInViewOnce first render", () => {
  it("is true without a window (SSR)", () => {
    expect(firstRenderInView()).toBe("true");
  });

  it("is true when IntersectionObserver is unavailable", () => {
    g.window = { matchMedia: () => ({ matches: false }) };
    expect(firstRenderInView()).toBe("true");
  });

  it("is true under prefers-reduced-motion", () => {
    g.window = { matchMedia: (q: string) => ({ matches: q.includes("prefers-reduced-motion") }) };
    g.IntersectionObserver = class {};
    expect(firstRenderInView()).toBe("true");
  });

  it("waits for the observer otherwise", () => {
    g.window = { matchMedia: () => ({ matches: false }) };
    g.IntersectionObserver = class {};
    expect(firstRenderInView()).toBe("false");
  });
});
