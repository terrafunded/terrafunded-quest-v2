import type { QualityLang } from "@/domain/quality_human";
import { useLang } from "./lang";

export interface LoginUiStrings {
  brand: string;
  tagline: string;
  email: string;
  password: string;
  submit: string;
  signInAria: string;
  notConfigured: string;
  footer: string;
  homeAria: string;
}

export const LOGIN_UI: Record<QualityLang, LoginUiStrings> = {
  en: {
    brand: "Quest",
    tagline: "Sign in to Quest",
    email: "Email",
    password: "Password",
    submit: "Enter",
    signInAria: "Sign in",
    notConfigured:
      "Supabase is not configured. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    footer: "Read-only, and for the TerraFunded team only: Payments staff (role admin) may enter; nothing here can write.",
    homeAria: "Quest — back to Overview",
  },
  es: {
    brand: "Quest",
    tagline: "Entra a Quest",
    email: "Correo",
    password: "Contraseña",
    submit: "Entrar",
    signInAria: "Iniciar sesión",
    notConfigured:
      "Supabase no está configurado. Copia .env.example a .env y define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
    footer: "Solo lectura, y solo para el equipo TerraFunded: el personal de Payments (rol admin) puede entrar; aquí no se escribe nada.",
    homeAria: "Quest — volver a Resumen",
  },
};

export function useLoginStrings(): LoginUiStrings {
  const [lang] = useLang();
  return LOGIN_UI[lang];
}
