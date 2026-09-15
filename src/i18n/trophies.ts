import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** UI chrome for /trophies. Trophy titles/descriptions stay in the domain. */
export interface TrophiesUiStrings {
  title: string;
  subtitle: (earned: number, total: number, byRarity: string) => string;
  rarity: Record<string, string>;
}

export const TROPHIES_UI: Record<QualityLang, TrophiesUiStrings> = {
  en: {
    title: "Trophies",
    subtitle: (earned, total, byRarity) =>
      `${earned} of ${total} achievements earned — ${byRarity}. Every one is computed from real rows; nothing is awarded by hand.`,
    rarity: { legendary: "legendary", epic: "epic", rare: "rare", common: "common" },
  },
  es: {
    title: "Trofeos",
    subtitle: (earned, total, byRarity) =>
      `${earned} de ${total} logros obtenidos — ${byRarity}. Cada uno se calcula de filas reales; nada se otorga a mano.`,
    rarity: { legendary: "legendario", epic: "épico", rare: "raro", common: "común" },
  },
};

export function useTrophiesStrings(): TrophiesUiStrings {
  const [lang] = useLang();
  return TROPHIES_UI[lang];
}
