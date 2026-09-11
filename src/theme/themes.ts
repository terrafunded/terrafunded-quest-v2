/**
 * The three skins. Same data, same layouts — only tokens, type, texture, motion and iconography
 * change. Colour tokens live in `tokens.css` under `[data-theme="…"]`; this file holds what React
 * needs at runtime: metadata, the motion language and the ambient-particle recipe.
 */
export type ThemeId = "iron-crown" | "gilded-realm" | "neon-kingdom";

export const THEME_IDS: readonly ThemeId[] = ["iron-crown", "gilded-realm", "neon-kingdom"];
export const DEFAULT_THEME: ThemeId = "iron-crown";
export const THEME_STORAGE_KEY = "quest.theme";

export interface MotionLanguage {
  /** Multiplier applied to every Framer Motion duration and to the counter tweens. */
  scale: number;
  /** Default cubic-bezier for the theme. */
  ease: [number, number, number, number];
  /** Page transition preset. */
  page: "rise" | "turn" | "hud";
}

export interface ParticleRecipe {
  kind: "embers" | "motes" | "streaks";
  count: number;
  /** Base speed in px/s at 1x scale. */
  speed: number;
  /** HSL triplets without the wrapper, e.g. "24 90% 55%". */
  colors: string[];
}

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  /** Short description for the menu and the docs. */
  blurb: string;
  /** Preview swatches shown in the theme menu (CSS colours). */
  swatches: [string, string, string];
  /** `<meta name="theme-color">` for the browser chrome. */
  themeColor: string;
  scheme: "dark" | "light";
  motion: MotionLanguage;
  particles: ParticleRecipe;
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  "iron-crown": {
    id: "iron-crown",
    name: "Iron Crown",
    tagline: "Dark stone. Cold steel. Embers.",
    blurb: "Heavy serif on wet stone, steel edges and ember accents. Slow, deliberate motion.",
    swatches: ["hsl(220 12% 9%)", "hsl(210 14% 62%)", "hsl(22 92% 55%)"],
    themeColor: "#14161a",
    scheme: "dark",
    motion: { scale: 1.5, ease: [0.22, 1, 0.36, 1], page: "rise" },
    particles: { kind: "embers", count: 36, speed: 18, colors: ["22 92% 58%", "34 95% 62%", "12 85% 48%"] },
  },
  "gilded-realm": {
    id: "gilded-realm",
    name: "Gilded Realm",
    tagline: "Parchment. Warm gold. Forest green.",
    blurb: "An illuminated manuscript: parchment grain, ornamental borders, drop caps and gold leaf.",
    swatches: ["hsl(40 42% 90%)", "hsl(38 75% 45%)", "hsl(150 32% 30%)"],
    themeColor: "#efe6d2",
    scheme: "light",
    motion: { scale: 1, ease: [0.16, 1, 0.3, 1], page: "turn" },
    particles: { kind: "motes", count: 44, speed: 12, colors: ["42 90% 55%", "38 80% 45%", "150 30% 35%"] },
  },
  "neon-kingdom": {
    id: "neon-kingdom",
    name: "Neon Kingdom",
    tagline: "Black glass. Electric gold. Violet.",
    blurb: "A tactical HUD: black glass, sharp geometry, monospace numbers and fast, snapping motion.",
    swatches: ["hsl(240 20% 4%)", "hsl(48 100% 55%)", "hsl(275 95% 65%)"],
    themeColor: "#07070d",
    scheme: "dark",
    motion: { scale: 0.55, ease: [0.9, 0, 0.1, 1], page: "hud" },
    particles: { kind: "streaks", count: 48, speed: 140, colors: ["48 100% 60%", "275 95% 70%", "200 100% 65%"] },
  },
};

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);
}

/** Reads the persisted theme; never throws (private mode, disabled storage). */
export function readStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Applies the theme to <html> so CSS tokens, fonts and textures switch at once. */
export function applyThemeToDocument(id: ThemeId) {
  const meta = THEMES[id];
  const root = document.documentElement;
  root.dataset.theme = id;
  root.style.colorScheme = meta.scheme;
  root.classList.toggle("dark", meta.scheme === "dark");
  root.classList.toggle("light", meta.scheme === "light");
  const tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (tag) tag.content = meta.themeColor;
}
