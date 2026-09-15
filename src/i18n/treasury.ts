import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** UI chrome for /treasury. */
export interface TreasuryUiStrings {
  title: string;
  subtitle: string;
  cashIn: string;
  cashOut: string;
  netCash: string;
  noteSalesAll: string;
  cashInHintFarm: (down: string, notes: string) => string;
  cashInHintReconcile: (realized: string, other: string, total: string, otherCompact: string) => string;
  cashOutHint: (capital: string, share: string) => string;
  noteSalesHintOther: (farm: string, other: string) => string;
  noteSalesHintAllFarm: string;
  empty: string;
  monthlyChart: string;
  cumulativeChart: string;
  series: {
    downPayments: string;
    noteSales: string;
    otherNotes: string;
    toSponsors: string;
    cumulativeNet: string;
    cumulativeIn: string;
    cumulativeOut: string;
  };
  col: {
    month: string;
    downPayments: string;
    noteSales: string;
    otherNotes: string;
    cashIn: string;
    capitalReturned: string;
    profitShared: string;
    cashOut: string;
    net: string;
    cumulative: string;
  };
  undated: string;
  undatedHint: string;
  totals: string;
  notes: {
    title: string;
    subtitle: string;
    realized: string;
    unrealized: string;
    totalCost: string;
    totalIdentity: (total: string, realized: string, unrealized: string) => string;
    sell: string;
    hold: string;
    deliver: string;
    sellHint: string;
    holdHint: string;
    deliverHint: string;
    cashNow: string;
    totalValue: string;
    liquidityCost: string;
    lpReturnable: string;
    lpStillOwed: (amount: string) => string;
    perNote: string;
    colFarm: string;
    colLot: string;
    colFace: string;
    colSale: string;
    colCost: string;
    footnote: string;
  };
}

export const TREASURY_UI: Record<QualityLang, TreasuryUiStrings> = {
  en: {
    title: "Cash flow",
    subtitle:
      "Real cash only. In: down payments at closing (full price on cash deals), farm-lot note sales, and other note sales outside the farms. Out: every investor distribution. Monthly buyer collections are out of scope.",
    cashIn: "Cash in",
    cashOut: "Cash out to sponsors",
    netCash: "Net cash",
    noteSalesAll: "Note sales, all",
    cashInHintFarm: (down, notes) => `Farm-lot cash: down payments ${down} · notes ${notes}`,
    cashInHintReconcile: (realized, other, total, otherCompact) =>
      `Cash realized ${realized} + other note sales ${other} = Cash in ${total} · includes non-farm note sales (${otherCompact})`,
    cashOutHint: (capital, share) => `Capital ${capital} · profit share ${share}`,
    noteSalesHintOther: (farm, other) => `Farm lots ${farm} · ${other} on notes outside the farms (the gap vs Cash realized)`,
    noteSalesHintAllFarm: "all on farm lots",
    empty: "No cash movements yet",
    monthlyChart: "Monthly cash in vs. out",
    cumulativeChart: "Cumulative",
    series: {
      downPayments: "Down payments",
      noteSales: "Note sales",
      otherNotes: "Other notes",
      toSponsors: "To sponsors",
      cumulativeNet: "Cumulative net",
      cumulativeIn: "Cumulative in",
      cumulativeOut: "Cumulative out",
    },
    col: {
      month: "Month",
      downPayments: "Down payments",
      noteSales: "Note sales",
      otherNotes: "Other notes",
      cashIn: "Cash in",
      capitalReturned: "Capital returned",
      profitShared: "Profit shared",
      cashOut: "Cash out",
      net: "Net",
      cumulative: "Cumulative",
    },
    undated: "Undated closings",
    undatedHint: "Completed file cases with no closing_date (see Data Quality). Counted in totals, not in any month.",
    totals: "Totals",
    notes: {
      title: "Notes: sell, hold, or deliver",
      subtitle:
        "The measured cost of turning notes into cash, and three ways to treat the notes still held. Cash in hand is farm-lot cash already realized (down payments + notes sold), plus sale proceeds only if you sell the held book now. Hold does not invent collections by the exit deadline.",
      realized: "Realized liquidity cost",
      unrealized: "Unrealized if sold at the measured ratio",
      totalCost: "Total liquidity cost",
      totalIdentity: (total, realized, unrealized) => `${total} = realized ${realized} + unrealized ${unrealized}`,
      sell: "Sell now",
      hold: "Hold to collect",
      deliver: "Deliver to LPs at face",
      sellHint: "Sell every held note at the measured sale ratio",
      holdHint: "Keep the notes and collect them — no sale, no invented payment schedule",
      deliverHint: "Assign the notes to limited partners at face value",
      cashNow: "Cash in hand now",
      totalValue: "Total value",
      liquidityCost: "Liquidity cost",
      lpReturnable: "LP capital returnable by the deadline",
      lpStillOwed: (amount) => `${amount} still owed`,
      perNote: "Held notes",
      colFarm: "Farm",
      colLot: "Lot",
      colFace: "Face balance",
      colSale: "Measured sale value",
      colCost: "Cost of selling",
      footnote:
        "Numeric effect only. Delivering notes to limited partners requires legal review and each partner's acceptance.",
    },
  },
  es: {
    title: "Flujo de efectivo",
    subtitle:
      "Solo efectivo real. Entrada: enganches al cierre (precio completo en ventas de contado), ventas de pagarés de lotes de finca y otras ventas de pagarés fuera de las fincas. Salida: cada distribución a inversionistas. Las colecciones mensuales del comprador quedan fuera de alcance.",
    cashIn: "Efectivo entrante",
    cashOut: "Efectivo a sponsors",
    netCash: "Efectivo neto",
    noteSalesAll: "Ventas de pagarés, todas",
    cashInHintFarm: (down, notes) => `Efectivo de lotes de finca: enganches ${down} · pagarés ${notes}`,
    cashInHintReconcile: (realized, other, total, otherCompact) =>
      `Efectivo realizado ${realized} + otras ventas de pagarés ${other} = Entrada de efectivo ${total} · incluye pagarés fuera de fincas (${otherCompact})`,
    cashOutHint: (capital, share) => `Capital ${capital} · reparto de utilidades ${share}`,
    noteSalesHintOther: (farm, other) => `Lotes de finca ${farm} · ${other} en pagarés fuera de las fincas (la brecha vs Efectivo realizado)`,
    noteSalesHintAllFarm: "todas en lotes de finca",
    empty: "Aún no hay movimientos de efectivo",
    monthlyChart: "Efectivo mensual: entrada vs salida",
    cumulativeChart: "Acumulado",
    series: {
      downPayments: "Enganches",
      noteSales: "Ventas de pagarés",
      otherNotes: "Otros pagarés",
      toSponsors: "A sponsors",
      cumulativeNet: "Neto acumulado",
      cumulativeIn: "Entrada acumulada",
      cumulativeOut: "Salida acumulada",
    },
    col: {
      month: "Mes",
      downPayments: "Enganches",
      noteSales: "Ventas de pagarés",
      otherNotes: "Otros pagarés",
      cashIn: "Entrada",
      capitalReturned: "Capital devuelto",
      profitShared: "Utilidades repartidas",
      cashOut: "Salida",
      net: "Neto",
      cumulative: "Acumulado",
    },
    undated: "Cierres sin fecha",
    undatedHint: "File cases completados sin closing_date (ver Calidad de datos). Cuentan en totales, no en ningún mes.",
    totals: "Totales",
    notes: {
      title: "Pagarés: vender, cobrar o entregar",
      subtitle:
        "El costo medido de convertir pagarés en efectivo, y tres formas de tratar los que siguen en cartera. El efectivo en mano es el de lotes de finca ya realizado (enganches + pagarés vendidos), más el producto de venta solo si vendes los pagarés retenidos ahora. Cobrar no inventa un calendario de cobros antes de la fecha límite.",
      realized: "Costo de liquidez realizado",
      unrealized: "No realizado si se vende al ratio medido",
      totalCost: "Costo de liquidez total",
      totalIdentity: (total, realized, unrealized) => `${total} = realizado ${realized} + no realizado ${unrealized}`,
      sell: "Vender ahora",
      hold: "Cobrar a plazo",
      deliver: "Entregar a LP a valor nominal",
      sellHint: "Vender cada pagaré en cartera al ratio de venta medido",
      holdHint: "Quedarse los pagarés y cobrarlos — sin venta, sin calendario inventado",
      deliverHint: "Asignar los pagarés a limited partners a valor nominal",
      cashNow: "Efectivo en mano ahora",
      totalValue: "Valor total",
      liquidityCost: "Costo de liquidez",
      lpReturnable: "Capital LP devolvible para la fecha límite",
      lpStillOwed: (amount) => `${amount} aún adeudado`,
      perNote: "Pagarés en cartera",
      colFarm: "Finca",
      colLot: "Lote",
      colFace: "Saldo nominal",
      colSale: "Valor de venta medido",
      colCost: "Costo de vender",
      footnote:
        "Solo el efecto numérico. Entregar pagarés a limited partners requiere revisión legal y la aceptación de cada socio.",
    },
  },
};

export function useTreasuryStrings(): TreasuryUiStrings {
  const [lang] = useLang();
  return TREASURY_UI[lang];
}
