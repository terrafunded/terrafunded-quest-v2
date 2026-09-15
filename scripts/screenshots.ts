/**
 * Screenshot every route in one theme + language at desktop and 380px (Spanish length check).
 *
 *   npx tsx scripts/screenshots.ts --theme iron-crown --lang es --out docs/screenshots/i18n/es [--base http://localhost:4173]
 *
 * Read-only: signs in with QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD, sets quest.theme + quest.lang,
 * visits each route, waits for the realm to load, writes JPEGs.
 * Assumes `npm run preview` (or `npm run dev`) is already serving the app.
 */
import { chromium, devices, type Page } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { mkdirSync } from "node:fs";
import path from "node:path";

loadDotenv();

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a.startsWith("--")) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(a.slice(2), next);
      i++;
    } else args.set(a.slice(2), "true");
  }
}

const THEME = args.get("theme") ?? "iron-crown";
const LANG = (args.get("lang") ?? "en") as "en" | "es";
const OUT = args.get("out") ?? `docs/screenshots/i18n/${LANG}`;
const BASE = args.get("base") ?? "http://localhost:4173";
const FULL = args.get("full") === "true";
const ONLY = args.get("only");

const ROUTES = [
  "/login",
  "/",
  "/council",
  "/engine",
  "/warplan",
  "/exodus",
  "/realm",
  "/quests",
  "/pipeline",
  "/sponsors",
  "/treasury",
  "/oracle",
  "/chronicle",
  "/trophies",
  "/quality",
];

/** Desktop + 380px (user asked for Spanish overflow check at ~380). */
const WIDTHS = [
  { name: "1280", viewport: { width: 1280, height: 800 }, mobile: false },
  { name: "380", viewport: { width: 380, height: 844 }, mobile: true },
];

const SETTLE_MS: Record<string, number> = { "iron-crown": 3200, "gilded-realm": 2800, "neon-kingdom": 1800 };

const LOGIN = {
  en: { email: "Email", password: "Password", enter: "Enter" },
  es: { email: "Correo", password: "Contraseña", enter: "Entrar" },
} as const;

function slug(route: string) {
  return route === "/" ? "throne" : route.replace(/^\//, "").replace(/\//g, "-");
}

async function waitRealmGone(page: Page) {
  await page
    .locator('[role="status"][aria-label="Loading farm and lot data"], [role="status"][aria-label="Cargando fincas y lotes"]')
    .first()
    .waitFor({ state: "detached", timeout: 30_000 })
    .catch(() => undefined);
}

async function settle(page: Page, route: string) {
  if (route !== "/login") await waitRealmGone(page);
  await page.evaluate(() => {
    sessionStorage.setItem("quest.intro.seen", "1");
  });
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(SETTLE_MS[THEME] ?? 2500);
}

async function main() {
  const email = process.env.QUEST_TEST_EMAIL;
  const password = process.env.QUEST_TEST_PASSWORD;
  if (!email || !password) throw new Error("QUEST_TEST_EMAIL and QUEST_TEST_PASSWORD must be set");
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const labels = LOGIN[LANG];

  for (const w of WIDTHS) {
    const context = await browser.newContext({
      ...(w.mobile ? { ...devices["Desktop Chrome"], isMobile: true, hasTouch: true } : devices["Desktop Chrome"]),
      viewport: w.viewport,
      deviceScaleFactor: 1,
      colorScheme: THEME === "gilded-realm" ? "light" : "dark",
      locale: LANG === "es" ? "es-MX" : "en-US",
    });
    await context.addInitScript(
      ([theme, lang]) => {
        try {
          localStorage.setItem("quest.theme", theme!);
          localStorage.setItem("quest.lang", lang!);
          sessionStorage.setItem("quest.intro.seen", "1");
          localStorage.setItem("quest.lastVisit", new Date().toISOString());
          localStorage.setItem("quest.liberations.seen", JSON.stringify(["liberation:seen-all"]));
        } catch {
          /* ignore */
        }
      },
      [THEME, LANG],
    );
    const page = await context.newPage();

    await page.goto(`${BASE}/login`);
    await page.getByLabel(labels.email).fill(email);
    await page.getByLabel(labels.password).fill(password);
    await page.getByRole("button", { name: labels.enter }).click();
    await page.waitForURL(/\/$/, { timeout: 30_000 });
    await waitRealmGone(page);
    await page.goto(`${BASE}/sponsors`);
    await waitRealmGone(page);
    await page.keyboard.press("Escape").catch(() => undefined);

    for (const route of ROUTES) {
      if (ONLY && slug(route) !== ONLY) continue;
      if (route === "/login") {
        const anon = await browser.newContext({
          viewport: w.viewport,
          deviceScaleFactor: 1,
          colorScheme: THEME === "gilded-realm" ? "light" : "dark",
          locale: LANG === "es" ? "es-MX" : "en-US",
        });
        await anon.addInitScript(
          ([theme, lang]) => {
            localStorage.setItem("quest.theme", theme!);
            localStorage.setItem("quest.lang", lang!);
          },
          [THEME, LANG],
        );
        const p = await anon.newPage();
        await p.goto(`${BASE}/login`);
        await p.waitForTimeout(900);
        await p.screenshot({ path: path.join(OUT, `login-${w.name}.jpg`), type: "jpeg", quality: 78, fullPage: FULL });
        await anon.close();
        continue;
      }
      await page.goto(`${BASE}${route}`);
      await settle(page, route);
      await page.screenshot({
        path: path.join(OUT, `${slug(route)}-${w.name}.jpg`),
        type: "jpeg",
        quality: 78,
        fullPage: FULL,
      });
      process.stdout.write(`${THEME} ${LANG} ${route} @${w.name}\n`);
    }
    await context.close();
  }
  await browser.close();
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
