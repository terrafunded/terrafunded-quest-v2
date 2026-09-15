import { expect, test, type Page } from "@playwright/test";

/**
 * The celebration toast is portalled under the topbar. On a long page it must stay in the
 * viewport at the top — never mid-page — whether the user is scrolled to the top or the bottom.
 */

async function waitForRealm(page: Page) {
  await expect(page.getByRole("status", { name: /Loading farm and lot data|Cargando fincas y lotes/ })).toHaveCount(0, {
    timeout: 30_000,
  });
}

async function openReplay(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("quest.intro.seen", "1");
    localStorage.setItem("quest.liberations.seen", JSON.stringify(["seen-by-e2e"]));
    localStorage.setItem("quest.lastVisit", new Date().toISOString());
  });
  await page.goto("/sponsors");
  await waitForRealm(page);
  const existing = page.getByTestId("celebration");
  if (await existing.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(existing).toHaveCount(0);
  }
  const replay = page.getByTestId("replay-liberations");
  await expect(replay).toBeVisible();
  await replay.click();
  const toast = page.getByTestId("celebration");
  await expect(toast).toBeVisible();
  await toast.hover();
  return toast;
}

function assertUnderTopbar(
  toast: { x: number; y: number; width: number; height: number },
  topbar: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
) {
  expect(toast.y).toBeGreaterThanOrEqual(topbar.y + topbar.height - 2);
  expect(toast.y).toBeLessThanOrEqual(topbar.y + topbar.height + 24);
  expect(toast.x).toBeGreaterThanOrEqual(-1);
  expect(toast.x + toast.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(toast.y).toBeGreaterThanOrEqual(-1);
  expect(toast.y + toast.height).toBeLessThanOrEqual(viewport.height + 1);
}

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 380, height: 844 },
] as const;

test.describe("celebration stays in the viewport", () => {
  for (const vp of VIEWPORTS) {
    test(`under the topbar at ${vp.width} when scrolled to the top and the bottom`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "set the viewport here; run once on the desktop project");
      await page.setViewportSize(vp);
      const toast = await openReplay(page);
      const topbar = page.getByTestId("topbar");
      await expect(topbar).toBeVisible();

      const topBoxes = { toast: (await toast.boundingBox())!, bar: (await topbar.boundingBox())! };
      assertUnderTopbar(topBoxes.toast, topBoxes.bar, vp);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(200);
      const bottomBoxes = { toast: (await toast.boundingBox())!, bar: (await topbar.boundingBox())! };
      assertUnderTopbar(bottomBoxes.toast, bottomBoxes.bar, vp);
      expect(Math.abs(bottomBoxes.toast.y - topBoxes.toast.y)).toBeLessThan(2);
    });
  }
});
