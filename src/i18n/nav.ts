import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** Navigation drawer + top-bar chrome. Language selector governs the entire app. */
export interface NavUiStrings {
  quest: string;
  openMenu: string;
  closeMenu: string;
  /** Top-bar Quest wordmark — back to Overview. */
  homeAria: string;
  primaryNav: string;
  signOut: string;
  language: string;
  languageCaption: string;
  exitHorizon: string;
  exitHorizonAria: string;
  exitYear: (year: number) => string;
  exitHorizonCaption: (year: number) => string;
  items: {
    throne: string;
    council: string;
    engine: string;
    warplan: string;
    exodus: string;
    realm: string;
    quests: string;
    pipeline: string;
    sponsors: string;
    treasury: string;
    oracle: string;
    chronicle: string;
    trophies: string;
    quality: string;
  };
  /** Route path → label, same order as the drawer. */
  byPath: Record<string, string>;
}

export const NAV_UI: Record<QualityLang, NavUiStrings> = {
  en: {
    quest: "Quest",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    homeAria: "Quest — back to Overview",
    primaryNav: "Primary",
    signOut: "Sign out",
    language: "Language",
    languageCaption: "This language applies to the entire app.",
    exitHorizon: "Exit horizon",
    exitHorizonAria: "Exit horizon",
    exitYear: (year) => `Exit ${year}`,
    exitHorizonCaption: (year) => `Every required figure on every page is measured against Dec 31, ${year}.`,
    items: {
      throne: "Overview",
      council: "Recommendations",
      engine: "Capital projection",
      warplan: "Plan",
      exodus: "Exodus",
      realm: "Farms and lots",
      quests: "Lots",
      pipeline: "Pipeline",
      sponsors: "Sponsors",
      treasury: "Cash flow",
      oracle: "Simulator",
      chronicle: "Activity",
      trophies: "Milestones",
      quality: "Data Quality",
    },
    byPath: {
      "/": "Overview",
      "/council": "Recommendations",
      "/engine": "Capital projection",
      "/warplan": "Plan",
      "/exodus": "Exodus",
      "/realm": "Farms and lots",
      "/quests": "Lots",
      "/pipeline": "Pipeline",
      "/sponsors": "Sponsors",
      "/treasury": "Cash flow",
      "/oracle": "Simulator",
      "/chronicle": "Activity",
      "/trophies": "Milestones",
      "/quality": "Data Quality",
    },
  },
  es: {
    quest: "Quest",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    homeAria: "Quest — volver a Resumen",
    primaryNav: "Principal",
    signOut: "Cerrar sesión",
    language: "Idioma",
    languageCaption: "Este idioma aplica a toda la aplicación.",
    exitHorizon: "Horizonte de salida",
    exitHorizonAria: "Horizonte de salida",
    exitYear: (year) => `Salida ${year}`,
    exitHorizonCaption: (year) => `Toda cifra requerida en cada pantalla se mide contra el 31 dic ${year}.`,
    items: {
      throne: "Resumen",
      council: "Recomendaciones",
      engine: "Proyección de capital",
      warplan: "Plan",
      exodus: "Exodus",
      realm: "Fincas y lotes",
      quests: "Lotes",
      pipeline: "Pipeline",
      sponsors: "Sponsors",
      treasury: "Flujo de efectivo",
      oracle: "Simulador",
      chronicle: "Actividad",
      trophies: "Logros",
      quality: "Calidad de datos",
    },
    byPath: {
      "/": "Resumen",
      "/council": "Recomendaciones",
      "/engine": "Proyección de capital",
      "/warplan": "Plan",
      "/exodus": "Exodus",
      "/realm": "Fincas y lotes",
      "/quests": "Lotes",
      "/pipeline": "Pipeline",
      "/sponsors": "Sponsors",
      "/treasury": "Flujo de efectivo",
      "/oracle": "Simulador",
      "/chronicle": "Actividad",
      "/trophies": "Logros",
      "/quality": "Calidad de datos",
    },
  },
};

export function useNavStrings(): NavUiStrings {
  const [lang] = useLang();
  return NAV_UI[lang];
}
