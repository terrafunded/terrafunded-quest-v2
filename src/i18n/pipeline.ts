import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** UI chrome for /pipeline and ReverseFunnel. */
export interface PipelineUiStrings {
  title: string;
  subtitle: (stuckAfterDays: number) => string;
  filterFarm: string;
  allFarms: string;
  inLedger: string;
  figuresAria: string;
  trapped: string;
  trappedHint: (stuck: number, reserved: number, days: number, sales: string) => string;
  reservationsVsClosings: string;
  paceHintTrailing: (windowDays: number, waiting: number, made: number) => string;
  paceHintSince: (since: string, days: number, waiting: number, made: number) => string;
  resolvedConversion: string;
  resolvedHint: (closed: number, denom: string, feeding: boolean) => string;
  stillOpen: string;
  stillOpenHint: (cutoff: string) => string;
  blendedConversion: string;
  inclCancellations: (pct: string) => string;
  blendedHint: (closed: number, cohort: number, waiting: number, cancelled: number) => string;
  cancellationRate: string;
  cancellationHint: (cancelled: number, cohort: number, allCancelled: number) => string;
  medianDays: string;
  medianHint: (n: number) => string;
  perFarm: string;
  median: (d: string) => string;
  farmLine: (reserved: number, stuck: number) => string;
  trappedAmount: (amount: string) => string;
  emptyTitle: string;
  emptyBody: (days: number, farm: string) => string;
  col: {
    daysWaiting: string;
    lot: string;
    buyer: string;
    reserved: string;
    estClosing: string;
    salePrice: string;
    netAtStake: string;
  };
  testClient: string;
  totals: (n: number) => string;
  funnel: {
    title: string;
    costLabel: string;
    costHint: string;
    remaining: string;
    deadlinePassed: string;
    remainingExplain: (remaining: string, perMonth: string, months: string) => string;
    remainingExplainNoMonths: (remaining: string) => string;
    lotsToClose: (suffix: string) => string;
    reservationsNeeded: (suffix: string) => string;
    perMonth: (suffix: string) => string;
    perWeek: (suffix: string) => string;
    adSpend: string;
    ledgerAvg: string;
    sinceEra: (era: string) => string;
    tagLedger: (avg: string) => string;
    tagRecent: (era: string, avg: string) => string;
    lotsExplain: (lots: string, tag: string, perMonth: string, months: string) => string;
    resExplain: (res: string, conv: string, tag: string) => string;
    perMonthExplain: (n: string, months: string) => string;
    perWeekExplain: (n: string) => string;
    adExplain: (spend: string, cost: string) => string;
    noAdCost: string;
  };
}

export const PIPELINE_UI: Record<QualityLang, PipelineUiStrings> = {
  en: {
    title: "Pipeline",
    subtitle: (d) =>
      `Reservations lead, closings pay. Every reserved lot with no closing after ${d} days, sorted by days waiting. Nothing on this page counts toward net profit or the goal date until it closes.`,
    filterFarm: "Filter stuck lots by farm",
    allFarms: "All farms",
    inLedger: "in the ledger",
    figuresAria: "Pipeline figures",
    trapped: "Profit trapped in reservations",
    trappedHint: (stuck, reserved, days, sales) => `${stuck} of ${reserved} reservations waiting ${days}+ days · ${sales} of sales`,
    reservationsVsClosings: "Reservations vs closings / mo",
    paceHintTrailing: (w, waiting, made) => `trailing ${w} days · ${waiting} new reservations still waiting, ${made} made in total`,
    paceHintSince: (since, days, waiting, made) => `since ${since} (${days} days) · ${waiting} new reservations still waiting, ${made} made in total`,
    resolvedConversion: "Resolved conversion (forecasts)",
    resolvedHint: (closed, denom, feeding) =>
      `closed ÷ (closed + cancelled) = ${closed} ÷ ${denom} · used for Expected, Engine, War Plan${feeding ? " · feeding forecasts now" : ""}`,
    stillOpen: "Still open",
    stillOpenHint: (cutoff) => `matured reservations still waiting — not failures yet · cohort cutoff ${cutoff}`,
    blendedConversion: "Blended conversion",
    inclCancellations: (p) => ` · ${p} incl. cancellations`,
    blendedHint: (closed, cohort, waiting, cancelled) =>
      `including unresolved reservations: ${closed} of ${cohort} closed; ${waiting} still waiting; ${cancelled} cancelled`,
    cancellationRate: "Cancellation rate",
    cancellationHint: (cancelled, cohort, all) =>
      `${cancelled} matured reservations whose only file case was cancelled, out of ${cohort} · ${all} cancelled in all`,
    medianDays: "Median days to close",
    medianHint: (n) => `over ${n} closed lots with both dates · per farm below`,
    perFarm: "Per farm",
    median: (d) => `median ${d}`,
    farmLine: (reserved, stuck) => `${reserved} reserved · ${stuck} stuck`,
    trappedAmount: (a) => ` · ${a} trapped`,
    emptyTitle: "Nothing stuck",
    emptyBody: (days, farm) => `No reservation has waited ${days} days without closing${farm ? ` on ${farm}` : ""}.`,
    col: {
      daysWaiting: "Days waiting",
      lot: "Lot",
      buyer: "Buyer",
      reserved: "Reserved",
      estClosing: "Est. closing",
      salePrice: "Sale price",
      netAtStake: "Net profit at stake",
    },
    testClient: "test client",
    totals: (n) => `Totals · ${n} stuck reservations`,
    funnel: {
      title: "Reverse funnel",
      costLabel: "Cost per conversation",
      costHint: "Assumption — not in Payments",
      remaining: "Remaining net profit",
      deadlinePassed: "the deadline has passed",
      remainingExplain: (remaining, perMonth, months) =>
        `${remaining} still to book by the deadline — ${perMonth} every month for ${months} months.`,
      remainingExplainNoMonths: (remaining) => `${remaining} still to book by the deadline — no months left.`,
      lotsToClose: (s) => `Lots to close${s}`,
      reservationsNeeded: (s) => `Reservations needed${s}`,
      perMonth: (s) => `Reservations / month${s}`,
      perWeek: (s) => `Reservations / week${s}`,
      adSpend: "Ad spend / month",
      ledgerAvg: " · ledger average",
      sinceEra: (era) => ` · since ${era}`,
      tagLedger: (avg) => `ledger average ${avg}/lot`,
      tagRecent: (era, avg) => `since-${era} average ${avg}/lot`,
      lotsExplain: (lots, tag, perMonth, months) => `${lots} at the ${tag} — ${perMonth} lots/month over ${months} months.`,
      resExplain: (res, conv, tag) => `${res} at ${conv} conversion — ${tag}.`,
      perMonthExplain: (n, months) => `${n} reservations every month for ${months} months.`,
      perWeekExplain: (n) => `${n} reservations every week.`,
      adExplain: (spend, cost) => `${spend}/month at ${cost} per conversation.`,
      noAdCost: "Set a cost per conversation to estimate ad spend.",
    },
  },
  es: {
    title: "Embudo",
    subtitle: (d) =>
      `Las reservas adelantan, los cierres pagan. Cada lote reservado sin cierre después de ${d} días, ordenado por días de espera. Nada en esta pantalla cuenta para la utilidad neta ni la fecha meta hasta que cierre.`,
    filterFarm: "Filtrar lotes atascados por finca",
    allFarms: "Todas las fincas",
    inLedger: "en el libro",
    figuresAria: "Cifras del embudo",
    trapped: "Utilidad atrapada en reservas",
    trappedHint: (stuck, reserved, days, sales) => `${stuck} de ${reserved} reservas esperando ${days}+ días · ${sales} en ventas`,
    reservationsVsClosings: "Reservas vs cierres / mes",
    paceHintTrailing: (w, waiting, made) => `últimos ${w} días · ${waiting} reservas nuevas aún esperando, ${made} hechas en total`,
    paceHintSince: (since, days, waiting, made) => `desde ${since} (${days} días) · ${waiting} reservas nuevas aún esperando, ${made} hechas en total`,
    resolvedConversion: "Conversión resuelta (pronósticos)",
    resolvedHint: (closed, denom, feeding) =>
      `cerrados ÷ (cerrados + cancelados) = ${closed} ÷ ${denom} · usado en Esperado, Motor, Plan de Guerra${feeding ? " · alimentando pronósticos ahora" : ""}`,
    stillOpen: "Aún abiertas",
    stillOpenHint: (cutoff) => `reservas maduras aún esperando — aún no son fallos · corte de cohorte ${cutoff}`,
    blendedConversion: "Conversión mezclada",
    inclCancellations: (p) => ` · ${p} incl. cancelaciones`,
    blendedHint: (closed, cohort, waiting, cancelled) =>
      `incluyendo reservas sin resolver: ${closed} de ${cohort} cerrados; ${waiting} aún esperando; ${cancelled} cancelados`,
    cancellationRate: "Tasa de cancelación",
    cancellationHint: (cancelled, cohort, all) =>
      `${cancelled} reservas maduras cuyo único file case fue cancelado, de ${cohort} · ${all} canceladas en total`,
    medianDays: "Mediana de días al cierre",
    medianHint: (n) => `sobre ${n} lotes cerrados con ambas fechas · por finca abajo`,
    perFarm: "Por finca",
    median: (d) => `mediana ${d}`,
    farmLine: (reserved, stuck) => `${reserved} reservados · ${stuck} atascados`,
    trappedAmount: (a) => ` · ${a} atrapados`,
    emptyTitle: "Nada atascado",
    emptyBody: (days, farm) => `Ninguna reserva ha esperado ${days} días sin cerrar${farm ? ` en ${farm}` : ""}.`,
    col: {
      daysWaiting: "Días esperando",
      lot: "Lote",
      buyer: "Comprador",
      reserved: "Reservado",
      estClosing: "Cierre est.",
      salePrice: "Precio de venta",
      netAtStake: "Utilidad neta en juego",
    },
    testClient: "cliente de prueba",
    totals: (n) => `Totales · ${n} reservas atascadas`,
    funnel: {
      title: "Embudo inverso",
      costLabel: "Costo por conversación",
      costHint: "Supuesto — no está en Payments",
      remaining: "Utilidad neta restante",
      deadlinePassed: "la fecha límite ya pasó",
      remainingExplain: (remaining, perMonth, months) =>
        `${remaining} aún por registrar antes de la fecha límite — ${perMonth} cada mes durante ${months} meses.`,
      remainingExplainNoMonths: (remaining) => `${remaining} aún por registrar antes de la fecha límite — no quedan meses.`,
      lotsToClose: (s) => `Lotes por cerrar${s}`,
      reservationsNeeded: (s) => `Reservas necesarias${s}`,
      perMonth: (s) => `Reservas / mes${s}`,
      perWeek: (s) => `Reservas / semana${s}`,
      adSpend: "Gasto en anuncios / mes",
      ledgerAvg: " · promedio del libro",
      sinceEra: (era) => ` · desde ${era}`,
      tagLedger: (avg) => `promedio del libro ${avg}/lote`,
      tagRecent: (era, avg) => `promedio desde ${era} ${avg}/lote`,
      lotsExplain: (lots, tag, perMonth, months) => `${lots} al ${tag} — ${perMonth} lotes/mes durante ${months} meses.`,
      resExplain: (res, conv, tag) => `${res} a ${conv} de conversión — ${tag}.`,
      perMonthExplain: (n, months) => `${n} reservas cada mes durante ${months} meses.`,
      perWeekExplain: (n) => `${n} reservas cada semana.`,
      adExplain: (spend, cost) => `${spend}/mes a ${cost} por conversación.`,
      noAdCost: "Define un costo por conversación para estimar el gasto en anuncios.",
    },
  },
};

export function usePipelineStrings(): PipelineUiStrings {
  const [lang] = useLang();
  return PIPELINE_UI[lang];
}
