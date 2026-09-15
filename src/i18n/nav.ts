import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

/** Navigation drawer + top-bar chrome. Language selector governs the entire app. */
export interface NavUiStrings {
  quest: string;
  openMenu: string;
  closeMenu: string;
  /** Top-bar Quest wordmark — back to Throne Room. */
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
    homeAria: "Quest — back to the Throne Room",
    primaryNav: "Primary",
    signOut: "Sign out",
    language: "Language",
    languageCaption: "This language applies to the entire app.",
    exitHorizon: "Exit horizon",
    exitHorizonAria: "Exit horizon",
    exitYear: (year) => `Exit ${year}`,
    exitHorizonCaption: (year) => `Every required figure on every page is measured against Dec 31, ${year}.`,
    items: {
      throne: "Throne Room",
      council: "Council",
      engine: "The Engine",
      warplan: "War Plan",
      exodus: "Exodus",
      realm: "The Realm",
      quests: "Quests",
      pipeline: "Pipeline",
      sponsors: "Sponsors",
      treasury: "Treasury",
      oracle: "Oracle",
      chronicle: "Chronicle",
      trophies: "Trophies",
      quality: "Data Quality",
    },
    byPath: {
      "/": "Throne Room",
      "/council": "Council",
      "/engine": "The Engine",
      "/warplan": "War Plan",
      "/exodus": "Exodus",
      "/realm": "The Realm",
      "/quests": "Quests",
      "/pipeline": "Pipeline",
      "/sponsors": "Sponsors",
      "/treasury": "Treasury",
      "/oracle": "Oracle",
      "/chronicle": "Chronicle",
      "/trophies": "Trophies",
      "/quality": "Data Quality",
    },
  },
  es: {
    quest: "Quest",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    homeAria: "Quest — volver a la Sala del Trono",
    primaryNav: "Principal",
    signOut: "Cerrar sesión",
    language: "Idioma",
    languageCaption: "Este idioma aplica a toda la aplicación.",
    exitHorizon: "Horizonte de salida",
    exitHorizonAria: "Horizonte de salida",
    exitYear: (year) => `Salida ${year}`,
    exitHorizonCaption: (year) => `Toda cifra requerida en cada pantalla se mide contra el 31 dic ${year}.`,
    items: {
      throne: "Sala del Trono",
      council: "Consejo",
      engine: "El Motor",
      warplan: "Plan de Guerra",
      exodus: "Exodus",
      realm: "El Reino",
      quests: "Misiones",
      pipeline: "Embudo",
      sponsors: "Sponsors",
      treasury: "Tesorería",
      oracle: "Oráculo",
      chronicle: "Crónica",
      trophies: "Trofeos",
      quality: "Calidad de datos",
    },
    byPath: {
      "/": "Sala del Trono",
      "/council": "Consejo",
      "/engine": "El Motor",
      "/warplan": "Plan de Guerra",
      "/exodus": "Exodus",
      "/realm": "El Reino",
      "/quests": "Misiones",
      "/pipeline": "Embudo",
      "/sponsors": "Sponsors",
      "/treasury": "Tesorería",
      "/oracle": "Oráculo",
      "/chronicle": "Crónica",
      "/trophies": "Trofeos",
      "/quality": "Calidad de datos",
    },
  },
};

export function useNavStrings(): NavUiStrings {
  const [lang] = useLang();
  return NAV_UI[lang];
}
