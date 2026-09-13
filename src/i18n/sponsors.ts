import type { CapitalKind } from "@/domain";
import type { QualityLang } from "@/domain/quality_human";
import { dateIn } from "@/lib/format";
import { useLang } from "./lang";

/**
 * UI strings for /sponsors: the page, the sponsor cards and the capital donut. Money and
 * percentages arrive already formatted; dates go through `date` so a Spanish view never prints
 * "May 19, 2026". Deal-type and distribution-kind labels live here too — the page used to print
 * the raw `kind` column with its underscore replaced.
 */
export interface SponsorsUiStrings {
  date: (iso: string | null | undefined) => string;
  title: string;
  subtitle: string;
  replay: string;
  emptyTitle: string;
  emptyBody: string;
  footnote: (names: string) => string;
  /** Deal type as the badge prints it; keys are `InvestorSummary.dealType`. */
  deal: Record<string, string>;
  kind: Record<CapitalKind, string>;
  card: {
    capitalDeployed: string;
    capitalReturned: string;
    capitalOutstanding: string;
    profitShareEarned: string;
    profitShareEarnedHint: string;
    profitSharePaid: string;
    profitSharePaidHint: string;
    unpaidShare: string;
    unpaidShareHint: string;
    interestAccrued: string;
    interestAccruedHint: string;
    interestPaid: string;
    interestPaidHint: string;
    unpaidInterest: string;
    farm: string;
    capital: string;
    terms: string;
    lots: string;
    shareEarned: string;
    accrued: string;
    outstanding: string;
    termsShare: (pct: string) => string;
    termsPerYear: (pct: string) => string;
    termsOwn: string;
    distributions: (n: number, total: string) => string;
    nothingPaid: string;
    /** Distribution kinds as `investor_distributions.kind` spells them; unknown kinds fall back to the raw value. */
    distributionKind: Record<string, string>;
  };
  donut: {
    aria: string;
    title: string;
    subtitle: (total: string, sponsors: number, farms: number) => string;
    ringLegend: string;
    shareOfTotal: (pct: string) => string;
    arcLabel: (amount: string, pct: string) => string;
    concentration: (name: string, share: string, topTwoShare: string) => string;
    concentrationOne: (name: string, share: string) => string;
    concentrationNone: string;
    flagged: (threshold: string) => string;
    underThreshold: (threshold: string) => string;
    deployed: string;
    returned: string;
    outstanding: string;
    terms: string;
    farms: string;
    openCard: string;
    recoveredTitle: string;
    recoveredSubtitle: (returned: string, total: string) => string;
    recoveredCentre: string;
    outsideOnly: string;
  };
}

export const SPONSORS_UI: Record<QualityLang, SponsorsUiStrings> = {
  en: {
    date: (iso) => dateIn("en", iso),
    title: "Sponsors",
    subtitle: "Who funded which farm, on what terms, and what they have been paid. Profit-share and fixed-interest are never blended. Every position is a hostage until its capital comes home.",
    replay: "Replay liberation",
    emptyTitle: "No sponsors",
    emptyBody: "No investor is attached to a subdivided farm.",
    footnote: (names) => `Also in the investors table with no farm capital: ${names}.`,
    deal: { fixed_interest: "Fixed interest", profit_share: "Profit share", own_capital: "Own capital", mixed: "Mixed terms", none: "No farm capital" },
    kind: { own_capital: "Own capital", profit_share: "Profit share", fixed_interest: "Fixed interest", other: "Other terms" },
    card: {
      capitalDeployed: "Capital deployed",
      capitalReturned: "Capital returned",
      capitalOutstanding: "Capital outstanding",
      profitShareEarned: "Profit share earned",
      profitShareEarnedHint: "Share of realized gross on closed lots",
      profitSharePaid: "Profit share paid",
      profitSharePaidHint: "kind = profit_share rows",
      unpaidShare: "Unpaid share",
      unpaidShareHint: "Earned − paid",
      interestAccrued: "Interest accrued",
      interestAccruedHint: "Daily on outstanding capital",
      interestPaid: "Interest paid",
      interestPaidHint: "Non-capital distributions",
      unpaidInterest: "Unpaid interest",
      farm: "Farm",
      capital: "Capital",
      terms: "Terms",
      lots: "Lots",
      shareEarned: "Share earned",
      accrued: "Accrued",
      outstanding: "Outstanding",
      termsShare: (pct) => `${pct} share`,
      termsPerYear: (pct) => `${pct} / yr`,
      termsOwn: "own",
      distributions: (n, total) => `Distributions · ${n} · ${total}`,
      nothingPaid: "Nothing paid out yet.",
      distributionKind: { capital_return: "capital return", profit_share: "profit share", interest: "interest" },
    },
    donut: {
      aria: "Capital deployed by sponsor",
      title: "Capital deployed by sponsor",
      subtitle: (total, sponsors, farms) => `${total} on ${farms} ${farms === 1 ? "farm" : "farms"} from ${sponsors} ${sponsors === 1 ? "source" : "sources"}. Inner ring: own capital, profit share and fixed interest — never blended.`,
      ringLegend: "Inner ring · by kind of capital",
      shareOfTotal: (pct) => `${pct} of total`,
      arcLabel: (amount, pct) => `${amount} · ${pct}`,
      concentration: (name, share, topTwoShare) => `${name} holds ${share} of deployed capital; the top two sponsors hold ${topTwoShare}.`,
      concentrationOne: (name, share) => `${name} holds ${share} of deployed capital and is the only outside sponsor.`,
      concentrationNone: "No outside capital is deployed.",
      flagged: (threshold) => `Above the ${threshold} concentration line.`,
      underThreshold: (threshold) => `Under the ${threshold} concentration line.`,
      deployed: "Deployed",
      returned: "Returned",
      outstanding: "Outstanding",
      terms: "Terms",
      farms: "Farms",
      openCard: "Click to open the sponsor's card",
      recoveredTitle: "Capital returned",
      recoveredSubtitle: (returned, total) => `${returned} of ${total} outside capital is home.`,
      recoveredCentre: "recovered",
      outsideOnly: "Outside capital only — nobody is owed the own capital.",
    },
  },
  es: {
    date: (iso) => dateIn("es", iso),
    title: "Sponsors",
    subtitle: "Quién financió qué finca, en qué términos y cuánto se le ha pagado. Reparto de utilidades e interés fijo nunca se mezclan. Cada posición es un rehén hasta que su capital vuelve a casa.",
    replay: "Repetir la liberación",
    emptyTitle: "Sin sponsors",
    emptyBody: "Ningún inversionista está ligado a una finca subdividida.",
    footnote: (names) => `También en la tabla de inversionistas, sin capital en fincas: ${names}.`,
    deal: { fixed_interest: "Interés fijo", profit_share: "Reparto de utilidades", own_capital: "Capital propio", mixed: "Términos mixtos", none: "Sin capital en fincas" },
    kind: { own_capital: "Capital propio", profit_share: "Reparto de utilidades", fixed_interest: "Interés fijo", other: "Otros términos" },
    card: {
      capitalDeployed: "Capital desplegado",
      capitalReturned: "Capital devuelto",
      capitalOutstanding: "Capital pendiente",
      profitShareEarned: "Utilidad ganada",
      profitShareEarnedHint: "Parte del bruto realizado en lotes cerrados",
      profitSharePaid: "Utilidad pagada",
      profitSharePaidHint: "Filas con kind = profit_share",
      unpaidShare: "Utilidad por pagar",
      unpaidShareHint: "Ganada − pagada",
      interestAccrued: "Interés devengado",
      interestAccruedHint: "Diario sobre el capital pendiente",
      interestPaid: "Interés pagado",
      interestPaidHint: "Distribuciones que no son capital",
      unpaidInterest: "Interés por pagar",
      farm: "Finca",
      capital: "Capital",
      terms: "Términos",
      lots: "Lotes",
      shareEarned: "Utilidad ganada",
      accrued: "Devengado",
      outstanding: "Pendiente",
      termsShare: (pct) => `${pct} de utilidad`,
      termsPerYear: (pct) => `${pct} anual`,
      termsOwn: "propio",
      distributions: (n, total) => `Distribuciones · ${n} · ${total}`,
      nothingPaid: "Aún no se ha pagado nada.",
      distributionKind: { capital_return: "devolución de capital", profit_share: "reparto de utilidades", interest: "interés" },
    },
    donut: {
      aria: "Capital desplegado por sponsor",
      title: "Capital desplegado por sponsor",
      subtitle: (total, sponsors, farms) => `${total} en ${farms} ${farms === 1 ? "finca" : "fincas"} desde ${sponsors} ${sponsors === 1 ? "fuente" : "fuentes"}. Anillo interior: capital propio, reparto de utilidades e interés fijo — nunca mezclados.`,
      ringLegend: "Anillo interior · por tipo de capital",
      shareOfTotal: (pct) => `${pct} del total`,
      arcLabel: (amount, pct) => `${amount} · ${pct}`,
      concentration: (name, share, topTwoShare) => `${name} tiene el ${share} del capital desplegado; los dos mayores sponsors suman el ${topTwoShare}.`,
      concentrationOne: (name, share) => `${name} tiene el ${share} del capital desplegado y es el único sponsor externo.`,
      concentrationNone: "No hay capital externo desplegado.",
      flagged: (threshold) => `Por encima de la línea de concentración del ${threshold}.`,
      underThreshold: (threshold) => `Por debajo de la línea de concentración del ${threshold}.`,
      deployed: "Desplegado",
      returned: "Devuelto",
      outstanding: "Pendiente",
      terms: "Términos",
      farms: "Fincas",
      openCard: "Clic para abrir la tarjeta del sponsor",
      recoveredTitle: "Capital devuelto",
      recoveredSubtitle: (returned, total) => `${returned} de ${total} de capital externo ya volvieron.`,
      recoveredCentre: "recuperado",
      outsideOnly: "Solo capital externo: el capital propio no se le debe a nadie.",
    },
  },
};

/** The /sponsors strings for the language chosen in the drawer. */
export function useSponsorsStrings(): SponsorsUiStrings {
  const [lang] = useLang();
  return SPONSORS_UI[lang];
}
