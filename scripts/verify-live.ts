/**
 * Smoke-checks a deployed Quest: the Throne Room renders real numbers and all three skins switch.
 *
 *   npm run verify:live -- https://terrafunded-quest-v2.vercel.app
 *
 * Read-only. Signs in with QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD (from .env or the shell), waits
 * for the realm to load, asserts the net-profit counter is a dollar amount > 0, that the SPA
 * rewrite serves deep links (/pipeline reloaded directly), and that picking each theme in the
 * nav drawer sets html[data-theme] and survives a reload. Writes docs/live-<theme>.jpg for the record.
 *
 * It also proves the Payments-staff gate on the deployed bundle: the login footer names it, and a
 * sign-in staged as a non-admin (the questbot's real token response with `user.email` rewritten to
 * an address the gate does not know, so its `viewer` role decides) is refused with
 * "Quest is for the TerraFunded team only." and left with no session.
 * Exit code 0 on success, 1 on any failure.
 */
import { mkdirSync } from "node:fs";
import { chromium, devices, type Page } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const THEMES = ["iron-crown", "gilded-realm", "neon-kingdom"] as const;
const REFUSAL = "Quest is for the TerraFunded team only.";

function fail(msg: string): never {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

async function sessionKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token")));
}

async function waitForRealm(page: Page) {
  await page.locator('[role="status"][aria-label="Loading farm and lot data"], [role="status"][aria-label="Cargando fincas y lotes"]').waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);
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

  // 2. The Payments-staff gate, on the live bundle: footer text, and a staged non-admin refused.
  //    Its own browser context: the staged session must not reach the main tab through shared storage.
  {
    const gateCtx = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const gate = await gateCtx.newPage();
    await gate.route("**/auth/v1/token**", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { user?: { email?: string } };
      if (body.user) body.user.email = "not.the.questbot@example.com";
      const headers = Object.fromEntries(
        Object.entries(response.headers()).filter(([k]) => !["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())),
      );
      await route.fulfill({ status: response.status(), headers, json: body });
    });
    await gate.goto(`${base}/login`);
    const footer = (await gate.getByTestId("login-footer").textContent({ timeout: 30_000 }))?.trim() ?? "";
    if (!footer.includes("TerraFunded team only")) fail(`login footer does not say who may enter: "${footer}"`);
    await gate.getByLabel("Email").fill(email!);
    await gate.getByLabel("Password").fill(password!);
    await gate.getByRole("button", { name: "Enter" }).click();
    const refusal = gate.getByTestId("access-refused");
    await refusal.waitFor({ timeout: 60_000 });
    const text = (await refusal.textContent())?.trim();
    if (text !== REFUSAL) fail(`refusal reads "${text}", expected "${REFUSAL}"`);
    if (!/\/login$/.test(new URL(gate.url()).pathname)) fail(`refused user ended on ${gate.url()}`);
    if ((await gate.getByTestId("net-profit-counter").count()) !== 0) fail("refused user can see the Throne Room");
    let keys = await sessionKeys(gate);
    for (let i = 0; i < 20 && keys.length; i++) {
      await gate.waitForTimeout(500);
      keys = await sessionKeys(gate);
    }
    if (keys.length) fail(`refused user still has a session in localStorage (${keys.join(", ")})`);
    await gateCtx.close();
    console.log(`✓ access gate: footer names the TerraFunded team; a viewer that is not the allowed test e-mail is refused with "${text}" and signed out`);
  }

  // 3. Sign in as the allowed test account. Where it lands depends on the deep link it came from
  //    (step 1's /pipeline when the browser kept that history state), so only "not /login" is asserted here.
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  await waitForRealm(page);
  console.log(`✓ signed in (landed on ${new URL(page.url()).pathname})`);

  // 4. Real numbers on the Throne Room.
  await page.goto(`${base}/`);
  await waitForRealm(page);
  const counter = page.getByTestId("net-profit-counter");
  await counter.waitFor({ timeout: 60_000 });
  const target = Number(await counter.getAttribute("data-target"));
  if (!(target > 0)) fail(`net-profit counter target is ${target}`);
  const verdict = (await page.getByTestId("verdict").textContent())?.trim() ?? "";
  const trapped = Number(await page.getByTestId("pipeline-trapped").getAttribute("data-target"));
  const owed = Number(await page.getByTestId("key-capital-outstanding").getAttribute("data-value"));
  const debtOwed = Number(await page.getByTestId("debt-capital-owed").getAttribute("data-target"));
  const owedHint = (await page.getByTestId("key-capital-outstanding-hint").textContent())?.replace(/\s+/g, " ").trim() ?? "";
  if (!(owed > 0) || Math.round(owed) !== debtOwed) fail(`Key figures Capital outstanding is ${owed}, Debt is ${debtOwed}`);
  if (!owedHint.includes("Still owed to sponsors") || !owedHint.includes("own capital tied up")) {
    fail(`Capital outstanding hint is "${owedHint}"`);
  }
  console.log(`✓ Throne Room: net profit $${target.toLocaleString("en-US")} · trapped $${trapped.toLocaleString("en-US")} · "${verdict}"`);
  console.log(`✓ Capital outstanding Stat: $${owed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (= Debt) · ${owedHint}`);

  // 5. Every theme switches and persists (drawer skin picker when signed in; /login when not).
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
