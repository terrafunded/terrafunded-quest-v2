/**
 * Screenshot every route in one theme at 1280 and 390 wide (the POLISH RULE evidence).
 *
 *   npx tsx scripts/screenshots.ts --theme iron-crown --out docs/screenshots/iron-crown/pass-01 [--full] [--base http://localhost:4173]
 *
 * Read-only: signs in with QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD, sets `quest.theme` in localStorage,
 * visits each route, waits for the realm to load and the counters to settle, and writes JPEGs.
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
const OUT = args.get("out") ?? `docs/screenshots/${THEME}/pass-01`;
const BASE = args.get("base") ?? "http://localhost:4173";
const FULL = args.get("full") === "true";
const ONLY = args.get("only");

const ROUTES = ["/login", "/", "/realm", "/quests", "/pipeline", "/sponsors", "/treasury", "/oracle", "/chronicle", "/trophies", "/quality"];
const WIDTHS = [
  { name: "1280", viewport: { width: 1280, height: 800 }, mobile: false },
  { name: "390", viewport: { width: 390, height: 844 }, mobile: true },
];

const SETTLE_MS: Record<string, number> = { "iron-crown": 3800, "gilded-realm": 2800, "neon-kingdom": 1800 };

function slug(route: string) {
  return route === "/" ? "throne" : route.replace(/^\//, "").replace(/\//g, "-");
}

async function settle(page: Page, route: string) {
  if (route !== "/login") {
    await page.locator('[role="status"][aria-label="Loading realm data"]').waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined);
  }
  // Skip the cinematic intro and any celebration so the page itself is what we capture.
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
  for (const w of WIDTHS) {
    const context = await browser.newContext({
      ...(w.mobile ? { ...devices["Desktop Chrome"], isMobile: true, hasTouch: true } : devices["Desktop Chrome"]),
      viewport: w.viewport,
      deviceScaleFactor: 1,
      colorScheme: THEME === "gilded-realm" ? "light" : "dark",
    });
    await context.addInitScript(
      ([theme]) => {
        try {
          localStorage.setItem("quest.theme", theme!);
          sessionStorage.setItem("quest.intro.seen", "1");
          localStorage.setItem("quest.lastVisit", new Date().toISOString());
          localStorage.setItem("quest.liberations.seen", JSON.stringify(["liberation:seen-all"]));
        } catch {
          /* ignore */
        }
      },
      [THEME],
    );
    const page = await context.newPage();

    // Sign in once per context.
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Enter" }).click();
    await page.waitForURL(/\/$/, { timeout: 30_000 });
    await page.locator('[role="status"][aria-label="Loading realm data"]').waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined);
    // Liberation fanfare on /sponsors keys off event ids; visit once and dismiss so later captures are clean.
    await page.goto(`${BASE}/sponsors`);
    await page.locator('[role="status"][aria-label="Loading realm data"]').waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined);
    await page.keyboard.press("Escape").catch(() => undefined);

    for (const route of ROUTES) {
      if (ONLY && slug(route) !== ONLY) continue;
      if (route === "/login") {
        // The login page is only reachable signed out.
        const anon = await browser.newContext({ viewport: w.viewport, deviceScaleFactor: 1, colorScheme: THEME === "gilded-realm" ? "light" : "dark" });
        await anon.addInitScript((theme) => localStorage.setItem("quest.theme", theme), THEME);
        const p = await anon.newPage();
        await p.goto(`${BASE}/login`);
        await p.waitForTimeout(900);
        await p.screenshot({ path: path.join(OUT, `login-${w.name}.jpg`), type: "jpeg", quality: 78, fullPage: FULL });
        await anon.close();
        continue;
      }
      await page.goto(`${BASE}${route}`);
      await settle(page, route);
      await page.screenshot({ path: path.join(OUT, `${slug(route)}-${w.name}.jpg`), type: "jpeg", quality: 78, fullPage: FULL });
      process.stdout.write(`${THEME} ${route} @${w.name}\n`);
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
