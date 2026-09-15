import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DEFAULT_QUALITY_LANG, type QualityLang } from "@/domain/quality_human";
import { readStoredLang, subscribeStoredLang, writeStoredLang } from "./storedLang";

export { LANG_STORAGE_KEY, readStoredLang, writeStoredLang } from "./storedLang";

/**
 * App-wide UI language. The drawer selector governs the entire Quest surface —
 * every page, chart, badge, date and number. Persisted in localStorage; default Spanish.
 */

/** Keep `<html lang>` in sync so the browser and assistive tech match the UI. */
export function syncDocumentLang(lang: QualityLang = readStoredLang()) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "es" ? "es" : "en";
  document.title = lang === "es" ? "Quest" : "Quest";
}

export function useLang(): [QualityLang, (lang: QualityLang) => void] {
  const lang = useSyncExternalStore(subscribeStoredLang, readStoredLang, () => DEFAULT_QUALITY_LANG);
  const setLang = useCallback((next: QualityLang) => {
    writeStoredLang(next);
    syncDocumentLang(next);
  }, []);
  useEffect(() => {
    syncDocumentLang(lang);
  }, [lang]);
  return [lang, setLang];
}
