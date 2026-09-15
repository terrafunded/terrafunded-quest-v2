import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** UI chrome for /quests (sales ledger). */
export interface QuestsUiStrings {
  title: string;
  subtitle: string;
  filterFarm: string;
  filterStage: string;
  filterInvestor: string;
  sortBy: string;
  sortPrefix: (label: string) => string;
  allFarms: string;
  allSales: string;
  allLots: string;
  stuckReservations: (days: number) => string;
  expectedThisMonth: (n: number) => string;
  allSponsors: string;
  emptyTitle: string;
  emptyBody: string;
  columns: Record<string, string>;
  ownCapital: string;
  testClient: string;
  reserved: (d: string) => string;
  closed: (d: string) => string;
  stuckAria: string;
  totals: (n: number) => string;
  pendingExpected: (n: number, amount: string) => string;
  noMedianYet: string;
  late: (d: number) => string;
  today: string;
  inDays: (d: number) => string;
  farmMedian: string;
  realmMedian: string;
  medianDays: (source: string, days: number) => string;
}

export const QUESTS_UI: Record<QualityLang, QuestsUiStrings> = {
  en: {
    title: "Quests",
    subtitle:
      "Every lot sale, straight from file cases and notes. Contract price is the file-case figure; sale price follows the note when one exists. Oxygen is the days each closing moved the exit date; a reservation shows the days it would gain, lighter, until it closes. Expected close is the reservation date plus the farm's median reservation→closing lag. Hourglass rows are reservations stuck past 60 days.",
    filterFarm: "Filter by farm",
    filterStage: "Filter by stage",
    filterInvestor: "Filter by investor",
    sortBy: "Sort by",
    sortPrefix: (label) => `Sort: ${label}`,
    allFarms: "All farms",
    allSales: "All sales (with a case)",
    allLots: "All lots",
    stuckReservations: (days) => `Stuck reservations (${days}+ days)`,
    expectedThisMonth: (n) => `Expected this month (${n})`,
    allSponsors: "All sponsors",
    emptyTitle: "No quests match",
    emptyBody: "Loosen the filters to see lots.",
    columns: {
      name: "Lot",
      buyerName: "Buyer",
      stage: "Stage",
      fileCaseSalePrice: "Contract price",
      salePrice: "Sale price",
      landCost: "Land cost",
      grossProfit: "Gross",
      investorTake: "Investor take",
      netProfit: "Net",
      cashRealized: "Cash realized",
      daysInPipeline: "Days",
      expectedCloseDate: "Expected close",
      daysGained: "Oxygen",
    },
    ownCapital: "own capital",
    testClient: "test client",
    reserved: (d) => `Res. ${d}`,
    closed: (d) => `Closed ${d}`,
    stuckAria: "Stuck reservation",
    totals: (n) => `Totals · ${n} lots`,
    pendingExpected: (n, amount) => `${n} pending · ${amount} expected`,
    noMedianYet: "no median yet",
    late: (d) => `${d}d late`,
    today: "today",
    inDays: (d) => `in ${d}d`,
    farmMedian: "farm",
    realmMedian: "realm",
    medianDays: (source, days) => `${source} median ${days}d`,
  },
  es: {
    title: "Misiones",
    subtitle:
      "Cada venta de lote, directo de file cases y pagarés. El precio de contrato es la cifra del file case; el precio de venta sigue el pagaré cuando existe. El oxígeno son los días que cada cierre movió la fecha de salida; una reserva muestra los días que ganaría, más suave, hasta que cierre. El cierre esperado es la fecha de reserva más la mediana reserva→cierre de la finca. Las filas con reloj de arena son reservas atascadas más de 60 días.",
    filterFarm: "Filtrar por finca",
    filterStage: "Filtrar por etapa",
    filterInvestor: "Filtrar por inversionista",
    sortBy: "Ordenar por",
    sortPrefix: (label) => `Orden: ${label}`,
    allFarms: "Todas las fincas",
    allSales: "Todas las ventas (con caso)",
    allLots: "Todos los lotes",
    stuckReservations: (days) => `Reservas atascadas (${days}+ días)`,
    expectedThisMonth: (n) => `Esperadas este mes (${n})`,
    allSponsors: "Todos los sponsors",
    emptyTitle: "Ninguna misión coincide",
    emptyBody: "Afloja los filtros para ver lotes.",
    columns: {
      name: "Lote",
      buyerName: "Comprador",
      stage: "Etapa",
      fileCaseSalePrice: "Precio de contrato",
      salePrice: "Precio de venta",
      landCost: "Costo de tierra",
      grossProfit: "Bruta",
      investorTake: "Parte del inversionista",
      netProfit: "Neta",
      cashRealized: "Efectivo realizado",
      daysInPipeline: "Días",
      expectedCloseDate: "Cierre esperado",
      daysGained: "Oxígeno",
    },
    ownCapital: "capital propio",
    testClient: "cliente de prueba",
    reserved: (d) => `Res. ${d}`,
    closed: (d) => `Cerrado ${d}`,
    stuckAria: "Reserva atascada",
    totals: (n) => `Totales · ${n} lotes`,
    pendingExpected: (n, amount) => `${n} pendientes · ${amount} esperados`,
    noMedianYet: "aún sin mediana",
    late: (d) => `${d}d tarde`,
    today: "hoy",
    inDays: (d) => `en ${d}d`,
    farmMedian: "finca",
    realmMedian: "reino",
    medianDays: (source, days) => `mediana ${source} ${days}d`,
  },
};

export function useQuestsStrings(): QuestsUiStrings {
  const [lang] = useLang();
  return QUESTS_UI[lang];
}
