import { expect, test, type Page } from "@playwright/test";

/**
 * The top bar and the page share one box: same max-width, same centring, same gutter scale. These
 * tests measure it instead of eyeballing it — at every width and on every page the hamburger's INK
 * (not its 44×44 box), the page title and the first content card must sit on the same pixel column,
 * the oxygen pill's right edge on the cards' right edge, and the wordmark on the viewport's centre.
 */

const WIDTHS = [380, 768, 1280, 1920] as const;
const ROUTES = ["/", "/realm", "/warplan", "/exodus", "/quests", "/pipeline", "/sponsors", "/treasury", "/oracle", "/chronicle"] as const;
const TOLERANCE_PX = 1;

/**
 * Two pages have no title/card at the content edge by design, so they are measured against the block
 * that does fill the content box:
 *  - "/"          the Throne Room's h1 is centred text inside the hero card → measure the hero card.
 *  - "/chronicle" the events hang off a timeline rail (ml-3 pl-6) → measure the PageHeader block.
 */
const TITLE_SELECTOR: Partial<Record<(typeof ROUTES)[number], string>> = { "/": "main section" };
const CARD_SELECTOR: Partial<Record<(typeof ROUTES)[number], string>> = { "/chronicle": "main header" };
const DEFAULT_TITLE = "main h1";
const DEFAULT_CARD = "main .parchment-card, main section, main table";

type Edges = {
  inkLeft: number;
  buttonBox: { width: number; height: number };
  titleLeft: number;
  cardLeft: number;
  contentLeft: number;
  contentRight: number;
  pillRight: number;
  pillHeight: number;
  brandCentre: number;
  viewportCentre: number;
};

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: /Loading farm and lot data|Cargando fincas y lotes/ })).toHaveCount(0, { timeout: 30_000 });
}

/** The page-enter transition translates the page root; wait until it has landed. */
async function waitForPageSettled(page: Page) {
  const root = page.getByTestId("page-transition");
  await expect(root).toBeVisible();
  await expect
    .poll(async () =>
      root.evaluate((el) => {
        const s = getComputedStyle(el);
        return (s.transform === "none" || s.transform === "matrix(1, 0, 0, 1, 0, 0)") && s.opacity === "1";
      }),
    )
    .toBe(true);
}

async function measure(page: Page, titleSelector: string, cardSelector: string): Promise<Edges> {
  return page.evaluate(
    ([titleSel, cardSel]) => {
      const rect = (el: Element | null) => {
        if (!el) throw new Error("missing element");
        return el.getBoundingClientRect();
      };
      const button = document.querySelector("[data-testid='nav-menu-button']");
      const svg = button?.querySelector("svg");
      const stroke = svg?.querySelector("line, path");
      if (!button || !svg || !stroke) throw new Error("hamburger glyph not found");
      // lucide draws with stroke-width 2 in a 24-unit box; the visible ink starts half a stroke
      // before the path's geometric x, scaled to the rendered size.
      const halfStroke = (rect(svg).width / 24) * (Number(svg.getAttribute("stroke-width") ?? 2) / 2);
      const content = rect(document.querySelector("main > div"));
      const pill = rect(document.querySelector("[data-testid='topbar-oxygen'] > span"));
      const brand = rect(document.querySelector("[data-testid='topbar-realm-name']"));
      const buttonRect = rect(button);
      return {
        inkLeft: rect(stroke).left - halfStroke,
        buttonBox: { width: buttonRect.width, height: buttonRect.height },
        titleLeft: rect(document.querySelector(titleSel)).left,
        cardLeft: rect(document.querySelector(cardSel)).left,
        contentLeft: content.left,
        contentRight: content.right,
        pillRight: pill.right,
        pillHeight: pill.height,
        brandCentre: (brand.left + brand.right) / 2,
        viewportCentre: document.documentElement.clientWidth / 2,
      };
    },
    [titleSelector, cardSelector] as const,
  );
}

test.describe("topbar aligns with the page content", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // The suite sets its own viewports; running it again under the phone project only repeats it.
    test.skip(testInfo.project.name === "mobile", "widths are set explicitly by the test");
    await page.addInitScript(() => sessionStorage.setItem("quest.intro.seen", "1"));
  });

  for (const width of WIDTHS) {
    test(`glyph, title, cards and pill share their edges at ${width}px on every page`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const report: string[] = [];

      for (const route of ROUTES) {
        await page.goto(route);
        await waitForRealm(page);
        await waitForPageSettled(page);

        const m = await measure(page, TITLE_SELECTOR[route] ?? DEFAULT_TITLE, CARD_SELECTOR[route] ?? DEFAULT_CARD);
        report.push(
          `${route}: ink=${m.inkLeft} title=${m.titleLeft} card=${m.cardLeft} content=${m.contentLeft}..${m.contentRight} pill=${m.pillRight} brand=${m.brandCentre}/${m.viewportCentre}`,
        );
        await testInfo.attach(`${width}-${route === "/" ? "throne" : route.slice(1)}.png`, {
          body: await page.screenshot({ clip: { x: 0, y: 0, width, height: Math.min(900, 420) } }),
          contentType: "image/png",
        });

        const where = `${route} @ ${width}px`;
        expect(Math.abs(m.inkLeft - m.titleLeft), `${where}: hamburger ink vs page title`).toBeLessThanOrEqual(TOLERANCE_PX);
        expect(Math.abs(m.inkLeft - m.cardLeft), `${where}: hamburger ink vs first card`).toBeLessThanOrEqual(TOLERANCE_PX);
        expect(Math.abs(m.inkLeft - m.contentLeft), `${where}: hamburger ink vs content box`).toBeLessThanOrEqual(TOLERANCE_PX);
        expect(Math.abs(m.pillRight - m.contentRight), `${where}: oxygen pill vs content right edge`).toBeLessThanOrEqual(TOLERANCE_PX);
        expect(Math.abs(m.brandCentre - m.viewportCentre), `${where}: wordmark vs viewport centre`).toBeLessThanOrEqual(TOLERANCE_PX);
        // Shifted, not shrunk.
        expect(Math.round(m.buttonBox.width), `${where}: hamburger tap width`).toBeGreaterThanOrEqual(44);
        expect(Math.round(m.buttonBox.height), `${where}: hamburger tap height`).toBeGreaterThanOrEqual(44);
        expect(Math.round(m.pillHeight), `${where}: pill tap height`).toBeGreaterThanOrEqual(44);
      }

      await testInfo.attach(`${width}-edges.txt`, { body: report.join("\n"), contentType: "text/plain" });
    });
  }
});
