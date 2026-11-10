import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("unauthenticated users are sent to sign in", async ({ page }) => {
  await page.goto("/players");
  await expect(page).toHaveURL(/\/login/);
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@mjfootball.example");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("each role lands in the right place and is blocked from others' pages", async ({ page }) => {
  await login(page, "parent@mjfootball.example");
  await expect(page).toHaveURL(/\/portal/);
  await expect(page.getByRole("heading", { name: "My family" })).toBeVisible();
  await page.goto("/players");
  await expect(page.getByText("Access restricted")).toBeVisible();

  await page.context().clearCookies();
  await login(page, "coach@mjfootball.example");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/settings");
  await expect(page.getByText("Access restricted")).toBeVisible();
});

test("private files are not publicly accessible", async ({ request }) => {
  const res = await request.get("/api/players/export");
  expect(res.status()).toBe(401);
  const photo = await request.get("/api/players/anything/photo");
  expect(photo.status()).toBe(401);
});
