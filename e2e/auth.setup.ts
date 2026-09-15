import { expect, test as setup } from "@playwright/test";
import { mkdirSync } from "node:fs";

const authFile = "playwright/.auth/user.json";

/** Logs in once with the env credentials and stores the session for every project. */
setup("authenticate", async ({ page }) => {
  const email = process.env.QUEST_TEST_EMAIL ?? process.env.QUEST_TEST_EMAIL;
  const password = process.env.QUEST_TEST_PASSWORD ?? process.env.QUEST_TEST_PASSWORD;
  if (!email || !password) throw new Error("QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD must be set (see .env.example)");

  // Default UI lang is Spanish; accept either locale on the login form.
  await page.goto("/login");
  await page.getByLabel(/^(Email|Correo)$/).fill(email);
  await page.getByLabel(/^(Password|Contraseña)$/).fill(password);
  await page.getByRole("button", { name: /^(Enter|Entrar)$/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("net-profit-counter")).toBeVisible();

  mkdirSync("playwright/.auth", { recursive: true });
  await page.context().storageState({ path: authFile });
});
