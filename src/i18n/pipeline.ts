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
    aria: string;
    title: (remaining: string) => string;
    monthsConversion: (months: string, deadline: string, conv: string, source: string) => string;
    conversionResolved: string;
    conversionWithCanc: string;
    conversionAssumed: string;
    twoFigures: (ledgerAvg: string) => string;
    andEraAvg: (era: string, avg: string, closings: number) => string;
    noEraAvg: string;
    goalMet: string;
    noHistory: (remaining: string) => string;
    paymentsHint: string;
    costLabel: string;
    costPlaceholder: string;
    costAria: string;
    legendAria: string;
    legendLedger: string;
    legendRecent: (era: string) => string;
    remaining: string;
    deadlinePassed: string;
    noMonthsLeft: string;
    remainingPerMonth: (amount: string) => string;
    remainingExplain: (remaining: string, perMonth: string, months: string) => string;
    remainingExplainNoMonths: (remaining: string) => string;
    lots: (n: string, singular: boolean) => string;
    reservations: (n: string, singular: boolean) => string;
    lotsToClose: (suffix: string) => string;
    reservationsNeeded: (suffix: string) => string;
    perMonthLabel: (suffix: string) => string;
    perWeekLabel: (suffix: string) => string;
    adSpendLabel: (suffix: string) => string;
    perMonthValue: (n: string) => string;
    perWeekValue: (n: string) => string;
    adSpendValue: (spend: string) => string;
    lotsPerMonth: (n: string) => string;
    perMonthShort: (n: string) => string;
    adSpendDetail: (conversations: string, cost: string) => string;
    ledgerAvgSuffix: string;
    sinceEraSuffix: (era: string) => string;
    tagLedger: (avg: string) => string;
    tagRecent: (era: string, avg: string) => string;
    lotsExplain: (lots: string, tag: string, perMonth: string, months: string) => string;
    resExplain: (res: string, conv: string, sourceNote: string) => string;
    resSourceResolved: string;
    resSourceWithCanc: string;
    resSourceAssumed: string;
    perMonthExplain: (n: string, months: string, tag: string) => string;
    perWeekExplain: (n: string, perMonth: string, tag: string) => string;
    adExplain: (spend: string, cost: string) => string;
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
      aria: "Reverse funnel",
      title: (remaining) => `The reverse funnel · what ${remaining} demands`,
      monthsConversion: (months, deadline, conv, source) => `${months} months to ${deadline} · ${conv} conversion${source}`,
      conversionResolved: ", resolved (feeds forecasts)",
      conversionWithCanc: ", cancellations included",
      conversionAssumed: ", assumed",
      twoFigures: (ledgerAvg) =>
        `Two figures per step, never one: at the ledger average (${ledgerAvg}/lot over every closed lot)`,
      andEraAvg: (era, avg, closings) =>
        ` and at the since-${era} average (${avg}/lot, ${closings} closings), the two the audit compares.`,
      noEraAvg: " — no era average yet.",
      goalMet: "The goal is met: nothing remains to reserve.",
      noHistory: (remaining) => `No closed lot yet, so there is no average to turn ${remaining} into lots.`,
      paymentsHint:
        "Payments holds no lead or inquiry volume, so the funnel stops at reservations. Your cost per conversation turns reservations per month into ad spend — if every reservation takes one paid conversation. It is kept on this device only and feeds nothing else.",
      costLabel: "Cost per conversation ($)",
      costPlaceholder: "e.g. 40",
      costAria: "Cost per conversation in dollars",
      legendAria: "legend",
      legendLedger: "ledger average",
      legendRecent: (era) => `since-${era} average`,
      remaining: "Remaining net profit",
      deadlinePassed: "the deadline has passed",
      noMonthsLeft: "no months left",
      remainingPerMonth: (amount) => `${amount}/month`,
      remainingExplain: (remaining, perMonth, months) =>
        `${remaining} still to book by the deadline — ${perMonth} every month for ${months} months.`,
      remainingExplainNoMonths: (remaining) => `${remaining} still to book by the deadline — no months left.`,
      lots: (n, singular) => `${n} ${singular ? "lot" : "lots"}`,
      reservations: (n, singular) => `${n} ${singular ? "reservation" : "reservations"}`,
      lotsToClose: (s) => `Lots to close${s}`,
      reservationsNeeded: (s) => `Reservations needed${s}`,
      perMonthLabel: (s) => `Reservations per month${s}`,
      perWeekLabel: (s) => `Reservations per week${s}`,
      adSpendLabel: (s) => `Implied ad spend per month${s}`,
      perMonthValue: (n) => `${n}/month`,
      perWeekValue: (n) => `${n}/week`,
      adSpendValue: (spend) => `${spend}/month`,
      lotsPerMonth: (n) => `${n} lots/month`,
      perMonthShort: (n) => `${n}/month`,
      adSpendDetail: (conversations, cost) => `${conversations} conversations/month × ${cost}`,
      ledgerAvgSuffix: " · ledger average",
      sinceEraSuffix: (era) => ` · since ${era}`,
      tagLedger: (avg) => `ledger average ${avg}/lot`,
      tagRecent: (era, avg) => `since-${era} average ${avg}/lot`,
      lotsExplain: (lots, tag, perMonth, months) => `${lots} at the ${tag} — ${perMonth} lots/month over ${months} months.`,
      resExplain: (res, conv, sourceNote) =>
        `${res}: those lots ÷ the measured ${conv} reservation → closing conversion${sourceNote}.`,
      resSourceResolved: " (resolved: open matured reservations excluded — feeds forecasts)",
      resSourceWithCanc: " (cancellations counted as failures)",
      resSourceAssumed: " (assumed 100 %: no matured cohort yet)",
      perMonthExplain: (n, months, tag) => `${n} reservations every month for ${months} months, at the ${tag}.`,
      perWeekExplain: (n, perMonth, tag) =>
        `${n} reservations a week (${perMonth}/month over 30.44 ÷ 7 weeks), at the ${tag}.`,
      adExplain: (spend, cost) =>
        `${spend} a month if every reservation takes one paid conversation at ${cost} — your figure, not Payments'.`,
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
      aria: "Embudo inverso",
      title: (remaining) => `El embudo inverso · lo que exige ${remaining}`,
      monthsConversion: (months, deadline, conv, source) => `${months} meses hasta ${deadline} · ${conv} de conversión${source}`,
      conversionResolved: ", resuelta (alimenta pronósticos)",
      conversionWithCanc: ", cancelaciones incluidas",
      conversionAssumed: ", asumida",
      twoFigures: (ledgerAvg) =>
        `Dos cifras por paso, nunca una: al promedio del libro (${ledgerAvg}/lote sobre cada lote cerrado)`,
      andEraAvg: (era, avg, closings) =>
        ` y al promedio desde ${era} (${avg}/lote, ${closings} cierres), las dos que compara la auditoría.`,
      noEraAvg: " — aún no hay promedio de la era.",
      goalMet: "La meta está cumplida: no queda nada por reservar.",
      noHistory: (remaining) => `Aún no hay lote cerrado, así que no hay promedio para convertir ${remaining} en lotes.`,
      paymentsHint:
        "Payments no guarda volumen de leads ni consultas, así que el embudo se detiene en reservas. Tu costo por conversación convierte reservas al mes en gasto en anuncios — si cada reserva toma una conversación pagada. Se guarda solo en este dispositivo y no alimenta nada más.",
      costLabel: "Costo por conversación ($)",
      costPlaceholder: "p. ej. 40",
      costAria: "Costo por conversación en dólares",
      legendAria: "leyenda",
      legendLedger: "promedio del libro",
      legendRecent: (era) => `promedio desde ${era}`,
      remaining: "Utilidad neta restante",
      deadlinePassed: "la fecha límite ya pasó",
      noMonthsLeft: "no quedan meses",
      remainingPerMonth: (amount) => `${amount}/mes`,
      remainingExplain: (remaining, perMonth, months) =>
        `${remaining} aún por registrar antes de la fecha límite — ${perMonth} cada mes durante ${months} meses.`,
      remainingExplainNoMonths: (remaining) => `${remaining} aún por registrar antes de la fecha límite — no quedan meses.`,
      lots: (n, singular) => `${n} ${singular ? "lote" : "lotes"}`,
      reservations: (n, singular) => `${n} ${singular ? "reserva" : "reservas"}`,
      lotsToClose: (s) => `Lotes por cerrar${s}`,
      reservationsNeeded: (s) => `Reservas necesarias${s}`,
      perMonthLabel: (s) => `Reservas por mes${s}`,
      perWeekLabel: (s) => `Reservas por semana${s}`,
      adSpendLabel: (s) => `Gasto en anuncios implícito por mes${s}`,
      perMonthValue: (n) => `${n}/mes`,
      perWeekValue: (n) => `${n}/semana`,
      adSpendValue: (spend) => `${spend}/mes`,
      lotsPerMonth: (n) => `${n} lotes/mes`,
      perMonthShort: (n) => `${n}/mes`,
      adSpendDetail: (conversations, cost) => `${conversations} conversaciones/mes × ${cost}`,
      ledgerAvgSuffix: " · promedio del libro",
      sinceEraSuffix: (era) => ` · desde ${era}`,
      tagLedger: (avg) => `promedio del libro ${avg}/lote`,
      tagRecent: (era, avg) => `promedio desde ${era} ${avg}/lote`,
      lotsExplain: (lots, tag, perMonth, months) => `${lots} al ${tag} — ${perMonth} lotes/mes durante ${months} meses.`,
      resExplain: (res, conv, sourceNote) =>
        `${res}: esos lotes ÷ la conversión medida ${conv} reserva → cierre${sourceNote}.`,
      resSourceResolved: " (resuelta: reservas maduras abiertas excluidas — alimenta pronósticos)",
      resSourceWithCanc: " (cancelaciones contadas como fallos)",
      resSourceAssumed: " (asumida 100 %: aún no hay cohorte madura)",
      perMonthExplain: (n, months, tag) => `${n} reservas cada mes durante ${months} meses, al ${tag}.`,
      perWeekExplain: (n, perMonth, tag) =>
        `${n} reservas a la semana (${perMonth}/mes sobre 30.44 ÷ 7 semanas), al ${tag}.`,
      adExplain: (spend, cost) =>
        `${spend} al mes si cada reserva toma una conversación pagada a ${cost} — tu cifra, no la de Payments.`,
    },
  },
};

export function usePipelineStrings(): PipelineUiStrings {
  const [lang] = useLang();
  return PIPELINE_UI[lang];
}
