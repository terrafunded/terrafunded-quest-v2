import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** UI chrome for /realm (map) and farm/lot panels. */
export interface RealmMapUiStrings {
  title: string;
  subtitle: (mapped: number, total: number) => string;
  legendAria: string;
  stuck60: string;
  emptyTitle: string;
  emptyBody: string;
  ownCapital: string;
  lot: {
    buyer: (name: string) => string;
    salePrice: string;
    landCost: string;
    gross: string;
    investorTake: string;
    net: string;
    cashRealized: string;
    noteSoldFor: string;
    reserved: string;
    closed: string;
    daysInPipeline: string;
  };
  farm: {
    capitalDeployed: string;
    landCostPerLot: string;
    revenue: string;
    netProfit: string;
    cashRealized: string;
    capitalOutstanding: string;
    interestAccrued: (rate: number) => string;
    investorShare: (pct: number) => string;
    funded: string;
    monthsSinceFunding: string;
    notYet: string;
    reservationClosing: string;
    medianOver: (n: number, realm: string | null) => string;
    reservedStuck: (reserved: number, stuck: number) => string;
    profitTrapped: (amount: string) => string;
    lotNumber: (n: string) => string;
    unsold: string;
  };
  campaign: {
    aria: string;
    title: (label: string) => string;
    covered: (pct: string) => string;
    goal: string;
    soldSoFar: string;
    lotsLeft: string;
    ofUnsold: (left: string, unsold: number) => string;
    short: (n: number) => string;
    reservationsWaiting: string;
    lastClosing: string;
    daysAgo: (d: number) => string;
    noneYet: string;
    interestAccrued: string;
  };
  card: {
    closedLine: (sold: number, total: number, pct: string, deal: string) => string;
    territoryAria: (name: string, campaign: string | null) => string;
    schematicMismatch: (polygons: number, lots: number) => string;
    seeQuality: string;
    schematicError: string;
    schematicNone: string;
  };
  lotAria: (name: string, stage: string, stuck: boolean) => string;
  scorecard: {
    title: string;
    subtitle: string;
    staleFlag: string;
    staleHint: (days: number) => string;
    ungraded: string;
    buyLike: (names: string, grade: string) => string;
    buyLikeNone: string;
    dealProfitShare: (pct: string, take: string) => string;
    dealInterest: (pct: string, take: string) => string;
    dealOwn: string;
    lotsSplit: (sold: number, reserved: number, available: number) => string;
    col: {
      farm: string;
      grade: string;
      landCost: string;
      avgSale: string;
      netPerLot: string;
      netOverLand: string;
      lots: string;
      sellThrough: string;
      medianClose: string;
      daysSinceRes: string;
      sponsorTake: string;
    };
  };
}

export const REALM_MAP_UI: Record<QualityLang, RealmMapUiStrings> = {
  en: {
    title: "Farms and lots",
    subtitle: (mapped, total) =>
      `One card per farm on its surveyed parcel map — the same drawing Payments' availability map uses, over the aerial it serves. Each lot is tinted by stage (available, reserved, closed, note sold). Farms whose drawing is missing or disagrees with Payments get a schematic plat instead (${mapped} of ${total} mapped). Sell enough lots on a farm to cover its capital and accrued interest. Hover a lot for its figures; click a farm for the status.`,
    legendAria: "Legend",
    stuck60: "Stuck 60+ days",
    emptyTitle: "No farms",
    emptyBody: "No subdivided farms were found.",
    ownCapital: "own capital",
    lot: {
      buyer: (name) => `Buyer: ${name}`,
      salePrice: "Sale price",
      landCost: "Land cost",
      gross: "Gross",
      investorTake: "Investor take",
      net: "Net",
      cashRealized: "Cash realized",
      noteSoldFor: "Note sold for",
      reserved: "Reserved",
      closed: "Closed",
      daysInPipeline: "Days in pipeline",
    },
    farm: {
      capitalDeployed: "Capital deployed",
      landCostPerLot: "Land cost / lot",
      revenue: "Revenue",
      netProfit: "Net profit at closing",
      cashRealized: "Cash realized",
      capitalOutstanding: "Capital outstanding",
      interestAccrued: (rate) => `Interest accrued @ ${rate}%`,
      investorShare: (p) => `Investor share @ ${p}%`,
      funded: "Funded",
      monthsSinceFunding: "Months since funding",
      notYet: "not yet",
      reservationClosing: "Reservation → closing",
      medianOver: (n, realm) => `median over ${n} closed lot${n === 1 ? "" : "s"}${realm ? ` · all farms ${realm}` : ""}`,
      reservedStuck: (r, s) => `${r} reserved · ${s} stuck`,
      profitTrapped: (a) => ` · ${a} of profit trapped`,
      lotNumber: (n) => `Lot ${n}`,
      unsold: "unsold",
    },
    campaign: {
      aria: "Farm status",
      title: (label) => `Farm status · ${label}`,
      covered: (p) => `${p} covered`,
      goal: "Goal (capital + interest)",
      soldSoFar: "Sold so far",
      lotsLeft: "Lots left to cover",
      ofUnsold: (left, unsold) => `${left} of ${unsold} unsold`,
      short: (n) => ` (${n} short)`,
      reservationsWaiting: "Reservations waiting",
      lastClosing: "Last closing",
      daysAgo: (d) => `${d}d ago`,
      noneYet: "none yet",
      interestAccrued: "Interest accrued",
    },
    card: {
      closedLine: (sold, total, p, deal) => `${sold}/${total} closed · ${p} · ${deal}`,
      territoryAria: (name, campaign) => `${name}${campaign ? `, ${campaign}` : ""}`,
      schematicMismatch: (polygons, lots) =>
        `Schematic · the survey drawing has ${polygons} parcel${polygons === 1 ? "" : "s"}, Payments has ${lots} lot${lots === 1 ? "" : "s"} — `,
      seeQuality: "see Data Quality",
      schematicError: "Schematic · the survey drawing could not be loaded from Payments",
      schematicNone: "Schematic · Payments has no survey drawing for this farm",
    },
    lotAria: (name, stage, stuck) => `${name}: ${stage}${stuck ? ", stuck reservation" : ""}`,
    scorecard: {
      title: "Farm scorecard",
      subtitle:
        "One row per subdivided farm. Grade A–D from net profit per sold lot and median days from farm funding to each closing. Farms with no reservation in 90 days are flagged.",
      staleFlag: "No reservation in 90 days",
      staleHint: (days) => `No reservation in the last ${days} days`,
      ungraded: "—",
      buyLike: (names, grade) =>
        `Buy more farms like ${names}: grade ${grade} from high net per lot and fast funding-to-close.`,
      buyLikeNone: "No farm has a sold-lot grade yet, so there is no pattern to copy.",
      dealProfitShare: (pct, take) => `${pct} profit share · ${take} per sold lot`,
      dealInterest: (pct, take) => `${pct} interest · ${take} per sold lot`,
      dealOwn: "own capital",
      lotsSplit: (sold, reserved, available) => `${sold} sold / ${reserved} reserved / ${available} available`,
      col: {
        farm: "Farm",
        grade: "Grade",
        landCost: "Land cost / lot",
        avgSale: "Avg sale",
        netPerLot: "Net / sold lot",
        netOverLand: "Net ÷ land",
        lots: "Sold / reserved / available",
        sellThrough: "Sell-through",
        medianClose: "Median funding → close",
        daysSinceRes: "Days since last reservation",
        sponsorTake: "Deal · sponsor take",
      },
    },
  },
  es: {
    title: "Fincas y lotes",
    subtitle: (mapped, total) =>
      `Una tarjeta por finca en su mapa de parcelas — el mismo dibujo que usa el mapa de disponibilidad de Payments, sobre la aérea que sirve. Cada lote se tiñe por etapa (disponible, reservado, cerrado, pagaré vendido). Las fincas cuyo dibujo falta o no coincide con Payments reciben un esquema (${mapped} de ${total} mapeadas). Hay que vender suficientes lotes para cubrir el capital y el interés de esa finca. Pasa el cursor por un lote para sus cifras; haz clic en una finca para su estado.`,
    legendAria: "Leyenda",
    stuck60: "Atascado 60+ días",
    emptyTitle: "Sin fincas",
    emptyBody: "No se encontraron fincas subdivididas.",
    ownCapital: "capital propio",
    lot: {
      buyer: (name) => `Comprador: ${name}`,
      salePrice: "Precio de venta",
      landCost: "Costo de tierra",
      gross: "Bruta",
      investorTake: "Parte del inversionista",
      net: "Neta",
      cashRealized: "Efectivo realizado",
      noteSoldFor: "Pagaré vendido por",
      reserved: "Reservado",
      closed: "Cerrado",
      daysInPipeline: "Días en pipeline",
    },
    farm: {
      capitalDeployed: "Capital desplegado",
      landCostPerLot: "Costo de tierra / lote",
      revenue: "Ingresos",
      netProfit: "Utilidad neta al cierre",
      cashRealized: "Efectivo realizado",
      capitalOutstanding: "Capital pendiente",
      interestAccrued: (rate) => `Interés devengado @ ${rate}%`,
      investorShare: (p) => `Parte del inversionista @ ${p}%`,
      funded: "Fondeada",
      monthsSinceFunding: "Meses desde el fondeo",
      notYet: "aún no",
      reservationClosing: "Reserva → cierre",
      medianOver: (n, realm) => `mediana sobre ${n} lote${n === 1 ? "" : "s"} cerrado${n === 1 ? "" : "s"}${realm ? ` · todas las fincas ${realm}` : ""}`,
      reservedStuck: (r, s) => `${r} reservados · ${s} atascados`,
      profitTrapped: (a) => ` · ${a} de utilidad atrapada`,
      lotNumber: (n) => `Lote ${n}`,
      unsold: "sin vender",
    },
    campaign: {
      aria: "Estado de la finca",
      title: (label) => `Estado de la finca · ${label}`,
      covered: (p) => `${p} cubierto`,
      goal: "Meta (capital + interés)",
      soldSoFar: "Vendido hasta ahora",
      lotsLeft: "Lotes por cubrir",
      ofUnsold: (left, unsold) => `${left} de ${unsold} sin vender`,
      short: (n) => ` (${n} de déficit)`,
      reservationsWaiting: "Reservas en espera",
      lastClosing: "Último cierre",
      daysAgo: (d) => `hace ${d}d`,
      noneYet: "aún ninguno",
      interestAccrued: "Interés devengado",
    },
    card: {
      closedLine: (sold, total, p, deal) => `${sold}/${total} cerrados · ${p} · ${deal}`,
      territoryAria: (name, campaign) => `${name}${campaign ? `, ${campaign}` : ""}`,
      schematicMismatch: (polygons, lots) =>
        `Esquema · el levantamiento tiene ${polygons} parcela${polygons === 1 ? "" : "s"}, Payments tiene ${lots} lote${lots === 1 ? "" : "s"} — `,
      seeQuality: "ver Calidad de datos",
      schematicError: "Esquema · no se pudo cargar el levantamiento desde Payments",
      schematicNone: "Esquema · Payments no tiene levantamiento para esta finca",
    },
    lotAria: (name, stage, stuck) => `${name}: ${stage}${stuck ? ", reserva atascada" : ""}`,
    scorecard: {
      title: "Tarjeta de fincas",
      subtitle:
        "Una fila por finca subdividida. Nota A–D según la utilidad neta por lote vendido y la mediana de días del fondeo de la finca a cada cierre. Se marcan las fincas sin reserva en 90 días.",
      staleFlag: "Sin reserva en 90 días",
      staleHint: (days) => `Ninguna reserva en los últimos ${days} días`,
      ungraded: "—",
      buyLike: (names, grade) =>
        `Comprar más fincas como ${names}: nota ${grade} por alta utilidad neta por lote y fondeo-a-cierre rápido.`,
      buyLikeNone: "Ninguna finca tiene nota de lotes vendidos, así que no hay patrón que copiar.",
      dealProfitShare: (pct, take) => `${pct} de utilidad · ${take} por lote vendido`,
      dealInterest: (pct, take) => `${pct} de interés · ${take} por lote vendido`,
      dealOwn: "capital propio",
      lotsSplit: (sold, reserved, available) => `${sold} vendidos / ${reserved} reservados / ${available} disponibles`,
      col: {
        farm: "Finca",
        grade: "Nota",
        landCost: "Tierra / lote",
        avgSale: "Venta promedio",
        netPerLot: "Neta / lote vendido",
        netOverLand: "Neta ÷ tierra",
        lots: "Vendidos / reservados / disponibles",
        sellThrough: "Colocación",
        medianClose: "Mediana fondeo → cierre",
        daysSinceRes: "Días desde la última reserva",
        sponsorTake: "Trato · parte del sponsor",
      },
    },
  },
};

export function useRealmMapStrings(): RealmMapUiStrings {
  const [lang] = useLang();
  return REALM_MAP_UI[lang];
}
