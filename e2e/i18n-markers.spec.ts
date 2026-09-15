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
 * - Payments navigation paths in /quality ("Farm Acquisitions → …") — product UI labels stay English
 *
 * Bare "Capital" is NOT an English-leak marker: Spanish UI reuses it in phrases like
 * "Capital desplegado" / "capital propio".
 *
 * Markers avoided here (covered instead by the JSX literal allowlist / domain work):
 * - bare "Farm" / "peak" / "required" — Quality path labels and residual Farm Calendar / Throne debt
 * - full English month names (January…) — chronicle narrative (`src/domain/narrative.ts`) is still EN-only
 *   Prefer the English short-date shape (`May 19, 2026`) which must never appear under lang=es.
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

/**
 * English chrome that must not appear as whole tokens when lang=es.
 * Stage labels + Terms/Last + English short dates (format leak).
 * Bare "required"/"Farm"/"peak" omitted while Farm Calendar / Quality paths / residual debt remain;
 * those are tracked by the JSX literal allowlist instead.
 */
const ENGLISH_MARKERS =
  /\b(?:Available|Reserved|Closed|Terms|Last)\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\b/;

/**
 * Spanish domain words that must not appear as whole tokens in English UI.
 * Month abbreviations use a date shape (`19 ago 2026`) so bare English "ago" does not trip.
 */
const SPANISH_MARKERS =
  /\b(?:Finca|Lote|Disponible|Reservado|Cerrado|requerido|Utilidad)\b|\b\d{1,2} (?:ene|abr|ago|dic)\.? \d{4}\b/;

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: /Loading farm and lot data|Cargando fincas y lotes/ })).toHaveCount(0, {
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
