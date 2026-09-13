import { describe, expect, it } from "vitest";
import { pulseBand, pulseRatioPct } from "../pulse";

describe("pulseRatioPct", () => {
  it("is producing ÷ needed as a percentage", () => {
    expect(pulseRatioPct(9_145.63, 16_310.13)).toBe(56.07);
    expect(pulseRatioPct(16_310.13, 16_310.13)).toBe(100);
    expect(pulseRatioPct(null, 16_310.13)).toBeNull();
    expect(pulseRatioPct(9_145.63, null)).toBeNull();
    expect(pulseRatioPct(9_145.63, 0)).toBeNull();
  });
});

describe("pulseBand", () => {
  it("uses ember under 90, gold from 90 to 110, oxygen above 110", () => {
    expect(pulseBand(89.99)).toBe("ember");
    expect(pulseBand(90)).toBe("gold");
    expect(pulseBand(110)).toBe("gold");
    expect(pulseBand(110.01)).toBe("oxygen");
  });
});
