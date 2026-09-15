import type { QualityLang } from "@/domain/quality_human";
import { readStoredLang } from "@/i18n/lang";

/** BCP 47 locale for number/date formatting. es-MX keeps comma thousands like en-US. */
export function localeOf(lang: QualityLang): string {
  return lang === "es" ? "es-MX" : "en-US";
}

function langOrStored(lang?: QualityLang): QualityLang {
  return lang ?? readStoredLang();
}

/**
 * Whole dollars with a leading `$` and locale grouping.
 * Avoids `USD 1,234` from `style: "currency"` in es-MX so e2e pins stay stable.
 */
export function money(n: number | null | undefined, lang?: QualityLang): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const formatted = new Intl.NumberFormat(localeOf(langOrStored(lang)), { maximumFractionDigits: 0 }).format(n);
  return `$${formatted}`;
}

/** Cents: $8,986,794.30 */
export function moneyExact(n: number | null | undefined, lang?: QualityLang): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const formatted = new Intl.NumberFormat(localeOf(langOrStored(lang)), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `$${formatted}`;
}

/** Compact: $2.27M, $815K — unit letters stay Latin (team convention). */
export function moneyCompact(n: number | null | undefined, lang?: QualityLang): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return money(n, lang);
}

export function number(n: number | null | undefined, lang?: QualityLang): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(localeOf(langOrStored(lang)), { maximumFractionDigits: 2 }).format(n);
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

/** "Sep 11, 2026" / "11 sep 2026" from an ISO date — follows the stored language unless overridden. */
export function date(iso: string | null | undefined, lang?: QualityLang): string {
  return dateIn(langOrStored(lang), iso);
}

/** Explicit-language date (preferred inside i18n dictionaries). */
export function dateIn(lang: QualityLang, iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeOf(lang), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** "Sep 2026" / "sep 2026" from "2026-09". */
export function monthLabel(key: string, lang?: QualityLang): string {
  return monthLabelIn(langOrStored(lang), key);
}

export function monthLabelIn(lang: QualityLang, key: string): string {
  const iso = key.length >= 10 ? key.slice(0, 7) : key.slice(0, 7);
  const d = new Date(`${iso}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return new Intl.DateTimeFormat(localeOf(lang), {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/** "45d" / "45 d" — compact day count for tables. */
export function days(n: number | null | undefined, lang?: QualityLang): string {
  if (n === null || n === undefined) return "—";
  return langOrStored(lang) === "es" ? `${n} d` : `${n}d`;
}

const STAGE_EN: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  closed: "Closed",
  note_sold: "Note sold",
};

const STAGE_ES: Record<string, string> = {
  available: "Disponible",
  reserved: "Reservado",
  closed: "Cerrado",
  note_sold: "Pagaré vendido",
};

const DEAL_EN: Record<string, string> = {
  fixed_interest: "Fixed interest",
  profit_share: "Profit share",
  own_capital: "Own capital",
};

const DEAL_ES: Record<string, string> = {
  fixed_interest: "Interés fijo",
  profit_share: "Reparto de utilidades",
  own_capital: "Capital propio",
};

/**
 * English stage labels — kept for call sites mid-migration.
 * Prefer `stageLabel(key, lang)` so Spanish screens never show "Available".
 */
export const STAGE_LABEL: Record<string, string> = STAGE_EN;

/** English deal labels — prefer `dealLabel(key, lang)`. */
export const DEAL_LABEL: Record<string, string> = DEAL_EN;

export function stageLabel(key: string, lang?: QualityLang): string {
  const map = langOrStored(lang) === "es" ? STAGE_ES : STAGE_EN;
  return map[key] ?? key;
}

export function dealLabel(key: string, lang?: QualityLang): string {
  const map = langOrStored(lang) === "es" ? DEAL_ES : DEAL_EN;
  return map[key] ?? key;
}

export function stageLabels(lang?: QualityLang): Record<string, string> {
  return langOrStored(lang) === "es" ? { ...STAGE_ES } : { ...STAGE_EN };
}

export function dealLabels(lang?: QualityLang): Record<string, string> {
  return langOrStored(lang) === "es" ? { ...DEAL_ES } : { ...DEAL_EN };
}
