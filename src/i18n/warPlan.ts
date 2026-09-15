import type { FarmGradeVerdict, MixDealType, TargetMode, WarPlanColumnId, WarPlanFlag } from "@/domain";
import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** UI chrome for /warplan. Domain verdict / rotation headline stay in English for now. */
export interface WarPlanUiStrings {
  title: string;
  subtitle: (eraSince: string | null) => string;
  reset: string;
  inputsAria: string;
  target: string;
  deadline: string;
  monthsFromToday: (n: string) => string;
  targetMode: string;
  modeOption: Record<TargetMode, string>;
  modeLabel: Record<TargetMode, string>;
  modeShort: Record<TargetMode, string>;
  modeHintCash: string;
  modeHintProfit: string;
  keptOwed: (kept: string, owed: string) => string;
  lotsPerFarm: string;
  lotsPerFarmReal: (n: string) => string;
  lotsPerFarmHint: string;
  farmCost: string;
  noPurchase: (era: string) => string;
  recentCost: (amount: string, era: string, farms: string, perLot: string) => string;
  allTimeCost: (amount: string, perLot: string) => string;
  farmCostHint: (lots: string, recent: string) => string;
  adSpend: string;
  adSpendReal: string;
  adSpendHint: string;
  conversion: string;
  conversionIncl: (withCanc: string, closed: string, cohort: string, live: string) => string;
  conversionHint: (rate: string | null, cancelled: string, allCancelled: string) => string;
  farmLag: string;
  farmLagReal: (months: string, farms: number) => string;
  farmLagNone: string;
  farmLagHint: (median: string) => string;
  noteLag: string;
  noteLagReal: (n: string) => string;
  noteLagHint: string;
  capitalTurn: string;
  neverReturns: string;
  mo: string;
  capitalTurnHint: string;
  cycleNone: (era: string | null) => string;
  cycleReal: (days: string, months: string, detail: string) => string;
  cycleFreed: (n: number) => string;
  cycleProjected: (n: number) => string;
  cycleExcluded: (names: string) => string;
  requiredPace: string;
  paceShapeAria: string;
  seasonal: string;
  flat: string;
  paceHintNone: (reason: string) => string;
  paceHintSeasonal: string;
  paceHintFlat: string;
  seasonalityNone: (reason: string, have: number, need: number, since: string, closings: string, excluded: number) => string;
  seasonalityPeak: (closings: string, since: string, peak: string, peakF: string, trough: string, troughF: string, floor: string) => string;
  noDatedClosings: string;
  /** Translate domain seasonality.reason codes shown in the inputs. */
  seasonalityReason: (reason: string | null) => string;
  investorMix: string;
  investorMixHint: string;
  scenarioName: string;
  scenarioPlaceholder: string;
  save: string;
  savedScenarios: string;
  loadScenario: string;
  noneSaved: string;
  delete: string;
  verdict: string;
  measuredOn: (mode: string) => string;
  verdictFoot: (months: string, deadline: string, inventory: string, landLag: string, landWord: string, closeLag: string, notePart: string, purchasePart: string) => string;
  noteLagPart: (n: number) => string;
  lastPurchase: (month: string) => string;
  noPurchaseConverts: string;
  cashStart: (kept: string, owed: string, capital: string, take: string, start: string) => string;
  rotationAria: string;
  rotationTitle: string;
  rotationScope: string;
  turnsIncomplete: (incomplete: number, farms: number, word: string) => string;
  peakOutstanding: string;
  peakHint: string;
  totalDeployed: string;
  totalDeployedHint: (farms: number, word: string, recycled: string) => string;
  turnsNeeded: string;
  turnsNeededHint: (completed: number, cycle: string) => string;
  turns: (n: string) => string;
  firstTurnBy: string;
  lastTurnCompletes: (month: string) => string;
  noTurnCompletes: string;
  noFarmToBuy: string;
  turnsPerInvestor: string;
  investorLine: (peak: string, deployed: string, fresh: string) => string;
  benchmarkCycle: string;
  daysMonths: (days: string, months: string, projected: boolean) => string;
  fundedToFree: (investor: string, funded: string, freeLabel: string, freeDate: string, median: string, since: string) => string;
  projectedFree: string;
  capitalBack: string;
  medianCycles: (n: number, kind: string) => string;
  freed: string;
  projected: string;
  farmsFunded: (since: string) => string;
  curveAria: string;
  noBenchmark: (since: string | null) => string;
  excludedRecord: (list: string, before: string) => string;
  turnsCompleted: string;
  capitalOutstanding: string;
  nextLiberation: string;
  everyFarmVs: string;
  projectedBenchmarkNote: (since: string | null) => string;
  noOtherFarm: string;
  gradeCol: {
    farm: string;
    daysIn: string;
    returned: string;
    benchmarkSameDay: (name: string) => string;
    vsBenchmark: string;
    liberation: string;
    grade: string;
  };
  pts: (n: string) => string;
  ahead: (d: string) => string;
  behind: (d: string) => string;
  freedOn: (d: string) => string;
  coveredAwaiting: string;
  lotsToCover: (n: string) => string;
  grade: Record<FarmGradeVerdict, string>;
  threePlansAria: string;
  beyond10: string;
  onOrBefore: (d: string) => string;
  afterDeadline: (d: string) => string;
  notReached: string;
  daysEarlierPace: (n: string) => string;
  daysLaterPace: (n: string) => string;
  lotsMonth: string;
  realDealTerms: string;
  farmsToBuy: string;
  lastBy: (month: string) => string;
  capitalToRaise: string;
  unfunded: string;
  peakOutstandingShort: string;
  totalDeployedShort: string;
  reservationsMonth: string;
  adSpendMonth: string;
  noteSalesMonth: string;
  lotsClosedByDeadline: string;
  inventoryAtDeadline: string;
  cumulativeAtDeadline: (mode: string) => string;
  turnsNotBack: string;
  ofFarms: (a: number, b: number) => string;
  redFlags: string;
  months: (n: number) => string;
  monthWord: (n: number) => string;
  shownMonthByMonth: string;
  showMonthByMonth: string;
  monthByMonth: (title: string) => string;
  planShownAria: string;
  columnShort: Record<WarPlanColumnId, string>;
  flag: Record<WarPlanFlag, string>;
  deal: Record<MixDealType, string>;
  mixCol: { order: string; sponsor: string; deal: string; rate: string; capital: string; orderCol: string };
  fundingOrder: string;
  shareOfGross: string;
  annualRate: string;
  sponsorsInMix: (n: number) => string;
  addSponsor: string;
  newSponsor: (n: number) => string;
  moveUp: (name: string) => string;
  moveDown: (name: string) => string;
  remove: (name: string) => string;
  monthCol: {
    month: string;
    farmsBought: string;
    capitalDeployed: string;
    lotsClosed: string;
    lotsClosedSeasonal: string;
    flatAverage: string;
    notesSold: string;
    adSpend: string;
    cumulative: (mode: string) => string;
    capitalOwed: string;
    returned: (name: string) => string;
    inventory: string;
    flags: string;
  };
  fromDate: (d: string) => string;
  byDeadline: (d: string) => string;
  flagged: (n: number) => string;
  none: string;
  monthFoot: string;
  monthFootSeasonal: string;
  days: (n: number) => string;
}

export const WAR_PLAN_UI: Record<QualityLang, WarPlanUiStrings> = {
  en: {
    title: "War Plan",
    subtitle: (era) =>
      `The Oracle in reverse: the Oracle takes a pace and returns a date; the War Plan takes the deadline and returns what must happen — closings, farms and when to buy them, capital and who funds it, ad spend, note sales, and what comes back to every sponsor. Every input starts at the real figure${era ? `; rates and trends are measured ${era}, when sales operations started in earnest` : ""}.`,
    reset: "Reset to real data",
    inputsAria: "Inputs",
    target: "Target",
    deadline: "Deadline",
    monthsFromToday: (n) => `${n} months from today`,
    targetMode: "Target mode",
    modeOption: {
      profit_at_closing: "Net profit at closing",
      cash_in_bank: "Cash in the bank, sponsors paid out",
    },
    modeLabel: { profit_at_closing: "net profit at closing", cash_in_bank: "cash in the bank" },
    modeShort: { profit_at_closing: "net profit", cash_in_bank: "cash" },
    modeHintCash: "Down payments + note sales − farm outlays − every sponsor's capital and take",
    modeHintProfit: "(price − land) × (1 − take), booked at closing",
    keptOwed: (kept, owed) => `${kept} kept, ${owed} owed`,
    lotsPerFarm: "Lots per new farm",
    lotsPerFarmReal: (n) => `${n} (mean total_lots)`,
    lotsPerFarmHint: "The brief's 10; the farm cost follows until you edit it",
    farmCost: "Farm cost",
    noPurchase: (era) => `no purchase ${era}`,
    recentCost: (amount, era, farms, perLot) => `${amount} recent${era}, ${era} (${farms}: ${perLot}/lot)`,
    allTimeCost: (amount, perLot) => `${amount} all-time (${perLot}/lot)`,
    farmCostHint: (lots, recent) => `${lots} lots × the per-lot cost of the ${recent}`,
    adSpend: "Ad spend per closing",
    adSpendReal: "no source in the data — assumption",
    adSpendHint: "Monthly ads = closings ÷ conversion × this",
    conversion: "Reservation → closing conversion",
    conversionIncl: (withCanc, closed, cohort, live) => `${withCanc} incl. cancellations (${closed} of ${cohort}) · ${live} live only`,
    conversionHint: (rate, cancelled, all) =>
      rate === null ? "Cancelled reservations count as failures" : `Cancellation rate ${rate} — ${cancelled} matured reservations cancelled, ${all} cancelled in all`,
    farmLag: "Farm purchase → first closing",
    farmLagReal: (months, farms) => `${months} mo (median of ${farms} farms)`,
    farmLagNone: "no farm has closed a lot yet",
    farmLagHint: (median) => `Plus ${median} median days to close a reservation`,
    noteLag: "Note-sale lag",
    noteLagReal: (n) => `${n} mo (closing → note sale)`,
    noteLagHint: "When the financed balance turns into cash",
    capitalTurn: "Capital turn",
    neverReturns: "never returns",
    mo: "mo",
    capitalTurnHint: "Farm bought → lots close → notes sold → capital back → next farm. Blank: capital never rotates.",
    cycleNone: (era) => `no farm freed${era ? ` ${era}` : ""}, none projectable`,
    cycleReal: (days, months, detail) => `${days} days / ${months} mo (${detail})`,
    cycleFreed: (n) => `median of ${n} freed ${n === 1 ? "farm" : "farms"}`,
    cycleProjected: (n) => `projected from ${n} captive ${n === 1 ? "farm" : "farms"}`,
    cycleExcluded: (names) => ` · ${names} freed before then: on record, not measured`,
    requiredPace: "Required pace",
    paceShapeAria: "Required pace shape",
    seasonal: "Seasonal",
    flat: "Flat",
    paceHintNone: (reason) => `Every month asks the same average — ${reason}`,
    paceHintSeasonal: "Each month asks what its calendar month really delivers; the flat average sits alongside",
    paceHintFlat: "Every month asks the same average",
    seasonalityNone: (reason, have, need, since, closings, excluded) =>
      `${reason}: ${have} of ${need} months ${since} (${closings} closings${excluded > 0 ? `, ${excluded} earlier left out` : ""})`,
    seasonalityPeak: (closings, since, peak, peakF, trough, troughF, floor) =>
      `${closings} closings${since} · peak ${peak} ×${peakF}, trough ${trough} ×${troughF} (floor ${floor})`,
    noDatedClosings: "no dated closings",
    seasonalityReason: (reason) =>
      reason === "not enough history for seasonality" ? "not enough history for seasonality" : reason ?? "no seasonal profile",
    investorMix: "Investor mix",
    investorMixHint: "New farms are funded top to bottom; each new lot pays its own farm's deal. Prefilled from the sponsors' real positions.",
    scenarioName: "Scenario name",
    scenarioPlaceholder: "e.g. Two farms before spring",
    save: "Save",
    savedScenarios: "Saved scenarios",
    loadScenario: "Load a scenario…",
    noneSaved: "None saved yet",
    delete: "Delete",
    verdict: "The verdict",
    measuredOn: (mode) => `Measured on ${mode}. `,
    verdictFoot: (months, deadline, inventory, landLag, landWord, closeLag, notePart, purchasePart) =>
      `${months} months to ${deadline}, ${inventory} lots in inventory today (available + reserved). A new farm needs ${landLag} ${landWord} to its first closing and ${closeLag} more to close a reservation${notePart}${purchasePart}`,
    noteLagPart: (n) => `, then ${n} to sell the note`,
    lastPurchase: (month) => `, so the last useful purchase is ${month}.`,
    noPurchaseConverts: ", so no farm bought now converts before the deadline.",
    cashStart: (kept, owed, capital, take, start) =>
      ` The fund has kept ${kept} and owes sponsors ${owed} (${capital} of capital and ${take} of accrued take), so the plan starts at ${start}.`,
    rotationAria: "Capital rotation",
    rotationTitle: "Capital rotation — the required plan",
    rotationScope: "Land only: houses, receivables and overhead are out of scope by design.",
    turnsIncomplete: (incomplete, farms, word) => `${incomplete} of ${farms} ${word} cannot complete before the deadline`,
    peakOutstanding: "Peak capital outstanding",
    peakHint: "The most land capital out at once — what actually has to be raised",
    totalDeployed: "Total capital deployed",
    totalDeployedHint: (farms, word, recycled) => `Every purchase over ${farms} ${word}, counting recycled dollars each time · ${recycled} recycled`,
    turnsNeeded: "Turns needed",
    turnsNeededHint: (completed, cycle) => `Deployed ÷ peak · ${completed} completed so far${cycle}`,
    turns: (n) => `${n} ${n === "1" ? "turn" : "turns"}`,
    firstTurnBy: "First turn must start by",
    lastTurnCompletes: (month) => `Last turn completes ${month}`,
    noTurnCompletes: "No planned turn completes before the deadline",
    noFarmToBuy: "No farm to buy",
    turnsPerInvestor: "Turns per investor",
    investorLine: (peak, deployed, fresh) => `${peak} out at peak · ${deployed} deployed · ${fresh} fresh`,
    benchmarkCycle: "Benchmark cycle",
    daysMonths: (days, months, projected) => `${days} days · ${months} months${projected ? " (projected)" : ""}`,
    fundedToFree: (investor, funded, freeLabel, freeDate, median, since) =>
      `${investor} funded ${funded} → ${freeLabel} ${freeDate}${median}${since}`,
    projectedFree: "projected free",
    capitalBack: "100 % of capital back",
    medianCycles: (n, kind) => ` · median of ${n} ${kind} cycles`,
    freed: "freed",
    projected: "projected",
    farmsFunded: (since) => ` · farms funded ${since}`,
    curveAria: "Capital returned over the benchmark cycle",
    noBenchmark: (since) =>
      `No sponsor-funded farm${since ? ` funded ${since}` : ""} has been freed and none can be projected, so there is no benchmark cycle yet.`,
    excludedRecord: (list, before) =>
      `On record, not measured: ${list} — funded before ${before}, so real money but not today's pace.`,
    turnsCompleted: "Turns completed",
    capitalOutstanding: "Capital outstanding",
    nextLiberation: "Next liberation",
    everyFarmVs: "Every farm against the benchmark",
    projectedBenchmarkNote: (since) =>
      `No sponsor-funded farm${since ? ` funded ${since}` : ""} has returned 100 % of its capital yet, so the benchmark is the median of every captive farm's projected liberation at the current pace (campaigns.ts) and no farm can be graded against a real curve. The first liberation${since ? " of a farm funded in the era" : ""} turns this into a measured cycle.`,
    noOtherFarm: "No other sponsor-funded farm to grade.",
    gradeCol: {
      farm: "Farm",
      daysIn: "Days in",
      returned: "Returned",
      benchmarkSameDay: (name) => `${name} at the same day`,
      vsBenchmark: "vs benchmark",
      liberation: "Liberation",
      grade: "Grade",
    },
    pts: (n) => `${n} pts`,
    ahead: (d) => `${d} ahead`,
    behind: (d) => `${d} behind`,
    freedOn: (d) => `freed ${d}`,
    coveredAwaiting: "covered, awaiting payout",
    lotsToCover: (n) => `${n} lots to cover`,
    grade: { benchmark: "Benchmark", ahead: "Ahead", on_pace: "On pace", behind: "Behind", unrated: "Unrated" },
    threePlansAria: "Three plans",
    beyond10: "beyond 10 years",
    onOrBefore: (d) => `on or before the ${d} deadline`,
    afterDeadline: (d) => `after the ${d} deadline`,
    notReached: "the target is not reached within the horizon",
    daysEarlierPace: (n) => `${n} days earlier than the current pace`,
    daysLaterPace: (n) => `${n} days later than the current pace`,
    lotsMonth: "Lots / month",
    realDealTerms: "per the War Plan's real deal terms",
    farmsToBuy: "Farms to buy",
    lastBy: (month) => ` · last by ${month}`,
    capitalToRaise: "Capital to raise",
    unfunded: "Unfunded",
    peakOutstandingShort: "Peak outstanding",
    totalDeployedShort: "Total deployed",
    reservationsMonth: "Reservations / month",
    adSpendMonth: "Ad spend / month",
    noteSalesMonth: "Note sales / month",
    lotsClosedByDeadline: "Lots closed by the deadline",
    inventoryAtDeadline: "Inventory at the deadline",
    cumulativeAtDeadline: (mode) => `Cumulative ${mode} at the deadline`,
    turnsNotBack: "Turns not back by the deadline",
    ofFarms: (a, b) => `${a} of ${b}`,
    redFlags: "Red flags",
    months: (n) => `${n} ${n === 1 ? "month" : "months"}`,
    monthWord: (n) => (n === 1 ? "month" : "months"),
    shownMonthByMonth: "Shown month by month",
    showMonthByMonth: "Show month by month",
    monthByMonth: (title) => `Month by month — ${title}`,
    planShownAria: "Plan shown",
    columnShort: { current_pace: "Current pace", required_plan: "Required plan", required_plus_buffer: "+1 buffer farm" },
    flag: {
      shortfall: "Closings exceed inventory",
      too_late: "Farm bought too late to convert",
      turn_incomplete: "Capital turn cannot complete before the deadline",
    },
    deal: { fixed_interest: "Fixed interest", profit_share: "Profit share", own_capital: "Own capital" },
    mixCol: { order: "#", sponsor: "Sponsor", deal: "Deal", rate: "Rate", capital: "Capital for new farms", orderCol: "Order" },
    fundingOrder: "Funding order",
    shareOfGross: "Share of gross",
    annualRate: "Annual rate",
    sponsorsInMix: (n) => `${n} ${n === 1 ? "sponsor" : "sponsors"} in the mix`,
    addSponsor: "Add sponsor",
    newSponsor: (n) => `Sponsor ${n}`,
    moveUp: (name) => `Move ${name} up`,
    moveDown: (name) => `Move ${name} down`,
    remove: (name) => `Remove ${name}`,
    monthCol: {
      month: "Month",
      farmsBought: "Farms bought",
      capitalDeployed: "Capital deployed",
      lotsClosed: "Lots closed",
      lotsClosedSeasonal: "Lots closed (seasonal)",
      flatAverage: "Flat average",
      notesSold: "Notes sold",
      adSpend: "Ad spend",
      cumulative: (mode) => `Cumulative ${mode}`,
      capitalOwed: "Capital owed",
      returned: (name) => `Returned · ${name}`,
      inventory: "Inventory",
      flags: "Flags",
    },
    fromDate: (d) => `from ${d}`,
    byDeadline: (d) => `By ${d}`,
    flagged: (n) => `${n} flagged`,
    none: "none",
    monthFoot:
      "The first row runs from today to the end of the month, so its closings are prorated. Capital owed is what sponsors are still due at month end (today's positions repaid pro rata as the existing lots close, new farms as their lots close). Red rows are months where the required closings exceed the inventory, a farm is bought too late to convert before the deadline, or a farm's capital turn cannot complete before it.",
    monthFootSeasonal:
      " Seasonal closings follow the realm's month-of-year profile of real closing dates (smoothed, floored at 25% of the flat rate) and average out to the flat pace over the plan.",
    days: (n) => `${n} ${Math.abs(n) === 1 ? "day" : "days"}`,
  },
  es: {
    title: "Plan de Guerra",
    subtitle: (era) =>
      `El Oráculo al revés: el Oráculo toma un ritmo y devuelve una fecha; el Plan de Guerra toma la fecha límite y devuelve lo que debe pasar — cierres, fincas y cuándo comprarlas, capital y quién lo fondea, gasto en anuncios, ventas de pagarés y lo que vuelve a cada sponsor. Cada entrada empieza en la cifra real${era ? `; tasas y tendencias se miden ${era}, cuando la operación de ventas arrancó en serio` : ""}.`,
    reset: "Restablecer a datos reales",
    inputsAria: "Entradas",
    target: "Meta",
    deadline: "Fecha límite",
    monthsFromToday: (n) => `${n} meses desde hoy`,
    targetMode: "Modo de meta",
    modeOption: {
      profit_at_closing: "Utilidad neta al cierre",
      cash_in_bank: "Efectivo en banco, sponsors pagados",
    },
    modeLabel: { profit_at_closing: "utilidad neta al cierre", cash_in_bank: "efectivo en banco" },
    modeShort: { profit_at_closing: "utilidad neta", cash_in_bank: "efectivo" },
    modeHintCash: "Enganches + ventas de pagarés − desembolsos de finca − capital y parte de cada sponsor",
    modeHintProfit: "(precio − tierra) × (1 − parte), registrado al cierre",
    keptOwed: (kept, owed) => `${kept} retenidos, ${owed} adeudados`,
    lotsPerFarm: "Lotes por finca nueva",
    lotsPerFarmReal: (n) => `${n} (media total_lots)`,
    lotsPerFarmHint: "Los 10 del brief; el costo de finca sigue hasta que lo edites",
    farmCost: "Costo de finca",
    noPurchase: (era) => `sin compra ${era}`,
    recentCost: (amount, era, farms, perLot) => `${amount} reciente${era}, ${era} (${farms}: ${perLot}/lote)`,
    allTimeCost: (amount, perLot) => `${amount} de por vida (${perLot}/lote)`,
    farmCostHint: (lots, recent) => `${lots} lotes × el costo por lote de ${recent}`,
    adSpend: "Gasto en anuncios por cierre",
    adSpendReal: "sin fuente en los datos — supuesto",
    adSpendHint: "Anuncios mensuales = cierres ÷ conversión × esto",
    conversion: "Conversión reserva → cierre",
    conversionIncl: (withCanc, closed, cohort, live) => `${withCanc} incl. cancelaciones (${closed} de ${cohort}) · ${live} solo vivas`,
    conversionHint: (rate, cancelled, all) =>
      rate === null ? "Las reservas canceladas cuentan como fallos" : `Tasa de cancelación ${rate} — ${cancelled} reservas maduras canceladas, ${all} canceladas en total`,
    farmLag: "Compra de finca → primer cierre",
    farmLagReal: (months, farms) => `${months} mes (mediana de ${farms} fincas)`,
    farmLagNone: "ninguna finca ha cerrado un lote aún",
    farmLagHint: (median) => `Más ${median} días medianos para cerrar una reserva`,
    noteLag: "Desfase de venta de pagaré",
    noteLagReal: (n) => `${n} mes (cierre → venta de pagaré)`,
    noteLagHint: "Cuándo el saldo financiado se vuelve efectivo",
    capitalTurn: "Ciclo de capital",
    neverReturns: "nunca regresa",
    mo: "mes",
    capitalTurnHint: "Finca comprada → lotes cierran → pagarés vendidos → capital de vuelta → siguiente finca. Vacío: el capital nunca rota.",
    cycleNone: (era) => `ninguna finca liberada${era ? ` ${era}` : ""}, ninguna proyectable`,
    cycleReal: (days, months, detail) => `${days} días / ${months} mes (${detail})`,
    cycleFreed: (n) => `mediana de ${n} finca${n === 1 ? "" : "s"} liberada${n === 1 ? "" : "s"}`,
    cycleProjected: (n) => `proyectado de ${n} finca${n === 1 ? "" : "s"} cautiva${n === 1 ? "" : "s"}`,
    cycleExcluded: (names) => ` · ${names} liberadas antes: en el registro, no medidas`,
    requiredPace: "Ritmo requerido",
    paceShapeAria: "Forma del ritmo requerido",
    seasonal: "Estacional",
    flat: "Plano",
    paceHintNone: (reason) => `Cada mes pide el mismo promedio — ${reason}`,
    paceHintSeasonal: "Cada mes pide lo que su mes calendario realmente entrega; el promedio plano va al lado",
    paceHintFlat: "Cada mes pide el mismo promedio",
    seasonalityNone: (reason, have, need, since, closings, excluded) =>
      `${reason}: ${have} de ${need} meses ${since} (${closings} cierres${excluded > 0 ? `, ${excluded} anteriores excluidos` : ""})`,
    seasonalityPeak: (closings, since, peak, peakF, trough, troughF, floor) =>
      `${closings} cierres${since} · pico ${peak} ×${peakF}, valle ${trough} ×${troughF} (piso ${floor})`,
    noDatedClosings: "sin cierres fechados",
    seasonalityReason: (reason) =>
      reason === "not enough history for seasonality" ? "no hay suficiente historial para estacionalidad" : reason ?? "sin perfil estacional",
    investorMix: "Mezcla de inversionistas",
    investorMixHint: "Las fincas nuevas se fondean de arriba a abajo; cada lote nuevo paga el trato de su propia finca. Prefill de las posiciones reales de los sponsors.",
    scenarioName: "Nombre del escenario",
    scenarioPlaceholder: "p. ej. Dos fincas antes de la primavera",
    save: "Guardar",
    savedScenarios: "Escenarios guardados",
    loadScenario: "Cargar un escenario…",
    noneSaved: "Ninguno guardado aún",
    delete: "Eliminar",
    verdict: "El veredicto",
    measuredOn: (mode) => `Medido sobre ${mode}. `,
    verdictFoot: (months, deadline, inventory, landLag, landWord, closeLag, notePart, purchasePart) =>
      `${months} meses hasta ${deadline}, ${inventory} lotes en inventario hoy (disponibles + reservados). Una finca nueva necesita ${landLag} ${landWord} hasta su primer cierre y ${closeLag} más para cerrar una reserva${notePart}${purchasePart}`,
    noteLagPart: (n) => `, luego ${n} para vender el pagaré`,
    lastPurchase: (month) => `, así que la última compra útil es ${month}.`,
    noPurchaseConverts: ", así que ninguna finca comprada ahora convierte antes de la fecha límite.",
    cashStart: (kept, owed, capital, take, start) =>
      ` El fondo ha retenido ${kept} y adeuda a sponsors ${owed} (${capital} de capital y ${take} de parte devengada), así que el plan empieza en ${start}.`,
    rotationAria: "Rotación de capital",
    rotationTitle: "Rotación de capital — el plan requerido",
    rotationScope: "Solo tierra: casas, cuentas por cobrar y overhead quedan fuera de alcance por diseño.",
    turnsIncomplete: (incomplete, farms, word) => `${incomplete} de ${farms} ${word} no pueden completarse antes de la fecha límite`,
    peakOutstanding: "Pico de capital pendiente",
    peakHint: "El máximo capital de tierra fuera a la vez — lo que realmente hay que levantar",
    totalDeployed: "Capital total desplegado",
    totalDeployedHint: (farms, word, recycled) => `Cada compra en ${farms} ${word}, contando dólares reciclados cada vez · ${recycled} reciclados`,
    turnsNeeded: "Ciclos necesarios",
    turnsNeededHint: (completed, cycle) => `Desplegado ÷ pico · ${completed} completados hasta ahora${cycle}`,
    turns: (n) => `${n} ${n === "1" ? "ciclo" : "ciclos"}`,
    firstTurnBy: "El primer ciclo debe empezar para",
    lastTurnCompletes: (month) => `El último ciclo termina ${month}`,
    noTurnCompletes: "Ningún ciclo planeado termina antes de la fecha límite",
    noFarmToBuy: "Ninguna finca por comprar",
    turnsPerInvestor: "Ciclos por inversionista",
    investorLine: (peak, deployed, fresh) => `${peak} fuera en el pico · ${deployed} desplegados · ${fresh} frescos`,
    benchmarkCycle: "Ciclo de referencia",
    daysMonths: (days, months, projected) => `${days} días · ${months} meses${projected ? " (proyectado)" : ""}`,
    fundedToFree: (investor, funded, freeLabel, freeDate, median, since) =>
      `${investor} fondeó ${funded} → ${freeLabel} ${freeDate}${median}${since}`,
    projectedFree: "libre proyectado",
    capitalBack: "100 % del capital de vuelta",
    medianCycles: (n, kind) => ` · mediana de ${n} ciclos ${kind}`,
    freed: "liberados",
    projected: "proyectados",
    farmsFunded: (since) => ` · fincas fondeadas ${since}`,
    curveAria: "Capital devuelto a lo largo del ciclo de referencia",
    noBenchmark: (since) =>
      `Ninguna finca fondeada por sponsors${since ? ` fondeada ${since}` : ""} ha sido liberada y ninguna se puede proyectar, así que aún no hay ciclo de referencia.`,
    excludedRecord: (list, before) =>
      `En el registro, no medido: ${list} — fondeadas antes de ${before}, así que es dinero real pero no el ritmo de hoy.`,
    turnsCompleted: "Ciclos completados",
    capitalOutstanding: "Capital pendiente",
    nextLiberation: "Próxima liberación",
    everyFarmVs: "Cada finca contra la referencia",
    projectedBenchmarkNote: (since) =>
      `Ninguna finca fondeada por sponsors${since ? ` fondeada ${since}` : ""} ha devuelto el 100 % de su capital aún, así que la referencia es la mediana de la liberación proyectada de cada finca cautiva al ritmo actual (campaigns.ts) y ninguna finca se puede calificar contra una curva real. La primera liberación${since ? " de una finca fondeada en la era" : ""} convierte esto en un ciclo medido.`,
    noOtherFarm: "Ninguna otra finca fondeada por sponsors para calificar.",
    gradeCol: {
      farm: "Finca",
      daysIn: "Días dentro",
      returned: "Devuelto",
      benchmarkSameDay: (name) => `${name} el mismo día`,
      vsBenchmark: "vs referencia",
      liberation: "Liberación",
      grade: "Nota",
    },
    pts: (n) => `${n} pts`,
    ahead: (d) => `${d} adelante`,
    behind: (d) => `${d} atrás`,
    freedOn: (d) => `liberada ${d}`,
    coveredAwaiting: "cubierta, esperando pago",
    lotsToCover: (n) => `${n} lotes por cubrir`,
    grade: { benchmark: "Referencia", ahead: "Adelante", on_pace: "Al ritmo", behind: "Atrás", unrated: "Sin nota" },
    threePlansAria: "Tres planes",
    beyond10: "más de 10 años",
    onOrBefore: (d) => `en o antes de la fecha límite ${d}`,
    afterDeadline: (d) => `después de la fecha límite ${d}`,
    notReached: "la meta no se alcanza dentro del horizonte",
    daysEarlierPace: (n) => `${n} días antes que el ritmo actual`,
    daysLaterPace: (n) => `${n} días después que el ritmo actual`,
    lotsMonth: "Lotes / mes",
    realDealTerms: "según los términos reales del Plan de Guerra",
    farmsToBuy: "Fincas por comprar",
    lastBy: (month) => ` · última para ${month}`,
    capitalToRaise: "Capital por levantar",
    unfunded: "Sin fondear",
    peakOutstandingShort: "Pico pendiente",
    totalDeployedShort: "Total desplegado",
    reservationsMonth: "Reservas / mes",
    adSpendMonth: "Anuncios / mes",
    noteSalesMonth: "Ventas de pagarés / mes",
    lotsClosedByDeadline: "Lotes cerrados a la fecha límite",
    inventoryAtDeadline: "Inventario a la fecha límite",
    cumulativeAtDeadline: (mode) => `${mode} acumulado a la fecha límite`,
    turnsNotBack: "Ciclos que no vuelven a la fecha límite",
    ofFarms: (a, b) => `${a} de ${b}`,
    redFlags: "Alertas",
    months: (n) => `${n} ${n === 1 ? "mes" : "meses"}`,
    monthWord: (n) => (n === 1 ? "mes" : "meses"),
    shownMonthByMonth: "Mostrado mes a mes",
    showMonthByMonth: "Mostrar mes a mes",
    monthByMonth: (title) => `Mes a mes — ${title}`,
    planShownAria: "Plan mostrado",
    columnShort: { current_pace: "Ritmo actual", required_plan: "Plan requerido", required_plus_buffer: "+1 finca de colchón" },
    flag: {
      shortfall: "Los cierres superan el inventario",
      too_late: "Finca comprada demasiado tarde para convertir",
      turn_incomplete: "El ciclo de capital no puede completarse antes de la fecha límite",
    },
    deal: { fixed_interest: "Interés fijo", profit_share: "Reparto de utilidades", own_capital: "Capital propio" },
    mixCol: { order: "#", sponsor: "Sponsor", deal: "Trato", rate: "Tasa", capital: "Capital para fincas nuevas", orderCol: "Orden" },
    fundingOrder: "Orden de fondeo",
    shareOfGross: "Parte de bruta",
    annualRate: "Tasa anual",
    sponsorsInMix: (n) => `${n} sponsor${n === 1 ? "" : "s"} en la mezcla`,
    addSponsor: "Agregar sponsor",
    newSponsor: (n) => `Sponsor ${n}`,
    moveUp: (name) => `Subir ${name}`,
    moveDown: (name) => `Bajar ${name}`,
    remove: (name) => `Quitar ${name}`,
    monthCol: {
      month: "Mes",
      farmsBought: "Fincas compradas",
      capitalDeployed: "Capital desplegado",
      lotsClosed: "Lotes cerrados",
      lotsClosedSeasonal: "Lotes cerrados (estacional)",
      flatAverage: "Promedio plano",
      notesSold: "Pagarés vendidos",
      adSpend: "Anuncios",
      cumulative: (mode) => `${mode} acumulado`,
      capitalOwed: "Capital adeudado",
      returned: (name) => `Devuelto · ${name}`,
      inventory: "Inventario",
      flags: "Alertas",
    },
    fromDate: (d) => `desde ${d}`,
    byDeadline: (d) => `Para ${d}`,
    flagged: (n) => `${n} con alerta`,
    none: "ninguna",
    monthFoot:
      "La primera fila va de hoy al fin de mes, así que sus cierres se prorratean. El capital adeudado es lo que aún se debe a sponsors a fin de mes (posiciones de hoy reembolsadas a prorrata conforme cierran los lotes existentes; fincas nuevas conforme cierran sus lotes). Las filas rojas son meses donde los cierres requeridos superan el inventario, se compra una finca demasiado tarde para convertir antes de la fecha límite, o el ciclo de capital de una finca no puede completarse antes.",
    monthFootSeasonal:
      " Los cierres estacionales siguen el perfil mes-del-año del reino de fechas reales de cierre (suavizado, con piso al 25% del ritmo plano) y promedian al ritmo plano a lo largo del plan.",
    days: (n) => `${n} ${Math.abs(n) === 1 ? "día" : "días"}`,
  },
};

export function useWarPlanStrings(): WarPlanUiStrings {
  const [lang] = useLang();
  return WAR_PLAN_UI[lang];
}
