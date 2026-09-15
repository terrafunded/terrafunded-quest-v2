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
    title: "Milestones",
    subtitle: (earned, total, byRarity) =>
      `${earned} of ${total} milestones reached — ${byRarity}. Every one is computed from real rows; nothing is awarded by hand.`,
    rarity: { legendary: "landmark", epic: "major", rare: "notable", common: "standard" },
  },
  es: {
    title: "Logros",
    subtitle: (earned, total, byRarity) =>
      `${earned} de ${total} logros alcanzados — ${byRarity}. Cada uno se calcula de filas reales; nada se otorga a mano.`,
    rarity: { legendary: "hito", epic: "mayor", rare: "destacado", common: "estándar" },
  },
};

export function useTrophiesStrings(): TrophiesUiStrings {
  const [lang] = useLang();
  return TROPHIES_UI[lang];
}
