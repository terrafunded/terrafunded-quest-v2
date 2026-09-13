/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * The faces each skin needs for its first screen (display for the counter and titles, heading,
 * body regular, numerals). Chrome only fetches a web font once text using it is laid out, which on
 * a slow link is after the JS bundle has run; preloading the current theme's faces from <head>
 * lets them arrive with the CSS instead, so the first render already uses them (no swap shift).
 */
const FIRST_SCREEN_FONTS: Record<string, string[]> = {
  "iron-crown": ["cinzel-latin-700-normal", "cinzel-latin-900-normal", "crimson-pro-latin-400-normal", "crimson-pro-latin-600-normal"],
  "gilded-realm": ["cinzel-decorative-latin-700-normal", "cormorant-garamond-latin-700-normal", "eb-garamond-latin-400-normal", "eb-garamond-latin-600-normal"],
  "neon-kingdom": ["orbitron-latin-800-normal", "rajdhani-latin-600-normal", "inter-latin-400-normal", "jetbrains-mono-latin-400-normal", "jetbrains-mono-latin-600-normal"],
};

function themeFontPreload(): Plugin {
  return {
    name: "quest:theme-font-preload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const emitted = Object.keys(bundle).filter((f) => f.endsWith(".woff2"));
        const byTheme: Record<string, string[]> = {};
        for (const [theme, faces] of Object.entries(FIRST_SCREEN_FONTS)) {
          byTheme[theme] = faces
            .map((face) => emitted.find((f) => path.basename(f).startsWith(`${face}-`)))
            .filter((f): f is string => Boolean(f))
            .map((f) => `/${f}`);
        }
        const script = `<script>(function(){var f=${JSON.stringify(byTheme)};var t=document.documentElement.getAttribute("data-theme")||"iron-crown";(f[t]||[]).forEach(function(h){var l=document.createElement("link");l.rel="preload";l.as="font";l.type="font/woff2";l.crossOrigin="anonymous";l.href=h;document.head.appendChild(l);});})();</script>`;
        // After the theme bootstrap has set data-theme; still inside <head> so the fonts are
        // requested alongside the stylesheet and the module script.
        return html.replace("</head>", `  ${script}\n  </head>`);
      },
    },
  };
}

/**
 * The Realm's parcel maps read Payments' static geometry files (`/lots/<slug>.json`) same-origin;
 * in production vercel.json rewrites that path to payments.terrafunded.com, and locally the dev
 * and preview servers proxy it the same way (Payments sends no CORS header). Read-only, static.
 */
const LOTS_PROXY = {
  "/lots": { target: "https://payments.terrafunded.com", changeOrigin: true },
};

export default defineConfig({
  plugins: [react(), themeFontPreload()],
  // Besides VITE_*, exactly one more variable reaches the browser bundle: QUEST_ALLOWED_TEST_EMAIL,
  // the questbot e-mail the Payments-staff gate lets in (src/domain/access.ts). The prefix is
  // deliberately narrower than QUEST_ so QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD never can.
  envPrefix: ["VITE_", "QUEST_ALLOWED_"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: LOTS_PROXY,
  },
  preview: {
    proxy: LOTS_PROXY,
  },
  build: {
    // recharts is only loaded by the Treasury and Oracle routes (lazy chunks).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          motion: ["framer-motion"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
