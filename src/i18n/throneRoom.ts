import type { RealmEvent } from "@/domain";
import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** UI chrome for the Throne Room. Domain verdict / chronicle narrative stay English for now. */
export interface ThroneRoomUiStrings {
  emptyTitle: string;
  emptyBody: string;
  asOf: (date: string) => string;
  ofGoal: (goal: string, remaining: string) => string;
  committedAria: string;
  committed: (n: number, word: string) => string;
  noReservationWaiting: string;
  atStake: (stake: string, conv: string, label: string) => string;
  forecastsUse: (label: string) => string;
  expectedBy: string;
  overdue: (n: number, amount: string) => string;
  complete: string;
  conversion: {
    resolved: string;
    blendedIncl: string;
    blended: string;
    assumed: string;
  };
  paceReservations: (res: string, closings: string) => string;
  paceWindowTrailing: (days: number) => string;
  paceWindowSince: (since: string, days: number) => string;
  paceRequired: (res: string) => string;
  paceRequiredClosings: (closings: string, conv: string, label: string) => string;
  eraNote: string;
  era: string;
  lifetime: string;
  perLotLotsFarms: (perLot: string, lots: string, farms: string, need: string, lands: string, closings: string) => string;
  /** Suffix after the lands date: " · 14 closings" / " · 14 cierres". Empty when n is 0. */
  closingsCount: (n: number) => string;
  daysToDeadline: (days: string, deadline: string) => string;
  lotsStillNeeded: (lots: string, farms: string) => string;
  eraLotsFarms: (lots: number, farms: string) => string;
  engineReconcile: string;
  seeEngine: string;
  verdictLotsMonth: string;
  verdictLotsMonthAnnotated: string;
  thisMonthAria: string;
  reservationsThisMonth: string;
  pledgedIn: (month: string) => string;
  closingsThisMonth: string;
  moreExpected: (n: number) => string;
  closedIn: (month: string) => string;
  expectedNextMonth: string;
  closingsFromReservations: (month: string, n: number, word: string) => string;
  debtOxygenAria: string;
  rotation: string;
  warPlanLink: string;
  capitalOutstanding: string;
  capitalOutstandingHint: string;
  benchmarkTurn: string;
  days: (n: string) => string;
  months: (n: string) => string;
  projected: string;
  noFarmFreed: string;
  farmsFunded: (since: string) => string;
  freedEarlier: (names: string) => string;
  turnsCompleted: string;
  farmFreed: string;
  farmsFreed: string;
  capitalFullyBack: string;
  turnsStillNeeded: string;
  noCapitalToTurn: string;
  farmWord: (n: number) => string;
  peakInWarPlan: (peak: string, farms: number, word: string, outstanding: string) => string;
  notBackByDeadline: (n: number) => string;
  nextLiberation: string;
  pctStillToReturn: (pct: string) => string;
  lotsCoveredAwaiting: string;
  daysToGo: (days: string, date: string) => string;
  everyFarmFree: string;
  keyFiguresAria: string;
  cashRealized: string;
  cashRealizedHint: string;
  cashReconcile: (realized: string, other: string, total: string) => string;
  profitOnPaper: string;
  profitOnPaperHint: string;
  pipelineProfit: string;
  pipelineHint: (reserved: number, committed: string, conv: string, label: string, stuck: string) => string;
  capitalOutstandingKey: string;
  captiveSponsor: string;
  ownCapitalTied: (amount: string) => string;
  liveChronicle: string;
  fullChronicle: string;
  noEvents: string;
  eventLabel: Record<RealmEvent["kind"], string>;
  quests: string;
  questsHint: (closed: number, reserved: number, available: number) => string;
  sponsors: string;
  sponsorsHint: (sponsors: number, farms: number) => string;
  treasury: string;
  treasuryHint: (inn: string, out: string) => string;
}

export const THRONE_ROOM_UI: Record<QualityLang, ThroneRoomUiStrings> = {
  en: {
    emptyTitle: "The realm is empty",
    emptyBody: "No lots were found on subdivided farms. Check the Data Quality panel and table permissions.",
    asOf: (d) => `Throne Room · Net profit chronicled · as of ${d}`,
    ofGoal: (goal, remaining) => `of ${goal} · ${remaining} remaining · closings only`,
    committedAria: "Committed net profit from live reservations",
    committed: (n, word) => `Committed · ${n} live ${word}`,
    noReservationWaiting: "no reservation is waiting to close",
    atStake: (stake, conv, label) => `${stake} at stake × ${conv} ${label} = this figure`,
    forecastsUse: (label) => ` (forecasts use ${label})`,
    expectedBy: " · expected by ",
    overdue: (n, amount) => ` · ${n} overdue (${amount})`,
    complete: "complete",
    conversion: {
      resolved: "resolved conversion",
      blendedIncl: "blended conversion (incl. cancellations)",
      blended: "blended conversion",
      assumed: "assumed conversion",
    },
    paceReservations: (res, closings) => `Reserving ${res}/month, closing ${closings}/month`,
    paceWindowTrailing: (days) => `trailing ${days} days`,
    paceWindowSince: (since, days) => `${since} (${days} days)`,
    paceRequired: (res) => `Need ${res} reservations/month`,
    paceRequiredClosings: (closings, conv, label) => ` · ${closings} closings/month at ${conv} ${label}`,
    eraNote: "Era average is the better estimator of today's business (excludes pre-operation closings). Lifetime keeps every closed lot.",
    era: "Era",
    lifetime: "Lifetime",
    perLotLotsFarms: (perLot, lots, farms, need, lands, closings) =>
      `: ${perLot}/lot · ${lots} lots · ${farms} farms · need ${need}/mo · lands ${lands}${closings}`,
    closingsCount: (n) => (n > 0 ? ` · ${n} closings` : ""),
    daysToDeadline: (days, deadline) => `${days} days to ${deadline}`,
    lotsStillNeeded: (lots, farms) => `${lots} closings still needed to the deadline · ${farms} more farms (capital turns)`,
    eraLotsFarms: (lots, farms) => ` (era: ${lots} closings · ${farms} farms)`,
    engineReconcile: "Throne pace is unconstrained; the Engine caps inventory and capital turns",
    seeEngine: "see The Engine →",
    verdictLotsMonth: "lots/month",
    verdictLotsMonthAnnotated: "lots/month from the ledger average",
    thisMonthAria: "This month",
    reservationsThisMonth: "Reservations this month",
    pledgedIn: (m) => `pledged in ${m}`,
    closingsThisMonth: "Closings this month",
    moreExpected: (n) => `${n} more expected to close by month end`,
    closedIn: (m) => `closed in ${m}`,
    expectedNextMonth: "Expected next month",
    closingsFromReservations: (month, n, word) => `closings in ${month} from ${n} ${word} already made`,
    debtOxygenAria: "The Debt and Oxygen",
    rotation: "Rotation · land capital turning",
    warPlanLink: "the war plan →",
    capitalOutstanding: "Capital outstanding",
    capitalOutstandingHint: "today's captive sponsor capital (excludes own-capital farms)",
    benchmarkTurn: "Benchmark turn",
    days: (n) => `${n} days`,
    months: (n) => `${n} months`,
    projected: ", projected",
    noFarmFreed: "no farm freed, none projectable",
    farmsFunded: (since) => ` · farms funded ${since}`,
    freedEarlier: (names) => ` (${names} freed earlier, on record only)`,
    turnsCompleted: "Turns completed",
    farmFreed: "farm freed",
    farmsFreed: "farms freed",
    capitalFullyBack: " — capital fully back",
    turnsStillNeeded: "Turns still needed",
    noCapitalToTurn: "no capital has to turn",
    farmWord: (n) => (n === 1 ? "farm" : "farms"),
    peakInWarPlan: (peak, farms, word, outstanding) =>
      `${peak} peak in the war-plan buy schedule across ${farms} ${word} (not today's ${outstanding} already outstanding with sponsors)`,
    notBackByDeadline: (n) => ` · ${n} not back by the deadline`,
    nextLiberation: "Next liberation",
    pctStillToReturn: (p) => `${p}% of capital still to return`,
    lotsCoveredAwaiting: "lots covered, awaiting payout",
    daysToGo: (days, d) => `${days} days to go · ${d}`,
    everyFarmFree: "every sponsor-funded farm is free",
    keyFiguresAria: "Key figures",
    cashRealized: "Cash realized",
    cashRealizedHint: "Farm-lot cash only — down payments + note sales on farm lots",
    cashReconcile: (realized, other, total) =>
      `Farm-lot cash only. Cash realized ${realized} + other note sales ${other} = Treasury cash in ${total}`,
    profitOnPaper: "Profit on paper",
    profitOnPaperHint: "Net profit recognized but not yet cash",
    pipelineProfit: "Pipeline profit",
    pipelineHint: (reserved, committed, conv, label, stuck) =>
      `${reserved} reserved lots, if every one closes as priced · ${committed} committed at ${conv} ${label} · ${stuck} stuck`,
    capitalOutstandingKey: "Capital outstanding",
    captiveSponsor: "Today's captive sponsor capital",
    ownCapitalTied: (a) => ` · + ${a} own capital tied up`,
    liveChronicle: "Live chronicle",
    fullChronicle: "Full chronicle",
    noEvents: "No events yet.",
    eventLabel: {
      reservation: "Reserved",
      cancellation: "Cancelled",
      closing: "Closed",
      note_sale: "Note sold",
      distribution: "Paid out",
      farm_acquired: "Farm",
      milestone: "Milestone",
      liberation: "Freed",
    },
    quests: "Quests",
    questsHint: (c, r, a) => `${c} closed · ${r} reserved · ${a} available`,
    sponsors: "Sponsors",
    sponsorsHint: (s, f) => `${s} sponsors funding ${f} farms`,
    treasury: "Treasury",
    treasuryHint: (inn, out) => `${inn} in · ${out} out`,
  },
  es: {
    emptyTitle: "El reino está vacío",
    emptyBody: "No se encontraron lotes en fincas subdivididas. Revisa el panel de Calidad de datos y los permisos de las tablas.",
    asOf: (d) => `Sala del Trono · Utilidad neta crónica · al ${d}`,
    ofGoal: (goal, remaining) => `de ${goal} · ${remaining} restantes · solo cierres`,
    committedAria: "Utilidad neta comprometida de reservas vivas",
    committed: (n, word) => `Comprometido · ${n} ${word} viva${n === 1 ? "" : "s"}`,
    noReservationWaiting: "ninguna reserva espera cerrar",
    atStake: (stake, conv, label) => `${stake} en juego × ${conv} ${label} = esta cifra`,
    forecastsUse: (label) => ` (los pronósticos usan ${label})`,
    expectedBy: " · esperado para ",
    overdue: (n, amount) => ` · ${n} vencidas (${amount})`,
    complete: "completo",
    conversion: {
      resolved: "conversión resuelta",
      blendedIncl: "conversión mezclada (incl. cancelaciones)",
      blended: "conversión mezclada",
      assumed: "conversión asumida",
    },
    paceReservations: (res, closings) => `Reservando ${res}/mes, cerrando ${closings}/mes`,
    paceWindowTrailing: (days) => `últimos ${days} días`,
    paceWindowSince: (since, days) => `${since} (${days} días)`,
    paceRequired: (res) => `Se necesitan ${res} reservas/mes`,
    paceRequiredClosings: (closings, conv, label) => ` · ${closings} cierres/mes a ${conv} ${label}`,
    eraNote: "El promedio de la Era estima mejor el negocio de hoy (excluye cierres previos a la operación). El de por vida guarda cada lote cerrado.",
    era: "Era",
    lifetime: "De por vida",
    perLotLotsFarms: (perLot, lots, farms, need, lands, closings) =>
      `: ${perLot}/lote · ${lots} lotes · ${farms} fincas · se necesitan ${need}/mes · aterriza ${lands}${closings}`,
    closingsCount: (n) => (n > 0 ? ` · ${n} cierres` : ""),
    daysToDeadline: (days, deadline) => `${days} días hasta ${deadline}`,
    lotsStillNeeded: (lots, farms) => `${lots} cierres aún necesarios hasta la fecha límite · ${farms} fincas más (giros de capital)`,
    eraLotsFarms: (lots, farms) => ` (era: ${lots} cierres · ${farms} fincas)`,
    engineReconcile: "El ritmo del Trono no tiene tope; El Motor limita inventario y giros de capital",
    seeEngine: "ver El Motor →",
    verdictLotsMonth: "lotes/mes",
    verdictLotsMonthAnnotated: "lotes/mes del promedio del libro",
    thisMonthAria: "Este mes",
    reservationsThisMonth: "Reservas este mes",
    pledgedIn: (m) => `comprometidas en ${m}`,
    closingsThisMonth: "Cierres este mes",
    moreExpected: (n) => `${n} más se espera que cierren a fin de mes`,
    closedIn: (m) => `cerrados en ${m}`,
    expectedNextMonth: "Esperado el próximo mes",
    closingsFromReservations: (month, n, word) => `cierres en ${month} de ${n} ${word} ya hechas`,
    debtOxygenAria: "La Deuda y el Oxígeno",
    rotation: "Rotación · capital de tierra en giro",
    warPlanLink: "el plan de guerra →",
    capitalOutstanding: "Capital pendiente",
    capitalOutstandingHint: "capital de sponsors cautivo hoy (excluye fincas de capital propio)",
    benchmarkTurn: "Ciclo de referencia",
    days: (n) => `${n} días`,
    months: (n) => `${n} meses`,
    projected: ", proyectado",
    noFarmFreed: "ninguna finca liberada, ninguna proyectable",
    farmsFunded: (since) => ` · fincas fondeadas ${since}`,
    freedEarlier: (names) => ` (${names} liberadas antes, solo en el registro)`,
    turnsCompleted: "Ciclos completados",
    farmFreed: "finca liberada",
    farmsFreed: "fincas liberadas",
    capitalFullyBack: " — capital de vuelta por completo",
    turnsStillNeeded: "Ciclos aún necesarios",
    noCapitalToTurn: "no hay capital que girar",
    farmWord: (n) => (n === 1 ? "finca" : "fincas"),
    peakInWarPlan: (peak, farms, word, outstanding) =>
      `${peak} de pico en el calendario de compras del plan de guerra en ${farms} ${word} (no los ${outstanding} ya pendientes con sponsors hoy)`,
    notBackByDeadline: (n) => ` · ${n} no vuelven antes de la fecha límite`,
    nextLiberation: "Próxima liberación",
    pctStillToReturn: (p) => `${p}% del capital aún por devolver`,
    lotsCoveredAwaiting: "lotes cubiertos, esperando pago",
    daysToGo: (days, d) => `${days} días restantes · ${d}`,
    everyFarmFree: "toda finca fondeada por sponsors está libre",
    keyFiguresAria: "Cifras clave",
    cashRealized: "Efectivo realizado",
    cashRealizedHint: "Solo efectivo de lotes de finca — enganches + ventas de pagarés en lotes de finca",
    cashReconcile: (realized, other, total) =>
      `Solo efectivo de lotes de finca. Efectivo realizado ${realized} + otras ventas de pagarés ${other} = Entrada de Tesorería ${total}`,
    profitOnPaper: "Utilidad en papel",
    profitOnPaperHint: "Utilidad neta reconocida pero aún no en efectivo",
    pipelineProfit: "Utilidad en embudo",
    pipelineHint: (reserved, committed, conv, label, stuck) =>
      `${reserved} lotes reservados, si todos cierran al precio · ${committed} comprometidos a ${conv} ${label} · ${stuck} atascados`,
    capitalOutstandingKey: "Capital pendiente",
    captiveSponsor: "Capital de sponsors cautivo hoy",
    ownCapitalTied: (a) => ` · + ${a} de capital propio inmovilizado`,
    liveChronicle: "Crónica en vivo",
    fullChronicle: "Crónica completa",
    noEvents: "Aún no hay eventos.",
    eventLabel: {
      reservation: "Reservado",
      cancellation: "Cancelada",
      closing: "Cerrado",
      note_sale: "Pagaré vendido",
      distribution: "Pagado",
      farm_acquired: "Finca",
      milestone: "Hito",
      liberation: "Liberada",
    },
    quests: "Misiones",
    questsHint: (c, r, a) => `${c} cerrados · ${r} reservados · ${a} disponibles`,
    sponsors: "Sponsors",
    sponsorsHint: (s, f) => `${s} sponsors fondeando ${f} fincas`,
    treasury: "Tesorería",
    treasuryHint: (inn, out) => `${inn} entrante · ${out} saliente`,
  },
};

export function useThroneRoomStrings(): ThroneRoomUiStrings {
  const [lang] = useLang();
  return THRONE_ROOM_UI[lang];
}
