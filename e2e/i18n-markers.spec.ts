import { expect, test, type Page } from "@playwright/test";

/**
 * Bilingual marker sweep: after auth, each major route is loaded once in Spanish and
 * once in English; visible body text must not carry the other language's domain markers.
 *
 * Deliberate English keeps (allowed even when lang=es — see docs/glossary.md §Guards):
 * - Quest (product title)
 * - Exodus (product / screen name)
 * - Sponsor / Sponsors (team vocabulary; Spanish copy still says "sponsor")
 * - Engine chart numbers and technical codes
 *
 * Bare "Capital" is NOT an English-leak marker: Spanish UI reuses it in phrases like
 * "Capital desplegado" / "capital propio". Prefer English-only stage words and months.
 */

const ROUTES = [
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
] as const;

/** English domain words / full month names that must not appear as whole tokens in Spanish UI. */
const ENGLISH_MARKERS =
  /\b(?:Farm|Terms|Available|Reserved|Closed|required|peak|Last|January|February|March|April|May|June|July|August|September|October|November|December)\b/;

/**
 * Spanish domain words that must not appear as whole tokens in English UI.
 * Month abbreviations use a date shape (`19 ago 2026`) so bare English "ago" does not trip.
 */
const SPANISH_MARKERS =
  /\b(?:Finca|Lote|Disponible|Reservado|Cerrado|requerido|Utilidad)\b|\b\d{1,2} (?:ene|abr|ago|dic)\.? \d{4}\b/;

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: /Loading realm data|Cargando los datos del reino/ })).toHaveCount(0, {
    timeout: 30_000,
  });
}

async function openRoute(page: Page, route: string, lang: "en" | "es") {
  await page.addInitScript((l) => {
    localStorage.setItem("quest.lang", l);
    sessionStorage.setItem("quest.intro.seen", "1");
    localStorage.setItem("quest.liberations.seen", JSON.stringify(["seen-by-e2e"]));
  }, lang);
  await page.goto(route);
  await waitForRealm(page);
  const fanfare = page.getByTestId("celebration");
  if (await fanfare.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(fanfare).toHaveCount(0);
  }
}

function stripDeliberateKeeps(text: string): string {
  // Remove allowed English brand tokens so they never trip Spanish-mode checks.
  return text
    .replace(/\bQuest\b/g, " ")
    .replace(/\bExodus\b/g, " ")
    .replace(/\bSponsors?\b/gi, " ");
}

test.describe("i18n bilingual markers", () => {
  for (const route of ROUTES) {
    test(`${route} in Spanish has no English domain markers`, async ({ page }) => {
      await openRoute(page, route, "es");
      const text = stripDeliberateKeeps(await page.locator("body").innerText());
      const hit = text.match(ENGLISH_MARKERS);
      expect(hit, hit ? `Unexpected English marker ${JSON.stringify(hit[0])} on ${route} (es)` : "").toBeNull();
    });

    test(`${route} in English has no Spanish domain markers`, async ({ page }) => {
      await openRoute(page, route, "en");
      const text = await page.locator("body").innerText();
      const hit = text.match(SPANISH_MARKERS);
      expect(hit, hit ? `Unexpected Spanish marker ${JSON.stringify(hit[0])} on ${route} (en)` : "").toBeNull();
    });
  }

  test("/login is bilingual when reachable (no session)", async ({ browser }) => {
    // Auth storage redirects /login → /; use a clean context to see the form.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.addInitScript(() => localStorage.setItem("quest.lang", "es"));
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    const esText = stripDeliberateKeeps(await page.locator("body").innerText());
    expect(esText.match(ENGLISH_MARKERS)).toBeNull();

    await page.evaluate(() => localStorage.setItem("quest.lang", "en"));
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    const enText = await page.locator("body").innerText();
    expect(enText.match(SPANISH_MARKERS)).toBeNull();
    await context.close();
  });
});
