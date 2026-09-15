import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("/workspace/.env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const routes = [
  "/",
  "/realm",
  "/council",
  "/engine",
  "/warplan",
  "/quests",
  "/oracle",
  "/chronicle",
  "/treasury",
  "/trophies",
  "/sponsors",
  "/exodus",
  "/pipeline",
  "/quality",
];

function overflows(el: { box: { width: number; height: number }; scrollW: number; scrollH: number }) {
  return el.scrollW - el.box.width > 1 || el.scrollH - el.box.height > 2;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 380, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("quest.lang", "es");
    sessionStorage.setItem("quest.intro.seen", "1");
    localStorage.setItem("quest.liberations.seen", JSON.stringify(["seen-by-e2e"]));
  });
  await page.goto("http://localhost:4173/");
  await page.fill("#email", env.QUEST_TEST_EMAIL!);
  await page.fill("#password", env.QUEST_TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(?!login)/, { timeout: 20000 });
  await page.getByTestId("nav-menu-button").waitFor({ timeout: 30_000 });

  const findings: string[] = [];
  for (const route of routes) {
    await page.goto(`http://localhost:4173${route}`);
    await page.getByTestId("nav-menu-button").waitFor({ timeout: 30_000 });
    await page
      .locator('[role="status"][aria-label="Loading farm and lot data"], [role="status"][aria-label="Cargando fincas y lotes"]')
      .first()
      .waitFor({ state: "detached", timeout: 30_000 })
      .catch(() => undefined);
    await page.waitForTimeout(400);

    const title = await page.locator("main h1, h1").first().evaluate((el) => ({
      text: (el as HTMLElement).innerText,
      box: el.getBoundingClientRect(),
      scrollW: el.scrollWidth,
      scrollH: el.scrollHeight,
    }));
    if (overflows(title)) findings.push(`${route} TITLE overflow: ${JSON.stringify(title.text)}`);

    const badges = await page.locator('[class*="rounded-full"]').evaluateAll((els) =>
      els.slice(0, 20).map((el) => ({
        text: (el as HTMLElement).innerText.slice(0, 80),
        box: el.getBoundingClientRect(),
        scrollW: el.scrollWidth,
        scrollH: el.scrollHeight,
      })),
    );
    for (const b of badges) {
      if (b.box.width < 8 || !b.text.trim()) continue;
      if (overflows(b)) findings.push(`${route} BADGE overflow: ${JSON.stringify(b.text)} sw=${b.scrollW} bw=${Math.round(b.box.width)}`);
    }

    const fanfare = page.getByTestId("celebration");
    if (await fanfare.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
    }

    if (route === "/") {
      await page.getByTestId("nav-menu-button").click();
      await page.waitForTimeout(400);
      const items = await page.locator("nav a, nav button").evaluateAll((els) =>
        els.map((el) => ({
          text: (el as HTMLElement).innerText.replace(/\n/g, " ").trim(),
          box: el.getBoundingClientRect(),
          scrollW: el.scrollWidth,
          scrollH: el.scrollHeight,
        })),
      );
      for (const item of items) {
        if (!item.text.trim()) continue;
        if (overflows(item)) findings.push(`NAV overflow: ${item.text} sw=${item.scrollW} bw=${Math.round(item.box.width)}`);
      }
      const navLabels = items.map((i) => i.text).filter(Boolean);
      console.log("NAV labels:", navLabels.join(" | "));
      await page.keyboard.press("Escape");
    }
  }

  console.log(findings.length ? findings.join("\n") : "NO_OVERFLOW");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
