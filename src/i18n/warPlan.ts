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
  calendar: {
    aria: string;
    title: string;
    subtitle: string;
    legendAria: string;
    fundingDeadlinesAria: string;
    barRecycled: string;
    barFresh: string;
    barUnfunded: string;
    barReturned: string;
    inventoryOut: string;
    deadline: string;
    legendFresh: string;
    legendRecycled: string;
    legendUnfunded: string;
    legendReturned: string;
    legendInventoryOut: string;
    farmFundBy: (n: number, month: string) => string;
    recycledAmount: (amount: string) => string;
    freshAmount: (amount: string) => string;
    unfundedAmount: (amount: string) => string;
    lotsCloseFrom: (when: string) => string;
    afterDeadline: string;
    lagPrefix: string;
    month: (n: number) => string;
    farm: (n: number) => string;
    lot: (n: number) => string;
    capitalReturn: (n: number) => string;
    lagObserved: (months: string, farms: string, median: string) => string;
    lagAssumption: (months: string, sparse: string | null) => string;
      lagSparse: (n: number, hasHave: string) => string;
      farmHas: string;
      farmsHave: string;
      inventoryNever: (stock: string) => string;
    inventoryPast: (stock: string, months: string, pace: string, when: string) => string;
    inventoryRunsOut: (stock: string, months: string, pace: string, when: string) => string;
    inventoryStock: (lots: string, available: number, reserved: number) => string;
    summaryFunds: (lag: string, farms: string, first: string, last: string, fresh: string, recycled: string | null) => string;
    summaryNone: (lag: string) => string;
    andRecycled: (amount: string) => string;
    todayMonth: (label: string) => string;
    deadlineMonth: (label: string, date: string) => string;
    emptyMonth: (label: string) => string;
    farmSentence: (n: number, lots: string, cost: string, fundBy: string, land: string, lag: string, source: string, parts: string, late: boolean) => string;
    recycledFrom: (amount: string) => string;
    freshFrom: (amount: string, who: string) => string;
    theMix: string;
    andJoin: string;
    nobodyCovers: (amount: string) => string;
    returnSentence: (when: string, sponsor: string, amount: string, farm: number, cycle: string, use: string) => string;
    afterCycle: (months: string) => string;
    canFundFarm: (n: number) => string;
    afterDeadlineNoUse: string;
    noLaterFarm: string;
    returnsInPlan: (returns: string, cycle: string, after: string) => string;
    onCycle: (months: string) => string;
    afterDeadlineList: (n: number, list: string) => string;
    returnAfterItem: (sponsor: string, amount: string, farm: number, when: string | null) => string;
    noCycleMeasured: string;
    noReturnsInPlan: string;
  };
}

export const WAR_PLAN_UI: Record<QualityLang, WarPlanUiStrings> = {
  en: {
    title: "Plan",
    subtitle: (era) =>
      `The inverse of the Simulator: the Simulator takes a pace and returns a date; the Plan takes the deadline and returns what must happen — closings, farms and when to buy them, capital and who funds it, ad spend, note sales, and what comes back to every sponsor. Every input starts at the real figure${era ? `; rates and trends are measured ${era}, when sales operations started in earnest` : ""}.`,
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
    cycleNone: (era) => `no farm has returned capital${era ? ` ${era}` : ""}, none projectable`,
    cycleReal: (days, months, detail) => `${days} days / ${months} mo (${detail})`,
    cycleFreed: (n) => `median of ${n} ${n === 1 ? "farm" : "farms"} that returned capital`,
    cycleProjected: (n) => `projected from ${n} captive ${n === 1 ? "farm" : "farms"}`,
    cycleExcluded: (names) => ` · ${names} returned capital before then: on record, not measured`,
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
    projectedFree: "projected capital back",
    capitalBack: "100 % of capital back",
    medianCycles: (n, kind) => ` · median of ${n} ${kind} cycles`,
    freed: "capital returned",
    projected: "projected",
    farmsFunded: (since) => ` · farms funded ${since}`,
    curveAria: "Capital returned over the benchmark cycle",
    noBenchmark: (since) =>
      `No sponsor-funded farm${since ? ` funded ${since}` : ""} has returned capital and none can be projected, so there is no benchmark cycle yet.`,
    excludedRecord: (list, before) =>
      `On record, not measured: ${list} — funded before ${before}, so real money but not today's pace.`,
    turnsCompleted: "Turns completed",
    capitalOutstanding: "Capital outstanding",
    nextLiberation: "Next capital return",
    everyFarmVs: "Every farm against the benchmark",
    projectedBenchmarkNote: (since) =>
      `No sponsor-funded farm${since ? ` funded ${since}` : ""} has returned 100 % of its capital yet, so the benchmark is the median of every farm still outstanding, projected at the current pace, and no farm can be graded against a real curve. The first full return${since ? " of a farm funded in the era" : ""} turns this into a measured cycle.`,
    noOtherFarm: "No other sponsor-funded farm to grade.",
    gradeCol: {
      farm: "Farm",
      daysIn: "Days in",
      returned: "Returned",
      benchmarkSameDay: (name) => `${name} at the same day`,
      vsBenchmark: "vs benchmark",
      liberation: "Capital returned",
      grade: "Grade",
    },
    pts: (n) => `${n} pts`,
    ahead: (d) => `${d} ahead`,
    behind: (d) => `${d} behind`,
    freedOn: (d) => `returned ${d}`,
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
    realDealTerms: "per the Plan's real deal terms",
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
      " Seasonal closings follow the month-of-year profile of real closing dates (smoothed, floored at 25% of the flat rate) and average out to the flat pace over the plan.",
    days: (n) => `${n} ${Math.abs(n) === 1 ? "day" : "days"}`,
    calendar: {
      aria: "Farm calendar",
      title: "The farm calendar — when to reinvest",
      subtitle: "The required plan, month by month. Hover any month.",
      legendAria: "legend",
      fundingDeadlinesAria: "Funding deadlines",
      barRecycled: "Recycled capital",
      barFresh: "Fresh capital to raise",
      barUnfunded: "Unfunded",
      barReturned: "Capital returned",
      inventoryOut: "inventory out",
      deadline: "deadline",
      legendFresh: "fresh capital to raise",
      legendRecycled: "recycled capital",
      legendUnfunded: "unfunded",
      legendReturned: "sponsor capital returned",
      legendInventoryOut: "inventory out",
      farmFundBy: (n, month) => `Farm ${n} · fund by ${month}`,
      recycledAmount: (a) => `${a} recycled · `,
      freshAmount: (a) => `${a} fresh`,
      unfundedAmount: (a) => ` · ${a} unfunded`,
      lotsCloseFrom: (when) => ` · lots close from ${when}`,
      afterDeadline: "after the deadline",
      lagPrefix: "Lag: ",
      month: (n) => `${n} ${n === 1 ? "month" : "months"}`,
      farm: (n) => `${n} ${n === 1 ? "farm" : "farms"}`,
      lot: (n) => `${n} ${n === 1 ? "lot" : "lots"}`,
      capitalReturn: (n) => `${n} ${n === 1 ? "capital return" : "capital returns"}`,
      lagObserved: (months, farms, median) =>
        `${months} from funding to first closing, observed on ${farms} (median ${median})`,
      lagAssumption: (months, sparse) =>
        `${months} from funding to first closing — an assumption${sparse ?? ", not the observed median"}`,
      lagSparse: (n, hasHave) => ` (only ${n} funded ${hasHave} a first closing)`,
      farmHas: "farm has",
      farmsHave: "farms have",
      inventoryNever: (stock) => `${stock}; the required pace is zero, so they never run out.`,
      inventoryPast: (stock, months, pace, when) =>
        `${stock} last ${months} months at ${pace} lots/month — past the deadline (${when}), so no farm is needed for inventory.`,
      inventoryRunsOut: (stock, months, pace, when) =>
        `${stock} last ${months} months at the required ${pace} lots/month: they run out around ${when}.`,
      inventoryStock: (lots, available, reserved) =>
        `${lots} in inventory today (${available} available + ${reserved} reserved)`,
      summaryFunds: (lag, farms, first, last, fresh, recycled) =>
        `Working back ${lag}, the plan funds ${farms} — the first by ${first}, the last by ${last} — ${fresh} fresh${recycled ?? ""}.`,
      summaryNone: (lag) => `No farm to fund before the deadline (lag: ${lag}).`,
      andRecycled: (a) => ` and ${a} recycled`,
      todayMonth: (label) => `${label}: today's month — the plan starts here.`,
      deadlineMonth: (label, d) => `${label}: the deadline, ${d}.`,
      emptyMonth: (label) => `${label}: nothing to fund, nothing comes back.`,
      farmSentence: (n, lots, cost, fundBy, land, lag, source, parts, late) =>
        `Farm ${n} (${lots}, ${cost}): fund by ${fundBy} so its lots can close from ${land} (${lag} lag, ${source}) — ${parts}${late ? " — bought too late to convert before the deadline." : "."}`,
      recycledFrom: (a) => `${a} recycled from an earlier farm's capital return`,
      freshFrom: (a, who) => `${a} fresh from ${who}`,
      theMix: "the mix",
      andJoin: " and ",
      nobodyCovers: (a) => `${a} nobody in the mix covers`,
      returnSentence: (when, sponsor, amount, farm, cycle, use) =>
        `${when}: ${sponsor}'s ${amount} from farm ${farm} comes back${cycle} — ${use}.`,
      afterCycle: (m) => ` after a ${m}-month cycle`,
      canFundFarm: (n) => `it can fund farm ${n}`,
      afterDeadlineNoUse: "after the deadline, so no planned farm can use it",
      noLaterFarm: "no later farm in the plan needs it",
      returnsInPlan: (returns, cycle, after) => `${returns} in the plan${cycle}${after}.`,
      onCycle: (m) => ` on a ${m}-month cycle`,
      afterDeadlineList: (n, list) => `; ${n} of them land after the deadline (${list})`,
      returnAfterItem: (sponsor, amount, farm, when) =>
        `${sponsor} ${amount} from farm ${farm}${when ? ` in ${when}` : ""}`,
      noCycleMeasured: "No capital cycle is measured, so no sponsor capital returns inside the plan.",
      noReturnsInPlan: "No sponsor capital returns inside the plan.",
    },
  },
  es: {
    title: "Plan",
    subtitle: (era) =>
      `El inverso del Simulador: el Simulador toma un ritmo y devuelve una fecha; el Plan toma la fecha límite y devuelve lo que debe pasar — cierres, fincas y cuándo comprarlas, capital y quién lo fondea, gasto en anuncios, ventas de pagarés y lo que vuelve a cada sponsor. Cada entrada empieza en la cifra real${era ? `; tasas y tendencias se miden ${era}, cuando la operación de ventas arrancó en serio` : ""}.`,
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
    cycleNone: (era) => `ninguna finca ha devuelto capital${era ? ` ${era}` : ""}, ninguna proyectable`,
    cycleReal: (days, months, detail) => `${days} días / ${months} mes (${detail})`,
    cycleFreed: (n) => `mediana de ${n} finca${n === 1 ? "" : "s"} que devolvió capital`,
    cycleProjected: (n) => `proyectado de ${n} finca${n === 1 ? "" : "s"} con capital aún afuera`,
    cycleExcluded: (names) => ` · ${names} devolvieron capital antes: en el registro, no medidas`,
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
    projectedFree: "capital de vuelta proyectado",
    capitalBack: "100 % del capital de vuelta",
    medianCycles: (n, kind) => ` · mediana de ${n} ciclos ${kind}`,
    freed: "capital devuelto",
    projected: "proyectados",
    farmsFunded: (since) => ` · fincas fondeadas ${since}`,
    curveAria: "Capital devuelto a lo largo del ciclo de referencia",
    noBenchmark: (since) =>
      `Ninguna finca fondeada por sponsors${since ? ` fondeada ${since}` : ""} ha devuelto capital y ninguna se puede proyectar, así que aún no hay ciclo de referencia.`,
    excludedRecord: (list, before) =>
      `En el registro, no medido: ${list} — fondeadas antes de ${before}, así que es dinero real pero no el ritmo de hoy.`,
    turnsCompleted: "Ciclos completados",
    capitalOutstanding: "Capital pendiente",
    nextLiberation: "Próximo capital devuelto",
    everyFarmVs: "Cada finca contra la referencia",
    projectedBenchmarkNote: (since) =>
      `Ninguna finca fondeada por sponsors${since ? ` fondeada ${since}` : ""} ha devuelto el 100 % de su capital aún, así que la referencia es la mediana de cada finca con capital aún afuera, proyectada al ritmo actual, y ninguna finca se puede calificar contra una curva real. El primer retorno completo${since ? " de una finca fondeada en la era" : ""} convierte esto en un ciclo medido.`,
    noOtherFarm: "Ninguna otra finca fondeada por sponsors para calificar.",
    gradeCol: {
      farm: "Finca",
      daysIn: "Días dentro",
      returned: "Devuelto",
      benchmarkSameDay: (name) => `${name} el mismo día`,
      vsBenchmark: "vs referencia",
      liberation: "Capital devuelto",
      grade: "Nota",
    },
    pts: (n) => `${n} pts`,
    ahead: (d) => `${d} adelante`,
    behind: (d) => `${d} atrás`,
    freedOn: (d) => `devuelto ${d}`,
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
    realDealTerms: "según los términos reales del Plan",
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
      " Los cierres estacionales siguen el perfil mes-del-año de fechas reales de cierre (suavizado, con piso al 25% del ritmo plano) y promedian al ritmo plano a lo largo del plan.",
    days: (n) => `${n} ${Math.abs(n) === 1 ? "día" : "días"}`,
    calendar: {
      aria: "Calendario de fincas",
      title: "El calendario de fincas — cuándo reinvertir",
      subtitle: "El plan requerido, mes a mes. Pasa el cursor por cualquier mes.",
      legendAria: "leyenda",
      fundingDeadlinesAria: "Fechas límite de fondeo",
      barRecycled: "Capital reciclado",
      barFresh: "Capital fresco por levantar",
      barUnfunded: "Sin fondear",
      barReturned: "Capital devuelto",
      inventoryOut: "inventario agotado",
      deadline: "fecha límite",
      legendFresh: "capital fresco por levantar",
      legendRecycled: "capital reciclado",
      legendUnfunded: "sin fondear",
      legendReturned: "capital de sponsors devuelto",
      legendInventoryOut: "inventario agotado",
      farmFundBy: (n, month) => `Finca ${n} · fondear para ${month}`,
      recycledAmount: (a) => `${a} reciclado · `,
      freshAmount: (a) => `${a} fresco`,
      unfundedAmount: (a) => ` · ${a} sin fondear`,
      lotsCloseFrom: (when) => ` · lotes cierran desde ${when}`,
      afterDeadline: "después de la fecha límite",
      lagPrefix: "Retraso: ",
      month: (n) => `${n} ${n === 1 ? "mes" : "meses"}`,
      farm: (n) => `${n} ${n === 1 ? "finca" : "fincas"}`,
      lot: (n) => `${n} ${n === 1 ? "lote" : "lotes"}`,
      capitalReturn: (n) => `${n} ${n === 1 ? "retorno de capital" : "retornos de capital"}`,
      lagObserved: (months, farms, median) =>
        `${months} del fondeo al primer cierre, observado en ${farms} (mediana ${median})`,
      lagAssumption: (months, sparse) =>
        `${months} del fondeo al primer cierre — un supuesto${sparse ?? ", no la mediana observada"}`,
      lagSparse: (n, hasHave) => ` (solo ${n} ${hasHave} un primer cierre)`,
      farmHas: "finca fondeada tiene",
      farmsHave: "fincas fondeadas tienen",
      inventoryNever: (stock) => `${stock}; el ritmo requerido es cero, así que nunca se agotan.`,
      inventoryPast: (stock, months, pace, when) =>
        `${stock} duran ${months} meses a ${pace} lotes/mes — pasada la fecha límite (${when}), así que no hace falta finca para inventario.`,
      inventoryRunsOut: (stock, months, pace, when) =>
        `${stock} duran ${months} meses al ritmo requerido de ${pace} lotes/mes: se agotan alrededor de ${when}.`,
      inventoryStock: (lots, available, reserved) =>
        `${lots} en inventario hoy (${available} disponibles + ${reserved} reservados)`,
      summaryFunds: (lag, farms, first, last, fresh, recycled) =>
        `Trabajando hacia atrás ${lag}, el plan fondea ${farms} — la primera para ${first}, la última para ${last} — ${fresh} fresco${recycled ?? ""}.`,
      summaryNone: (lag) => `Ninguna finca que fondear antes de la fecha límite (retraso: ${lag}).`,
      andRecycled: (a) => ` y ${a} reciclado`,
      todayMonth: (label) => `${label}: el mes de hoy — el plan empieza aquí.`,
      deadlineMonth: (label, d) => `${label}: la fecha límite, ${d}.`,
      emptyMonth: (label) => `${label}: nada que fondear, nada que vuelva.`,
      farmSentence: (n, lots, cost, fundBy, land, lag, source, parts, late) =>
        `Finca ${n} (${lots}, ${cost}): fondear para ${fundBy} para que sus lotes cierren desde ${land} (${lag} de retraso, ${source}) — ${parts}${late ? " — comprada demasiado tarde para convertir antes de la fecha límite." : "."}`,
      recycledFrom: (a) => `${a} reciclado del retorno de capital de una finca anterior`,
      freshFrom: (a, who) => `${a} fresco de ${who}`,
      theMix: "la mezcla",
      andJoin: " y ",
      nobodyCovers: (a) => `${a} que nadie en la mezcla cubre`,
      returnSentence: (when, sponsor, amount, farm, cycle, use) =>
        `${when}: ${amount} de ${sponsor} de la finca ${farm} vuelve${cycle} — ${use}.`,
      afterCycle: (m) => ` tras un ciclo de ${m} meses`,
      canFundFarm: (n) => `puede fondear la finca ${n}`,
      afterDeadlineNoUse: "después de la fecha límite, así que ninguna finca planificada puede usarlo",
      noLaterFarm: "ninguna finca posterior del plan lo necesita",
      returnsInPlan: (returns, cycle, after) => `${returns} en el plan${cycle}${after}.`,
      onCycle: (m) => ` en un ciclo de ${m} meses`,
      afterDeadlineList: (n, list) => `; ${n} de ellos caen después de la fecha límite (${list})`,
      returnAfterItem: (sponsor, amount, farm, when) =>
        `${sponsor} ${amount} de la finca ${farm}${when ? ` en ${when}` : ""}`,
      noCycleMeasured: "No hay ciclo de capital medido, así que no hay retornos de capital de sponsors dentro del plan.",
      noReturnsInPlan: "No hay retornos de capital de sponsors dentro del plan.",
    },
  },
};

export function useWarPlanStrings(): WarPlanUiStrings {
  const [lang] = useLang();
  return WAR_PLAN_UI[lang];
}
