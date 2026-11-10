import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";

test("a parent applies online and an administrator approves the application", async ({ page }) => {
  const child = `Apply${unique()}`;
  await page.goto("/apply");
  await page.getByLabel("Child's date of birth").fill("2017-02-10");
  await page.getByLabel("First name").fill(child);
  await page.getByLabel("Last name").fill("Adeyemi");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("First name").first().fill("Funmi");
  await page.getByLabel("Last name").first().fill("Adeyemi");
  await page.getByLabel("Phone").first().fill(`0803${Math.floor(1000000 + Math.random() * 8999999)}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Allergies").fill("None");
  await page.getByRole("button", { name: "Continue" }).click();

  // Mandatory consents are enforced.
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Participation consent is required")).toBeVisible();
  for (const text of ["taking part in football", "arranging first aid", "processing my and my child"]) {
    await page.getByText(text, { exact: false }).click();
  }
  await page.getByLabel(/Signature/).fill("Funmi Adeyemi");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: "Application received" })).toBeVisible();
  const ref = (await page.locator("p.font-mono").textContent())!.trim();
  expect(ref).toMatch(/^APP-/);

  // The applicant chose the default branch; the academy president can review any branch.
  await login(page, "president@mjfootball.example");
  await page.goto(`/registrations?q=${ref}`);
  await page.getByRole("link", { name: ref }).click();
  await page.waitForURL(/\/registrations\/c/);
  await expect(page.getByRole("heading", { name: `${child} Adeyemi` })).toBeVisible();
  // Choose an age group (the child may not match the requested branch's bands).
  const group = page.getByLabel("Age group");
  if (!(await group.inputValue())) await group.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Approve & create player" }).click();
  await page.waitForURL(/\/players\/c/, { timeout: 20000 });
  await expect(page.getByRole("heading", { name: `${child} Adeyemi` })).toBeVisible();
});
