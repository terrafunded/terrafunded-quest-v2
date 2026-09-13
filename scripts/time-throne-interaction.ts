/**
 * Click-to-paint on the Throne Room horizon switch (the interaction that used to rebuild
 * the realm three times). Requires a signed-in preview on :4173.
 *
 *   npx tsx scripts/time-throne-interaction.ts
 */
import { chromium } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const BASE = process.env.QUEST_PERF_BASE ?? "http://localhost:4173";

async function main() {
  const email = process.env.QUEST_TEST_EMAIL;
  const password = process.env.QUEST_TEST_PASSWORD;
  if (!email || !password) throw new Error("QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD must be set");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => sessionStorage.setItem("quest.intro.seen", "1"));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter" }).click();
  await page.waitForURL(/\/$/, { timeout: 60_000 });
  await page.locator('[data-testid="net-profit-counter"]').waitFor({ timeout: 60_000 });

  await page.getByTestId("nav-menu-button").click();
  await page.getByTestId("nav-drawer").waitFor();
  const samples: number[] = [];
  for (const year of ["2028", "2029", "2027"] as const) {
    const ms = await page.evaluate(async (y) => {
      const btn = document.querySelector<HTMLElement>(`[data-testid="horizon-${y}"]`);
      if (!btn) return -1;
      const t0 = performance.now();
      btn.click();
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      return performance.now() - t0;
    }, year);
    samples.push(ms);
    await page.waitForTimeout(300);
  }
  await browser.close();
  const ok = samples.filter((n) => n >= 0);
  const mid = [...ok].sort((a, b) => a - b)[Math.floor(ok.length / 2)] ?? -1;
  console.log(`horizon click → 2nd rAF (ms): ${ok.map((n) => n.toFixed(1)).join(", ")}`);
  console.log(`median: ${mid.toFixed(1)} ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
