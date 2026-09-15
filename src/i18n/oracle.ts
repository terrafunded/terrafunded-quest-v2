import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** UI chrome for /oracle. Future titles/premises stay in the domain. */
export interface OracleUiStrings {
  title: string;
  subtitle: string;
  reset: string;
  futuresAria: string;
  yourFuture: string;
  withReservations: (n: number) => string;
  closingsOnly: string;
  goalReached: string;
  notWithin10: string;
  beforeDeadline: (d: string) => string;
  afterDeadline: (d: string) => string;
  raisePace: string;
  reservationsScheduledFirst: (n: number) => string;
  closingsOnlyHint: string;
  monthsToGoal: string;
  monthsLeft: (n: string) => string;
  netPerLot: string;
  lotsStillNeeded: (n: string) => string;
  netAtDeadline: string;
  farmsBought: (n: number) => string;
  projected: string;
  deadline: string;
  netProfit: string;
  cashRealized: string;
  chartFootStart: (net: string, lots: string) => string;
  chartFootWithRes: (n: number, conv: number, lag: number) => string;
  chartFootClosingsOnly: string;
  chartFootCash: (down: number, note: number, lag: number) => string;
  beyond10: string;
  beforeThe: (d: string) => string;
  afterThe: (d: string) => string;
  notReached: string;
  /** On-screen note: current-pace exit date ignores the horizon selector. */
  paceExitNote: string;
  daysEarlier: (n: string) => string;
  daysLater: (n: string) => string;
  sameDay: string;
  reservationsScheduled: string;
  closingsArrow: (n: string) => string;
  thenLotsMonth: string;
  lotsMonth: string;
  replayingMix: string;
  farmEvery: string;
  mo: string;
  inventoryToday: string;
  lots: (n: string) => string;
  loadSliders: string;
  slider: {
    lotsPerMonth: { label: string; hint: string };
    avgSalePrice: { label: string; hint: string };
    avgLandCost: { label: string; hint: string };
    avgMonthsToSellNote: { label: string; hint: string };
    newFarmEveryMonths: { label: string; hint: string };
    avgLotsPerFarm: { label: string; hint: string };
    investorTakePct: { label: string; hint: string };
  };
  never: string;
  monthsShort: (n: number) => string;
  fundingHint: (hint: string, since: string, farms: number, excluded: number) => string;
}

export const ORACLE_UI: Record<QualityLang, OracleUiStrings> = {
  en: {
    title: "Simulator",
    subtitle:
      "Four projections from the real 90-day averages, then your own. The current pace lets every live reservation close on its expected date, then keeps reserving at the trailing pace. The last line is the closings-only extrapolation, for comparison.",
    reset: "Reset to the current pace",
    futuresAria: "Four futures",
    yourFuture: "Your own future",
    withReservations: (n) => `With the ${n} live reservations`,
    closingsOnly: "Closings only",
    goalReached: "Goal reached",
    notWithin10: "Not within 10 years",
    beforeDeadline: (d) => `Before the ${d} deadline`,
    afterDeadline: (d) => `After the ${d} deadline`,
    raisePace: "Raise pace or margin",
    reservationsScheduledFirst: (n) => ` · ${n} reservations scheduled first`,
    closingsOnlyHint: " · closings only",
    monthsToGoal: "Months to goal",
    monthsLeft: (n) => `${n} months left`,
    netPerLot: "Net profit per lot",
    lotsStillNeeded: (n) => `${n} lots still needed`,
    netAtDeadline: "Net at deadline",
    farmsBought: (n) => `${n} farms bought along the way`,
    projected: "Projected net profit",
    deadline: "Deadline",
    netProfit: "Net profit",
    cashRealized: "Cash realized",
    chartFootStart: (net, lots) => `Starts at ${net} net and ${lots} lots of inventory (available + reserved). `,
    chartFootWithRes: (n, conv, lag) =>
      `The ${n} live reservations close first, each on its expected date at ${conv}% conversion and for its own net profit; the pace above only starts after the ${lag}-day reservation → closing lag. `,
    chartFootClosingsOnly: "Every closing comes from the pace above, from the first month on. ",
    chartFootCash: (down, note, lag) =>
      `Each other closed lot books (price − land) × (1 − take); cash lands as ${down}% down now and ${note}% of the balance ${lag} months later.`,
    beyond10: "beyond 10 years",
    beforeThe: (d) => `before the ${d} deadline`,
    afterThe: (d) => `after the ${d} deadline`,
    notReached: "the goal is not reached within the horizon",
    paceExitNote: "Pace projection — does not move with the exit horizon selector; only the deadline line does.",
    daysEarlier: (n) => `${n} days earlier`,
    daysLater: (n) => `${n} days later`,
    sameDay: "same day",
    reservationsScheduled: "Reservations scheduled",
    closingsArrow: (n) => ` → ${n} closings`,
    thenLotsMonth: "Then lots / month",
    lotsMonth: "Lots / month",
    replayingMix: "replaying today's mix",
    farmEvery: "Farm every",
    mo: "mo",
    inventoryToday: "Inventory today",
    lots: (n) => `${n} lots`,
    loadSliders: "Load into the sliders",
    slider: {
      lotsPerMonth: { label: "Lots closed per month", hint: "Trailing 90-day pace" },
      avgSalePrice: { label: "Average sale price", hint: "Mean price of closed lots" },
      avgLandCost: { label: "Average land cost per lot", hint: "Capital ÷ lots on closed lots" },
      avgMonthsToSellNote: { label: "Months to sell a note", hint: "Closing → note sale" },
      newFarmEveryMonths: { label: "New farm every N months", hint: "Mean gap between fundings" },
      avgLotsPerFarm: { label: "Lots per new farm", hint: "Mean total_lots" },
      investorTakePct: { label: "Investor take (% of gross)", hint: "Blended, from closed lots" },
    },
    never: "never",
    monthsShort: (n) => `${n} mo`,
    fundingHint: (hint, since, farms, excluded) =>
      `${hint} ${since} (${farms} funding${farms === 1 ? "" : "s"}${excluded > 0 ? `, ${excluded} earlier left out` : ""})`,
  },
  es: {
    title: "Simulador",
    subtitle:
      "Cuatro proyecciones desde los promedios reales de 90 días, y luego la tuya. El ritmo actual deja que cada reserva viva cierre en su fecha esperada y luego sigue reservando al ritmo reciente. La última línea es la extrapolación solo de cierres, para comparar.",
    reset: "Restablecer al ritmo actual",
    futuresAria: "Cuatro futuros",
    yourFuture: "Tu propio futuro",
    withReservations: (n) => `Con las ${n} reservas vivas`,
    closingsOnly: "Solo cierres",
    goalReached: "Meta alcanzada",
    notWithin10: "No en 10 años",
    beforeDeadline: (d) => `Antes de la fecha límite ${d}`,
    afterDeadline: (d) => `Después de la fecha límite ${d}`,
    raisePace: "Sube el ritmo o el margen",
    reservationsScheduledFirst: (n) => ` · ${n} reservas programadas primero`,
    closingsOnlyHint: " · solo cierres",
    monthsToGoal: "Meses a la meta",
    monthsLeft: (n) => `${n} meses restantes`,
    netPerLot: "Utilidad neta por lote",
    lotsStillNeeded: (n) => `${n} lotes aún necesarios`,
    netAtDeadline: "Utilidad a la fecha límite",
    farmsBought: (n) => `${n} fincas compradas en el camino`,
    projected: "Utilidad neta proyectada",
    deadline: "Fecha límite",
    netProfit: "Utilidad neta",
    cashRealized: "Efectivo realizado",
    chartFootStart: (net, lots) => `Parte de ${net} netos y ${lots} lotes de inventario (disponibles + reservados). `,
    chartFootWithRes: (n, conv, lag) =>
      `Las ${n} reservas vivas cierran primero, cada una en su fecha esperada a ${conv}% de conversión y con su propia utilidad neta; el ritmo de arriba solo empieza después del desfase de ${lag} días reserva → cierre. `,
    chartFootClosingsOnly: "Cada cierre viene del ritmo de arriba, desde el primer mes. ",
    chartFootCash: (down, note, lag) =>
      `Cada otro lote cerrado registra (precio − tierra) × (1 − parte); el efectivo llega como ${down}% de enganche ahora y ${note}% del saldo ${lag} meses después.`,
    beyond10: "más de 10 años",
    beforeThe: (d) => `antes de la fecha límite ${d}`,
    afterThe: (d) => `después de la fecha límite ${d}`,
    notReached: "la meta no se alcanza dentro del horizonte",
    paceExitNote: "Proyección al ritmo — no se mueve con el selector de horizonte; solo se mueve la línea de fecha límite.",
    daysEarlier: (n) => `${n} días antes`,
    daysLater: (n) => `${n} días después`,
    sameDay: "el mismo día",
    reservationsScheduled: "Reservas programadas",
    closingsArrow: (n) => ` → ${n} cierres`,
    thenLotsMonth: "Luego lotes / mes",
    lotsMonth: "Lotes / mes",
    replayingMix: "reproduciendo la mezcla de hoy",
    farmEvery: "Finca cada",
    mo: "mes",
    inventoryToday: "Inventario hoy",
    lots: (n) => `${n} lotes`,
    loadSliders: "Cargar en los controles",
    slider: {
      lotsPerMonth: { label: "Lotes cerrados por mes", hint: "Ritmo de los últimos 90 días" },
      avgSalePrice: { label: "Precio de venta promedio", hint: "Precio medio de lotes cerrados" },
      avgLandCost: { label: "Costo de tierra promedio por lote", hint: "Capital ÷ lotes en lotes cerrados" },
      avgMonthsToSellNote: { label: "Meses para vender un pagaré", hint: "Cierre → venta de pagaré" },
      newFarmEveryMonths: { label: "Nueva finca cada N meses", hint: "Brecha media entre fondeos" },
      avgLotsPerFarm: { label: "Lotes por finca nueva", hint: "Media de total_lots" },
      investorTakePct: { label: "Parte del inversionista (% de bruta)", hint: "Mezclada, de lotes cerrados" },
    },
    never: "nunca",
    monthsShort: (n) => `${n} mes`,
    fundingHint: (hint, since, farms, excluded) =>
      `${hint} ${since} (${farms} fondeo${farms === 1 ? "" : "s"}${excluded > 0 ? `, ${excluded} anteriores excluidos` : ""})`,
  },
};

export function useOracleStrings(): OracleUiStrings {
  const [lang] = useLang();
  return ORACLE_UI[lang];
}
