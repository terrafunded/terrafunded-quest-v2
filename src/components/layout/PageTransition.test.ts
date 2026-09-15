import { describe, expect, it } from "vitest";
import { PAGE_PRESETS, PAGE_TRANSITION_CLEAR } from "./PageTransition";

describe("PageTransition end state", () => {
  it("clears filter and transform after every enter preset so fixed children use the viewport", () => {
    for (const name of ["rise", "turn", "hud"] as const) {
      const animate = PAGE_PRESETS[name].animate;
      expect(animate, name).toBeTruthy();
      expect(typeof animate).toBe("object");
      const end = (animate as { transitionEnd?: { filter?: string; transform?: string } }).transitionEnd;
      expect(end, `${name} missing transitionEnd`).toEqual(PAGE_TRANSITION_CLEAR);
      expect(end?.filter).toBe("none");
      expect(end?.transform).toBe("none");
    }
  });
});
