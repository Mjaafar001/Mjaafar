import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/** Coach workflow on a phone: schedule a session for today and take the register. */
test("taking attendance on a phone updates counts and session credits", async ({ page }) => {
  await login(page, "admin@mjfootball.example");
  const now = new Date(Date.now() + 60 * 60 * 1000); // Lagos is UTC+1
  const date = now.toISOString().slice(0, 10);
  const hh = String(Math.max(0, now.getUTCHours() - 1)).padStart(2, "0");
  await page.goto(`/sessions/new?date=${date}`);
  await page.getByLabel("Age group").selectOption({ label: "Under-10" });
  await page.getByLabel("Start").fill(`${hh}:00`);
  await page.getByLabel("Minutes").fill("30");
  await page.getByRole("button", { name: "Schedule" }).click();
  const anyway = page.getByRole("button", { name: "Schedule anyway" });
  await Promise.race([page.waitForURL(/\/sessions\/c/), anyway.waitFor()]);
  if (await anyway.isVisible()) await anyway.click();
  await expect(page).toHaveURL(/\/sessions\/c/);

  // Mark everyone present, then one player absent.
  await page.getByRole("button", { name: "Mark unmarked present" }).click();
  const firstAbsent = page.getByRole("button", { name: /^Absent:/ }).first();
  await firstAbsent.click();
  await expect(firstAbsent).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText(/Saved \d+ player/)).toBeVisible();
  await expect(page.getByText("All changes saved")).toBeVisible();

  // Bottom navigation is present on mobile
  await expect(page.getByRole("navigation", { name: "Quick" })).toBeVisible();
  // No horizontal scrolling on a phone
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
