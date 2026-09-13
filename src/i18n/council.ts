import type { QualityLang } from "@/domain/quality_human";

export interface CouncilUiStrings {
  title: string;
  subtitle: string;
  weeklyLabel: string;
  weeklyWritten: string;
  disclaimer: string;
  unavailable: string;
  regenerate: string;
  regenerating: string;
  generated: (when: string) => string;
  limit: (n: number) => string;
  watchOut: string;
  ledgerLabel: string;
  ledgerHint: string;
  worth: string;
  why: string;
  critical: string;
  warning: string;
  ok: string;
  open: string;
}

export const COUNCIL_UI: Record<QualityLang, CouncilUiStrings> = {
  en: {
    title: "The Council",
    subtitle: "What the ledger already computed, and a written plan for this week. Every number below is from the books. Only the ranking of this week's actions is written.",
    weeklyLabel: "Weekly read",
    weeklyWritten: "written",
    disclaimer: "Numbers come from the ledger. Only the prioritisation is written by the model.",
    unavailable: "Weekly read unavailable. The Council below is unchanged.",
    regenerate: "Regenerate",
    regenerating: "Writing…",
    generated: (when) => `generated ${when}`,
    limit: (n) => `Daily regenerate limit reached (${n} per day). The current read stays.`,
    watchOut: "Watch out",
    ledgerLabel: "From the ledger",
    ledgerHint: "Computed. Every figure is a reading of a number the realm already had.",
    worth: "Worth",
    why: "Why",
    critical: "Critical",
    warning: "Warning",
    ok: "Clear",
    open: "Open",
  },
  es: {
    title: "El Consejo",
    subtitle: "Lo que el libro ya calculó, y un plan escrito para esta semana. Cada cifra de abajo sale del libro. Solo el orden de las acciones de esta semana está escrito.",
    weeklyLabel: "Lectura semanal",
    weeklyWritten: "escrita",
    disclaimer: "Las cifras vienen del libro. Solo la prioridad la escribe el modelo.",
    unavailable: "Lectura semanal no disponible. El Consejo de abajo no cambia.",
    regenerate: "Regenerar",
    regenerating: "Escribiendo…",
    generated: (when) => `generada ${when}`,
    limit: (n) => `Límite diario de regeneración alcanzado (${n} al día). Queda la lectura actual.`,
    watchOut: "Ojo",
    ledgerLabel: "Del libro",
    ledgerHint: "Calculado. Cada cifra es una lectura de un número que el reino ya tenía.",
    worth: "Vale",
    why: "Por qué",
    critical: "Crítico",
    warning: "Aviso",
    ok: "En orden",
    open: "Abrir",
  },
};

export function formatWeeklyGeneratedAt(iso: string, lang: QualityLang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
