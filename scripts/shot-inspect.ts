import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const BASE = "http://localhost:4173";
const OUT = "/opt/cursor/artifacts/screenshots/mobile-inspect";
mkdirSync(OUT, { recursive: true });
const routes = ["/", "/realm", "/quests", "/pipeline", "/sponsors", "/treasury", "/oracle", "/chronicle", "/trophies", "/quality"] as const;
const devices = [
  { name: "se", w: 375, h: 667, dpr: 2 },
  { name: "se-land", w: 667, h: 375, dpr: 2 },
  { name: "15", w: 393, h: 852, dpr: 3 },
];

async function main() {
  const browser = await chromium.launch();
  const boot = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bp = await boot.newPage();
  await bp.goto(`${BASE}/login`);
  await bp.getByLabel("Email").fill(process.env.QUEST_TEST_EMAIL!);
  await bp.getByLabel("Password").fill(process.env.QUEST_TEST_PASSWORD!);
  await bp.getByRole("button", { name: "Enter" }).click();
  await bp.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  const storage = await boot.storageState();
  await boot.close();

  for (const d of devices) {
    const ctx = await browser.newContext({
      storageState: storage,
      viewport: { width: d.w, height: d.h },
      deviceScaleFactor: d.dpr,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    for (const route of routes) {
      await page.goto(`${BASE}${route}`);
      await page
        .locator('[role="status"][aria-label="Loading realm data"]')
        .waitFor({ state: "detached", timeout: 45_000 })
        .catch(() => undefined);
      await page.evaluate(() => sessionStorage.setItem("quest.intro.seen", "1"));
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(500);
      const slug = route === "/" ? "throne" : route.slice(1);
      await page.screenshot({ path: `${OUT}/${d.name}-${slug}.png`, type: "png" });
      const m = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth;
        const vw = window.innerWidth;
        const counter = document.querySelector<HTMLElement>('[data-testid="net-profit-counter"]');
        let counterInfo: { text: string; height: number; width: number; fontSize: string } | null = null;
        if (counter) {
          const r = counter.getBoundingClientRect();
          counterInfo = {
            text: counter.textContent ?? "",
            height: r.height,
            width: r.width,
            fontSize: getComputedStyle(counter).fontSize,
          };
        }
        const tables = Array.from(document.querySelectorAll("table")).map((t) => ({
          testid: t.getAttribute("data-testid"),
          mobile: t.getAttribute("data-mobile"),
          width: Math.round(t.getBoundingClientRect().width),
          firstRowDisplay: t.querySelector("tbody tr") ? getComputedStyle(t.querySelector("tbody tr")!).display : null,
        }));
        const topbar = document.querySelector<HTMLElement>("[data-testid='app-topbar'], header");
        const main = document.querySelector("main");
        let sticky: { topbarBottom: number; mainPadTop: string; contentTop: number } | null = null;
        if (topbar && main) {
          const first = main.firstElementChild as HTMLElement | null;
          sticky = {
            topbarBottom: topbar.getBoundingClientRect().bottom,
            mainPadTop: getComputedStyle(main).paddingTop,
            contentTop: first?.getBoundingClientRect().top ?? -1,
          };
        }
        return { sw, vw, hScroll: sw > vw + 1, counterInfo, tables, sticky };
      });
      console.log(JSON.stringify({ device: d.name, route, ...m }));
    }
    await page.goto(`${BASE}/`);
    await page
      .locator('[role="status"][aria-label="Loading realm data"]')
      .waitFor({ state: "detached", timeout: 45_000 })
      .catch(() => undefined);
    await page.evaluate(() => sessionStorage.setItem("quest.intro.seen", "1"));
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.getByTestId("nav-menu-button").click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${d.name}-drawer.png`, type: "png" });
    const drawer = await page.getByTestId("nav-drawer").boundingBox();
    console.log(JSON.stringify({ device: d.name, route: "drawer", drawer, vp: { w: d.w, h: d.h } }));
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
