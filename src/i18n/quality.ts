import type { QualityLang } from "@/domain/quality_human";

/** UI strings for /quality only. Issue texts live in `src/domain/quality_human.ts`. */
export interface QualityUiStrings {
  title: string;
  subtitle: string;
  lotsWithIssues: string;
  issuesLabel: string;
  lotsWithIssuesCount: (n: number) => string;
  emptySourceTables: (tables: string) => string;
  andFarms: (n: number) => string;
  profitAffected: string;
  profitAffectedHint: (mismatches: number) => string;
  oldest: string;
  oldestNone: string;
  oldestHint: (days: number, since: string) => string;
  oldestUndated: string;
  copyAll: string;
  /** Downloads JSON + text of every figure, row and reconciliation across the app. */
  exportAll: string;
  copyCard: string;
  copied: string;
  copyFailed: string;
  all: string;
  hideReviewed: string;
  showReviewed: string;
  reviewed: string;
  markReviewed: string;
  note: string;
  notePlaceholder: string;
  check: string;
  fix: string;
  quest: string;
  technical: string;
  since: (d: string) => string;
  issues: (n: number) => string;
  reviewedOf: (done: number, total: number) => string;
  farm: string;
  lot: string;
  empty: string;
  emptyBody: string;
  allReviewedBody: string;
  whatsappHint: string;
  totals: (lots: number, issues: number) => string;
}

export const QUALITY_UI: Record<QualityLang, QualityUiStrings> = {
  es: {
    title: "Calidad de datos",
    subtitle:
      "Cada lugar donde Payments se contradice, explicado en palabras. Quest no corrige nada ni escribe en Payments: aquí ves qué revisar, cómo corregirlo y puedes marcar lo que ya revisaste.",
    lotsWithIssues: "Lotes con problemas",
    issuesLabel: "Problemas",
    lotsWithIssuesCount: (n) => (n === 1 ? "1 lote con problemas" : `${n} lotes con problemas`),
    emptySourceTables: (tables) =>
      `Payments devolvió 0 filas en: ${tables}. Las cifras que leen esas tablas se calculan desde nada.`,
    andFarms: (n) => (n === 1 ? "y 1 finca" : `y ${n} fincas`),
    profitAffected: "Ganancia afectada por diferencias de precio",
    profitAffectedHint: (n) => (n === 0 ? "ningún precio en desacuerdo" : `suma de las diferencias en ${n} ${n === 1 ? "lote" : "lotes"}; Quest usa la nota`),
    oldest: "Problema más antiguo sin revisar",
    oldestNone: "Todo revisado",
    oldestHint: (days, since) => `${days} ${days === 1 ? "día" : "días"} · desde el ${since}`,
    oldestUndated: "sin fecha en los registros",
    copyAll: "Copiar todo para WhatsApp",
    exportAll: "Exportar todo",
    copyCard: "Copiar para WhatsApp",
    copied: "Copiado",
    copyFailed: "No se pudo copiar",
    all: "Todos",
    hideReviewed: "Ocultar revisados",
    showReviewed: "Mostrar revisados",
    reviewed: "Revisado",
    markReviewed: "Marcar como revisado",
    note: "Nota",
    notePlaceholder: "Ej. Hablé con Ana, lo corrige el lunes",
    check: "Qué revisar",
    fix: "Cómo corregir en Payments",
    quest: "Qué usa Quest hoy",
    technical: "Detalles técnicos",
    since: (d) => `desde el ${d}`,
    issues: (n) => (n === 1 ? "1 problema" : `${n} problemas`),
    reviewedOf: (done, total) => `${done} de ${total} ${total === 1 ? "revisado" : "revisados"}`,
    farm: "Finca",
    lot: "Lote",
    empty: "Sin problemas",
    emptyBody: "Payments no se contradice en ningún lugar con este filtro.",
    allReviewedBody: "Todo lo de este filtro ya está marcado como revisado. Muestra los revisados para verlo de nuevo.",
    whatsappHint: "El mensaje se copia en español, listo para pegar al equipo.",
    totals: (lots, issues) => `${issues} ${issues === 1 ? "problema" : "problemas"} en ${lots} ${lots === 1 ? "tarjeta" : "tarjetas"}`,
  },
  en: {
    title: "Data Quality",
    subtitle:
      "Every place Payments disagrees with itself, in plain words. Quest corrects nothing and cannot write to Payments: here you see what to check, how to fix it, and you can tick off what you have reviewed.",
    lotsWithIssues: "Lots with issues",
    issuesLabel: "Issues",
    lotsWithIssuesCount: (n) => (n === 1 ? "1 lot with issues" : `${n} lots with issues`),
    emptySourceTables: (tables) =>
      `Payments returned 0 rows for: ${tables}. Figures that read those tables are computed from nothing.`,
    andFarms: (n) => (n === 1 ? "and 1 farm" : `and ${n} farms`),
    profitAffected: "Profit affected by price mismatches",
    profitAffectedHint: (n) => (n === 0 ? "no price disagreements" : `sum of the differences on ${n} ${n === 1 ? "lot" : "lots"}; Quest uses the note`),
    oldest: "Oldest unreviewed issue",
    oldestNone: "Everything reviewed",
    oldestHint: (days, since) => `${days} ${days === 1 ? "day" : "days"} · since ${since}`,
    oldestUndated: "no date on the records",
    copyAll: "Copy all for WhatsApp",
    exportAll: "Export everything",
    copyCard: "Copy for WhatsApp",
    copied: "Copied",
    copyFailed: "Could not copy",
    all: "All",
    hideReviewed: "Hide reviewed",
    showReviewed: "Show reviewed",
    reviewed: "Reviewed",
    markReviewed: "Mark as reviewed",
    note: "Note",
    notePlaceholder: "e.g. Spoke to Ana, fixing it Monday",
    check: "What to check",
    fix: "How to fix in Payments",
    quest: "What Quest uses today",
    technical: "Technical details",
    since: (d) => `since ${d}`,
    issues: (n) => (n === 1 ? "1 issue" : `${n} issues`),
    reviewedOf: (done, total) => `${done} of ${total} reviewed`,
    farm: "Farm",
    lot: "Lot",
    empty: "Clean",
    emptyBody: "Payments does not disagree with itself anywhere under this filter.",
    allReviewedBody: "Everything under this filter is already marked as reviewed. Show reviewed to see it again.",
    whatsappHint: "The message is copied in Spanish, ready to paste to the team.",
    totals: (lots, issues) => `${issues} ${issues === 1 ? "issue" : "issues"} across ${lots} ${lots === 1 ? "card" : "cards"}`,
  },
};
