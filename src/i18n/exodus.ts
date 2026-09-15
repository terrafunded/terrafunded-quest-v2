import type { QualityLang } from "@/domain/quality_human";
import type { NoteInventoryStatus, NoteSaleRatioBasis } from "@/domain";

/** UI strings for /exodus. The verdict itself comes from the domain (`exodusVerdict`, EN/ES). */
export interface ExodusUiStrings {
  title: string;
  subtitle: (lpCapital: string) => string;
  reset: string;
  verdict: string;
  verdictFoot: (months: string, deadline: string, closingsPerMonth: string, farms: number, adSpend: string) => string;
  latestViable: (month: string) => string;
  noViable: string;
  versus: string;
  discountSaved: string;
  discountSavedHint: (ratio: string) => string;
  lotsNotNeeded: string;
  lotsNotNeededHint: (baseline: string, scenario: string) => string;
  monthsEarlier: string;
  monthsEarlierHint: (scenarioDate: string, baselineDate: string) => string;
  never: string;
  inputs: string;
  notesPct: string;
  notesPctHint: (target: string) => string;
  noteSalesCount: (all: number, farmLots: number) => string;
  maxMark: (pct: number) => string;
  lpCapital: string;
  lpCapitalReal: string;
  deadline: string;
  deadlineHint: (months: string) => string;
  noteSaleRatio: string;
  noteSaleRatioHint: string;
  noteSaleRatioReal: (combined: string, discount: string, discountSales: number, financed: string, financedSales: number, literal: string) => string;
  basis: Record<NoteSaleRatioBasis, string>;
  excluded: string;
  excludedHint: string;
  excludedReal: (codes: string) => string;
  startingCash: string;
  startingCashHint: string;
  startingCashReal: (kept: string, owed: string) => string;
  inherited: string;
  scenarioName: string;
  scenarioPlaceholder: string;
  save: string;
  savedScenarios: string;
  loadOne: string;
  noneSaved: string;
  remove: string;
  months: string;
  from: (date: string) => string;
  colMonth: string;
  colLots: string;
  colFreeAvailable: string;
  colDelivered: string;
  colReleases: string;
  colFarms: string;
  colSold: string;
  colCashIn: string;
  colAds: string;
  colCashPaid: string;
  colCumNotes: string;
  colCumCash: string;
  colCumTotal: string;
  by: (date: string) => string;
  monthsFoot: string;
  inventory: string;
  inventorySummary: (sold: number, inactive: number) => string;
  colNote: string;
  colFarm: string;
  colUpb: string;
  colRate: string;
  colTerm: string;
  colStatus: string;
  colReleaseCost: string;
  colSettlement: string;
  remaining: (n: number) => string;
  status: Record<NoteInventoryStatus, string>;
  statusShort: Record<NoteInventoryStatus, string>;
  inventoryFoot: string;
  packageTitle: string;
  packageEmpty: string;
  totalUpb: string;
  notesCount: string;
  avgRate: string;
  avgTerm: string;
  avgRemaining: string;
  upbWeighted: string;
  notesCountHint: string;
  ofLpCapital: (pct: string) => string;
  fromExistingFree: string;
  fromExistingReleased: string;
  fromProjectedFree: string;
  fromProjectedReleased: string;
  fromCashFarm: string;
  notes: (n: number) => string;
  sources: string;
  sourcesTitle: string;
  productionLine: (lots: string, farms: number, ads: string, match: boolean) => string;
  cashLine: (warPlan: string, baseline: string) => string;
  bridgeStart: string;
  bridgeReceipts: string;
  bridgeExisting: string;
  bridgePartners: string;
  bridgeSettlement: string;
  bridgeAds: string;
  bridgeCarry: string;
  bridgeDrift: string;
  bridgeResidual: string;
  futureNoteLine: (face: string, rate: string, term: number, notes: number) => string;
  unsoldLine: (lots: string, balance: string) => string;
  partnerBalanceLine: (balance: string) => string;
  releasesTitle: string;
  closingsOf: (month: string) => string;
  releasedIn: (month: string) => string;
  farmsTitle: string;
  farmViable: (ratio: string) => string;
  projectedExitAtCurrentPace: string;
  projectedExitFormula: string;
  seeNotesStrategies: string;
}

export const EXODUS_UI: Record<QualityLang, ExodusUiStrings> = {
  en: {
    title: "Exodus",
    subtitle: (lp) =>
      `Return the ${lp} the limited partners of Portafolio Diversificado Alpha LP invested, by the deadline: a chosen share in fractions of promissory notes at 100% of their unpaid balance, the rest in cash. Production is the Plan's required plan in cash mode; every input starts at the real figure.`,
    reset: "Reset to real data",
    verdict: "The verdict",
    verdictFoot: (months, deadline, closings, farms, ads) => `${months} months to ${deadline}. Production is the Plan's required plan: ${closings} closings per month, ${farms} new ${farms === 1 ? "farm" : "farms"}, ${ads} of ad spend per full month.`,
    latestViable: (month) => `The latest month a farm bought with own cash still closes lots before the deadline is ${month}.`,
    noViable: "No farm bought now closes lots before the deadline.",
    versus: "Versus 100% cash",
    discountSaved: "Discount saved",
    discountSavedHint: (ratio) => `Delivered balance × (1 − ${ratio} sale ratio): what selling those notes would have cost`,
    lotsNotNeeded: "Lots not needed",
    lotsNotNeededHint: (baseline, scenario) => `${baseline} lots until the capital is back paying 100% in cash, ${scenario} with notes`,
    monthsEarlier: "Months earlier",
    monthsEarlierHint: (s, b) => `Capital back on ${s} instead of ${b}`,
    never: "not reached",
    inputs: "Inputs",
    notesPct: "Share paid in notes",
    notesPctHint: (target) => `of the LP capital: ${target} of notes at 100% of their unpaid balance`,
    noteSalesCount: (all, farmLots) => `${all} note sales, all · ${farmLots} on farm lots`,
    maxMark: (pct) => `the inventory covers up to ${pct}%`,
    lpCapital: "LP capital to return",
    lpCapitalReal: "fixed — LP_CAPITAL_TO_RETURN",
    deadline: "Deadline",
    deadlineHint: (months) => `${months} months from today`,
    noteSaleRatio: "Note sale ratio",
    noteSaleRatioHint: "Sale price ÷ unpaid balance when a note is sold instead of delivered",
    noteSaleRatioReal: (combined, discount, dSales, financed, fSales, literal) =>
      `${combined} used: per sale, the balance discount_from_upb implies when recorded (${discount} over ${dSales} sales), else price ÷ financed amount (${financed} over ${fSales} sales). The brief's literal price ÷ (price + discount) reads ${literal} because discount_from_upb is a percent, so it is not used.`,
    basis: { combined: "combined", financed: "price ÷ financed", oracle: "Simulator default" },
    excluded: "Excluded note codes",
    excludedHint: "Comma-separated. Never delivered and never sold in the plan.",
    excludedReal: (codes) => `${codes} (dispute)`,
    startingCash: "Starting cash",
    startingCashHint: "Portafolio cash on day one. Payments holds no bank balance, so nothing is assumed.",
    startingCashReal: (kept, owed) => `${kept} kept by the fund so far, ${owed} owed to sponsors today (Plan) — shown, not assumed`,
    inherited: "Pace, farm cost, lags, conversion, funding mix, cycle and seasonality are the Plan's current inputs. Change them there.",
    scenarioName: "Scenario name",
    scenarioPlaceholder: "e.g. 40% in notes, Franklin excluded",
    save: "Save",
    savedScenarios: "Saved scenarios",
    loadOne: "Load a scenario…",
    noneSaved: "None saved yet",
    remove: "Delete",
    months: "Month by month",
    from: (d) => `from ${d}`,
    colMonth: "Month",
    colLots: "Lots closed",
    colFreeAvailable: "Free notes available",
    colDelivered: "Notes delivered",
    colReleases: "Partial releases",
    colFarms: "Cash farms",
    colSold: "Notes sold",
    colCashIn: "Portafolio cash in",
    colAds: "Ad spend",
    colCashPaid: "Cash paid to LPs",
    colCumNotes: "Returned in notes",
    colCumCash: "Returned in cash",
    colCumTotal: "Returned in all",
    by: (d) => `By ${d}`,
    monthsFoot:
      "The first row runs from today to the end of the month, so its closings are prorated. Closings, new farms and ad spend are the Plan's required plan month for month. Each month: closings and their down payments, then sales of every note not reserved for delivery, then the farm waterfalls (fixed interest to the partner until the lot is released, profit share to the sponsor's capital then 50/50, own capital to Portafolio), then ad spend, then Portafolio cash buys settlement by the highest settlement per dollar, and whatever is left is paid to the LPs. Free notes are delivered the month they appear; once the note target is met every further note is sold.",
    inventory: "Today's note inventory",
    inventorySummary: (sold, inactive) => `${sold} sold and ${inactive} not active are left out.`,
    colNote: "Note",
    colFarm: "Farm",
    colUpb: "Unpaid balance",
    colRate: "Rate",
    colTerm: "Term",
    colStatus: "Status",
    colReleaseCost: "Release cost today",
    colSettlement: "Settlement per $",
    remaining: (n) => `${n} left`,
    status: {
      free: "Free — deliverable now",
      needs_release: "Needs a partial release",
      profit_share: "Townson farm — always sold",
      excluded: "Excluded",
      no_farm: "No farm on record — left out",
    },
    statusShort: { free: "Free", needs_release: "Partial release", profit_share: "Townson", excluded: "Excluded", no_farm: "No farm" },
    inventoryFoot:
      "Active, unsold, non-test notes. Own-capital farms (Promised Valley, Olney, Red River 1) deliver at once; fixed-interest lots deliver once their outstanding balance is paid by a partial payoff, whose cost today is the lot's outstanding balance in Payments and grows every month; profit-share farms (Townson) never deliver. Notes without a farm on record cannot be classified and take no part in the plan.",
    packageTitle: "Delivered package",
    packageEmpty: "Nothing is delivered in notes at this percentage.",
    totalUpb: "Total unpaid balance",
    notesCount: "Notes",
    avgRate: "Average rate",
    avgTerm: "Average term",
    avgRemaining: "Average months left",
    upbWeighted: "weighted by balance",
    notesCountHint: "delivered in total; the last one may be a fraction",
    ofLpCapital: (p) => `${p} of the LP capital`,
    fromExistingFree: "Free notes held today",
    fromExistingReleased: "Today's notes after a partial release",
    fromProjectedFree: "Future notes of own-capital farms",
    fromProjectedReleased: "Future notes after a partial release",
    fromCashFarm: "Future notes of farms bought with own cash",
    notes: (n) => `${n} ${n === 1 ? "note" : "notes"}`,
    sources: "Where the numbers come from",
    sourcesTitle: "Production, cash and what differs from the Plan",
    productionLine: (lots, farms, ads, match) => `Production replays the Plan's required plan: ${lots} lots closed, ${farms} farms, ${ads} of ad spend — ${match ? "every month's closings match the Plan's row" : "some months differ from the Plan's rows"}.`,
    cashLine: (wp, baseline) => `Cash is not the same number by design. The Plan's cash mode lands at ${wp}; paying 100% in cash the Exodus pays ${baseline} to the LPs. The bridge:`,
    bridgeStart: "Starting position: the Exodus starts from the starting cash above, the Plan from cash kept − owed today",
    bridgeReceipts: "Receipts: real sale ratio on the amortized balance instead of the Simulator's note-sale percent of the face value",
    bridgeExisting: "Today's notes sold, net of the partners' share (the Plan does not model them)",
    bridgePartners: "Partners paid lot by lot through the waterfalls instead of every farm's whole cost plus the take",
    bridgeSettlement: "Partial releases and cash farms",
    bridgeAds: "Ad spend paid (the Plan shows it without deducting it)",
    bridgeCarry: "Cash still negative at the deadline, never paid",
    bridgeDrift: "Replay drift (the Plan's rows are rounded)",
    bridgeResidual: "Unexplained",
    futureNoteLine: (face, rate, term, notes) => `Every future note is given the Simulator's averages: ${face} of face value (sale price − down payment), ${rate} and ${term} months (means of ${notes} farm notes), amortized monthly.`,
    unsoldLine: (lots, balance) => `${lots} fixed-interest lots never close in the plan and carry ${balance} of partner balance at the deadline.`,
    partnerBalanceLine: (b) => `Partner balances the plan leaves unpaid at the deadline: ${b}.`,
    releasesTitle: "Partial releases in this scenario",
    closingsOf: (month) => `${month} closings`,
    releasedIn: (month) => `released ${month}`,
    farmsTitle: "Farms bought with own cash in this scenario",
    farmViable: (ratio) => `settlement per dollar ${ratio}`,
    projectedExitAtCurrentPace: "Projected exit at current pace",
    projectedExitFormula: "remaining ÷ era average net profit per lot ÷ trailing closings per month",
    seeNotesStrategies: "See sell, hold, or deliver on Cash flow →",
  },
  es: {
    title: "Exodus",
    subtitle: (lp) =>
      `Devolver los ${lp} que invirtieron los limited partners de Portafolio Diversificado Alpha LP antes de la fecha límite: una parte elegida en fracciones de pagarés al 100% de su saldo insoluto y el resto en efectivo. La producción es el plan requerido del Plan en modo efectivo; cada dato parte de la cifra real.`,
    reset: "Volver a los datos reales",
    verdict: "El veredicto",
    verdictFoot: (months, deadline, closings, farms, ads) => `${months} meses hasta el ${deadline}. La producción es el plan requerido del Plan: ${closings} cierres por mes, ${farms} ${farms === 1 ? "finca nueva" : "fincas nuevas"}, ${ads} de publicidad por mes completo.`,
    latestViable: (month) => `El último mes en que una finca comprada con efectivo propio aún cierra lotes antes de la fecha límite es ${month}.`,
    noViable: "Ninguna finca comprada ahora cierra lotes antes de la fecha límite.",
    versus: "Frente a 100% en efectivo",
    discountSaved: "Descuento ahorrado",
    discountSavedHint: (ratio) => `Saldo entregado × (1 − razón de venta ${ratio}): lo que habría costado vender esos pagarés`,
    lotsNotNeeded: "Lotes que no hacen falta",
    lotsNotNeededHint: (baseline, scenario) => `${baseline} lotes hasta devolver el capital pagando 100% en efectivo, ${scenario} con pagarés`,
    monthsEarlier: "Meses antes",
    monthsEarlierHint: (s, b) => `Capital devuelto el ${s} en lugar del ${b}`,
    never: "no se alcanza",
    inputs: "Datos de entrada",
    notesPct: "Parte pagada en pagarés",
    notesPctHint: (target) => `del capital de los LP: ${target} en pagarés al 100% de su saldo insoluto`,
    noteSalesCount: (all, farmLots) => `${all} ventas de pagarés, todas · ${farmLots} en lotes de finca`,
    maxMark: (pct) => `el inventario cubre hasta ${pct}%`,
    lpCapital: "Capital de los LP a devolver",
    lpCapitalReal: "fijo — LP_CAPITAL_TO_RETURN",
    deadline: "Fecha límite",
    deadlineHint: (months) => `${months} meses desde hoy`,
    noteSaleRatio: "Razón de venta de pagarés",
    noteSaleRatioHint: "Precio de venta ÷ saldo insoluto cuando un pagaré se vende en vez de entregarse",
    noteSaleRatioReal: (combined, discount, dSales, financed, fSales, literal) =>
      `${combined} usado: por venta, el saldo que implica discount_from_upb cuando está registrado (${discount} en ${dSales} ventas), si no precio ÷ monto financiado (${financed} en ${fSales} ventas). La fórmula literal del brief precio ÷ (precio + descuento) da ${literal} porque discount_from_upb es un porcentaje, así que no se usa.`,
    basis: { combined: "combinada", financed: "precio ÷ financiado", oracle: "valor del Simulador" },
    excluded: "Pagarés excluidos",
    excludedHint: "Separados por coma. Nunca se entregan ni se venden en el plan.",
    excludedReal: (codes) => `${codes} (en disputa)`,
    startingCash: "Efectivo inicial",
    startingCashHint: "Efectivo de Portafolio el primer día. Payments no registra saldo bancario, así que no se supone nada.",
    startingCashReal: (kept, owed) => `${kept} retenidos por el fondo hasta hoy, ${owed} adeudados a los sponsors hoy (Plan) — se muestran, no se suponen`,
    inherited: "Ritmo, costo de finca, plazos, conversión, mezcla de inversionistas, ciclo y estacionalidad son los datos actuales del Plan. Cámbielos allí.",
    scenarioName: "Nombre del escenario",
    scenarioPlaceholder: "p. ej. 40% en pagarés, Franklin excluido",
    save: "Guardar",
    savedScenarios: "Escenarios guardados",
    loadOne: "Cargar un escenario…",
    noneSaved: "Ninguno guardado aún",
    remove: "Borrar",
    months: "Mes a mes",
    from: (d) => `desde el ${d}`,
    colMonth: "Mes",
    colLots: "Lotes cerrados",
    colFreeAvailable: "Pagarés libres disponibles",
    colDelivered: "Pagarés entregados",
    colReleases: "Pagos parciales de saldo",
    colFarms: "Fincas con efectivo",
    colSold: "Pagarés vendidos",
    colCashIn: "Efectivo que entra a Portafolio",
    colAds: "Publicidad",
    colCashPaid: "Efectivo pagado a los LP",
    colCumNotes: "Devuelto en pagarés",
    colCumCash: "Devuelto en efectivo",
    colCumTotal: "Devuelto en total",
    by: (d) => `Al ${d}`,
    monthsFoot:
      "La primera fila va de hoy al fin de mes, así que sus cierres están prorrateados. Cierres, fincas nuevas y publicidad son el plan requerido del Plan mes por mes. Cada mes: los cierres y sus enganches, luego la venta de cada pagaré no reservado para entrega, luego las cascadas por finca (interés fijo al socio hasta pagar el saldo del lote, participación al capital del sponsor y luego 50/50, capital propio a Portafolio), luego la publicidad, luego el efectivo de Portafolio compra liquidación por la mayor liquidación por dólar, y lo que queda se paga a los LP. Los pagarés libres se entregan el mes en que aparecen; alcanzada la meta en pagarés, todo pagaré adicional se vende.",
    inventory: "Inventario de pagarés hoy",
    inventorySummary: (sold, inactive) => `Se dejan fuera ${sold} vendidos y ${inactive} no activos.`,
    colNote: "Pagaré",
    colFarm: "Finca",
    colUpb: "Saldo insoluto",
    colRate: "Tasa",
    colTerm: "Plazo",
    colStatus: "Estado",
    colReleaseCost: "Costo de pago del saldo hoy",
    colSettlement: "Liquidación por $",
    remaining: (n) => `quedan ${n}`,
    status: {
      free: "Libre — entregable ya",
      needs_release: "Requiere pago parcial del saldo",
      profit_share: "Finca Townson — siempre se vende",
      excluded: "Excluido",
      no_farm: "Sin finca registrada — fuera del plan",
    },
    statusShort: { free: "Libre", needs_release: "Pago parcial", profit_share: "Townson", excluded: "Excluido", no_farm: "Sin finca" },
    inventoryFoot:
      "Pagarés activos, no vendidos y no de prueba. Las fincas de capital propio (Promised Valley, Olney, Red River 1) se entregan de inmediato; los lotes de interés fijo se entregan cuando su saldo se paga con un pago parcial, cuyo costo hoy es el saldo pendiente del lote en Payments y crece cada mes; las fincas de participación (Townson) nunca se entregan. Los pagarés sin finca registrada no pueden clasificarse y no participan en el plan.",
    packageTitle: "Paquete entregado",
    packageEmpty: "A este porcentaje no se entrega nada en pagarés.",
    totalUpb: "Saldo insoluto total",
    notesCount: "Pagarés",
    avgRate: "Tasa promedio",
    avgTerm: "Plazo promedio",
    avgRemaining: "Meses restantes promedio",
    upbWeighted: "ponderado por saldo",
    notesCountHint: "entregados en total; el último puede ser una fracción",
    ofLpCapital: (p) => `${p} del capital de los LP`,
    fromExistingFree: "Pagarés libres en cartera hoy",
    fromExistingReleased: "Pagarés de hoy tras un pago parcial del saldo",
    fromProjectedFree: "Pagarés futuros de fincas de capital propio",
    fromProjectedReleased: "Pagarés futuros tras un pago parcial del saldo",
    fromCashFarm: "Pagarés futuros de fincas compradas con efectivo propio",
    notes: (n) => `${n} ${n === 1 ? "pagaré" : "pagarés"}`,
    sources: "De dónde salen los números",
    sourcesTitle: "Producción, efectivo y qué difiere del Plan",
    productionLine: (lots, farms, ads, match) => `La producción repite el plan requerido del Plan: ${lots} lotes cerrados, ${farms} fincas, ${ads} de publicidad — ${match ? "los cierres de cada mes coinciden con la fila del Plan" : "algunos meses difieren de las filas del Plan"}.`,
    cashLine: (wp, baseline) => `El efectivo no es la misma cifra por diseño. El modo efectivo del Plan llega a ${wp}; pagando 100% en efectivo el Exodus paga ${baseline} a los LP. El puente:`,
    bridgeStart: "Posición inicial: el Exodus parte del efectivo inicial de arriba, el Plan de efectivo retenido − adeudado hoy",
    bridgeReceipts: "Ingresos: razón de venta real sobre el saldo amortizado en vez del porcentaje de venta del Simulador sobre el valor nominal",
    bridgeExisting: "Pagarés de hoy vendidos, netos de la parte de los socios (el Plan no los modela)",
    bridgePartners: "Socios pagados lote por lote por las cascadas en vez del costo íntegro de cada finca más la participación",
    bridgeSettlement: "Pagos parciales de saldo y fincas con efectivo propio",
    bridgeAds: "Publicidad pagada (el Plan la muestra sin descontarla)",
    bridgeCarry: "Efectivo aún negativo en la fecha límite, nunca pagado",
    bridgeDrift: "Deriva de la repetición (las filas del Plan están redondeadas)",
    bridgeResidual: "Sin explicar",
    futureNoteLine: (face, rate, term, notes) => `Cada pagaré futuro recibe los promedios del Simulador: ${face} de valor nominal (precio de venta − enganche), ${rate} y ${term} meses (medias de ${notes} pagarés de fincas), amortizado mensualmente.`,
    unsoldLine: (lots, balance) => `${lots} lotes de interés fijo nunca cierran en el plan y cargan ${balance} de saldo de socio en la fecha límite.`,
    partnerBalanceLine: (b) => `Saldos de socios que el plan deja sin pagar en la fecha límite: ${b}.`,
    releasesTitle: "Pagos parciales de saldo en este escenario",
    closingsOf: (month) => `cierres de ${month}`,
    releasedIn: (month) => `pagado ${month}`,
    farmsTitle: "Fincas compradas con efectivo propio en este escenario",
    farmViable: (ratio) => `liquidación por dólar ${ratio}`,
    projectedExitAtCurrentPace: "Salida proyectada al ritmo actual",
    projectedExitFormula: "restante ÷ utilidad neta promedio de la era por lote ÷ cierres/mes recientes",
    seeNotesStrategies: "Ver vender, cobrar o entregar en Flujo de efectivo →",
  },
};
