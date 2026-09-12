/**
 * Mobile perfection audit — screenshots every route × device × orientation and
 * programmatically flags horizontal overflow, undersized tap targets, and tiny type.
 *
 *   npx tsx scripts/mobile-audit.ts --pass 01 [--out docs/screenshots/mobile/pass-01]
 *
 * Assumes `npm run preview` (or the Playwright webServer) is already serving, OR
 * starts a one-shot preview against the existing build.
 */
import { chromium, type Page } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { APP_ROUTES, MATRIX_DEVICES, ROUTE_SLUG } from "../e2e/matrix";

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

const PASS = args.get("pass") ?? "01";
const OUT = args.get("out") ?? `docs/screenshots/mobile/pass-${PASS}`;
const BASE = args.get("base") ?? "http://localhost:4173";

export type Defect = {
  route: string;
  device: string;
  kind: "h-scroll" | "tap-target" | "font-size" | "drawer-overflow" | "other";
  element: string;
  detail: string;
};

async function settle(page: Page, route: string) {
  if (route !== "/login") {
    await page
      .locator('[role="status"][aria-label="Loading realm data"]')
      .waitFor({ state: "detached", timeout: 45_000 })
      .catch(() => undefined);
  }
  await page.evaluate(() => sessionStorage.setItem("quest.intro.seen", "1"));
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(600);
}

async function collectDefects(page: Page, route: string, device: string): Promise<Defect[]> {
  const defects: Defect[] = [];
  const metrics = await page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    const viewport = window.innerWidth;
    const bodySize = Number.parseFloat(getComputedStyle(document.body).fontSize);
    const inputs = Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea")).map((el) => ({
      size: Number.parseFloat(getComputedStyle(el).fontSize),
      name: el.getAttribute("name") ?? el.id ?? el.tagName,
    }));
    const undersized = Array.from(
      document.querySelectorAll<HTMLElement>("button, a.nav-item, a.touch-link, [role='button'], input, select, textarea, summary, [data-testid='nav-menu-button']"),
    )
      .filter((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (Math.round(r.width) < 44 || Math.round(r.height) < 44);
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          testid: el.getAttribute("data-testid"),
          aria: el.getAttribute("aria-label"),
          text: (el.textContent ?? "").trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
    return { scrollWidth, clientWidth, viewport, bodySize, inputs, undersized };
  });

  if (metrics.scrollWidth > Math.max(metrics.clientWidth, metrics.viewport) + 1) {
    defects.push({
      route,
      device,
      kind: "h-scroll",
      element: "document",
      detail: `scrollWidth=${metrics.scrollWidth} viewport=${metrics.viewport}`,
    });
  }
  if (metrics.bodySize < 15) {
    defects.push({
      route,
      device,
      kind: "font-size",
      element: "body",
      detail: `font-size=${metrics.bodySize}px (< 15)`,
    });
  }
  for (const inp of metrics.inputs) {
    if (inp.size < 16) {
      defects.push({
        route,
        device,
        kind: "font-size",
        element: `input:${inp.name}`,
        detail: `font-size=${inp.size}px (< 16)`,
      });
    }
  }
  for (const u of metrics.undersized) {
    defects.push({
      route,
      device,
      kind: "tap-target",
      element: u.testid ?? u.aria ?? u.text ?? u.tag,
      detail: `${u.w}×${u.h}`,
    });
  }
  return defects;
}

async function main() {
  const email = process.env.QUEST_TEST_EMAIL;
  const password = process.env.QUEST_TEST_PASSWORD;
  if (!email || !password) throw new Error("QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD required");

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const allDefects: Defect[] = [];

  // Sign in once, reuse storage.
  const boot = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bootPage = await boot.newPage();
  await bootPage.goto(`${BASE}/login`);
  await bootPage.getByLabel("Email").fill(email);
  await bootPage.getByLabel("Password").fill(password);
  await bootPage.getByRole("button", { name: "Enter" }).click();
  await bootPage.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  const storage = await boot.storageState();
  await boot.close();

  for (const device of MATRIX_DEVICES) {
    const ctx = await browser.newContext({
      storageState: storage,
      viewport: device.viewport,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
    });
    const page = await ctx.newPage();
    for (const route of APP_ROUTES) {
      const slug = ROUTE_SLUG[route];
      const dir = path.join(OUT, device.folder);
      mkdirSync(dir, { recursive: true });
      await page.goto(`${BASE}${route}`);
      await settle(page, route);
      const defects = await collectDefects(page, route, device.project);
      allDefects.push(...defects);
      const shotPath = path.join(dir, `${slug}.jpg`);
      // Prefer viewport shots: fullPage JPEG of huge tables can exceed Chromium's
      // canvas limit and write a 0-byte file (seen on /quests portrait phones).
      try {
        await page.screenshot({ path: shotPath, type: "jpeg", quality: 72, fullPage: false });
        const { size } = await import("node:fs").then((fs) => fs.statSync(shotPath));
        if (size < 1000) {
          await page.screenshot({ path: shotPath, type: "jpeg", quality: 72, fullPage: true });
        }
      } catch (err) {
        allDefects.push({
          route,
          device: device.project,
          kind: "other",
          element: "screenshot",
          detail: String(err),
        });
      }
      const { size: finalSize } = await import("node:fs").then((fs) => fs.statSync(shotPath));
      if (finalSize < 1000) {
        allDefects.push({
          route,
          device: device.project,
          kind: "other",
          element: "screenshot",
          detail: `empty or tiny screenshot (${finalSize} bytes)`,
        });
      }
      process.stdout.write(`${device.project} ${route}: ${defects.length} defect(s)\n`);
    }
    await ctx.close();
  }

  await browser.close();
  const reportPath = path.join(OUT, "defects.json");
  writeFileSync(reportPath, JSON.stringify({ pass: PASS, defects: allDefects }, null, 2));
  console.log(`\n${allDefects.length} defect(s) → ${reportPath}`);
  if (allDefects.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
