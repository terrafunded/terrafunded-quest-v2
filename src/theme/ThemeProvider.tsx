import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { applyThemeToDocument, readStoredTheme, THEME_STORAGE_KEY, THEMES, type ThemeId, type ThemeMeta } from "./themes";

interface ThemeContextValue {
  theme: ThemeMeta;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  /** Scales a base duration (seconds) by the theme's motion language. */
  d: (seconds: number) => number;
  reducedMotion: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => readStoredTheme());
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    applyThemeToDocument(themeId);
  }, [themeId]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Follow changes made in another tab (or by the login page while the shell is open elsewhere).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setThemeId(readStoredTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* storage unavailable: the choice still applies for this session */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = THEMES[themeId];
    return {
      theme,
      themeId,
      setTheme,
      d: (s) => (reducedMotion ? 0 : s * theme.motion.scale),
      reducedMotion,
    };
  }, [themeId, setTheme, reducedMotion]);

  const theme = THEMES[themeId];
  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.5 * theme.motion.scale, ease: theme.motion.ease }}>
        {children}
      </MotionConfig>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
