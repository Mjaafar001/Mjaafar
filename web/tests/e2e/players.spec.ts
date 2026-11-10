import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";

test("administrator registers a player and sees the profile", async ({ page }) => {
  const last = `E2e${unique()}`;
  await login(page, "admin@mjfootball.example");
  await page.goto("/players/new");
  await page.getByLabel("First name").first().fill("Tobi");
  await page.getByLabel("Last name").first().fill(last);
  await page.getByLabel("Date of birth").fill("2016-05-20");
  await expect(page.getByText(/Suggested by age/)).toBeVisible();
  await page.getByText(/Suggested by age/).click();
  // Guardian section
  const guardian = page.locator("section", { hasText: "Parent / guardian" });
  await guardian.getByLabel("First name").fill("Kemi");
  await guardian.getByLabel("Last name").fill(last);
  // Unique phone: an existing phone would (correctly) link the existing guardian instead.
  await guardian.getByLabel("Phone").fill(`0803${Math.floor(1000000 + Math.random() * 8999999)}`);
  await page.getByRole("button", { name: "Register player" }).click();
  await expect(page).toHaveURL(/\/players\/c/);
  await expect(page.getByRole("heading", { name: `Tobi ${last}` })).toBeVisible();
  await expect(page.getByText(/MJA-\d{2}-\d{4}/).first()).toBeVisible();

  await page.getByRole("tab", { name: "Guardians" }).click();
  await expect(page.getByText(`Kemi ${last}`)).toBeVisible();

  await page.goto(`/players?q=${last}`);
  await expect(page.getByRole("link", { name: new RegExp(`Tobi ${last}`) })).toBeVisible();
});

test("medical information is hidden until explicitly revealed", async ({ page }) => {
  await login(page, "admin@mjfootball.example");
  await page.goto("/players");
  const href = await page.locator('table a[href^="/players/c"]').first().getAttribute("href");
  await page.goto(href!);
  await page.getByRole("tab", { name: "Medical" }).click();
  await expect(page.getByText("Medical information is protected")).toBeVisible();
  await page.getByRole("button", { name: "Show medical information" }).click();
  await expect(page.getByText("Emergency instructions")).toBeVisible();
});
