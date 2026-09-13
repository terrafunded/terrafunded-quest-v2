import { afterEach, describe, expect, it } from "vitest";
import { LOCKED_THEME, readStoredTheme, resolveStoredTheme, THEME_IDS, THEME_STORAGE_KEY, THEMES } from "./themes";

describe("theme lock", () => {
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

  it("holds everyone to Iron Crown while the selector is hidden, without deleting the other skins", () => {
    expect(LOCKED_THEME).toBe("iron-crown");
    expect(THEME_IDS).toEqual(["iron-crown", "gilded-realm", "neon-kingdom"]);
    expect(THEMES["gilded-realm"].name).toBeTruthy();
    expect(THEMES["neon-kingdom"].name).toBeTruthy();
  });

  it("resolves a stored skin naming another theme to Iron Crown and writes Iron Crown back", () => {
    // @ts-expect-error — node test env has no localStorage; the resolver must tolerate both.
    globalThis.localStorage = store;
    for (const stored of ["neon-kingdom", "gilded-realm", "not-a-theme"]) {
      memory.set(THEME_STORAGE_KEY, stored);
      expect(resolveStoredTheme()).toBe("iron-crown");
      expect(memory.get(THEME_STORAGE_KEY)).toBe("iron-crown");
    }
    memory.delete(THEME_STORAGE_KEY);
    expect(resolveStoredTheme()).toBe("iron-crown");
    expect(memory.get(THEME_STORAGE_KEY)).toBe("iron-crown");
  });

  it("still reads the raw stored value, so the choice can be honoured again when the lock is lifted", () => {
    // @ts-expect-error — see above
    globalThis.localStorage = store;
    memory.set(THEME_STORAGE_KEY, "neon-kingdom");
    expect(readStoredTheme()).toBe("neon-kingdom");
  });

  it("never throws when localStorage is missing", () => {
    // @ts-expect-error — simulate private mode / node
    delete globalThis.localStorage;
    expect(resolveStoredTheme()).toBe("iron-crown");
  });
});
