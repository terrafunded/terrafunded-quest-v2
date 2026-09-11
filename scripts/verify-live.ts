/**
 * Smoke-checks a deployed Quest: the Throne Room renders real numbers and all three skins switch.
 *
 *   npm run verify:live -- https://terrafunded-quest-v2.vercel.app
 *
 * Read-only. Signs in with QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD (from .env or the shell), waits
 * for the realm to load, asserts the net-profit counter is a dollar amount > 0, that the SPA
 * rewrite serves deep links (/pipeline reloaded directly), and that picking each theme in the
 * nav drawer sets html[data-theme] and survives a reload. Writes docs/live-<theme>.jpg for the record.
 * Exit code 0 on success, 1 on any failure.
 */
import { mkdirSync } from "node:fs";
import { chromium, devices, type Page } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const THEMES = ["iron-crown", "gilded-realm", "neon-kingdom"] as const;

function fail(msg: string): never {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

async function waitForRealm(page: Page) {
  await page.locator('[role="status"][aria-label="Loading realm data"]').waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);
  await page.evaluate(() => sessionStorage.setItem("quest.intro.seen", "1"));
  await page.keyboard.press("Escape").catch(() => undefined);
}

async function main() {
  const base = (process.argv[2] ?? "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(base)) fail("usage: npm run verify:live -- https://<deployment>");
  const email = process.env.QUEST_TEST_EMAIL;
  const password = process.env.QUEST_TEST_PASSWORD;
  if (!email || !password) fail("QUEST_TEST_EMAIL and QUEST_TEST_PASSWORD must be set");
  mkdirSync("docs", { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  // 1. SPA rewrite: a deep link must not 404.
  const deep = await page.goto(`${base}/pipeline`, { waitUntil: "domcontentloaded" });
  if (!deep || deep.status() >= 400) fail(`/pipeline returned ${deep?.status()} — vercel.json rewrite missing?`);
  console.log(`✓ deep link /pipeline → ${deep.status()} (redirected to ${new URL(page.url()).pathname})`);

  // 2. Sign in.
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  await waitForRealm(page);
  console.log("✓ signed in");

  // 3. Real numbers on the Throne Room.
  const counter = page.getByTestId("net-profit-counter");
  await counter.waitFor({ timeout: 60_000 });
  const target = Number(await counter.getAttribute("data-target"));
  if (!(target > 0)) fail(`net-profit counter target is ${target}`);
  const verdict = (await page.getByTestId("verdict").textContent())?.trim() ?? "";
  const trapped = Number(await page.getByTestId("pipeline-trapped").getAttribute("data-target"));
  console.log(`✓ Throne Room: net profit $${target.toLocaleString("en-US")} · trapped $${trapped.toLocaleString("en-US")} · "${verdict}"`);

  // 4. Every theme switches and persists (drawer skin picker when signed in; /login when not).
  for (const theme of THEMES) {
    await page.goto(`${base}/`);
    await waitForRealm(page);
    await page.getByTestId("nav-menu-button").click();
    const drawer = page.getByTestId("nav-drawer");
    await drawer.waitFor({ timeout: 15_000 });
    const option = drawer.locator(`[data-theme-option='${theme}']`).first();
    await option.waitFor({ timeout: 15_000 });
    await option.click();
    const applied = await page.locator("html").getAttribute("data-theme");
    if (applied !== theme) fail(`clicking ${theme} set data-theme=${applied}`);
    const stored = await page.evaluate(() => localStorage.getItem("quest.theme"));
    if (stored !== theme) fail(`localStorage quest.theme=${stored} after picking ${theme}`);
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.reload();
    await waitForRealm(page);
    const afterReload = await page.locator("html").getAttribute("data-theme");
    if (afterReload !== theme) fail(`${theme} did not survive a reload (got ${afterReload})`);
    await page.getByTestId("net-profit-counter").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `docs/live-${theme}.jpg`, type: "jpeg", quality: 78 });
    console.log(`✓ ${theme}: applied from the nav drawer, persisted, Throne Room rendered → docs/live-${theme}.jpg`);
  }

  if (consoleErrors.length) fail(`console errors:\n  ${consoleErrors.join("\n  ")}`);
  await browser.close();
  console.log(`\nLive check passed for ${base}`);
}

main().catch((e) => fail(String(e)));
