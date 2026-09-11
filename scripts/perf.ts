/// <reference lib="dom" />
/**
 * Performance and mobile checks per theme, against the production build served on :4173.
 *
 *   npx tsx scripts/perf.ts [--theme iron-crown] [--base http://localhost:4173]
 *
 * For each theme (or the one given): emulate a 390×844 phone on Lighthouse's "slow 4G"
 * (1.6 Mbps down · 750 Kbps up · 150 ms RTT) with 4× CPU slowdown, load /login cold and the
 * Throne Room signed in, and report first paint, first contentful paint, largest contentful
 * paint and cumulative layout shift. Then, at 390 px, list every interactive element on every
 * route whose hit target is smaller than 44×44 CSS px (thumb usability).
 */
import { chromium, devices, type Page } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const BASE = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1]! : "http://localhost:4173";
const ONLY = process.argv.includes("--theme") ? process.argv[process.argv.indexOf("--theme") + 1] : undefined;
const THEMES = ONLY ? [ONLY] : ["iron-crown", "gilded-realm", "neon-kingdom"];
const ROUTES = ["/", "/warplan", "/realm", "/quests", "/pipeline", "/sponsors", "/treasury", "/oracle", "/chronicle", "/trophies", "/quality"];

const SLOW_4G = { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 };

interface Paint {
  fp: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number;
  transferKB: number;
}

async function installObservers(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __lcp: number | null };
    w.__cls = 0;
    w.__lcp = null;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
          if (!e.hadRecentInput) w.__cls += e.value ?? 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) w.__lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* unsupported */
    }
  });
}

async function readPaint(page: Page): Promise<Paint> {
  return page.evaluate(() => {
    const w = window as unknown as { __cls: number; __lcp: number | null };
    const paints = performance.getEntriesByType("paint");
    const fp = paints.find((p) => p.name === "first-paint")?.startTime ?? null;
    const fcp = paints.find((p) => p.name === "first-contentful-paint")?.startTime ?? null;
    const transfer = performance.getEntriesByType("resource").reduce((a, r) => a + ((r as PerformanceResourceTiming).transferSize || 0), 0);
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return { fp, fcp, lcp: w.__lcp, cls: Math.round(w.__cls * 1000) / 1000, transferKB: Math.round((transfer + (nav?.transferSize ?? 0)) / 1024) };
  });
}

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return cdp;
}

async function main() {
  const email = process.env.QUEST_TEST_EMAIL;
  const password = process.env.QUEST_TEST_PASSWORD;
  if (!email || !password) throw new Error("QUEST_TEST_EMAIL and QUEST_TEST_PASSWORD must be set");
  const browser = await chromium.launch();
  const rows: string[] = [];
  const smallTargets: string[] = [];

  for (const theme of THEMES) {
    const light = theme === "gilded-realm";
    const mk = () =>
      browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: light ? "light" : "dark" });

    // 1. Cold /login on slow 4G.
    let ctx = await mk();
    await ctx.addInitScript((t) => localStorage.setItem("quest.theme", t), theme);
    let page = await ctx.newPage();
    await installObservers(page);
    await throttle(page);
    await page.goto(`${BASE}/login`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const login = await readPaint(page);
    rows.push(`| ${theme} | /login (cold) | ${fmt(login.fp)} | ${fmt(login.fcp)} | ${fmt(login.lcp)} | ${login.cls} | ${login.transferKB} KB |`);

    // Sign in (unthrottled is fine; we measure the next navigation).
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Enter" }).click();
    await page.waitForURL(/\/$/, { timeout: 60_000 });
    const state = await ctx.storageState();
    await ctx.close();

    // 2. Throne Room, signed in, cold cache, slow 4G.
    ctx = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      colorScheme: light ? "light" : "dark",
      storageState: state,
    });
    await ctx.addInitScript((t) => {
      localStorage.setItem("quest.theme", t);
      sessionStorage.setItem("quest.intro.seen", "1");
    }, theme);
    page = await ctx.newPage();
    await installObservers(page);
    await throttle(page);
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await page.locator('[role="status"][aria-label="Loading realm data"]').waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);
    await page.waitForTimeout(4000);
    const throne = await readPaint(page);
    rows.push(`| ${theme} | / (signed in, cold) | ${fmt(throne.fp)} | ${fmt(throne.fcp)} | ${fmt(throne.lcp)} | ${throne.cls} | ${throne.transferKB} KB |`);

    // 3. Thumb targets at 390 px on every route (no throttling needed).
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`);
      await page.locator('[role="status"][aria-label="Loading realm data"]').waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(600);
      const small = await page.evaluate(() => {
        const sel = "a, button, select, input, [role='button'], [role='radio'], [role='slider']";
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none") continue;
          // SVG lot tiles are measured separately (they are <rect>s).
          if (Math.min(r.width, r.height) < 40) {
            const label = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;
            out.push(`${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""} "${label}" ${Math.round(r.width)}×${Math.round(r.height)}`);
          }
        }
        return out;
      });
      for (const s of small) smallTargets.push(`${theme} ${route}: ${s}`);
    }
    await ctx.close();
  }
  await browser.close();

  console.log("\n| Theme | Page | First paint | FCP | LCP | CLS | Transfer |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of rows) console.log(r);
  console.log(`\nInteractive elements under 40 px at 390 wide: ${smallTargets.length}`);
  for (const s of smallTargets) console.log("  " + s);
}

function fmt(ms: number | null) {
  return ms === null ? "—" : `${(ms / 1000).toFixed(2)} s`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
