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
}

export const TREASURY_UI: Record<QualityLang, TreasuryUiStrings> = {
  en: {
    title: "Treasury",
    subtitle:
      "Real cash only. In: down payments at closing (full price on cash deals), farm-lot note sales, and other note sales outside the farms. Out: every investor distribution. Monthly buyer collections are out of scope.",
    cashIn: "Cash in",
    cashOut: "Cash out to sponsors",
    netCash: "Net cash",
    noteSalesAll: "Note sales, all",
    cashInHintFarm: (down, notes) => `Farm-lot cash: down payments ${down} · notes ${notes}`,
    cashInHintReconcile: (realized, other, total, otherCompact) =>
      `Cash realized ${realized} + other note sales ${other} = Treasury cash in ${total} · includes non-farm note sales (${otherCompact})`,
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
  },
  es: {
    title: "Tesorería",
    subtitle:
      "Solo efectivo real. Entrada: enganches al cierre (precio completo en ventas de contado), ventas de pagarés de lotes de finca y otras ventas de pagarés fuera de las fincas. Salida: cada distribución a inversionistas. Las colecciones mensuales del comprador quedan fuera de alcance.",
    cashIn: "Efectivo entrante",
    cashOut: "Efectivo a sponsors",
    netCash: "Efectivo neto",
    noteSalesAll: "Ventas de pagarés, todas",
    cashInHintFarm: (down, notes) => `Efectivo de lotes de finca: enganches ${down} · pagarés ${notes}`,
    cashInHintReconcile: (realized, other, total, otherCompact) =>
      `Efectivo realizado ${realized} + otras ventas de pagarés ${other} = Entrada de Tesorería ${total} · incluye pagarés fuera de fincas (${otherCompact})`,
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
  },
};

export function useTreasuryStrings(): TreasuryUiStrings {
  const [lang] = useLang();
  return TREASURY_UI[lang];
}
