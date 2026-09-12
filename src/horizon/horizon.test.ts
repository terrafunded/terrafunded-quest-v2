import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_EXIT_HORIZON } from "@/config/goal";
import { HORIZON_STORAGE_KEY, parseStoredHorizon, readStoredHorizon } from "./horizon";

describe("parseStoredHorizon", () => {
  it("accepts the three allowed years as numbers or numeric strings", () => {
    expect(parseStoredHorizon(2027)).toBe(2027);
    expect(parseStoredHorizon(2028)).toBe(2028);
    expect(parseStoredHorizon(2029)).toBe(2029);
    expect(parseStoredHorizon("2027")).toBe(2027);
    expect(parseStoredHorizon("2028")).toBe(2028);
    expect(parseStoredHorizon("2029")).toBe(2029);
  });

  it("rejects garbage, free dates, and years outside the three", () => {
    expect(parseStoredHorizon(null)).toBe(DEFAULT_EXIT_HORIZON);
    expect(parseStoredHorizon(undefined)).toBe(DEFAULT_EXIT_HORIZON);
    expect(parseStoredHorizon("")).toBe(DEFAULT_EXIT_HORIZON);
    expect(parseStoredHorizon("nope")).toBe(DEFAULT_EXIT_HORIZON);
    expect(parseStoredHorizon("2026")).toBe(DEFAULT_EXIT_HORIZON);
    expect(parseStoredHorizon("2030")).toBe(DEFAULT_EXIT_HORIZON);
    expect(parseStoredHorizon("2027-12-31")).toBe(DEFAULT_EXIT_HORIZON);
    expect(parseStoredHorizon(2027.5)).toBe(DEFAULT_EXIT_HORIZON);
    expect(parseStoredHorizon(0)).toBe(DEFAULT_EXIT_HORIZON);
    expect(parseStoredHorizon({ year: 2028 })).toBe(DEFAULT_EXIT_HORIZON);
  });
});

describe("readStoredHorizon", () => {
  const memory = new Map<string, string>();
  const store = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
  };

  afterEach(() => memory.clear());

  it("reads a valid stored year and falls back on garbage or missing storage", () => {
    // @ts-expect-error — node test env has no localStorage; the reader must tolerate both.
    globalThis.localStorage = store;
    memory.set(HORIZON_STORAGE_KEY, "2029");
    expect(readStoredHorizon()).toBe(2029);
    memory.set(HORIZON_STORAGE_KEY, "not-a-year");
    expect(readStoredHorizon()).toBe(DEFAULT_EXIT_HORIZON);
    memory.delete(HORIZON_STORAGE_KEY);
    expect(readStoredHorizon()).toBe(DEFAULT_EXIT_HORIZON);
  });

  it("never throws when localStorage is missing", () => {
    // @ts-expect-error — simulate private mode / node
    delete globalThis.localStorage;
    expect(readStoredHorizon()).toBe(DEFAULT_EXIT_HORIZON);
  });
});
