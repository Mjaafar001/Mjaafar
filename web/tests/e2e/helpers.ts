import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Academy2026!";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export const unique = () => Math.random().toString(36).slice(2, 7);
