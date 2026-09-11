import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_QUALITY_LANG, QUALITY_LANGS, type QualityLang } from "@/domain/quality_human";

/**
 * The page language chosen in the drawer. Only /quality reads it today — the rest of the app
 * stays in English — but the choice is stored once, app-wide, so another page could follow it.
 * Persisted in localStorage; default Spanish.
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

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LANG_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLang(): [QualityLang, (lang: QualityLang) => void] {
  const lang = useSyncExternalStore(subscribe, readStoredLang, () => DEFAULT_QUALITY_LANG);
  const setLang = useCallback((next: QualityLang) => writeStoredLang(next), []);
  return [lang, setLang];
}
