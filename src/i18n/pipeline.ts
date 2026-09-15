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
  resolvedStatement: (pct: string, closed: number, denom: number, open: number) => string;
  resolvedHint: (closed: number, denom: string, feeding: boolean) => string;
  resolvedWarning: string;
  stillOpen: string;
  stillOpenHint: (cutoff: string) => string;
  blendedConversion: string;
  blendedLabel: string;
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
  bottleneckAria: string;
  bottleneckTitle: string;
  bottleneckHint: string;
  bottleneckStage: string;
  bottleneckCount: string;
  bottleneckValue: string;
  bottleneckMedian: string;
  noStage: string;
  flaggedAria: string;
  flaggedTitle: string;
  flaggedHint: string;
  nearClosingAria: string;
  nearClosingTitle: string;
  nearClosingHint: string;
  stuckTitle: string;
  col: {
    daysWaiting: string;
    lot: string;
    buyer: string;
    reserved: string;
    estClosing: string;
    salePrice: string;
    netAtStake: string;
    stage: string;
    progress: string;
    lastUpdate: string;
  };
  flagBlocked: string;
  flagOverdue: string;
  flagNear: string;
  testClient: string;
  totals: (n: number) => string;
  funnel: {
    aria: string;
    title: (remaining: string) => string;
    monthsConversion: (months: string, deadline: string, conv: string, source: string) => string;
    conversionResolved: string;
    conversionResolvedOpen: (closed: number, denom: number, open: number) => string;
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
  aging: {
    title: string;
    subtitle: string;
    exportTasks: string;
    fullyReserved: string;
    bucket0: string;
    bucket31: string;
    bucket61: string;
    bucket90: string;
    salePrice: string;
    expectedNet: string;
    daysGained: string;
    client: string;
    farm: string;
    lot: string;
    daysWaiting: string;
    testClient: string;
    empty: string;
    farmCounts: (b0: number, b31: number, b61: number, b90: number) => string;
  };
}

export const PIPELINE_UI: Record<QualityLang, PipelineUiStrings> = {
  en: {
    title: "Pipeline",
    subtitle: (d) =>
      `Reservations lead, closings pay. Every reserved lot with no closing after ${d} days, ranked by days waiting and lack of progress. Nothing on this page counts toward net profit or the goal date until it closes.`,
    filterFarm: "Filter stuck lots by farm",
    allFarms: "All farms",
    inLedger: "in Payments",
    figuresAria: "Pipeline figures",
    trapped: "Profit trapped in reservations",
    trappedHint: (stuck, reserved, days, sales) => `${stuck} of ${reserved} reservations waiting ${days}+ days · ${sales} of sales`,
    reservationsVsClosings: "Reservations vs closings / mo",
    paceHintTrailing: (w, waiting, made) => `trailing ${w} days · ${waiting} new reservations still waiting, ${made} made in total`,
    paceHintSince: (since, days, waiting, made) => `since ${since} (${days} days) · ${waiting} new reservations still waiting, ${made} made in total`,
    resolvedConversion: "Resolved conversion (forecasts)",
    resolvedStatement: (p, closed, denom, open) => `${p} — ${closed} of ${denom} resolved · ${open} still open`,
    resolvedHint: (closed, denom, feeding) =>
      `closed ÷ (closed + cancelled) = ${closed} ÷ ${denom} · used for Expected, Capital projection, Plan${feeding ? " · feeding forecasts now" : ""}`,
    resolvedWarning: "This estimate rests on few resolved outcomes relative to how many reservations are still open.",
    stillOpen: "Still open",
    stillOpenHint: (cutoff) => `matured reservations still waiting — not failures yet · cohort cutoff ${cutoff}`,
    blendedConversion: "Blended conversion",
    blendedLabel: "including unresolved reservations",
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
    bottleneckAria: "Stage bottleneck",
    bottleneckTitle: "Stage bottleneck",
    bottleneckHint: "Open reservations grouped by the Payments stage they sit in, ordered by sale price held.",
    bottleneckStage: "Stage",
    bottleneckCount: "Reservations",
    bottleneckValue: "Sale price",
    bottleneckMedian: "Median days waiting",
    noStage: "No stage in Payments",
    flaggedAria: "Blocked or overdue stages",
    flaggedTitle: "Blocked or overdue",
    flaggedHint: "Payments marked a blocked or overdue stage. These need a different action than a slow case.",
    nearClosingAria: "Near closing",
    nearClosingTitle: "Near closing",
    nearClosingHint: "Progress at or above 70%, or an estimated closing date in the next 30 days. Shown here, not among the slow reservations.",
    stuckTitle: "Stuck reservations",
    col: {
      daysWaiting: "Days waiting",
      lot: "Lot",
      buyer: "Buyer",
      reserved: "Reserved",
      estClosing: "Est. closing",
      salePrice: "Sale price",
      netAtStake: "Net profit at stake",
      stage: "Stage",
      progress: "Progress",
      lastUpdate: "Last update",
    },
    flagBlocked: "Blocked",
    flagOverdue: "Overdue",
    flagNear: "Near closing",
    testClient: "test client",
    totals: (n) => `Totals · ${n} stuck reservations`,
    funnel: {
      aria: "Reverse funnel",
      title: (remaining) => `The reverse funnel · what ${remaining} demands`,
      monthsConversion: (months, deadline, conv, source) => `${months} months to ${deadline} · ${conv} conversion${source}`,
      conversionResolved: ", resolved (feeds forecasts)",
      conversionResolvedOpen: (closed, denom, open) =>
        `, resolved — ${closed} of ${denom} · ${open} still open`,
      conversionWithCanc: ", cancellations included",
      conversionAssumed: ", assumed",
      twoFigures: (ledgerAvg) =>
        `Two figures per step, never one: at the closed-lot average (${ledgerAvg}/lot over every closed lot)`,
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
      legendLedger: "closed-lot average",
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
      ledgerAvgSuffix: " · closed-lot average",
      sinceEraSuffix: (era) => ` · since ${era}`,
      tagLedger: (avg) => `closed-lot average ${avg}/lot`,
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
    aging: {
      title: "Parked money: reservation aging",
      subtitle:
        "Live reservations by days since the reservation, per farm. Days gained if closed this month use today's net profit per day. Farms whose entire inventory is reserved with zero closings are highlighted.",
      exportTasks: "Export as Score tasks",
      fullyReserved: "Entire inventory reserved · zero closings",
      bucket0: "0–30 days",
      bucket31: "31–60 days",
      bucket61: "61–90 days",
      bucket90: "90+ days",
      salePrice: "Sale price",
      expectedNet: "Expected net profit",
      daysGained: "Days gained if closed this month",
      client: "Client",
      farm: "Farm",
      lot: "Lot",
      daysWaiting: "Days waiting",
      testClient: "test client",
      empty: "No live reservations.",
      farmCounts: (b0, b31, b61, b90) => `${b0} · ${b31} · ${b61} · ${b90}`,
    },
  },
  es: {
    title: "Pipeline",
    subtitle: (d) =>
      `Las reservas adelantan, los cierres pagan. Cada lote reservado sin cierre después de ${d} días, ordenado por días de espera y falta de avance. Nada en esta pantalla cuenta para la utilidad neta ni la fecha meta hasta que cierre.`,
    filterFarm: "Filtrar lotes atascados por finca",
    allFarms: "Todas las fincas",
    inLedger: "en Payments",
    figuresAria: "Cifras del pipeline",
    trapped: "Utilidad atrapada en reservas",
    trappedHint: (stuck, reserved, days, sales) => `${stuck} de ${reserved} reservas esperando ${days}+ días · ${sales} en ventas`,
    reservationsVsClosings: "Reservas vs cierres / mes",
    paceHintTrailing: (w, waiting, made) => `últimos ${w} días · ${waiting} reservas nuevas aún esperando, ${made} hechas en total`,
    paceHintSince: (since, days, waiting, made) => `desde ${since} (${days} días) · ${waiting} reservas nuevas aún esperando, ${made} hechas en total`,
    resolvedConversion: "Conversión resuelta (pronósticos)",
    resolvedStatement: (p, closed, denom, open) => `${p} — ${closed} de ${denom} resueltas · ${open} aún abiertas`,
    resolvedHint: (closed, denom, feeding) =>
      `cerrados ÷ (cerrados + cancelados) = ${closed} ÷ ${denom} · usado en Esperado, Proyección de capital, Plan${feeding ? " · alimentando pronósticos ahora" : ""}`,
    resolvedWarning: "Esta estimación descansa en pocos desenlaces resueltos frente a las reservas que siguen abiertas.",
    stillOpen: "Aún abiertas",
    stillOpenHint: (cutoff) => `reservas maduras aún esperando — aún no son fallos · corte de cohorte ${cutoff}`,
    blendedConversion: "Conversión mezclada",
    blendedLabel: "incluye reservas sin resolver",
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
    bottleneckAria: "Cuello de botella por etapa",
    bottleneckTitle: "Cuello de botella por etapa",
    bottleneckHint: "Reservas abiertas agrupadas por la etapa de Payments en la que están, ordenadas por precio de venta retenido.",
    bottleneckStage: "Etapa",
    bottleneckCount: "Reservas",
    bottleneckValue: "Precio de venta",
    bottleneckMedian: "Mediana de días esperando",
    noStage: "Sin etapa en Payments",
    flaggedAria: "Etapas bloqueadas o vencidas",
    flaggedTitle: "Bloqueadas o vencidas",
    flaggedHint: "Payments marcó una etapa bloqueada o vencida. Piden una acción distinta a un caso lento.",
    nearClosingAria: "Cerca del cierre",
    nearClosingTitle: "Cerca del cierre",
    nearClosingHint: "Avance de 70% o más, o una fecha de cierre estimada en los próximos 30 días. No se mezclan con la lista atascada.",
    stuckTitle: "Reservas atascadas",
    col: {
      daysWaiting: "Días esperando",
      lot: "Lote",
      buyer: "Comprador",
      reserved: "Reservado",
      estClosing: "Cierre est.",
      salePrice: "Precio de venta",
      netAtStake: "Utilidad neta en juego",
      stage: "Etapa",
      progress: "Avance",
      lastUpdate: "Última actualización",
    },
    flagBlocked: "Bloqueada",
    flagOverdue: "Vencida",
    flagNear: "Cerca del cierre",
    testClient: "cliente de prueba",
    totals: (n) => `Totales · ${n} reservas atascadas`,
    funnel: {
      aria: "Reservas hacia atrás",
      title: (remaining) => `El pipeline inverso · lo que exige ${remaining}`,
      monthsConversion: (months, deadline, conv, source) => `${months} meses hasta ${deadline} · ${conv} de conversión${source}`,
      conversionResolved: ", resuelta (alimenta pronósticos)",
      conversionResolvedOpen: (closed, denom, open) =>
        `, resuelta — ${closed} de ${denom} · ${open} aún abiertas`,
      conversionWithCanc: ", cancelaciones incluidas",
      conversionAssumed: ", asumida",
      twoFigures: (ledgerAvg) =>
        `Dos cifras por paso, nunca una: al promedio de lotes cerrados (${ledgerAvg}/lote sobre cada lote cerrado)`,
      andEraAvg: (era, avg, closings) =>
        ` y al promedio desde ${era} (${avg}/lote, ${closings} cierres), las dos que compara la auditoría.`,
      noEraAvg: " — aún no hay promedio de la era.",
      goalMet: "La meta está cumplida: no queda nada por reservar.",
      noHistory: (remaining) => `Aún no hay lote cerrado, así que no hay promedio para convertir ${remaining} en lotes.`,
      paymentsHint:
        "Payments no guarda volumen de leads ni consultas, así que el pipeline se detiene en reservas. Tu costo por conversación convierte reservas al mes en gasto en anuncios — si cada reserva toma una conversación pagada. Se guarda solo en este dispositivo y no alimenta nada más.",
      costLabel: "Costo por conversación ($)",
      costPlaceholder: "p. ej. 40",
      costAria: "Costo por conversación en dólares",
      legendAria: "leyenda",
      legendLedger: "promedio de lotes cerrados",
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
      ledgerAvgSuffix: " · promedio de lotes cerrados",
      sinceEraSuffix: (era) => ` · desde ${era}`,
      tagLedger: (avg) => `promedio de lotes cerrados ${avg}/lote`,
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
    aging: {
      title: "Dinero estacionado: antigüedad de reservas",
      subtitle:
        "Reservas vivas por días desde la reserva, por finca. Los días ganados si cierra este mes usan la utilidad neta por día de hoy. Se destacan las fincas cuyo inventario entero está reservado y no tiene cierres.",
      exportTasks: "Exportar como tareas de Score",
      fullyReserved: "Inventario entero reservado · cero cierres",
      bucket0: "0–30 días",
      bucket31: "31–60 días",
      bucket61: "61–90 días",
      bucket90: "90+ días",
      salePrice: "Precio de venta",
      expectedNet: "Utilidad neta esperada",
      daysGained: "Días ganados si cierra este mes",
      client: "Cliente",
      farm: "Finca",
      lot: "Lote",
      daysWaiting: "Días esperando",
      testClient: "cliente de prueba",
      empty: "No hay reservas vivas.",
      farmCounts: (b0, b31, b61, b90) => `${b0} · ${b31} · ${b61} · ${b90}`,
    },
  },
};

export function usePipelineStrings(): PipelineUiStrings {
  const [lang] = useLang();
  return PIPELINE_UI[lang];
}
