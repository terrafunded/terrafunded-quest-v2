import type { LotStage, OxygenBand, RealmEvent, Trophy } from "@/domain";
import type { QualityLang } from "@/domain/quality_human";
import { dateIn } from "@/lib/format";
import { useLang } from "./lang";

/**
 * UI strings for the realm components (`src/components/realm`). Every user-visible word a realm
 * component prints lives here, in both languages, so the Throne Room never mixes them. Values the
 * domain produces (money, dates, `actualSinceLabel`, story cards, trophy titles) are passed in
 * already formatted and are not translated here.
 *
 * Plural forms are functions of the count so Spanish gets "reserva"/"reservas" instead of an "s".
 */
export interface RealmUiStrings {
  /** An ISO date in the page language: "May 19, 2026" / "19 may 2026". */
  date: (iso: string | null | undefined) => string;
  oxygen: {
    aria: string;
    title: string;
    perLot: string;
    days: string;
    /** Headline suffix after the trailing count: "days gained in the last 90". */
    gainedInLast: (windowDays: number) => string;
    /** The arithmetic under the headline, by band. `diff` is |gained − window|, always ≥ 0. */
    verdict: Record<OxygenBand, (gained: number, windowDays: number, diff: number) => string>;
    /** Topbar pill: text and its tooltip. */
    pill: (gained: number, windowDays: number) => string;
    pillTitle: (gained: number, windowDays: number, verdict: string) => string;
    pillLoading: string;
    cumulative: string;
    cumulativeTitle: string;
    provisional: string;
    provisionalTitle: (n: number, pct: number) => string;
    confirmed: (closings: number) => string;
    reservationsProvisional: (n: number, pct: number) => string;
    produces: (perDay: string) => string;
    latest: string;
    deepest: string;
    /** Extra tooltip line on the deepest breath: why an old dollar bought more days. */
    deepestWhy: string;
    net: (amount: string) => string;
    paceThatDay: (date: string, perDay: string) => string;
  };
  debt: {
    aria: string;
    title: string;
    asOf: (asOf: string, deadline: string) => string;
    capitalOwed: string;
    capitalOwedHint: (openPositions: number, interestPerDay: string) => string;
    committedUnfunded: (amount: string) => string;
    daysLeft: string;
    daysLeftTo: (deadline: string) => string;
    deadlinePassed: string;
    requiredPerDay: string;
    noClosings: string;
    averagedSince: (perDay: string, sinceLabel: string, days: string) => string;
    averagedAllTime: (perDay: string, firstClose: string) => string;
    averagedFirstClosing: (perDay: string) => string;
    actualPace: string;
    required: string;
  };
  pulse: {
    aria: string;
    producing: string;
    producingHint: string;
    needed: string;
    neededHint: string;
    ratio: (pct: number, horizonYear: number) => string;
  };
  pulseCharts: {
    aria: string;
    paceTitle: string;
    paceLegend: string;
    profitTitle: string;
    profitLegend: string;
    reservations: string;
    closings: string;
    netProfit: string;
    required: string;
    monthInProgress: string;
    eraNote: (eraLabel: string) => string;
    tooltipReservations: (n: number) => string;
    tooltipClosings: (n: number) => string;
  };
  goalCurve: {
    aria: string;
    title: string;
    /** Legend under the title; `eraMonth` is the era's first month ("Mar 2026") or null without one. */
    legend: (eraMonth: string | null) => string;
    today: string;
    /** Deadline marker: the horizon year. */
    deadline: (year: number) => string;
    actual: string;
    required: string;
    /** Projection at the all-sold average: "projected · ledger average $58,852/lot". */
    projectedLifetime: (avgPerLot: string, lots: number) => string;
    projectedRecent: (avgPerLot: string, lots: number, eraMonth: string) => string;
    /** Marker under the crossing dot: "Jan 8, 2029 · misses the deadline by 12.3 months". */
    misses: (date: string, months: string) => string;
    beats: (date: string, months: string) => string;
    onTheDay: (date: string) => string;
    /** Marker when the crossing lies past the axis: "not before Dec 2029 at this pace". */
    beyond: (edgeDate: string) => string;
    /** Second marker's tag. */
    atRecentAverage: (eraMonth: string) => string;
    noPace: string;
    noHistory: string;
    met: string;
    behind: string;
    ahead: string;
    /** Tooltip row labels. */
    tooltipActual: string;
    tooltipRequired: string;
    tooltipProjected: string;
    tooltipProjectedRecent: string;
  };
  gauge: {
    aria: string;
    /** The one sentence: pace, horizon year, then the three units. */
    sentence: (pace: string, year: number, lots: string, dollars: string, days: string, side: "ahead" | "behind" | "even") => string;
    /** Days part when there is no pace to divide by. */
    noPaceDays: string;
    noPace: (pace: string, year: number, lots: string, dollars: string) => string;
    noHistory: string;
    met: string;
    hint: (eraMonth: string | null) => string;
    /** Compact title attribute on the gauge card. */
    title: (lots: string, dollars: string, days: string | null) => string;
  };
  pipeline: {
    aria: string;
    title: string;
    stuckList: string;
    trapped: string;
    waiting: (stuckAfterDays: number, sales: string) => string;
    reservationsPerMonth: string;
    sinceWaiting: (n: number, since: string, days: number) => string;
    inDaysWaiting: (n: number, windowDays: number) => string;
    closingsPerMonth: string;
    onlyPace: string;
    conversion: string;
    resolvedConversion: string;
    resolvedStatement: (pct: string, closed: number, denom: number, open: number) => string;
    resolvedHint: string;
    resolvedWarning: string;
    stillOpen: string;
    stillOpenHint: string;
    blendedConversion: string;
    blendedLabel: string;
    blendedHint: string;
    conversionHint: (closed: number, cohort: number, maturityDays: number) => string;
    cancelled: (pct: string) => string;
    inclCancellations: (pct: string) => string;
    medianToClose: string;
    medianHint: (lots: number) => string;
  };
  liberation: {
    hostagesAria: string;
    hostages: (n: number) => string;
    returnedOf: (returned: string, capital: string) => string;
    totalReturned: (returned: string, capital: string, pct: string) => string;
    freed: (date: string) => string;
    afterDays: (days: number) => string;
    toGo: (amount: string) => string;
    paidOnTop: (amount: string) => string;
    nobodyOwed: string;
    liberatedAria: string;
    liberated: (n: number) => string;
    nobodyFreed: string;
    freeSponsors: (names: string) => string;
  };
  celebration: {
    aria: string;
    close: string;
    kind: Partial<Record<RealmEvent["kind"], string>>;
    sinceLastVisit: string;
    thingsHappened: (n: number) => string;
    onward: string;
  };
  intro: {
    tagline: (horizon: number) => string;
  };
  milestone: {
    title: (date: string) => string;
    caption: string;
  };
  pageStates: {
    loading: string;
    errorTitle: string;
    retry: string;
    partialTables: string;
    error: string;
  };
  questTree: {
    aria: string;
    reached: (date: string) => string;
    toward: (pct: string, target: string) => string;
  };
  stage: Record<LotStage, string>;
  fitMoney: {
    showFullName: (text: string) => string;
  };
  streaks: {
    closing: StreakWording;
    reservation: StreakWording;
    current: string;
    weeks: (n: number) => string;
    daysLeftToKeep: (n: number) => string;
    best: string;
    endedOn: (date: string) => string;
    bestWeek: string;
    bestMonth: string;
    since: (label: string) => string;
    weekOf: (date: string, money: string, moneyLabel: string) => string;
    noneSince: (label: string) => string;
    bestMonthHint: (month: string, money: string, moneyLabel: string, bestMonths: number) => string;
  };
  trophies: {
    rarity: Record<Trophy["rarity"], string>;
    earnedOn: (date: string) => string;
    earned: (n: number) => string;
    noneYet: string;
    stillToEarn: (n: number) => string;
    /** Pace Keeper (and any other horizon-tied trophy) carries this on-screen note. */
    horizonDependent: string;
  };
}

export interface StreakWording {
  title: string;
  noun: (n: number) => string;
  lit: string;
  none: string;
  noneYet: string;
  moneyLabel: string;
  leftOut: (n: number) => string;
  lastWeeks: (n: number) => string;
}

export const REALM_UI: Record<QualityLang, RealmUiStrings> = {
  en: {
    date: (iso) => dateIn("en", iso),
    oxygen: {
      aria: "Pace",
      title: "Pace · days gained against days passed",
      perLot: "per lot in Payments →",
      days: "days",
      gainedInLast: (windowDays) => `days gained in the last ${windowDays}`,
      verdict: {
        behind: (gained, windowDays, diff) =>
          `${windowDays} days passed − ${gained} gained: at this pace the exit date moves away by ${diff} ${diff === 1 ? "day" : "days"} every ${windowDays}`,
        ahead: (gained, windowDays, diff) =>
          `${gained} gained − ${windowDays} days passed: at this pace the exit date comes ${diff} ${diff === 1 ? "day" : "days"} closer every ${windowDays}`,
        even: (gained, windowDays) => `${gained} gained in ${windowDays} days passed: at this pace the exit date holds still`,
      },
      pill: (gained, windowDays) => `${gained}/${windowDays}d`,
      pillTitle: (gained, windowDays, verdict) => `Pace — ${gained} days gained in the last ${windowDays}. ${verdict}`,
      pillLoading: "Pace loading",
      cumulative: "Cumulative days gained",
      cumulativeTitle:
        "Sum of every closed lot's days gained, each measured at that day's pace (net profit ÷ that day's net profit per day). Different days, different paces: a running total, not a distance from the goal.",
      provisional: "provisional",
      provisionalTitle: (n, pct) =>
        `Provisional: ${n} live ${n === 1 ? "reservation" : "reservations"} at ${pct}% conversion, measured at the pace of their reservation day. Confirmed at closing, forfeited at cancellation. Never added to any total.`,
      confirmed: (closings) => `${closings} ${closings === 1 ? "closing" : "closings"} confirmed, each scored on its own closing day`,
      reservationsProvisional: (n, pct) => `${n} ${n === 1 ? "reservation" : "reservations"} provisional at ${pct}% conversion`,
      produces: (perDay) => `today closings produce ${perDay} of net profit at closing per day`,
      latest: "Latest closing",
      deepest: "Biggest impact",
      deepestWhy: "Days gained = net profit ÷ that day's pace: the same dollar bought more days when daily net profit was lower.",
      net: (amount) => `net ${amount}`,
      paceThatDay: (date, perDay) => `${date} · when daily net profit was ${perDay}`,
    },
    debt: {
      aria: "Capital owed",
      title: "Capital owed",
      asOf: (asOf, deadline) => `as of ${asOf} · deadline ${deadline}`,
      capitalOwed: "Capital still owed to sponsors",
      capitalOwedHint: (open, interest) => `${open} open ${open === 1 ? "position" : "positions"} · ${interest} of interest accrues per day`,
      committedUnfunded: (amount) => ` · ${amount} committed, not yet funded`,
      daysLeft: "Days left",
      daysLeftTo: (deadline) => `to ${deadline}`,
      deadlinePassed: "the deadline has passed",
      requiredPerDay: "Net profit required per day",
      noClosings: "no closings yet",
      averagedSince: (perDay, sinceLabel, days) => `you have averaged ${perDay} / day ${sinceLabel} (${days} days)`,
      averagedAllTime: (perDay, firstClose) => ` · ${perDay} / day over the full history since ${firstClose}`,
      averagedFirstClosing: (perDay) => `you have averaged ${perDay} / day since the first closing`,
      actualPace: "actual pace per day",
      required: "required",
    },
    pulse: {
      aria: "Pace",
      producing: "Producing",
      producingHint: "net profit at closing per day at the trailing pace",
      needed: "Needed",
      neededHint: "remaining ÷ days left",
      ratio: (pct, year) => `you are at ${pct}% of the pace the ${year} horizon requires`,
    },
    pulseCharts: {
      aria: "Pace charts",
      paceTitle: "Reservations lead, closings pay",
      paceLegend: "Reservations · Closings · required",
      profitTitle: "Net profit at closing per month",
      profitLegend: "Net profit at closing · required",
      reservations: "Reservations",
      closings: "Closings",
      netProfit: "Net profit at closing",
      required: "required",
      monthInProgress: "month in progress",
      eraNote: (era) => `Fainter bars are months that ended before sales operations started in earnest in ${era}.`,
      tooltipReservations: (n) => `Reservations ${n}`,
      tooltipClosings: (n) => `Closings ${n}`,
    },
    goalCurve: {
      aria: "Cumulative net profit at closing against the required line",
      title: "Cumulative net profit at closing · above or below the required line",
      legend: (era) =>
        `Booked net profit at closing by month · the straight line the deadline requires · where today's pace lands, at the closed-lot average and${era ? ` at the since-${era} average` : " (no era average yet)"}`,
      today: "today",
      deadline: (year) => `${year} deadline`,
      actual: "Booked",
      required: "Required",
      projectedLifetime: (avg, lots) => `Projected · closed-lot average ${avg}/lot (${lots} closings)`,
      projectedRecent: (avg, lots, era) => `Projected · since-${era} average ${avg}/lot (${lots} closings)`,
      misses: (date, months) => `${date} · misses the deadline by ${months} months`,
      beats: (date, months) => `${date} · beats the deadline by ${months} months`,
      onTheDay: (date) => `${date} · on the deadline`,
      beyond: (edge) => `not before ${edge} at this pace`,
      atRecentAverage: (era) => `at the since-${era} average`,
      noPace: "No closing in the trailing window: today's pace projects nowhere. Only the required line is drawn.",
      noHistory: "No closed lot yet: there is no average to project with. Only the required line is drawn.",
      met: "The goal is met; every line rests on $10M.",
      behind: "behind the required line",
      ahead: "ahead of the required line",
      tooltipActual: "Booked",
      tooltipRequired: "Required",
      tooltipProjected: "Projected · closed-lot average",
      tooltipProjectedRecent: "Projected · era average",
    },
    gauge: {
      aria: "Deadline gap — deviation at the deadline in lots, dollars and days",
      sentence: (pace, year, lots, dollars, days, side) =>
        side === "even"
          ? `At today's pace of ${pace} lots/month, the ${year} deadline lands exactly on the goal.`
          : `At today's pace of ${pace} lots/month, the ${year} deadline lands ${lots} lots · ${dollars} · ${days} days ${side}.`,
      noPaceDays: "no pace to count the days",
      noPace: (pace, year, lots, dollars) => `No closing in the trailing window (${pace} lots/month): by ${year} every remaining lot is behind — ${lots} lots · ${dollars} · no pace to count the days.`,
      noHistory: "No closed lot yet — there is no average to measure the deadline against.",
      met: "The goal is met. Nothing is behind.",
      hint: (era) =>
        `Lots the trailing pace closes by the deadline minus the lots still needed at the closed-lot average; those lots in dollars; those dollars at today's net profit per day. Same root as the cumulative chart marker${era ? `; the since-${era} average is the dotted line above` : ""}.`,
      title: (lots, dollars, days) => `${lots} lots · ${dollars} · ${days === null ? "—" : `${days} days`}`,
    },
    pipeline: {
      aria: "Pipeline",
      title: "Pipeline · reservations lead, closings pay",
      stuckList: "stuck reservations →",
      trapped: "Profit trapped in reservations",
      waiting: (days, sales) => `reservations waiting ${days}+ days · ${sales} of sales`,
      reservationsPerMonth: "Reservations / mo",
      sinceWaiting: (n, since, days) => `${n} since ${since} (${days} days), still waiting`,
      inDaysWaiting: (n, window) => `${n} in ${window} days, still waiting`,
      closingsPerMonth: "Closings / mo",
      onlyPace: "the only pace that counts",
      conversion: "Conversion",
      resolvedConversion: "Resolved (forecasts)",
      resolvedStatement: (p, closed, denom, open) => `${p} — ${closed} of ${denom} resolved · ${open} still open`,
      resolvedHint: "closed ÷ (closed + cancelled)",
      resolvedWarning: "This estimate rests on few resolved outcomes relative to how many reservations are still open.",
      stillOpen: "Still open",
      stillOpenHint: "matured, not failures yet",
      blendedConversion: "Blended",
      blendedLabel: "including unresolved reservations",
      blendedHint: "including unresolved reservations",
      conversionHint: (closed, cohort, maturity) => `${closed} of ${cohort} reserved ${maturity}+ days ago closed`,
      cancelled: (pct) => `${pct} cancelled`,
      inclCancellations: (pct) => `, ${pct} incl. cancellations`,
      medianToClose: "Median to close",
      medianHint: (lots) => `reservation → closing, ${lots} ${lots === 1 ? "lot" : "lots"}`,
    },
    liberation: {
      hostagesAria: "Capital still out",
      hostages: (n) => `Capital still out · ${n}`,
      returnedOf: (returned, capital) => `${returned} of ${capital} returned`,
      totalReturned: (returned, capital, pct) => `${returned} of ${capital} returned · ${pct}`,
      freed: (date) => ` · returned ${date}`,
      afterDays: (days) => ` after ${days} ${days === 1 ? "day" : "days"}`,
      toGo: (amount) => ` · ${amount} to go`,
      paidOnTop: (amount) => ` · ${amount} paid on top`,
      nobodyOwed: "No sponsor is owed anything. All LP capital is back.",
      liberatedAria: "Capital returned",
      liberated: (n) => `Capital returned · ${n}`,
      nobodyFreed: "No sponsor has received capital back yet. The first farm that returns 100% of its capital opens this list.",
      freeSponsors: (names) => `Sponsors with every position repaid: ${names}.`,
    },
    celebration: {
      aria: "Update",
      close: "Close update",
      kind: { closing: "A lot just sold", note_sale: "A note was sold", liberation: "A sponsor just got capital back" },
      sinceLastVisit: "Since your last visit",
      thingsHappened: (n) => `${n} things happened since your last visit`,
      onward: "Continue",
    },
    intro: {
      tagline: (horizon) => `Ten million by the last day of ${horizon}`,
    },
    milestone: {
      title: (date) => `Milestone · ${date}`,
      caption: "of net profit at closing recorded",
    },
    pageStates: {
      loading: "Loading farm and lot data",
      errorTitle: "Farm and lot data could not be loaded",
      retry: "Try again",
      partialTables: "Some tables could not be read; numbers below are partial.",
      error: "error",
    },
    questTree: {
      aria: "Lot sequence",
      reached: (date) => `Reached ${date}`,
      toward: (pct, target) => `${pct}% toward ${target}`,
    },
    stage: { available: "Available", reserved: "Reserved", closed: "Closed", note_sold: "Note sold" },
    fitMoney: {
      showFullName: (text) => `Show full name: ${text}`,
    },
    streaks: {
      closing: {
        title: "Closing streaks",
        noun: (n) => (n === 1 ? "closing" : "closings"),
        lit: "a lot closed this week — the streak is on",
        none: "no closing last week or this week",
        noneYet: "no closings yet",
        moneyLabel: "net",
        leftOut: (n) => ` · ${n} earlier ${n === 1 ? "closing" : "closings"} left out`,
        lastWeeks: (n) => `Last ${n} weeks with a closing`,
      },
      reservation: {
        title: "Reservation streaks",
        noun: (n) => (n === 1 ? "reservation" : "reservations"),
        lit: "a lot was reserved this week — the line is unbroken",
        none: "no reservation last week or this week",
        noneYet: "no reservations yet",
        moneyLabel: "net at stake",
        leftOut: (n) => ` · ${n} earlier ${n === 1 ? "reservation" : "reservations"} left out`,
        lastWeeks: (n) => `Last ${n} weeks with a reservation`,
      },
      current: "Current streak",
      weeks: (n) => `${n} ${n === 1 ? "week" : "weeks"}`,
      daysLeftToKeep: (n) => `${n} ${n === 1 ? "day" : "days"} left this week to keep the streak going`,
      best: "Best streak",
      endedOn: (date) => `ended ${date}`,
      bestWeek: "Best week",
      bestMonth: "Best month",
      since: (label) => ` · ${label}`,
      weekOf: (date, money, moneyLabel) => `week of ${date} · ${money} ${moneyLabel}`,
      noneSince: (label) => `none ${label}`,
      bestMonthHint: (month, money, moneyLabel, bestMonths) => `${month} · ${money} ${moneyLabel} · best run ${bestMonths} ${bestMonths === 1 ? "month" : "months"}`,
    },
    trophies: {
      rarity: { common: "Standard", rare: "Notable", epic: "Major", legendary: "Landmark" },
      earnedOn: (date) => `Reached ${date}`,
      earned: (n) => `Reached · ${n}`,
      noneYet: "No milestones yet. The first closing earns First sale.",
      stillToEarn: (n) => `Still to earn · ${n}`,
      horizonDependent: "Depends on the exit horizon selector",
    },
  },
  es: {
    date: (iso) => dateIn("es", iso),
    oxygen: {
      aria: "Ritmo",
      title: "Ritmo · días ganados contra días transcurridos",
      perLot: "por lote en Payments →",
      days: "días",
      gainedInLast: (windowDays) => `días ganados en los últimos ${windowDays}`,
      verdict: {
        behind: (gained, windowDays, diff) =>
          `${windowDays} días transcurridos − ${gained} ganados: a este ritmo la fecha de salida se aleja ${diff} ${diff === 1 ? "día" : "días"} cada ${windowDays}`,
        ahead: (gained, windowDays, diff) =>
          `${gained} ganados − ${windowDays} días transcurridos: a este ritmo la fecha de salida se acerca ${diff} ${diff === 1 ? "día" : "días"} cada ${windowDays}`,
        even: (gained, windowDays) => `${gained} ganados en ${windowDays} días transcurridos: a este ritmo la fecha de salida no se mueve`,
      },
      pill: (gained, windowDays) => `${gained}/${windowDays}d`,
      pillTitle: (gained, windowDays, verdict) => `Ritmo — ${gained} días ganados en los últimos ${windowDays}. ${verdict}`,
      pillLoading: "Cargando el ritmo",
      cumulative: "Días ganados acumulados",
      cumulativeTitle:
        "Suma de los días ganados por cada lote cerrado, cada uno medido al ritmo del día de su propio cierre (utilidad neta ÷ utilidad neta por día de ese día). Días distintos, ritmos distintos: un total acumulado, no una distancia respecto a la meta.",
      provisional: "provisional",
      provisionalTitle: (n, pct) =>
        `Provisional: ${n} ${n === 1 ? "reserva viva" : "reservas vivas"} al ${pct}% de conversión, medidas al ritmo del día en que se reservaron. Se confirman al cierre y se pierden si se cancelan. Nunca se suman a ningún total.`,
      confirmed: (closings) => `${closings} ${closings === 1 ? "cierre confirmado" : "cierres confirmados"}, cada uno puntuado el día de su propio cierre`,
      reservationsProvisional: (n, pct) => `${n} ${n === 1 ? "reserva provisional" : "reservas provisionales"} al ${pct}% de conversión`,
      produces: (perDay) => `hoy los cierres producen ${perDay} de utilidad neta al cierre al día`,
      latest: "Último cierre",
      deepest: "Mayor impacto",
      deepestWhy: "Días ganados = utilidad neta ÷ ritmo de ese día: el mismo dólar compraba más días cuando la utilidad neta diaria era más baja.",
      net: (amount) => `neta ${amount}`,
      paceThatDay: (date, perDay) => `${date} · cuando la utilidad neta diaria era ${perDay}`,
    },
    debt: {
      aria: "Capital adeudado",
      title: "Capital adeudado",
      asOf: (asOf, deadline) => `al ${asOf} · fecha límite ${deadline}`,
      capitalOwed: "Capital que aún se debe a los sponsors",
      capitalOwedHint: (open, interest) => `${open} ${open === 1 ? "posición abierta" : "posiciones abiertas"} · ${interest} de interés se acumulan por día`,
      committedUnfunded: (amount) => ` · ${amount} comprometido, aún no fondeado`,
      daysLeft: "Días restantes",
      daysLeftTo: (deadline) => `hasta el ${deadline}`,
      deadlinePassed: "la fecha límite ya pasó",
      requiredPerDay: "Utilidad neta requerida por día",
      noClosings: "aún no hay cierres",
      averagedSince: (perDay, sinceLabel, days) => `has promediado ${perDay} / día ${sinceLabel} (${days} días)`,
      averagedAllTime: (perDay, firstClose) => ` · ${perDay} / día en toda la historia desde el ${firstClose}`,
      averagedFirstClosing: (perDay) => `has promediado ${perDay} / día desde el primer cierre`,
      actualPace: "ritmo real por día",
      required: "requerido",
    },
    pulse: {
      aria: "Ritmo",
      producing: "Produciendo",
      producingHint: "utilidad neta al cierre por día al ritmo móvil",
      needed: "Necesario",
      neededHint: "restante ÷ días restantes",
      ratio: (pct, year) => `vas al ${pct}% del ritmo que exige el horizonte ${year}`,
    },
    pulseCharts: {
      aria: "Gráficas de ritmo",
      paceTitle: "Las reservas abren, los cierres pagan",
      paceLegend: "Reservas · Cierres · requerido",
      profitTitle: "Utilidad neta al cierre por mes",
      profitLegend: "Utilidad neta al cierre · requerido",
      reservations: "Reservas",
      closings: "Cierres",
      netProfit: "Utilidad neta al cierre",
      required: "requerido",
      monthInProgress: "mes en curso",
      eraNote: (era) => `Las barras más tenues son meses que terminaron antes de que las ventas arrancaran en serio en ${era}.`,
      tooltipReservations: (n) => `Reservas ${n}`,
      tooltipClosings: (n) => `Cierres ${n}`,
    },
    goalCurve: {
      aria: "Utilidad neta al cierre acumulada frente a la línea requerida",
      title: "Utilidad neta al cierre acumulada · por encima o por debajo de la línea requerida",
      legend: (era) =>
        `Utilidad neta al cierre registrada por mes · la recta que exige la fecha límite · dónde aterriza el ritmo de hoy, al promedio de lotes cerrados y${era ? ` al promedio desde ${era}` : " (aún sin promedio de la era)"}`,
      today: "hoy",
      deadline: (year) => `límite ${year}`,
      actual: "Registrado",
      required: "Requerido",
      projectedLifetime: (avg, lots) => `Proyectado · promedio de lotes cerrados ${avg}/lote (${lots} cierres)`,
      projectedRecent: (avg, lots, era) => `Proyectado · promedio desde ${era} ${avg}/lote (${lots} cierres)`,
      misses: (date, months) => `${date} · llega ${months} meses después del límite`,
      beats: (date, months) => `${date} · llega ${months} meses antes del límite`,
      onTheDay: (date) => `${date} · justo en el límite`,
      beyond: (edge) => `no antes de ${edge} a este ritmo`,
      atRecentAverage: (era) => `al promedio desde ${era}`,
      noPace: "Ningún cierre en la ventana: el ritmo de hoy no proyecta a ninguna fecha. Solo se dibuja la línea requerida.",
      noHistory: "Aún no hay lotes cerrados: no hay promedio con qué proyectar. Solo se dibuja la línea requerida.",
      met: "La meta está cumplida; todas las líneas descansan en $10M.",
      behind: "por debajo de la línea requerida",
      ahead: "por encima de la línea requerida",
      tooltipActual: "Registrado",
      tooltipRequired: "Requerido",
      tooltipProjected: "Proyectado · promedio de lotes cerrados",
      tooltipProjectedRecent: "Proyectado · promedio de la era",
    },
    gauge: {
      aria: "Desvío a la fecha límite — en lotes, dólares y días",
      sentence: (pace, year, lots, dollars, days, side) =>
        side === "even"
          ? `Al ritmo de hoy, ${pace} lotes/mes, el límite ${year} cae exactamente en la meta.`
          : `Al ritmo de hoy, ${pace} lotes/mes, el límite ${year} queda ${lots} lotes · ${dollars} · ${days} días ${side === "behind" ? "atrás" : "adelante"}.`,
      noPaceDays: "sin ritmo para contar los días",
      noPace: (pace, year, lots, dollars) => `Ningún cierre en la ventana (${pace} lotes/mes): para ${year} todo lote pendiente queda atrás — ${lots} lotes · ${dollars} · sin ritmo para contar los días.`,
      noHistory: "Aún no hay lotes cerrados: no hay promedio con qué medir la fecha límite.",
      met: "La meta está cumplida. Nada queda atrás.",
      hint: (era) =>
        `Lotes que el ritmo actual cierra hasta el límite menos los lotes que aún faltan al promedio de lotes cerrados; esos lotes en dólares; esos dólares al ritmo de utilidad neta por día de hoy. Misma raíz que el marcador del gráfico acumulado${era ? `; el promedio desde ${era} es la línea punteada de arriba` : ""}.`,
      title: (lots, dollars, days) => `${lots} lotes · ${dollars} · ${days === null ? "—" : `${days} días`}`,
    },
    pipeline: {
      aria: "Pipeline",
      title: "Pipeline · las reservas abren, los cierres pagan",
      stuckList: "reservas atascadas →",
      trapped: "Utilidad atrapada en reservas",
      waiting: (days, sales) => `reservas esperando ${days}+ días · ${sales} en ventas`,
      reservationsPerMonth: "Reservas / mes",
      sinceWaiting: (n, since, days) => `${n} desde ${since} (${days} días), aún en espera`,
      inDaysWaiting: (n, window) => `${n} en ${window} días, aún en espera`,
      closingsPerMonth: "Cierres / mes",
      onlyPace: "el único ritmo que cuenta",
      conversion: "Conversión",
      resolvedConversion: "Resuelta (pronósticos)",
      resolvedStatement: (p, closed, denom, open) => `${p} — ${closed} de ${denom} resueltas · ${open} aún abiertas`,
      resolvedHint: "cerrados ÷ (cerrados + cancelados)",
      resolvedWarning: "Esta estimación descansa en pocos desenlaces resueltos frente a las reservas que siguen abiertas.",
      stillOpen: "Aún abiertas",
      stillOpenHint: "maduras, aún no fallidas",
      blendedConversion: "Mezclada",
      blendedLabel: "incluye reservas sin resolver",
      blendedHint: "incluye reservas sin resolver",
      conversionHint: (closed, cohort, maturity) => `${closed} de ${cohort} reservados hace ${maturity}+ días cerraron`,
      cancelled: (pct) => `${pct} canceladas`,
      inclCancellations: (pct) => `, ${pct} incl. cancelaciones`,
      medianToClose: "Mediana hasta el cierre",
      medianHint: (lots) => `reserva → cierre, ${lots} ${lots === 1 ? "lote" : "lotes"}`,
    },
    liberation: {
      hostagesAria: "Capital aún afuera",
      hostages: (n) => `Capital aún afuera · ${n}`,
      returnedOf: (returned, capital) => `${returned} de ${capital} devueltos`,
      totalReturned: (returned, capital, pct) => `${returned} de ${capital} devueltos · ${pct}`,
      freed: (date) => ` · devuelto el ${date}`,
      afterDays: (days) => ` tras ${days} ${days === 1 ? "día" : "días"}`,
      toGo: (amount) => ` · faltan ${amount}`,
      paidOnTop: (amount) => ` · ${amount} pagados de más`,
      nobodyOwed: "No se le debe nada a ningún sponsor. Todo el capital de los LP está de vuelta.",
      liberatedAria: "Capital devuelto",
      liberated: (n) => `Capital devuelto · ${n}`,
      nobodyFreed: "Ningún sponsor ha recibido capital de vuelta aún. La primera finca que devuelva el 100% de su capital abre esta lista.",
      freeSponsors: (names) => `Sponsors con todas sus posiciones pagadas: ${names}.`,
    },
    celebration: {
      aria: "Actualización",
      close: "Cerrar la actualización",
      kind: { closing: "Un lote acaba de venderse", note_sale: "Se vendió un pagaré", liberation: "Un sponsor acaba de recibir capital de vuelta" },
      sinceLastVisit: "Desde tu última visita",
      thingsHappened: (n) => `${n} cosas pasaron desde tu última visita`,
      onward: "Continuar",
    },
    intro: {
      tagline: (horizon) => `Diez millones para el último día de ${horizon}`,
    },
    milestone: {
      title: (date) => `Hito · ${date}`,
      caption: "de utilidad neta al cierre registrada",
    },
    pageStates: {
      loading: "Cargando fincas y lotes",
      errorTitle: "No se pudieron cargar fincas y lotes",
      retry: "Reintentar",
      partialTables: "Algunas tablas no se pudieron leer; las cifras de abajo son parciales.",
      error: "error",
    },
    questTree: {
      aria: "Cadena de lotes",
      reached: (date) => `Alcanzado el ${date}`,
      toward: (pct, target) => `${pct}% hacia ${target}`,
    },
    stage: { available: "Disponible", reserved: "Reservado", closed: "Cerrado", note_sold: "Pagaré vendido" },
    fitMoney: {
      showFullName: (text) => `Mostrar el nombre completo: ${text}`,
    },
    streaks: {
      closing: {
        title: "Rachas de cierres",
        noun: (n) => (n === 1 ? "cierre" : "cierres"),
        lit: "un lote cerró esta semana — la racha está activa",
        none: "sin cierres la semana pasada ni esta",
        noneYet: "aún no hay cierres",
        moneyLabel: "neta",
        leftOut: (n) => ` · ${n} ${n === 1 ? "cierre anterior" : "cierres anteriores"} fuera del conteo`,
        lastWeeks: (n) => `Últimas ${n} semanas con un cierre`,
      },
      reservation: {
        title: "Rachas de reservas",
        noun: (n) => (n === 1 ? "reserva" : "reservas"),
        lit: "un lote se reservó esta semana — la línea sigue intacta",
        none: "sin reservas la semana pasada ni esta",
        noneYet: "aún no hay reservas",
        moneyLabel: "neta en juego",
        leftOut: (n) => ` · ${n} ${n === 1 ? "reserva anterior" : "reservas anteriores"} fuera del conteo`,
        lastWeeks: (n) => `Últimas ${n} semanas con una reserva`,
      },
      current: "Racha actual",
      weeks: (n) => `${n} ${n === 1 ? "semana" : "semanas"}`,
      daysLeftToKeep: (n) => `${n === 1 ? "queda 1 día" : `quedan ${n} días`} esta semana para mantener la racha`,
      best: "Mejor racha",
      endedOn: (date) => `terminó el ${date}`,
      bestWeek: "Mejor semana",
      bestMonth: "Mejor mes",
      since: (label) => ` · ${label}`,
      weekOf: (date, money, moneyLabel) => `semana del ${date} · ${money} ${moneyLabel}`,
      noneSince: (label) => `ninguna ${label}`,
      bestMonthHint: (month, money, moneyLabel, bestMonths) => `${month} · ${money} ${moneyLabel} · mejor tramo ${bestMonths} ${bestMonths === 1 ? "mes" : "meses"}`,
    },
    trophies: {
      rarity: { common: "Estándar", rare: "Destacado", epic: "Mayor", legendary: "Hito" },
      earnedOn: (date) => `Alcanzado el ${date}`,
      earned: (n) => `Alcanzados · ${n}`,
      noneYet: "Aún no hay logros. El primer cierre gana Primera venta.",
      stillToEarn: (n) => `Por obtener · ${n}`,
      horizonDependent: "Depende del selector de horizonte de salida",
    },
  },
};

/** The realm strings for the language chosen in the drawer. */
export function useRealmStrings(): RealmUiStrings {
  const [lang] = useLang();
  return REALM_UI[lang];
}
