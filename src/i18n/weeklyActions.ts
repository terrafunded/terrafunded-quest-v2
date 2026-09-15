import type { QualityLang } from "@/domain/quality_human";
import type { SimulatorBottleneckKind } from "@/domain/simulator";
import type { WeeklyDetectorType } from "@/domain/weeklyActions";
import { useLang } from "./lang";

export interface WeeklyActionsUiStrings {
  title: string;
  thisWeek: string;
  subtitle: string;
  lastWeek: (done: number, days: string) => string;
  lastWeekNone: string;
  belowMinimum: string;
  lever: Record<SimulatorBottleneckKind, string>;
  days: string;
  daysParked: string;
  viewRecords: string;
  sendToScore: string;
  assignOwner: string;
  copied: string;
  done: string;
  dismiss: string;
  dismissReason: string;
  dismissConfirm: string;
  cancel: string;
  pending: string;
  dismissed: string;
  history: string;
  historyRow: (week: string, done: number, days: string) => string;
  formula: string;
  pill: (pending: number, total: number) => string;
  pillAria: (pending: number, total: number) => string;
  allClear: string;
  titles: Record<string, (p: Record<string, string | number>) => string>;
  whys: Record<string, (p: Record<string, string | number>) => string>;
}

function titleFor(detector: string, p: Record<string, string | number>, lang: QualityLang): string {
  if (detector === "stuckFarm") {
    return lang === "es" ? `Desatascar ${p.count} reservas en ${p.farm}` : `Unstick ${p.count} reservations on ${p.farm}`;
  }
  if (detector === "stuckLot") {
    return lang === "es" ? `Desatascar ${p.lot}` : `Unstick ${p.lot}`;
  }
  if (detector === "fullyReserved") {
    return lang === "es" ? `Cerrar reservas de ${p.farm}` : `Close ${p.farm} reservations`;
  }
  if (detector === "idleFarm") {
    return lang === "es" ? `Reservar lotes en ${p.farm}` : `Reserve lots on ${p.farm}`;
  }
  if (detector === "unfunded") {
    return lang === "es" ? `Fondear ${p.amount} comprometido` : `Fund ${p.amount} committed`;
  }
  if (detector === "fundBy") {
    return lang === "es" ? `Fondear la próxima finca para el ${p.fundBy}` : `Fund the next farm by ${p.fundBy}`;
  }
  if (detector === "heldNotes") {
    return lang === "es" ? `No vender ${p.count} notas con descuento` : `Do not sell ${p.count} notes at a discount`;
  }
  if (detector === "qualityBlocker") {
    return lang === "es" ? `Corregir ${p.count} precios en desacuerdo` : `Fix ${p.count} price disagreements`;
  }
  if (typeof p.title === "string") return p.title;
  return lang === "es" ? "Revisar esta alerta" : "Review this alert";
}

function whyFor(detector: string, p: Record<string, string | number>, lang: QualityLang): string {
  if (detector === "stuckWhy") {
    return lang === "es"
      ? `${p.dollars} en juego, ${p.days} días al ritmo pedido`
      : `${p.dollars} at stake, ${p.days} days at the required pace`;
  }
  if (detector === "fullyReservedWhy") {
    return lang === "es"
      ? `${p.reserved} reservas, cero cierres, ${p.days} días`
      : `${p.reserved} reserved, zero closed, ${p.days} days`;
  }
  if (detector === "idleFarmWhy") {
    return lang === "es"
      ? `${p.lots} lotes × ${p.era} aparcan ${p.days} días`
      : `${p.lots} lots × ${p.era} park ${p.days} days`;
  }
  if (detector === "unfundedWhy") {
    return lang === "es" ? `${p.amount} sin fondear, ${p.days} días` : `${p.amount} unfunded, ${p.days} days`;
  }
  if (detector === "fundByWhy") {
    return lang === "es"
      ? `Evita ${p.days} días vacíos si se fondea el ${p.fundBy}`
      : `Avoids ${p.days} empty days if funded by ${p.fundBy}`;
  }
  if (detector === "heldNotesWhy") {
    return lang === "es" ? `${p.cost} de descuento, ${p.days} días` : `${p.cost} discount, ${p.days} days`;
  }
  if (detector === "qualityBlockerWhy") {
    return lang === "es" ? `${p.dollars} de utilidad afectada, ${p.days} días` : `${p.dollars} of profit affected, ${p.days} days`;
  }
  if (typeof p.body === "string") return p.body;
  return "";
}

export const WEEKLY_ACTIONS_UI: Record<QualityLang, WeeklyActionsUiStrings> = {
  en: {
    title: "This week",
    thisWeek: "This week",
    subtitle: "The three actions that move the most days toward the goal. The list freezes on Monday.",
    lastWeek: (done, days) => `Last week: ${done} done, ${days} days gained on records that actually moved.`,
    lastWeekNone: "No frozen week before this one.",
    belowMinimum: "No action this week exceeds 3 days toward the goal. The single best lever from the forecast is below.",
    lever: {
      inventory: "Fund the next farm before inventory runs out.",
      demand: "Reserve more lots. Inventory is not the bind.",
      capital: "Raise capital. Farms in the plan cannot be funded.",
      none: "The forecast does not name a bind.",
    },
    days: "days",
    daysParked: "days parked",
    viewRecords: "View records",
    sendToScore: "Send to Score",
    assignOwner: "Assign an owner in config",
    copied: "Copied",
    done: "Done",
    dismiss: "Dismiss",
    dismissReason: "Why dismiss?",
    dismissConfirm: "Save",
    cancel: "Cancel",
    pending: "Pending",
    dismissed: "Dismissed",
    history: "Past weeks",
    historyRow: (week, done, days) => `${week}: ${done} done, ${days} days gained`,
    formula: "How the days are counted",
    pill: (pending, total) => `${pending}/${total}`,
    pillAria: (pending, total) => `${pending} of ${total} actions pending this week`,
    allClear: "This week's actions are done or dismissed.",
    titles: new Proxy(
      {},
      { get: (_, key: string) => (p: Record<string, string | number>) => titleFor(key, p, "en") },
    ) as WeeklyActionsUiStrings["titles"],
    whys: new Proxy(
      {},
      { get: (_, key: string) => (p: Record<string, string | number>) => whyFor(key, p, "en") },
    ) as WeeklyActionsUiStrings["whys"],
  },
  es: {
    title: "Esta semana",
    thisWeek: "Esta semana",
    subtitle: "Las tres acciones que más días mueven hacia la meta. La lista se congela el lunes.",
    lastWeek: (done, days) => `La semana pasada: ${done} hechas, ${days} días ganados en registros que sí se movieron.`,
    lastWeekNone: "No hay una semana congelada anterior.",
    belowMinimum: "Ninguna acción de esta semana supera 3 días hacia la meta. Abajo está la palanca única del pronóstico.",
    lever: {
      inventory: "Fondea la próxima finca antes de que se acabe el inventario.",
      demand: "Reserva más lotes. El inventario no es el límite.",
      capital: "Levanta capital. El plan no puede fondear las fincas.",
      none: "El pronóstico no nombra un límite.",
    },
    days: "días",
    daysParked: "días aparcados",
    viewRecords: "Ver registros",
    sendToScore: "Enviar a Score",
    assignOwner: "Asigna un dueño en config",
    copied: "Copiado",
    done: "Hecho",
    dismiss: "Descartar",
    dismissReason: "¿Por qué descartar?",
    dismissConfirm: "Guardar",
    cancel: "Cancelar",
    pending: "Pendiente",
    dismissed: "Descartada",
    history: "Semanas anteriores",
    historyRow: (week, done, days) => `${week}: ${done} hechas, ${days} días ganados`,
    formula: "Cómo se cuentan los días",
    pill: (pending, total) => `${pending}/${total}`,
    pillAria: (pending, total) => `${pending} de ${total} acciones pendientes esta semana`,
    allClear: "Las acciones de esta semana están hechas o descartadas.",
    titles: new Proxy(
      {},
      { get: (_, key: string) => (p: Record<string, string | number>) => titleFor(key, p, "es") },
    ) as WeeklyActionsUiStrings["titles"],
    whys: new Proxy(
      {},
      { get: (_, key: string) => (p: Record<string, string | number>) => whyFor(key, p, "es") },
    ) as WeeklyActionsUiStrings["whys"],
  },
};

export function useWeeklyActionsStrings(): WeeklyActionsUiStrings {
  const [lang] = useLang();
  return WEEKLY_ACTIONS_UI[lang];
}

export function actionTitle(lang: QualityLang, key: string, params: Record<string, string | number>): string {
  return titleFor(key, params, lang);
}

export function actionWhy(lang: QualityLang, key: string, params: Record<string, string | number>): string {
  return whyFor(key, params, lang);
}

export function scoreClipboardPayload(usuario: string, descripcion: string): string {
  return JSON.stringify([{ usuario, descripcion, empresa: "terrafunded" }]);
}

export type { WeeklyDetectorType };
