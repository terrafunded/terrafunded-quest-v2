import { DEFAULT_QUALITY_LANG, QUALITY_LANGS, type QualityLang } from "../domain/quality_human";

/**
 * Pure language persistence — no React. Used by formatters (and by the Vite weekly-council
 * plugin path that imports domain → format) and by the React `useLang` hook.
 */
export const LANG_STORAGE_KEY = "quest.lang";

const listeners = new Set<() => void>();
/** Fallback for this visit when localStorage is unavailable. */
let sessionLang: QualityLang | null = null;

const isLang = (raw: string | null): raw is QualityLang => raw !== null && (QUALITY_LANGS as readonly string[]).includes(raw);

export function readStoredLang(): QualityLang {
  try {
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(raw)) return raw;
  } catch {
    /* storage unavailable */
  }
  return sessionLang ?? DEFAULT_QUALITY_LANG;
}

export function writeStoredLang(lang: QualityLang) {
  sessionLang = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* storage unavailable: the choice still applies for this visit */
  }
  for (const l of listeners) l();
}

export function subscribeStoredLang(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LANG_STORAGE_KEY) listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
