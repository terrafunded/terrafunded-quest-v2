import type { CampaignState } from "@/domain";
import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/**
 * Shared labels: stages, deals, campaign states, plurals, assumption badge.
 * Canonical Spanish is fixed in docs/glossary.md — do not invent synonyms.
 */
export interface CommonUiStrings {
  stage: Record<string, string>;
  deal: Record<string, string>;
  dealShort: Record<string, string>;
  campaign: Record<CampaignState, string>;
  campaignPending: (n: number) => string;
  campaignToCover: (n: number) => string;
  assumption: string;
  lots: (n: number) => string;
  farms: (n: number) => string;
  days: (n: number) => string;
  reservations: (n: number) => string;
  closings: (n: number) => string;
  sponsors: (n: number) => string;
  ownCapital: string;
  required: string;
  peak: (amount: string) => string;
  asOf: (date: string) => string;
  realPrefix: string;
}

function pluralEn(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function pluralEs(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const COMMON_UI: Record<QualityLang, CommonUiStrings> = {
  en: {
    stage: {
      available: "Available",
      reserved: "Reserved",
      closed: "Closed",
      note_sold: "Note sold",
    },
    deal: {
      fixed_interest: "Fixed interest",
      profit_share: "Profit share",
      own_capital: "Own capital",
    },
    dealShort: {
      fixed_interest: "Fixed",
      profit_share: "Share",
      own_capital: "Own",
    },
    campaign: {
      conquered: "Farm paid off",
      under_siege: "Farm not yet covered",
      closing_pending: "Closing pending",
      losing_ground: "No recent closings",
    },
    campaignPending: (n) => ` · ${n} pending`,
    campaignToCover: (n) => ` · ${n} to cover`,
    assumption: "ASSUMPTION",
    lots: (n) => pluralEn(n, "lot", "lots"),
    farms: (n) => pluralEn(n, "farm", "farms"),
    days: (n) => pluralEn(n, "day", "days"),
    reservations: (n) => pluralEn(n, "reservation", "reservations"),
    closings: (n) => pluralEn(n, "closing", "closings"),
    sponsors: (n) => pluralEn(n, "sponsor", "sponsors"),
    ownCapital: "own capital",
    required: "required",
    peak: (amount) => `peak ${amount}`,
    asOf: (d) => `as of ${d}`,
    realPrefix: "real:",
  },
  es: {
    stage: {
      available: "Disponible",
      reserved: "Reservado",
      closed: "Cerrado",
      note_sold: "Pagaré vendido",
    },
    deal: {
      fixed_interest: "Interés fijo",
      profit_share: "Reparto de utilidades",
      own_capital: "Capital propio",
    },
    dealShort: {
      fixed_interest: "Fijo",
      profit_share: "Reparto",
      own_capital: "Propio",
    },
    campaign: {
      conquered: "Finca pagada",
      under_siege: "Finca por cubrir",
      closing_pending: "Cierre pendiente",
      losing_ground: "Sin cierres recientes",
    },
    campaignPending: (n) => ` · ${n} pendiente${n === 1 ? "" : "s"}`,
    campaignToCover: (n) => ` · ${n} por cubrir`,
    assumption: "SUPUESTO",
    lots: (n) => pluralEs(n, "lote", "lotes"),
    farms: (n) => pluralEs(n, "finca", "fincas"),
    days: (n) => pluralEs(n, "día", "días"),
    reservations: (n) => pluralEs(n, "reserva", "reservas"),
    closings: (n) => pluralEs(n, "cierre", "cierres"),
    sponsors: (n) => pluralEs(n, "sponsor", "sponsors"),
    ownCapital: "capital propio",
    required: "requerido",
    peak: (amount) => `pico ${amount}`,
    asOf: (d) => `al ${d}`,
    realPrefix: "real:",
  },
};

export function useCommonStrings(): CommonUiStrings {
  const [lang] = useLang();
  return COMMON_UI[lang];
}
